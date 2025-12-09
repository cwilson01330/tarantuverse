"""
Verify the Apple reviewer test account
"""
from app.database import SessionLocal
from app.models.user import User

def verify_reviewer_account():
    db = SessionLocal()
    try:
        # Find the user
        user = db.query(User).filter(User.email == "apple.reviewer@tarantuverse.com").first()

        if user:
            user.is_verified = True
            user.verification_token = None
            user.verification_token_expires_at = None
            db.commit()
            print(f"✅ Successfully verified account: {user.email}")
            print(f"   Username: {user.username}")
            print(f"   User ID: {user.id}")
            print(f"   Display Name: {user.display_name}")
        else:
            print("❌ User not found")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    verify_reviewer_account()
