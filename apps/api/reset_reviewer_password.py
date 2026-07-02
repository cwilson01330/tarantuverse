"""
reset_reviewer_password.py — set a known password on a store-reviewer account.

Purpose: the Google/Apple review demo accounts log in with email + password.
This sets that password to a known value so it can be entered in Play Console
(Policy > App content > App access) / App Store Connect review notes.

Hashes through the app's own bcrypt context (utils.auth.get_password_hash), so
the resulting login works exactly like a normal sign-in. Does NOT run the
password-complexity validator (that only guards the public register/reset
endpoints) — a reviewer demo password can be simple.

Defaults to google.reviewer@tarantuverse.com and password "google123".
Override either without editing the file:
    REVIEWER_EMAIL=apple.reviewer@tarantuverse.com REVIEWER_PW=Secret1! python3 reset_reviewer_password.py

Run on the Render shell:
    cd apps/api
    python3 reset_reviewer_password.py

Safety: refuses to run against an account that isn't one of the known reviewer
emails, so it can't be pointed at a real user by accident.
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.utils.auth import get_password_hash

ALLOWED_REVIEWER_EMAILS = {
    "google.reviewer@tarantuverse.com",
    "apple.reviewer@tarantuverse.com",
}

EMAIL = os.environ.get("REVIEWER_EMAIL", "google.reviewer@tarantuverse.com").strip().lower()
PASSWORD = os.environ.get("REVIEWER_PW", "google123")


def main():
    if EMAIL not in ALLOWED_REVIEWER_EMAILS:
        print(
            f"ABORT: {EMAIL!r} is not a known reviewer account. "
            f"Allowed: {', '.join(sorted(ALLOWED_REVIEWER_EMAILS))}"
        )
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).first()
        if user is None:
            print(f"ABORT: no user with email {EMAIL!r}.")
            return

        user.hashed_password = get_password_hash(PASSWORD)
        user.is_active = True
        user.is_verified = True  # so login isn't blocked if verification is required
        db.commit()
        print(f"OK: password for {EMAIL} set. Username: {user.username}")
        print("Log in with EMAIL + the password you set (email/password, not OAuth).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
