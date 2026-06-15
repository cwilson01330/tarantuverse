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
from app.models.user import User, FREE_TIER_MAX_ANIMALS


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

    current_count = db.query(Invert).filter(Invert.user_id == user.id).count()

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
