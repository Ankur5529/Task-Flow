import os
from app import app, db
from dotenv import load_dotenv

load_dotenv()

def init_db():
    print(f"Initializing database using: {os.getenv('DATABASE_URL', 'sqlite:///app.db')}")
    with app.app_context():
        db.create_all()
        print("Database tables created successfully!")

if __name__ == '__main__':
    init_db()
