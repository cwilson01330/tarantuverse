from app.database import SessionLocal
from app.models.user import User

def check_user_count():
    db = SessionLocal()
    try:
        count = db.query(User).count()
        print(f"Total users: {count}")
        
        # Check first user
        first = db.query(User).order_by(User.created_at.asc()).first()
        print(f"First user: {first.email} (ID: {first.id})")
        
        # Check last user
        last = db.query(User).order_by(User.created_at.desc()).first()
        print(f"Last user: {last.email} (ID: {last.id})")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_user_count()
