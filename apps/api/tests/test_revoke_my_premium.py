"""POST /promo-codes/me/revoke (App Store review, 2026-10-12).

The mobile "Revoke Premium (Testing)" button used to cancel ANY active
subscription for ANY user — including App Store / Google Play / Stripe ones,
which the store keeps billing. It is now an admin testing tool that only
cancels grants we made ourselves (promo codes, admin comps).
"""
import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routers import promo_codes
from app.utils.dependencies import get_current_admin


PREMIUM = NS(id=uuid.uuid4(), name="premium")
FREE = NS(id=uuid.uuid4(), name="free")


def sub(plan, provider, *, admin=False, source=None):
    return NS(plan_id=plan.id, payment_provider=provider, granted_by_admin=admin,
              subscription_source=source, status="active", cancelled_at=None)


def fake_db(subs):
    plans = {PREMIUM.id: PREMIUM, FREE.id: FREE}
    db = MagicMock()

    def query(model):
        q = MagicMock()
        if model is promo_codes.UserSubscription:
            q.filter.return_value.all.return_value = subs
        else:
            def by_id(*conds):
                r = MagicMock()
                # The plan lookup is `SubscriptionPlan.id == sub.plan_id`.
                pid = conds[0].right.value
                r.first.return_value = plans.get(pid)
                return r
            q.filter.side_effect = by_id
        return q

    db.query.side_effect = query
    return db


def revoke(db):
    return asyncio.run(promo_codes.revoke_my_premium(db=db, current_user=NS(id=uuid.uuid4())))


def test_endpoint_requires_admin():
    dep = inspect.signature(promo_codes.revoke_my_premium).parameters["current_user"].default
    assert dep.dependency is get_current_admin
    with pytest.raises(HTTPException) as e:
        get_current_admin(NS(is_admin=False, is_superuser=False))
    assert e.value.status_code == 403
    assert get_current_admin(NS(is_admin=True, is_superuser=False)).is_admin
    assert get_current_admin(NS(is_admin=False, is_superuser=True)).is_superuser


@pytest.mark.parametrize("provider", ["apple", "google", "stripe"])
def test_store_billed_subscription_is_never_cancelled(provider):
    s = sub(PREMIUM, provider, source="monthly")
    db = fake_db([s])
    with pytest.raises(HTTPException) as e:
        revoke(db)
    assert e.value.status_code == 409
    assert s.status == "active" and s.cancelled_at is None
    db.commit.assert_not_called()


@pytest.mark.parametrize("s", [
    sub(PREMIUM, "promo_code", source="promo"),
    sub(PREMIUM, "admin_grant", admin=True, source="promo"),
    sub(PREMIUM, None, source="promo"),          # legacy promo row
    sub(PREMIUM, None, admin=True),              # legacy comp row
])
def test_promo_and_comp_grants_are_cancelled(s):
    db = fake_db([s])
    out = revoke(db)
    assert s.status == "cancelled" and s.cancelled_at is not None
    assert out["previous_plan"] == "premium"
    db.commit.assert_called_once()


def test_mixed_cancels_only_the_grant_and_reports_billing():
    paid = sub(PREMIUM, "apple", source="yearly")
    comp = sub(PREMIUM, "admin_grant", admin=True, source="promo")
    out = revoke(fake_db([paid, comp]))
    assert comp.status == "cancelled"
    assert paid.status == "active"
    assert out["still_billing"] == ["premium via apple"]


def test_unknown_provider_is_treated_as_billed():
    s = sub(PREMIUM, "paypal")
    with pytest.raises(HTTPException) as e:
        revoke(fake_db([s]))
    assert e.value.status_code == 409 and s.status == "active"


def test_nothing_to_revoke_is_404():
    with pytest.raises(HTTPException) as e:
        revoke(fake_db([sub(FREE, None)]))
    assert e.value.status_code == 404
