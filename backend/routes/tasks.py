from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from sqlalchemy import or_, desc, asc, case
from models import db, Task, ProjectMember, User
from routes.projects import require_project_membership
from extensions import socketio
from activity_helper import log_activity

tasks_bp = Blueprint('tasks', __name__)

VALID_STATUSES = {'To Do', 'In Progress', 'Done'}
VALID_PRIORITIES = {'Low', 'Medium', 'High'}


@tasks_bp.route('', methods=['POST'])
@jwt_required()
@require_project_membership(require_owner=False)
def create_task(project_id, current_member):
    data = request.get_json()
    current_user_id = get_jwt_identity()

    title = data.get('title')
    description = data.get('description', '')
    status = data.get('status', 'To Do')
    priority = data.get('priority', 'Medium')
    due_date_str = data.get('due_date')
    assignee_id = data.get('assignee_id')

    if not title or title.strip() == '':
        return jsonify({"msg": "Task title cannot be empty"}), 400

    if status not in VALID_STATUSES:
        return jsonify({"msg": f"Status must be one of {sorted(VALID_STATUSES)}"}), 400

    if priority not in VALID_PRIORITIES:
        return jsonify({"msg": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400

    due_date = None
    if due_date_str:
        try:
            due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
            if due_date.date() < datetime.utcnow().date():
                return jsonify({"msg": "Due date cannot be in the past"}), 400
        except ValueError:
            return jsonify({"msg": "Invalid due date format. Use ISO format."}), 400

    if assignee_id:
        assignee_member = ProjectMember.query.filter_by(project_id=project_id, user_id=assignee_id).first()
        if not assignee_member:
            return jsonify({"msg": "Cannot assign task to a non-member of the project"}), 400

    new_task = Task(
        project_id=project_id,
        title=title.strip(),
        description=description,
        status=status,
        priority=priority,
        due_date=due_date,
        assignee_id=assignee_id,
        created_by=current_user_id
    )

    if status == 'Done':
        new_task.completed_date = datetime.utcnow()

    db.session.add(new_task)
    db.session.commit()

    log_activity(project_id, current_user_id, f"created task '{new_task.title}'")

    task_data = {
        "id": new_task.id,
        "title": new_task.title,
        "status": new_task.status,
        "priority": new_task.priority,
        "assignee_id": new_task.assignee_id,
        "project_id": project_id
    }
    socketio.emit('task_created', task_data, room=f"project_{project_id}")

    return jsonify({
        "msg": "Task created successfully",
        "task": task_data
    }), 201


@tasks_bp.route('', methods=['GET'])
@jwt_required()
@require_project_membership(require_owner=False)
def list_tasks(project_id, current_member):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    assignee_id = request.args.get('assignee')
    priority = request.args.get('priority')
    search_query = request.args.get('search')

    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')

    query = Task.query.filter_by(project_id=project_id)

    if assignee_id:
        if assignee_id == 'unassigned':
            query = query.filter(Task.assignee_id == None)
        else:
            query = query.filter(Task.assignee_id == assignee_id)

    if priority:
        query = query.filter(Task.priority == priority)

    if search_query:
        query = query.filter(Task.title.ilike(f'%{search_query}%'))

    if sort_by == 'priority':
        priority_case = case(
            (Task.priority == 'High', 1),
            (Task.priority == 'Medium', 2),
            (Task.priority == 'Low', 3),
            else_=4
        )
        if sort_order == 'asc':
            query = query.order_by(priority_case.asc())
        else:
            query = query.order_by(priority_case.desc())
    elif sort_by == 'due_date':
        if sort_order == 'asc':
            query = query.order_by(Task.due_date.asc().nulls_last())
        else:
            query = query.order_by(Task.due_date.desc().nulls_last())
    else:
        if sort_order == 'asc':
            query = query.order_by(Task.created_at.asc())
        else:
            query = query.order_by(Task.created_at.desc())

    paginated_tasks = query.paginate(page=page, per_page=per_page, error_out=False)

    tasks_data = []
    for t in paginated_tasks.items:
        tasks_data.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "assignee_id": t.assignee_id,
            "assignee_name": t.assignee.name if t.assignee else None,
            "completed_date": t.completed_date.isoformat() if t.completed_date else None,
            "created_at": t.created_at.isoformat()
        })

    return jsonify({
        "tasks": tasks_data,
        "total": paginated_tasks.total,
        "pages": paginated_tasks.pages,
        "current_page": paginated_tasks.page
    }), 200


@tasks_bp.route('/<task_id>', methods=['PUT'])
@jwt_required()
@require_project_membership(require_owner=False)
def update_task(project_id, current_member, task_id):
    data = request.get_json()
    task = Task.query.filter_by(id=task_id, project_id=project_id).first()

    if not task:
        return jsonify({"msg": "Task not found"}), 404

    # Capture original values BEFORE any mutation, purely for activity-log comparisons
    original_title = task.title

    new_status = data.get('status', task.status)

    if new_status not in VALID_STATUSES:
        return jsonify({"msg": f"Status must be one of {sorted(VALID_STATUSES)}"}), 400

    if new_status == 'Done' and task.status != 'Done':
        if current_member.role != 'owner' and task.assignee_id != current_member.user_id:
            return jsonify({"msg": "Only the project owner or the task assignee can mark this task as Done"}), 403

    if 'title' in data:
        title = data['title']
        if not title or title.strip() == '':
            return jsonify({"msg": "Task title cannot be empty"}), 400
        task.title = title.strip()

    if 'description' in data:
        task.description = data['description']

    if 'priority' in data:
        priority = data['priority']
        if priority not in VALID_PRIORITIES:
            return jsonify({"msg": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400
        task.priority = priority

    if 'due_date' in data:
        due_date_str = data['due_date']
        if due_date_str:
            try:
                task.due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({"msg": "Invalid due date format"}), 400
        else:
            task.due_date = None

    assignee_id = None
    if 'assignee_id' in data:
        assignee_id = data['assignee_id']
        if assignee_id:
            assignee_member = ProjectMember.query.filter_by(project_id=project_id, user_id=assignee_id).first()
            if not assignee_member:
                return jsonify({"msg": "Cannot assign task to a non-member of the project"}), 400
        task.assignee_id = assignee_id

    if new_status != task.status:
        if new_status == 'Done':
            task.completed_date = datetime.utcnow()
        elif task.status == 'Done':
            task.completed_date = None
        task.status = new_status

    db.session.commit()

    # Log activities based on what changed — compares against ORIGINAL values,
    # captured before mutation, not the already-updated task object.
    if 'title' in data and data['title'].strip() != original_title:
        log_activity(project_id, current_member.user_id, f"renamed task '{original_title}' to '{task.title}'")
    elif 'status' in data:
        log_activity(project_id, current_member.user_id, f"moved task '{task.title}' to '{new_status}'")
    elif 'assignee_id' in data:
        if assignee_id:
            assignee_user = User.query.get(assignee_id)
            log_activity(project_id, current_member.user_id, f"assigned task '{task.title}' to {assignee_user.name if assignee_user else 'Unknown'}")
        else:
            log_activity(project_id, current_member.user_id, f"unassigned task '{task.title}'")
    else:
        log_activity(project_id, current_member.user_id, f"updated task '{task.title}'")

    socketio.emit('task_updated', {"task_id": task_id, "project_id": project_id}, room=f"project_{project_id}")

    return jsonify({"msg": "Task updated successfully"}), 200


@tasks_bp.route('/<task_id>', methods=['DELETE'])
@jwt_required()
@require_project_membership(require_owner=False)
def delete_task(project_id, current_member, task_id):
    task = Task.query.filter_by(id=task_id, project_id=project_id).first()

    if not task:
        return jsonify({"msg": "Task not found"}), 404

    task_title = task.title  # capture before delete, same reasoning as removed_user_name in projects.py

    db.session.delete(task)
    db.session.commit()

    log_activity(project_id, current_member.user_id, f"deleted task '{task_title}'")

    socketio.emit('task_deleted', {"task_id": task_id, "project_id": project_id}, room=f"project_{project_id}")

    return jsonify({"msg": "Task deleted successfully"}), 200