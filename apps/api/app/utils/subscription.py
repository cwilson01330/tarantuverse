"""Shared subscription entitlement helpers.

A subscription row with status='active' is NOT sufficient proof of
premium: provider webhooks (Stripe) or receipt re-validation (Apple /
Google) may never arrive, leaving stale rows that look active forever.
Every entitlement read must also check expires_at.

Use `active_subscription_clause()` in queries, or
`expire_stale_subscriptions()` to lazily flip stale rows to 'expired'
(safe: a late renewal webhook keys on payment_provider_id, not status,
via its own lookup — and a renewed user simply gets a fresh row).
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.subscription import UserSubscription


def active_subscription_clause():
    """SQLAlchemy filter: status is active AND not past expires_at.

    expires_at IS NULL means non-expiring (lifetime / free / admin grant).
    """
    return and_(
        UserSubscription.status == "active",
        or_(
            UserSubscription.expires_at.is_(None),
            UserSubscription.expires_at > datetime.now(timezone.utc),
        ),
    )


def get_active_subscription(db: Session, user_id) -> Optional[UserSubscription]:
    """Return the user's current, non-expired active subscription (or None)."""
    return (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user_id,
            active_subscription_clause(),
        )
        .order_by(UserSubscription.started_at.desc())
        .first()
    )


def expire_stale_subscriptions(db: Session, user_id) -> int:
    """Flip status='active' rows past their expires_at to 'expired'.

    Returns the number of rows updated. Caller is responsible for
    commit (we flush so subsequent queries in the same transaction see
    the change).
    """
    stale = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active",
            UserSubscription.expires_at.isnot(None),
            UserSubscription.expires_at <= datetime.now(timezone.utc),
        )
        .all()
    )

    for sub in stale:
        sub.status = "expired"

    if stale:
        db.flush()

    return len(stale)
