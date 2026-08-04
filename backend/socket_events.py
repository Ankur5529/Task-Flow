from flask import request
from flask_socketio import disconnect, join_room, leave_room
from flask_jwt_extended import decode_token
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from extensions import socketio
from models import User, ProjectMember

# Feature 22: Use WebSockets (Socket.io) for live updates.
@socketio.on('connect')
def handle_connect(auth):
    # Feature 25: The socket must be authenticated, and a user must only receive events for projects they are a member of.
    if not auth or 'token' not in auth:
        return False
        
    token = auth.get('token')
    
    try:
        decoded_token = decode_token(token)
        user_id = decoded_token['sub']
        
        user = User.query.get(user_id)
        if not user:
            return False
            
        # Feature 25: Scoping events to the right people by joining project-specific rooms.
        memberships = ProjectMember.query.filter_by(user_id=user.id).all()
        for membership in memberships:
            room_name = f"project_{membership.project_id}"
            join_room(room_name)
            
        # Feature 24: Global user-level socket room for "Assigned to me" live updates
        join_room(f"user_{user.id}")
            
    except ExpiredSignatureError:
        return False
    except InvalidTokenError:
        return False
    except Exception:
        return False

@socketio.on('disconnect')
def handle_disconnect():
    pass
