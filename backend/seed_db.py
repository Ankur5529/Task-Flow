from app import app
from models import db, User, Project, ProjectMember, Task, Comment, ActivityLog
import bcrypt
from datetime import datetime, timedelta

def seed_db():
    with app.app_context():
        # Guard: if users already exist, skip seeding
        from models import User
        if User.query.first():
            print("Database already seeded — skipping.")
            return

        print("Clearing database...")
        db.drop_all()
        db.create_all()

        print("Creating users...")
        salt = bcrypt.gensalt()
        pw_hash = bcrypt.hashpw(b"password", salt).decode('utf-8')
        users = [
            User(name="Alice Owner", email="alice@example.com", password_hash=pw_hash),
            User(name="Bob Member", email="bob@example.com", password_hash=pw_hash),
            User(name="Charlie Member", email="charlie@example.com", password_hash=pw_hash),
        ]
        db.session.add_all(users)
        db.session.commit()

        alice = users[0]
        bob = users[1]
        charlie = users[2]

        print("Creating projects...")
        project1 = Project(name="Website Redesign", description="Overhaul of the main corporate website.", owner_id=alice.id)
        project2 = Project(name="Mobile App Launch", description="Q4 iOS and Android app release.", owner_id=bob.id)
        
        db.session.add_all([project1, project2])
        db.session.commit()

        print("Adding members...")
        members = [
            ProjectMember(project_id=project1.id, user_id=alice.id, role='owner'),
            ProjectMember(project_id=project1.id, user_id=bob.id, role='member'),
            ProjectMember(project_id=project1.id, user_id=charlie.id, role='member'),
            
            ProjectMember(project_id=project2.id, user_id=bob.id, role='owner'),
            ProjectMember(project_id=project2.id, user_id=alice.id, role='member'),
        ]
        db.session.add_all(members)
        db.session.commit()

        print("Creating tasks...")
        now = datetime.utcnow()
        tasks = [
            # Project 1 Tasks
            Task(project_id=project1.id, title="Design Homepage mockups", description="Create 3 variations of the new homepage.", status="Done", priority="High", due_date=now - timedelta(days=2), assignee_id=alice.id, created_by=alice.id, completed_date=now - timedelta(days=1)),
            Task(project_id=project1.id, title="Implement navigation bar", description="Build the responsive header.", status="In Progress", priority="Medium", due_date=now + timedelta(days=2), assignee_id=bob.id, created_by=alice.id),
            Task(project_id=project1.id, title="Write copy for About page", description="Draft content and send for review.", status="To Do", priority="Low", due_date=now + timedelta(days=5), assignee_id=charlie.id, created_by=alice.id),
            
            # Project 2 Tasks
            Task(project_id=project2.id, title="Configure push notifications", description="Setup Firebase Cloud Messaging.", status="In Progress", priority="High", due_date=now + timedelta(days=1), assignee_id=bob.id, created_by=bob.id),
            Task(project_id=project2.id, title="Test login flow on Android", description="Ensure biometric auth works.", status="To Do", priority="Medium", due_date=now + timedelta(days=3), assignee_id=alice.id, created_by=bob.id),
        ]
        db.session.add_all(tasks)
        db.session.commit()

        print("Adding comments...")
        comments = [
            Comment(task_id=tasks[0].id, user_id=alice.id, content="Finished the initial designs. Please review!"),
            Comment(task_id=tasks[0].id, user_id=bob.id, content="Looks great, Alice. I'll start slicing these today."),
            Comment(task_id=tasks[1].id, user_id=bob.id, content="I'm blocked on the mobile dropdown menu."),
            Comment(task_id=tasks[4].id, user_id=bob.id, content="Alice, could you handle the Android testing?")
        ]
        db.session.add_all(comments)
        db.session.commit()

        print("Creating activity logs...")
        logs = [
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"created project '{project1.name}'", timestamp=now - timedelta(days=5)),
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"invited {bob.name} to the project", timestamp=now - timedelta(days=4)),
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"invited {charlie.name} to the project", timestamp=now - timedelta(days=4)),
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"created task '{tasks[0].title}'", timestamp=now - timedelta(days=3)),
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"assigned task '{tasks[0].title}' to {alice.name}", timestamp=now - timedelta(days=3)),
            ActivityLog(project_id=project1.id, user_id=alice.id, action=f"moved task '{tasks[0].title}' to 'Done'", timestamp=now - timedelta(days=1)),
            ActivityLog(project_id=project2.id, user_id=bob.id, action=f"created project '{project2.name}'", timestamp=now - timedelta(days=2)),
        ]
        db.session.add_all(logs)
        db.session.commit()

        print("Database seeded successfully!")
        print("Login credentials:")
        print("1. email: alice@example.com | password: password")
        print("2. email: bob@example.com   | password: password")

if __name__ == "__main__":
    seed_db()
