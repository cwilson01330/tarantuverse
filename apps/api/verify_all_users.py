"""
Verify ALL users in the database
Use this if you want to bypass email verification for testing/development
Run in Render shell: python verify_all_users.py
"""
from app.database import SessionLocal
from app.models.user import User

def verify_all_users():
    db = SessionLocal()

    try:
        # Get all unverified users
        unverified_users = db.query(User).filter(User.is_verified == False).all()

        print(f"Found {len(unverified_users)} unverified users\n")

        if len(unverified_users) == 0:
            print("✅ All users are already verified!")
            return

        # Ask for confirmation
        print("Users to verify:")
        for user in unverified_users:
            print(f"  - {user.email} (@{user.username})")

        print(f"\n⚠️  About to verify {len(unverified_users)} users")
        confirm = input("Type 'yes' to proceed: ")

        if confirm.lower() != 'yes':
            print("❌ Cancelled")
            return

        # Verify all users
        for user in unverified_users:
            user.is_verified = True
            user.verification_token = None
            user.verification_token_expires_at = None
            print(f"✅ Verified: {user.email}")

        db.commit()
        print(f"\n✅ Successfully verified {len(unverified_users)} users!")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    verify_all_users()
