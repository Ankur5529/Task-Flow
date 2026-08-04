from app import app
from models import db, User
print("Starting")
with app.app_context():
    print("Dropping")
    db.drop_all()
    print("Dropped")
