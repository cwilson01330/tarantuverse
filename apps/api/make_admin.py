"""
Make a user an admin/superuser
Run on Render or locally with database access
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ DATABASE_URL environment variable not set")
    exit(1)

# Create engine and session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def make_admin():
    db = SessionLocal()

    try:
        print("=" * 60)
        print("MAKE USER ADMIN")
        print("=" * 60)

        # List all users
        users = db.execute(text("SELECT id, email, username, is_superuser FROM users")).fetchall()

        if not users:
            print("❌ No users found in database")
            return

        print("\nAvailable users:")
        for i, (user_id, email, username, is_super) in enumerate(users, 1):
            admin_status = "✅ ADMIN" if is_super else ""
            print(f"  {i}. {email} (@{username}) {admin_status}")

        # Get user choice
        print("\nEnter the number of the user to make admin:")
        choice = input("> ").strip()

        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(users):
                print("❌ Invalid choice")
                return

            user_id, email, username, is_super = users[idx]

            if is_super:
                print(f"\n⚠️  {email} is already an admin!")
                return

            # Make admin
            db.execute(
                text("UPDATE users SET is_superuser = true WHERE id = :id"),
                {"id": user_id}
            )
            db.commit()

            print(f"\n✅ {email} (@{username}) is now a SUPERUSER!")
            print("\nAs admin, you can now:")
            print("  • Edit any species information")
            print("  • Delete species")
            print("  • Verify community submissions")

        except ValueError:
            print("❌ Please enter a number")
            return

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    make_admin()
