from flask import request
from flask_socketio import disconnect, join_room, leave_room
from flask_jwt_extended import decode_token
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from extensions import socketio
from models import User, ProjectMember

@socketio.on('connect')
def handle_connect(auth):
    """
    Authenticate the socket connection using the JWT access token.
    If valid, join a room for every project the user is a member of.
    """
    if not auth or 'token' not in auth:
        print("Socket connection rejected: No token provided")
        return False # Reject connection
        
    token = auth.get('token')
    
    try:
        # Verify the JWT token manually since we aren't in a standard request context
        decoded_token = decode_token(token)
        user_id = decoded_token['sub']
        
        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            print("Socket connection rejected: User not found")
            return False
            
        print(f"Socket connected for user: {user.email}")
        
        # Join a room for each project they belong to
        # This ensures they only receive events for their own projects (Requirement #25)
        memberships = ProjectMember.query.filter_by(user_id=user.id).all()
        for membership in memberships:
            room_name = f"project_{membership.project_id}"
            join_room(room_name)
            print(f"User {user.email} joined socket room: {room_name}")
            
    except ExpiredSignatureError:
        print("Socket connection rejected: Token expired")
        return False
    except InvalidTokenError:
        print("Socket connection rejected: Invalid token")
        return False
    except Exception as e:
        print(f"Socket connection rejected: {str(e)}")
        return False

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected:', request.sid)
