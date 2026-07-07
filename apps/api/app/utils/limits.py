"""Collection-limit enforcement for the free tier.

After the inverts consolidation (ADR-005) a keeper's collection spans
tarantulas, scorpions, and centipedes — all stored on, or mirrored
into, the unified `inverts` table. The free-tier cap is therefore
counted once against `inverts` and enforced on every invert create
route, replacing the old tarantula-only check.

Premium / unlimited plans use a sentinel of -1 and are never capped.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.invert import Invert
from app.models.colony import Colony
from app.models.animal import Animal
from app.models.user import User, FREE_TIER_MAX_ANIMALS, HV_FREE_TIER_MAX_ANIMALS


def active_colonies_query(db: Session, user_id):
    """Base query for a user's ACTIVE colonies (ADR-010).

    A colony is a first-class collection entry, so it counts as 1 animal
    toward the free-tier cap. Excludes archived (`is_active=False`) and
    handed-off (`transferred_out_at`) colonies — same exclusions the
    collection list uses, so counts and lists agree.
    """
    return db.query(Colony).filter(
        Colony.user_id == user_id,
        Colony.transferred_out_at.is_(None),
        Colony.is_active.is_(True),
    )


def active_inverts_query(db: Session, user_id):
    """Base query for a user's ACTIVE inverts — the single source of truth for
    "how many animals does this user have."

    Excludes records handed off via a transfer (`transferred_out_at IS NOT NULL`),
    so a breeder who sold 50 slings doesn't have them counting against the free
    cap or appearing in active collection counts (BRIEF §4b). Every count/list
    over a user's inverts should start from this query so the filter can't be
    forgotten in a new call site.
    """
    return db.query(Invert).filter(
        Invert.user_id == user_id,
        Invert.transferred_out_at.is_(None),
    )


def enforce_collection_limit(db: Session, user: User) -> None:
    """Raise HTTP 402 if the user is at or above their animal cap.

    Counts the user's rows in `inverts` (the cross-taxon source of
    truth). Call this BEFORE inserting the new animal so the count
    reflects only existing records.
    """
    limits = user.get_subscription_limits()
    max_animals = limits.get("max_animals", FREE_TIER_MAX_ANIMALS)

    # -1 means unlimited (premium / verified).
    if max_animals == -1:
        return

    # Cross-taxon count: individual animals (inverts) + population colonies,
    # each colony counting as 1 entry regardless of headcount (ADR-010).
    current_count = (
        active_inverts_query(db, user.id).count()
        + active_colonies_query(db, user.id).count()
    )

    if current_count >= max_animals:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": (
                    f"You've reached the limit of {max_animals} animals on the "
                    f"free plan. Upgrade to premium for unlimited tracking!"
                ),
                "current_count": current_count,
                "limit": max_animals,
                "is_premium": limits.get("is_premium", False),
            },
        )


def active_animals_query(db: Session, user_id):
    """Base query for a user's ACTIVE Herpetoverse animals (reptiles /
    amphibians). Excludes animals handed off via transfer, so counts and the
    collection list agree. Mirrors active_inverts_query for the `animals` table.
    """
    return db.query(Animal).filter(
        Animal.user_id == user_id,
        Animal.transferred_out_at.is_(None),
    )


def enforce_animal_limit(db: Session, user: User) -> None:
    """Raise HTTP 402 if the user is at or above their Herpetoverse animal cap.

    HV free tier = HV_FREE_TIER_MAX_ANIMALS animals. Premium is APP-SCOPED — only
    a Herpetoverse (or 'both' bundle) subscription lifts the HV cap; a
    Tarantuverse-only subscriber stays on the HV free tier. Call BEFORE inserting
    the new animal. The 402 detail shape matches enforce_collection_limit so the
    same UpgradeModal handles both apps.
    """
    # HV-scoped entitlement (not the global is_premium — HV bills separately).
    if user.is_premium_for_app("herpetoverse"):
        return

    cap = HV_FREE_TIER_MAX_ANIMALS
    current_count = active_animals_query(db, user.id).count()

    if current_count >= cap:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": (
                    f"You've reached the limit of {cap} animals on the free "
                    f"plan. Upgrade to premium for unlimited tracking!"
                ),
                "current_count": current_count,
                "limit": cap,
                "is_premium": False,
            },
        )
