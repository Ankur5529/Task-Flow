from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
import uuid

db = SQLAlchemy()

def generate_uuid():
    return str(uuid.uuid4())

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    projects_owned = db.relationship('Project', back_populates='owner', cascade='all, delete-orphan')
    memberships = db.relationship('ProjectMember', back_populates='user', cascade='all, delete-orphan')

class Project(db.Model):
    __tablename__ = 'projects'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    owner_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    owner = db.relationship('User', back_populates='projects_owned')
    members = db.relationship('ProjectMember', back_populates='project', cascade='all, delete-orphan')
    tasks = db.relationship('Task', back_populates='project', cascade='all, delete-orphan')
    activity_logs = db.relationship('ActivityLog', back_populates='project', cascade='all, delete-orphan')

class ProjectMember(db.Model):
    __tablename__ = 'project_members'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False) # 'owner' or 'member'
    
    project = db.relationship('Project', back_populates='members')
    user = db.relationship('User', back_populates='memberships')
    
    __table_args__ = (db.UniqueConstraint('project_id', 'user_id', name='uq_project_user'),)

class Task(db.Model):
    __tablename__ = 'tasks'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False, index=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), nullable=False, default='To Do')
    priority = db.Column(db.String(20), nullable=False, default='Medium')
    due_date = db.Column(db.DateTime, nullable=True)
    assignee_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    completed_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)

    project = db.relationship('Project', back_populates='tasks')
    assignee = db.relationship('User', foreign_keys=[assignee_id])
    creator = db.relationship('User', foreign_keys=[created_by])
    comments = db.relationship('Comment', back_populates='task', cascade='all, delete-orphan')

class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    task_id = db.Column(db.String(36), db.ForeignKey('tasks.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    task = db.relationship('Task', back_populates='comments')
    author = db.relationship('User')

class ActivityLog(db.Model):
    __tablename__ = 'activity_logs'
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(255), nullable=False) 
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    project = db.relationship('Project', back_populates='activity_logs')
    actor = db.relationship('User')
