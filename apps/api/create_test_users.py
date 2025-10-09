"""
Create test user accounts for testing follow/messaging features
"""
import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal, engine
from app.utils.auth import get_password_hash
import uuid

def create_test_users():
    """Create a few test user accounts"""
    db = SessionLocal()
    
    test_users = [
        {
            "email": "tarantulafan@example.com",
            "username": "tarantulafan",
            "display_name": "Sarah the Spider Expert",
            "password": "testpass123",
            "profile_bio": "Hobbyist keeper with 15+ years experience. Love arboreal species!",
            "profile_location": "Portland, OR",
            "profile_experience_level": "expert",
            "profile_years_keeping": 15,
            "profile_specialties": ["arboreal", "new_world"]
        },
        {
            "email": "spidercollector@example.com",
            "username": "spidercollector",
            "display_name": "Mike's Tarantula Collection",
            "password": "testpass123",
            "profile_bio": "Breeding and raising tarantulas since 2018. Specializing in terrestrial species.",
            "profile_location": "Austin, TX",
            "profile_experience_level": "advanced",
            "profile_years_keeping": 7,
            "profile_specialties": ["terrestrial", "old_world"]
        },
        {
            "email": "newkeeper@example.com",
            "username": "newkeeper",
            "display_name": "Alex - New to Tarantulas",
            "password": "testpass123",
            "profile_bio": "Just got my first T! Learning as much as I can. Open to advice!",
            "profile_location": "Denver, CO",
            "profile_experience_level": "beginner",
            "profile_years_keeping": 1,
            "profile_specialties": ["terrestrial"]
        }
    ]
    
    created_users = []
    
    for user_data in test_users:
        # Check if user already exists using raw SQL to avoid model relationship issues
        result = db.execute(
            text("SELECT username FROM users WHERE username = :username"),
            {"username": user_data["username"]}
        ).first()
        
        if result:
            print(f"⚠️  User {user_data['username']} already exists, skipping...")
            continue
        
        # Create new user using raw SQL
        user_id = str(uuid.uuid4())
        hashed_password = get_password_hash(user_data["password"])
        
        db.execute(
            text("""
                INSERT INTO users (
                    id, email, username, display_name, hashed_password,
                    profile_bio, profile_location, profile_experience_level,
                    profile_years_keeping, profile_specialties, collection_visibility,
                    is_active
                ) VALUES (
                    :id, :email, :username, :display_name, :hashed_password,
                    :profile_bio, :profile_location, :profile_experience_level,
                    :profile_years_keeping, :profile_specialties, :collection_visibility,
                    :is_active
                )
            """),
            {
                "id": user_id,
                "email": user_data["email"],
                "username": user_data["username"],
                "display_name": user_data["display_name"],
                "hashed_password": hashed_password,
                "profile_bio": user_data.get("profile_bio"),
                "profile_location": user_data.get("profile_location"),
                "profile_experience_level": user_data.get("profile_experience_level"),
                "profile_years_keeping": user_data.get("profile_years_keeping"),
                "profile_specialties": user_data.get("profile_specialties"),
                "collection_visibility": "public",
                "is_active": True
            }
        )
        
        created_users.append(user_data["username"])
    
    try:
        db.commit()
        print(f"\n✅ Successfully created {len(created_users)} test users!")
        print("\n📋 Test User Credentials:")
        print("=" * 60)
        for user_data in test_users:
            if user_data["username"] in created_users:
                print(f"\n👤 {user_data['display_name']}")
                print(f"   Username: {user_data['username']}")
                print(f"   Email: {user_data['email']}")
                print(f"   Password: {user_data['password']}")
                print(f"   Experience: {user_data.get('profile_experience_level', 'N/A')}")
                print(f"   Location: {user_data.get('profile_location', 'N/A')}")
        print("\n" + "=" * 60)
        print("\n💡 You can now use these accounts to test:")
        print("   - Follow/Unfollow functionality")
        print("   - Direct messaging between users")
        print("   - Viewing other users' profiles and collections")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error creating users: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("🕷️  Creating test user accounts...\n")
    create_test_users()
