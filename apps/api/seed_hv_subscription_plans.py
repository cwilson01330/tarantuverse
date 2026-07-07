"""
Seed Herpetoverse subscription plans (app-scoped — hvs_20260707).

Adds two plans on top of the existing TV free/premium rows:

  • herpetoverse_premium (app='herpetoverse') — HV standalone, priced to MATCH
    Tarantuverse premium ($4.99 / $44.99 / $149.99). Unlocks unlimited animals +
    HV premium features (breeding, feeder-keeping, detailed analytics).

  • bundle_premium (app='both') — All-Access, covers BOTH apps. $6.99 / $69.99 /
    $249. Doubles as the TV-subscriber add-on (upgrade to the bundle).

Premium is resolved PER-APP by User.is_premium_for_app(); a 'herpetoverse' or
'both' plan lifts the HV cap/gates, a 'tarantuverse' plan does not.

NOTE: these DB rows carry the display price + entitlement flags. The actual
charge happens via the store/Stripe products you create separately — map each
plan to its Apple/Google/Stripe product id when you wire the purchase flow.

Idempotent. Run on the Render shell:  python seed_hv_subscription_plans.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import exists

from app.database import SessionLocal
from app.models.subscription import SubscriptionPlan


# HV premium unlocks these (same single-premium boolean TV uses; can_use_breeding
# also gates advanced analytics via get_subscription_limits.can_use_analytics).
_HV_FEATURES = {
    "tracking": ["feeding", "sheds", "weights", "breeding"],
    "species_database": "full_access",
    "community": "full_access",
    "analytics": "advanced",
    "support": "priority",
    "data_export": ["json", "csv", "zip"],
    "breeding_module": "full_access",      # reptile pairings / clutches / genetics
    "feeder_keeping": "full_access",       # feeder colony tracking
}


def seed_hv_plans():
    db = SessionLocal()
    try:
        created = []

        if not db.query(exists().where(SubscriptionPlan.name == "herpetoverse_premium")).scalar():
            db.add(SubscriptionPlan(
                name="herpetoverse_premium",
                display_name="Herpetoverse Premium",
                description="Unlimited animals, breeding, feeder keeping, and detailed analytics for reptiles & amphibians.",
                app="herpetoverse",
                price_monthly=4.99,       # matches Tarantuverse premium
                price_yearly=44.99,
                price_lifetime=149.99,
                max_tarantulas=-1,
                max_animals=-1,           # unlimited
                can_edit_species=False,
                can_submit_species=True,
                has_advanced_filters=True,
                has_priority_support=True,
                can_use_breeding=True,    # gates HV breeding + feeder + advanced analytics
                max_photos_per_tarantula=-1,
                features=_HV_FEATURES,
            ))
            created.append("herpetoverse_premium ($4.99 / $44.99 / $149.99)")

        if not db.query(exists().where(SubscriptionPlan.name == "bundle_premium")).scalar():
            db.add(SubscriptionPlan(
                name="bundle_premium",
                display_name="All-Access (Tarantuverse + Herpetoverse)",
                description="Premium across both apps — every taxon, unlimited tracking, breeding, and analytics. Also the add-on for existing subscribers.",
                app="both",
                price_monthly=6.99,
                price_yearly=69.99,
                price_lifetime=249.00,
                max_tarantulas=-1,
                max_animals=-1,
                can_edit_species=False,
                can_submit_species=True,
                has_advanced_filters=True,
                has_priority_support=True,
                can_use_breeding=True,
                max_photos_per_tarantula=-1,
                features={**_HV_FEATURES, "apps": ["tarantuverse", "herpetoverse"]},
            ))
            created.append("bundle_premium ($6.99 / $69.99 / $249)")

        if not created:
            print("✅ HV plans already exist. Nothing to do.")
            return

        db.commit()
        print("🎉 Seeded HV subscription plans:")
        for c in created:
            print(f"  • {c}")
        print("\nReminder: map each plan to its Apple/Google/Stripe product id when")
        print("wiring the purchase flow. Premium is app-scoped via is_premium_for_app().")

    except Exception as e:
        print(f"❌ Error seeding HV plans: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding Herpetoverse subscription plans...")
    seed_hv_plans()
