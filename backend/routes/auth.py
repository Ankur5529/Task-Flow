import re
from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    set_refresh_cookies,
    unset_jwt_cookies
)
import bcrypt
from models import db, User

auth_bp = Blueprint('auth', __name__)

EMAIL_REGEX = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def is_valid_email(email):
    return bool(EMAIL_REGEX.match(email))

def validate_password(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Za-z]', password):
        return False, "Password must contain at least one letter"
    if not re.search(r'[0-9]', password):
        return False, "Password must contain at least one number"
    return True, None

# Feature 1: Sign up with name, email, password. Validate email format and enforce password rules you define and document.
@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password') or not data.get('name'):
        return jsonify({"msg": "Missing required fields (name, email, password)"}), 400

    email = data.get('email').strip().lower()
    password = data.get('password')
    name = data.get('name').strip()

    if not is_valid_email(email):
        return jsonify({"msg": "Invalid email format"}), 400

    is_valid, error_msg = validate_password(password)
    if not is_valid:
        return jsonify({"msg": error_msg}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email already registered"}), 409

    # Feature 3: Passwords hashed with bcrypt or argon2. Plaintext is an automatic fail.
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)

    new_user = User(
        name=name,
        email=email,
        password_hash=hashed.decode('utf-8')
    )

    db.session.add(new_user)
    db.session.commit()

    return jsonify({"msg": "User created successfully"}), 201

# Feature 2: Log in / log out using JWT with a refresh-token flow: a short-lived access token and a longer-lived refresh token.
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"msg": "Missing email or password"}), 400

    email = data.get('email').strip().lower()
    password = data.get('password')

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({"msg": "Bad email or password"}), 401

    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    resp = jsonify({
        "msg": "Login successful",
        "access_token": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    })
    set_refresh_cookies(resp, refresh_token)

    return resp, 200

# Feature 5: Expired access token returns 401 and the client transparently refreshes and retries.
@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)

    return jsonify({
        "access_token": new_access_token
    }), 200

@auth_bp.route('/logout', methods=['POST'])
def logout():
    resp = jsonify({"msg": "Logout successful"})
    unset_jwt_cookies(resp)
    return resp, 200

# Feature 5: Unauthenticated requests to protected endpoints return 401.
@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    return jsonify({
        "id": user.id,
        "name": user.name,
        "email": user.email
    }), 200