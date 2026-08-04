import sys
print(0)
from app import app
print(1)
from models import db, User
print(2)
with app.app_context():
    print(3)
    if User.query.first():
        print(4)
    else:
        print(5)
