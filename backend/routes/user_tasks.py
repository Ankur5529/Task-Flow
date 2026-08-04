from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Task

user_tasks_bp = Blueprint('user_tasks', __name__)

@user_tasks_bp.route('/me', methods=['GET'])
@jwt_required()
def get_my_tasks():
    current_user_id = get_jwt_identity()
    
    # Requirement #18: "Assigned to Me"
    # Query tasks where assignee_id == current_user_id
    # Sort by due date (nulls last)
    tasks = Task.query.filter_by(assignee_id=current_user_id).order_by(Task.due_date.asc().nulls_last()).all()
    
    tasks_data = []
    for t in tasks:
        tasks_data.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "project_id": t.project_id,
            "project_name": t.project.name if t.project else "Unknown Project"
        })
        
    return jsonify(tasks_data), 200
