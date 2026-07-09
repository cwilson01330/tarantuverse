"""
Create (or reset) the app-store reviewer test account.

Play Console / App Store reviewers need a working login because the app
requires an account. This creates the account DIRECTLY in the DB — pre-verified
and active — which bypasses the registration password-complexity rule, so the
exact credentials pasted into the "App access" form work as-is.

Idempotent: if the account already exists, it resets the password and ensures
it's active + verified.

Run on the Render shell:  cd apps/api && python create_reviewer_account.py

NOTE: keep these values IDENTICAL to what you entered in the store's App access
form. Edit here if you used different ones.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.utils.auth import get_password_hash

# ── must match the store "App access" credentials exactly ────────────────────
EMAIL = "google_reviewer@herpetoverse.com"
USERNAME = "google_reviewer"
PASSWORD = "Google123"
DISPLAY_NAME = "App Reviewer"


def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).first()
        if user:
            user.hashed_password = get_password_hash(PASSWORD)
            user.is_active = True
            user.is_verified = True
            db.commit()
            print(f"✅ Reviewer account already existed — password reset + verified: {EMAIL}")
            return

        # username must also be unique — bail clearly if it's taken by someone else
        if db.query(User).filter(User.username == USERNAME).first():
            print(f"❌ Username '{USERNAME}' is taken by a different account. Pick another USERNAME and re-run.")
            return

        user = User(
            email=EMAIL,
            username=USERNAME,
            hashed_password=get_password_hash(PASSWORD),
            display_name=DISPLAY_NAME,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        print(f"🎉 Created reviewer account: {EMAIL} / {PASSWORD}")
        print("   Log in once yourself to confirm, then hand these to the reviewers.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
