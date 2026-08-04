from models import db, ActivityLog, User
from extensions import socketio

def log_activity(project_id, user_id, action_text):
    """
    Creates an ActivityLog entry and emits a socket event.
    Failures here are logged but never propagate — activity logging
    is a secondary concern and should never break the primary action
    (e.g. a comment or task update) that triggered it.
    """
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