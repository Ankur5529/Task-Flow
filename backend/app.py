try:
    import eventlet
    eventlet.monkey_patch()
except ImportError:
    pass

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from flask_migrate import Migrate
from dotenv import load_dotenv

from extensions import socketio
from models import db

# Load environment variables
load_dotenv()

FRONTEND_ORIGIN = os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173')

def create_app():
    app = Flask(__name__)

    # Configure CORS — must be a specific origin, not "*", because
    # supports_credentials=True requires an explicit origin per CORS spec
    CORS(app, supports_credentials=True, resources={r"/*": {"origins": FRONTEND_ORIGIN}})

    # Configure Database
    db_url = os.getenv('DATABASE_URL', 'sqlite:///app.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Configure JWT
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secret-default-key')
    app.config['JWT_TOKEN_LOCATION'] = ['headers', 'cookies']
    # If in production (Render), these must be True & 'None' for cross-domain cookies to work!
    is_prod = os.getenv('FLASK_ENV') == 'production' or 'onrender.com' in FRONTEND_ORIGIN
    app.config['JWT_COOKIE_SECURE'] = is_prod
    app.config['JWT_COOKIE_SAMESITE'] = 'None' if is_prod else 'Lax'
    app.config['JWT_REFRESH_COOKIE_PATH'] = '/auth/refresh'
    # NOTE: CSRF protection on the refresh cookie is disabled for dev simplicity.
    # Documented as a known trade-off in README — should be enabled before real production use.
    app.config['JWT_COOKIE_CSRF_PROTECT'] = False

    # Initialize extensions
    db.init_app(app)
    jwt = JWTManager(app)
    migrate = Migrate(app, db)
    
    # Register blueprints
    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.tasks import tasks_bp
    from routes.comments import comments_bp
    from routes.activity import activity_bp
    from routes.user_tasks import user_tasks_bp
    from routes.dashboard import dashboard_bp
    
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(projects_bp, url_prefix='/projects')
    app.register_blueprint(tasks_bp, url_prefix='/projects/<project_id>/tasks')
    app.register_blueprint(comments_bp, url_prefix='/projects/<project_id>/tasks/<task_id>/comments')
    app.register_blueprint(activity_bp, url_prefix='')
    app.register_blueprint(user_tasks_bp, url_prefix='/tasks')
    app.register_blueprint(dashboard_bp, url_prefix='/dashboard')
    
    # Import socket events to register them
    import socket_events

    @app.route('/health')
    def health_check():
        return jsonify({"status": "healthy"}), 200

    return app

app = create_app()
socketio.init_app(app, cors_allowed_origins=FRONTEND_ORIGIN)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)