from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from models import db, Task, ProjectMember, Project
from sqlalchemy import func

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    current_user_id = get_jwt_identity()

    # Projects the user belongs to
    memberships = ProjectMember.query.filter_by(user_id=current_user_id).all()
    project_ids = [m.project_id for m in memberships]
    project_count = len(project_ids)

    # Tasks assigned to user by status
    assigned_tasks = Task.query.filter_by(assignee_id=current_user_id).all()
    tasks_by_status = {"To Do": 0, "In Progress": 0, "Done": 0}
    for t in assigned_tasks:
        if t.status in tasks_by_status:
            tasks_by_status[t.status] += 1

    # Tasks completed this week
    week_start = datetime.utcnow() - timedelta(days=7)
    completed_this_week = Task.query.filter(
        Task.assignee_id == current_user_id,
        Task.status == 'Done',
        Task.completed_date >= week_start
    ).count()

    # Project with most open tasks (To Do + In Progress)
    busiest_project = None
    if project_ids:
        open_tasks_by_project = db.session.query(
            Task.project_id,
            func.count(Task.id).label('open_count')
        ).filter(
            Task.project_id.in_(project_ids),
            Task.status.in_(['To Do', 'In Progress'])
        ).group_by(Task.project_id).order_by(func.count(Task.id).desc()).first()

        if open_tasks_by_project:
            proj = Project.query.get(open_tasks_by_project.project_id)
            if proj:
                busiest_project = {
                    "id": proj.id,
                    "name": proj.name,
                    "open_task_count": open_tasks_by_project.open_count
                }

    return jsonify({
        "project_count": project_count,
        "tasks_by_status": tasks_by_status,
        "completed_this_week": completed_this_week,
        "busiest_project": busiest_project
    }), 200
