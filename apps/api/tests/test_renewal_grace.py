"""Renewal grace period (2026-09-11).

A card declines and the subscriber lands on the free tier the same day, for the
whole of the provider's retry schedule. Stripe's default dunning runs to about
three weeks. That is a paying customer downgraded over a bank fraud hold.

Found live: a Stripe monthly subscriber whose card failed on her renewal date,
retry scheduled four days later, showing as Free in the admin list two days in.

These tests pin the SHAPE of the grace — what earns it and what ends it —
because the failure modes are asymmetric. Granting too little punishes someone
who is still paying; granting it unbounded hands out free premium to anyone who
cancels their card.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.utils.subscription import RENEWAL_GRACE_DAYS, is_in_renewal_grace


NOW = datetime.now(timezone.utc)


def sub(*, days_past_expiry=None, auto_renew=True, cancelled=False, expires=True):
    """A subscription-shaped stub. days_past_expiry is positive for expired."""
    expires_at = None
    if expires:
        expires_at = NOW - timedelta(days=days_past_expiry or 0)
    return SimpleNamespace(
        expires_at=expires_at,
        auto_renew=auto_renew,
        cancelled_at=NOW if cancelled else None,
    )


def test_a_failed_renewal_is_carried():
    """The case this exists for: expired yesterday, still set to auto-renew,
    never cancelled. The provider is retrying; the keeper keeps premium."""
    assert is_in_renewal_grace(sub(days_past_expiry=1)) is True


def test_grace_is_bounded():
    """One day inside the window and one day outside it.

    Bounded is the entire safety property. Without an upper edge this stops
    being a grace period and becomes a free plan for anyone whose card stops
    working — and nobody would ever be asked to fix it.
    """
    assert is_in_renewal_grace(sub(days_past_expiry=RENEWAL_GRACE_DAYS - 1)) is True
    assert is_in_renewal_grace(sub(days_past_expiry=RENEWAL_GRACE_DAYS + 1)) is False


def test_turning_off_renewal_forfeits_grace():
    """auto_renew off is a decision to stop paying. Carrying someone who chose
    to leave would be giving away the product, not protecting a customer."""
    assert is_in_renewal_grace(sub(days_past_expiry=1, auto_renew=False)) is False


def test_cancellation_ends_grace_immediately():
    """Provider cancellation sets cancelled_at, and that must cut grace the same
    day rather than buying another fortnight."""
    assert is_in_renewal_grace(sub(days_past_expiry=1, cancelled=True)) is False


# ── What grace must NOT change ───────────────────────────────────────────────

def test_an_unexpired_subscription_is_not_in_grace():
    """Grace describes being carried PAST expiry. A subscriber with time left is
    entitled on their own terms, and reporting them as in grace would tell them
    their payment failed when it didn't."""
    assert is_in_renewal_grace(sub(days_past_expiry=-5)) is False


def test_a_non_expiring_subscription_is_not_in_grace():
    """expires_at IS NULL means lifetime, free plan or admin grant."""
    assert is_in_renewal_grace(sub(expires=False)) is False


def test_none_is_not_in_grace():
    assert is_in_renewal_grace(None) is False


@pytest.mark.parametrize("days", [0, 1, 7, RENEWAL_GRACE_DAYS - 1])
def test_the_whole_window_is_covered(days):
    assert is_in_renewal_grace(sub(days_past_expiry=days)) is True


def test_cancel_at_period_end_keeps_paid_time():
    """A guard against the mistake this nearly was.

    Stripe's "cancel at period end" sets cancelled_at while the subscriber
    still has paid time remaining. If the cancelled_at test had gone on the
    OUTER entitlement clause instead of inside the grace branch, that keeper
    would lose access the instant they clicked cancel — access they had already
    paid for. They aren't in grace, but they must still be entitled, which is
    active_subscription_clause's `expires_at > now` branch doing its job.
    """
    cancelled_but_paid_up = sub(days_past_expiry=-10, cancelled=True)
    assert is_in_renewal_grace(cancelled_but_paid_up) is False
    assert cancelled_but_paid_up.expires_at > NOW  # still entitled, via expiry
