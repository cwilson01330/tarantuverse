"""
Bulk verify users who should be verified
Run this in Render shell to fix verification status
"""
from app.database import SessionLocal
from app.models.user import User

def bulk_verify_users():
    db = SessionLocal()

    # List of emails that should be verified
    emails_to_verify = [
        "apple.reviewer@tarantuverse.com",
        "cwil751@wgu.edu",
        # Add more emails here as needed
    ]

    verified_count = 0

    try:
        # Verify specific users
        for email in emails_to_verify:
            user = db.query(User).filter(User.email == email).first()
            if user:
                if not user.is_verified:
                    user.is_verified = True
                    user.verification_token = None
                    user.verification_token_expires_at = None
                    verified_count += 1
                    print(f"✅ Verified: {user.email}")
                else:
                    print(f"ℹ️  Already verified: {user.email}")
            else:
                print(f"❌ Not found: {email}")

        # Also verify all OAuth users (they should be auto-verified)
        oauth_users = db.query(User).filter(
            User.oauth_provider.isnot(None),
            User.is_verified == False
        ).all()

        for user in oauth_users:
            user.is_verified = True
            user.verification_token = None
            user.verification_token_expires_at = None
            verified_count += 1
            print(f"✅ Verified OAuth user: {user.email}")

        db.commit()
        print(f"\n✅ Successfully verified {verified_count} users")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    bulk_verify_users()
