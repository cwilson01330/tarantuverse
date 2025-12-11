#!/usr/bin/env python3
"""
Quick script to check your user permissions and optionally set admin flags
Run from the apps/api directory
"""
import sys
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.models.user import User
from app.config import settings

def main():
    # Get your email
    email = input("Enter your email address: ").strip()

    if not email:
        print("❌ Email is required")
        return

    # Connect to database
    engine = create_engine(settings.DATABASE_URL)

    with Session(engine) as session:
        # Find user
        user = session.query(User).filter(User.email == email).first()

        if not user:
            print(f"❌ User not found with email: {email}")
            return

        # Display current permissions
        print(f"\n✅ Found user: {user.username} ({user.email})")
        print(f"   ID: {user.id}")
        print(f"   is_admin: {user.is_admin}")
        print(f"   is_superuser: {user.is_superuser}")
        print(f"   is_active: {user.is_active}")
        print(f"   is_verified: {user.is_verified}")

        # Check if they need admin access
        if user.is_admin or user.is_superuser:
            print("\n✅ You already have admin access!")
            print(f"   Access level: {'Superuser' if user.is_superuser else 'Admin'}")
        else:
            print("\n⚠️  You don't have admin access")
            response = input("Set as admin? (y/n): ").strip().lower()

            if response == 'y':
                user.is_admin = True
                user.is_superuser = True  # Give full access
                session.commit()
                print("✅ Admin and superuser flags set!")
                print(f"   is_admin: {user.is_admin}")
                print(f"   is_superuser: {user.is_superuser}")
            else:
                print("No changes made")

if __name__ == "__main__":
    main()
