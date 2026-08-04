from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import ActivityLog, ProjectMember
from routes.projects import require_project_membership

activity_bp = Blueprint('activity', __name__)

@activity_bp.route('/projects/<project_id>/activity', methods=['GET'])
@jwt_required()
@require_project_membership(require_owner=False)
def get_project_activity(project_id, current_member):
    logs = ActivityLog.query.filter_by(project_id=project_id).order_by(ActivityLog.timestamp.desc()).limit(50).all()
    
    logs_data = []
    for log in logs:
        logs_data.append({
            "id": log.id,
            "project_id": log.project_id,
            "user_id": log.user_id,
            "actor_name": log.actor.name if log.actor else "Unknown",
            "action": log.action,
            "timestamp": log.timestamp.isoformat()
        })
        
    return jsonify(logs_data), 200

@activity_bp.route('/activity/me', methods=['GET'])
@jwt_required()
def get_my_activity():
    current_user_id = get_jwt_identity()
    
    # Get all project IDs where user is a member
    memberships = ProjectMember.query.filter_by(user_id=current_user_id).all()
    project_ids = [m.project_id for m in memberships]
    
    if not project_ids:
        return jsonify([]), 200
        
    logs = ActivityLog.query.filter(ActivityLog.project_id.in_(project_ids)).order_by(ActivityLog.timestamp.desc()).limit(50).all()
    
    logs_data = []
    for log in logs:
        logs_data.append({
            "id": log.id,
            "project_id": log.project_id,
            "project_name": log.project.name if log.project else "Unknown",
            "user_id": log.user_id,
            "actor_name": log.actor.name if log.actor else "Unknown",
            "action": log.action,
            "timestamp": log.timestamp.isoformat()
        })
        
    return jsonify(logs_data), 200
