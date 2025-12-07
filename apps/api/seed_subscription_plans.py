"""
Seed subscription plans

Run this script to initialize Free and Premium subscription plans.
Usage: python seed_subscription_plans.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.subscription import SubscriptionPlan
from sqlalchemy import exists


def seed_plans():
    """Seed subscription plans in database"""
    db = SessionLocal()

    try:
        # Check if plans already exist
        free_exists = db.query(exists().where(SubscriptionPlan.name == "free")).scalar()
        premium_exists = db.query(exists().where(SubscriptionPlan.name == "premium")).scalar()

        if free_exists and premium_exists:
            print("✅ Subscription plans already exist. Skipping seed.")
            return

        # Create Free plan
        if not free_exists:
            free_plan = SubscriptionPlan(
                name="free",
                display_name="Free Plan",
                description="Perfect for casual keepers with small collections",
                price_monthly=0,
                price_yearly=0,
                price_lifetime=0,
                max_tarantulas=15,  # Free tier limit
                can_edit_species=False,
                can_submit_species=True,  # Can submit species for review
                has_advanced_filters=False,
                has_priority_support=False,
                can_use_breeding=False,  # Breeding is premium only
                max_photos_per_tarantula=5,  # 5 photos per tarantula on free
                features={
                    "tracking": ["feeding", "molts", "substrate_changes"],
                    "species_database": "full_access",
                    "community": "full_access",
                    "analytics": "basic",
                    "support": "community"
                }
            )
            db.add(free_plan)
            print("✅ Created Free plan")

        # Create Premium plan
        if not premium_exists:
            premium_plan = SubscriptionPlan(
                name="premium",
                display_name="Premium Plan",
                description="Unlock unlimited tracking, breeding module, and advanced features",
                price_monthly=4.99,
                price_yearly=44.99,  # 25% savings
                price_lifetime=149.99,
                max_tarantulas=-1,  # -1 = unlimited
                can_edit_species=False,  # Reserved for admins
                can_submit_species=True,
                has_advanced_filters=True,
                has_priority_support=True,
                can_use_breeding=True,  # PREMIUM FEATURE
                max_photos_per_tarantula=-1,  # -1 = unlimited
                features={
                    "tracking": ["feeding", "molts", "substrate_changes", "breeding"],
                    "species_database": "full_access",
                    "community": "full_access",
                    "analytics": "advanced",
                    "support": "priority",
                    "data_export": ["csv", "pdf"],
                    "breeding_module": "full_access"
                }
            )
            db.add(premium_plan)
            print("✅ Created Premium plan")

        db.commit()
        print("\n🎉 Subscription plans seeded successfully!")
        print("\nPlan Summary:")
        print("━" * 60)
        print("FREE PLAN:")
        print("  • 15 tarantulas max")
        print("  • 5 photos per tarantula")
        print("  • Basic tracking (feeding, molts, substrate)")
        print("  • Community features")
        print("  • Species database access")
        print("\nPREMIUM PLAN:")
        print("  • Unlimited tarantulas")
        print("  • Unlimited photos")
        print("  • Full breeding module (pairings, egg sacs, offspring)")
        print("  • Advanced analytics")
        print("  • Priority support")
        print("  • Data export (CSV/PDF)")
        print("\nPricing:")
        print("  • $4.99/month")
        print("  • $44.99/year (save 25%)")
        print("  • $149.99 lifetime")
        print("━" * 60)

    except Exception as e:
        print(f"❌ Error seeding subscription plans: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding subscription plans...")
    seed_plans()
