from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Comment, Task
from routes.projects import require_project_membership
from extensions import socketio
from activity_helper import log_activity

comments_bp = Blueprint('comments', __name__)

@comments_bp.route('', methods=['GET'])
@jwt_required()
@require_project_membership(require_owner=False)
def get_comments(project_id, current_member, task_id):
    # Verify the task belongs to the project
    task = Task.query.filter_by(id=task_id, project_id=project_id).first()
    if not task:
        return jsonify({"msg": "Task not found in this project"}), 404
        
    comments = Comment.query.filter_by(task_id=task_id).order_by(Comment.timestamp.asc()).all()
    
    comments_data = []
    for c in comments:
        comments_data.append({
            "id": c.id,
            "task_id": c.task_id,
            "user_id": c.user_id,
            "author_name": c.author.name if c.author else "Unknown",
            "content": c.content,
            "timestamp": c.timestamp.isoformat()
        })
        
    return jsonify(comments_data), 200

@comments_bp.route('', methods=['POST'])
@jwt_required()
@require_project_membership(require_owner=False)
def create_comment(project_id, current_member, task_id):
    data = request.get_json()
    current_user_id = get_jwt_identity()
    
    content = data.get('content')
    if not content or content.strip() == '':
        return jsonify({"msg": "Comment content cannot be empty"}), 400
        
    # Verify the task belongs to the project
    task = Task.query.filter_by(id=task_id, project_id=project_id).first()
    if not task:
        return jsonify({"msg": "Task not found in this project"}), 404
        
    new_comment = Comment(
        task_id=task_id,
        user_id=current_user_id,
        content=content.strip()
    )
    
    db.session.add(new_comment)
    db.session.commit()
    
    comment_data = {
        "id": new_comment.id,
        "task_id": new_comment.task_id,
        "project_id": project_id,
        "user_id": new_comment.user_id,
        "author_name": current_member.user.name,
        "content": new_comment.content,
        "timestamp": new_comment.timestamp.isoformat()
    }
    
    # Emit socket event to the project room for real-time updates
    socketio.emit('comment_created', comment_data, room=f"project_{project_id}")
    
    log_activity(project_id, current_user_id, f"commented on task '{task.title}'")
    
    return jsonify({
        "msg": "Comment added successfully",
        "comment": comment_data
    }), 201
