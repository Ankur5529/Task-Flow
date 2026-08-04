from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps
from models import db, Project, ProjectMember, User, Task
from activity_helper import log_activity

projects_bp = Blueprint('projects', __name__)

# Feature 4: A user can only see and modify data for projects they are a member of. Enforce this on the backend.
# Feature 8: Roles within a project: owner and member. Enforce on the backend.
def require_project_membership(require_owner=False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(project_id, *args, **kwargs):
            current_user_id = get_jwt_identity()

            member = ProjectMember.query.filter_by(
                project_id=project_id,
                user_id=current_user_id
            ).first()

            if not member:
                return jsonify({"msg": "Forbidden: You are not a member of this project"}), 403

            if require_owner and member.role != 'owner':
                return jsonify({"msg": "Forbidden: You must be the project owner to perform this action"}), 403

            return fn(project_id, member, *args, **kwargs)
        return wrapper
    return decorator


# Feature 6: A user can create projects. The creator is the project owner.
@projects_bp.route('', methods=['POST'], strict_slashes=False)
@jwt_required()
def create_project():
    data = request.get_json()
    current_user_id = get_jwt_identity()

    name = data.get('name')
    description = data.get('description', '')

    if not name:
        return jsonify({"msg": "Project name is required"}), 400

    new_project = Project(
        name=name,
        description=description,
        owner_id=current_user_id
    )
    db.session.add(new_project)
    db.session.flush()

    owner_member = ProjectMember(
        project_id=new_project.id,
        user_id=current_user_id,
        role='owner'
    )
    db.session.add(owner_member)
    db.session.commit()

    log_activity(new_project.id, current_user_id, f"created project '{new_project.name}'")

    return jsonify({
        "msg": "Project created",
        "project": {
            "id": new_project.id,
            "name": new_project.name,
            "description": new_project.description,
            "owner_id": new_project.owner_id
        }
    }), 201


@projects_bp.route('', methods=['GET'], strict_slashes=False)
@jwt_required()
def get_projects():
    current_user_id = get_jwt_identity()

    memberships = ProjectMember.query.filter_by(user_id=current_user_id).all()

    projects_list = []
    for m in memberships:
        p = m.project
        projects_list.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "role": m.role,
            "owner_id": p.owner_id
        })

    return jsonify(projects_list), 200


@projects_bp.route('/<project_id>', methods=['GET'])
@jwt_required()
@require_project_membership(require_owner=False)
def get_project_details(project_id, current_member):
    project = current_member.project

    members_data = []
    for m in project.members:
        members_data.append({
            "id": m.user.id,
            "name": m.user.name,
            "email": m.user.email,
            "role": m.role
        })

    return jsonify({
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "owner_id": project.owner_id,
        "your_role": current_member.role,
        "members": members_data
    }), 200


# Feature 9: Deleting a project removes its tasks and memberships cleanly.
@projects_bp.route('/<project_id>', methods=['DELETE'])
@jwt_required()
@require_project_membership(require_owner=True)
def delete_project(project_id, current_member):
    project = current_member.project
    db.session.delete(project)
    db.session.commit()
    return jsonify({"msg": "Project deleted successfully"}), 200


# Feature 7: The owner can invite other registered users (by email) as members.
@projects_bp.route('/<project_id>/members', methods=['POST'])
@jwt_required()
@require_project_membership(require_owner=True)
def invite_member(project_id, current_member):
    data = request.get_json()
    email = data.get('email')

    if not email:
        return jsonify({"msg": "Email is required to invite a member"}), 400

    user_to_invite = User.query.filter_by(email=email.strip().lower()).first()

    if not user_to_invite:
        return jsonify({"msg": f"No registered user found with email {email}"}), 404

    existing_member = ProjectMember.query.filter_by(project_id=project_id, user_id=user_to_invite.id).first()
    if existing_member:
        return jsonify({"msg": "User is already a member of this project"}), 409

    new_member = ProjectMember(
        project_id=project_id,
        user_id=user_to_invite.id,
        role='member'
    )
    db.session.add(new_member)
    db.session.commit()

    log_activity(project_id, current_member.user_id, f"invited {user_to_invite.name} to the project")

    return jsonify({
        "msg": "Member invited successfully",
        "member": {
            "id": user_to_invite.id,
            "name": user_to_invite.name,
            "email": user_to_invite.email,
            "role": "member"
        }
    }), 201


# Feature 9: Removing a member must not delete the tasks they created; it just revokes their access.
@projects_bp.route('/<project_id>/members/<user_id>', methods=['DELETE'])
@jwt_required()
@require_project_membership(require_owner=True)
def remove_member(project_id, current_member, user_id):
    member_to_remove = ProjectMember.query.filter_by(project_id=project_id, user_id=user_id).first()

    if not member_to_remove:
        return jsonify({"msg": "User is not a member of this project"}), 404

    if member_to_remove.role == 'owner':
        return jsonify({"msg": "Cannot remove the project owner"}), 400

    tasks_assigned = Task.query.filter_by(project_id=project_id, assignee_id=user_id).all()
    for task in tasks_assigned:
        task.assignee_id = None

    removed_user_name = member_to_remove.user.name

    db.session.delete(member_to_remove)
    db.session.commit()

    log_activity(project_id, current_member.user_id, f"removed {removed_user_name} from the project")

    return jsonify({"msg": "Member removed successfully. They have been unassigned from all tasks."}), 200