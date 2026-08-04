from models import db, ActivityLog, User
from extensions import socketio

# Feature 21: Record key events per project: task created, task moved, task assigned, member invited, member removed, comment added.
def log_activity(project_id, user_id, action_text):
    try:
        log_entry = ActivityLog(
            project_id=project_id,
            user_id=user_id,
            action=action_text
        )
        db.session.add(log_entry)
        db.session.commit()

        user = User.query.get(user_id)

        activity_data = {
            "id": log_entry.id,
            "project_id": log_entry.project_id,
            "user_id": log_entry.user_id,
            "actor_name": user.name if user else "Unknown",
            "action": log_entry.action,
            "timestamp": log_entry.timestamp.isoformat()
        }

        socketio.emit('activity_logged', activity_data, room=f"project_{project_id}")
        return log_entry
    except Exception as e:
        # Roll back any partial changes from the failed log write so it
        # doesn't leave the session in a broken state for the caller.
        db.session.rollback()
        print(f"Failed to log activity for project {project_id}: {e}")
        return None