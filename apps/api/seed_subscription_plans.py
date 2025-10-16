"""
Seed subscription plans
Run this script to populate the database with subscription plans
"""
import sys
import os

# Add the app directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import Column, String, Text, Boolean, DateTime, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import SessionLocal, Base
import uuid


# Define a minimal SubscriptionPlan model to avoid circular imports
class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    description = Column(Text)
    price_monthly = Column(Numeric(10, 2), default=0)
    price_yearly = Column(Numeric(10, 2), default=0)
    features = Column(JSONB, default={})
    max_tarantulas = Column(Integer, default=10)
    can_edit_species = Column(Boolean, default=False)
    can_submit_species = Column(Boolean, default=False)
    has_advanced_filters = Column(Boolean, default=False)
    has_priority_support = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


def seed_subscription_plans():
    db = SessionLocal()
    
    try:
        # Check if plans already exist
        existing = db.query(SubscriptionPlan).count()
        if existing > 0:
            print(f"Subscription plans already exist ({existing} plans found). Skipping seed.")
            return
        
        plans = [
            # Free Plan
            SubscriptionPlan(
                id=uuid.uuid4(),
                name="free",
                display_name="Free",
                description="Perfect for beginners starting their tarantula journey",
                price_monthly=0,
                price_yearly=0,
                features={
                    "browse_species": True,
                    "search_species": True,
                    "add_tarantulas": True,
                    "track_feedings": True,
                    "track_molts": True,
                    "basic_analytics": True,
                    "community_access": True,
                },
                max_tarantulas=10,
                can_edit_species=False,
                can_submit_species=False,
                has_advanced_filters=False,
                has_priority_support=False,
            ),
            
            # Premium Plan
            SubscriptionPlan(
                id=uuid.uuid4(),
                name="premium",
                display_name="Premium",
                description="Full access for dedicated keepers and enthusiasts",
                price_monthly=4.99,
                price_yearly=49.99,
                features={
                    "everything_in_free": True,
                    "unlimited_tarantulas": True,
                    "edit_species_guides": True,
                    "submit_new_species": True,
                    "advanced_filters": True,
                    "bulk_operations": True,
                    "data_export": True,
                    "priority_support": True,
                    "ad_free": True,
                },
                max_tarantulas=-1,  # -1 means unlimited
                can_edit_species=True,
                can_submit_species=True,
                has_advanced_filters=True,
                has_priority_support=True,
            ),
            
            # Verified Contributor Plan
            SubscriptionPlan(
                id=uuid.uuid4(),
                name="verified",
                display_name="Verified Contributor",
                description="For recognized experts and breeders (invite-only)",
                price_monthly=0,  # Free for verified contributors
                price_yearly=0,
                features={
                    "all_premium_features": True,
                    "verified_badge": True,
                    "direct_publish": True,
                    "skip_review_queue": True,
                    "breeder_tools": True,
                    "exclusive_community": True,
                },
                max_tarantulas=-1,  # Unlimited
                can_edit_species=True,
                can_submit_species=True,
                has_advanced_filters=True,
                has_priority_support=True,
            ),
        ]
        
        for plan in plans:
            db.add(plan)
            print(f"✓ Created {plan.display_name} plan (${plan.price_monthly}/mo)")
        
        db.commit()
        print("\n✅ Successfully seeded subscription plans!")
        
    except Exception as e:
        print(f"❌ Error seeding subscription plans: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding subscription plans...")
    seed_subscription_plans()
