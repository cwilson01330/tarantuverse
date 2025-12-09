"""
Verify the Apple reviewer test account
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Get DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

# Create engine and session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    # Find the user
    from apps.api.app.models.user import User

    user = db.query(User).filter(User.email == "apple.reviewer@tarantuverse.com").first()

    if user:
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expires_at = None
        db.commit()
        print(f"✅ Successfully verified account: {user.email}")
        print(f"   Username: {user.username}")
        print(f"   User ID: {user.id}")
    else:
        print("❌ User not found")

except Exception as e:
    print(f"❌ Error: {e}")
    db.rollback()
finally:
    db.close()
