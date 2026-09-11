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
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.subscription import UserSubscription


# How long entitlement survives a renewal that hasn't landed.
#
# A card declines and the subscriber is on the free tier the same day, for the
# whole of the provider's retry schedule — Stripe's default dunning runs to
# about three weeks, Apple's billing retry similarly. That punishes someone who
# never intended to stop paying for a bank fraud hold or an expired card.
#
# 14 days covers the realistic retry window without being open-ended. Bounded
# matters: indefinite grace is free premium for anyone who cancels their card.
# Grace ends IMMEDIATELY on provider cancellation, which sets status and
# cancelled_at and so fails the conditions below — it doesn't wait out the 14.
RENEWAL_GRACE_DAYS = 14


def _renewal_grace_clause(now: datetime):
    """Rows inside the post-expiry grace window.

    Three conditions, all required:
      * auto_renew — the subscriber intends to keep paying. Someone who turned
        renewal off chose to stop and gets no grace.
      * cancelled_at IS NULL — never cancelled by the user or the provider.
      * expires_at within the window — bounded, so this can't become permanent.

    NOTE the cancelled_at test belongs HERE and not on the outer clause. Stripe
    "cancel at period end" sets cancelled_at while the subscriber still has paid
    time remaining; putting it on the outer clause would revoke access they've
    already paid for.
    """
    return and_(
        UserSubscription.auto_renew.is_(True),
        UserSubscription.cancelled_at.is_(None),
        UserSubscription.expires_at > now - timedelta(days=RENEWAL_GRACE_DAYS),
    )


def active_subscription_clause():
    """SQLAlchemy filter: status is active AND (not past expires_at OR in grace).

    expires_at IS NULL means non-expiring (lifetime / free / admin grant).
    """
    now = datetime.now(timezone.utc)
    return and_(
        UserSubscription.status == "active",
        or_(
            UserSubscription.expires_at.is_(None),
            UserSubscription.expires_at > now,
            _renewal_grace_clause(now),
        ),
    )


def is_in_renewal_grace(sub: Optional[UserSubscription]) -> bool:
    """True if this row is entitled ONLY because of the grace window.

    For telling the subscriber their payment failed. Someone silently carried
    by grace and then cut off without warning is worse off than someone who
    was told on day one — they lose the chance to fix the card.
    """
    if sub is None or sub.expires_at is None:
        return False
    now = datetime.now(timezone.utc)
    expires = sub.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return (
        expires <= now
        and bool(sub.auto_renew)
        and sub.cancelled_at is None
        and expires > now - timedelta(days=RENEWAL_GRACE_DAYS)
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

    SKIPS rows still inside the renewal grace window. Without that this would
    quietly defeat the grace period: active_subscription_clause requires
    status='active', so flipping a grace row to 'expired' would revoke
    entitlement the moment anything called this — which /subscriptions/me does
    on every read.
    """
    now = datetime.now(timezone.utc)
    grace_cutoff = now - timedelta(days=RENEWAL_GRACE_DAYS)
    stale = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active",
            UserSubscription.expires_at.isnot(None),
            UserSubscription.expires_at <= now,
            # Not in grace: renewal is off, or it was cancelled, or the window
            # has run out.
            or_(
                UserSubscription.auto_renew.is_(False),
                UserSubscription.auto_renew.is_(None),
                UserSubscription.cancelled_at.isnot(None),
                UserSubscription.expires_at <= grace_cutoff,
            ),
        )
        .all()
    )

    for sub in stale:
        sub.status = "expired"

    if stale:
        db.flush()

    return len(stale)
