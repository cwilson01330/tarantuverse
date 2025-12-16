"""
Fix premium plan - enable can_use_breeding

Run this script to update the premium plan to have can_use_breeding = True
Usage: python fix_premium_plan.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.subscription import SubscriptionPlan


def fix_premium_plan():
    """Update premium plan to enable breeding"""
    db = SessionLocal()

    try:
        # Find premium plan
        premium_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "premium"
        ).first()

        if not premium_plan:
            print("❌ Premium plan not found!")
            return

        print(f"Found premium plan: {premium_plan.display_name}")
        print(f"  Current can_use_breeding: {premium_plan.can_use_breeding}")
        print(f"  Current max_photos_per_tarantula: {premium_plan.max_photos_per_tarantula}")

        # Update the plan
        premium_plan.can_use_breeding = True
        premium_plan.max_photos_per_tarantula = -1  # Unlimited for premium

        db.commit()

        print("\n✅ Premium plan updated!")
        print(f"  can_use_breeding: {premium_plan.can_use_breeding}")
        print(f"  max_photos_per_tarantula: {premium_plan.max_photos_per_tarantula}")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🔧 Fixing premium plan...")
    fix_premium_plan()
