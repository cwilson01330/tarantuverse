"""Advanced Analytics "spent this month" figures (expense tracking, Task 5).

`/analytics/advanced/` adds `spent_this_month` (every one of the keeper's own
Tarantuverse expenses dated in the current month) and
`feeders_spent_this_month` (the feeders category only). Herpetoverse expenses,
last month's, next month's and other keepers' never count. The route has no
`tz_offset_minutes` parameter, so "this month" is the server's UTC month.

Real Postgres through the TestClient, like tests/test_expenses.py.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.expense import Expense
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.user import User
from app.schemas.analytics import AdvancedAnalyticsResponse
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

URL = "/api/v1/analytics/advanced/"
TV, HV = "tarantuverse", "herpetoverse"


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _first_of_month(d: date) -> date:
    return d.replace(day=1)


def _last_month(d: date) -> date:
    return _first_of_month(d) - timedelta(days=1)


def _next_month(d: date) -> date:
    return (_first_of_month(d) + timedelta(days=32)).replace(day=1)


def mk_user(db, tag):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def make_premium(db, user):
    plan = SubscriptionPlan(
        name=f"plan-{uuid.uuid4().hex[:10]}", display_name="Premium", app=TV, can_use_breeding=True,
    )
    db.add(plan)
    db.commit()
    db.add(UserSubscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def add_expense(db, owner, amount, category="feeders", app=TV, spent_on=None, created_by=None):
    e = Expense(
        id=uuid.uuid4(), owner_id=owner.id, created_by=(created_by or owner).id, app=app,
        spent_on=spent_on or _today(), description="Thing", category=category,
        amount=Decimal(str(amount)), split_mode="none",
    )
    db.add(e)
    db.commit()
    return e


def advanced(client, user):
    r = client.get(URL, headers=hdr(user))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def keeper(db_session):
    u = mk_user(db_session, "spender")
    make_premium(db_session, u)
    return u


def test_response_defaults_are_zero_floats():
    f = AdvancedAnalyticsResponse.model_fields
    assert f["spent_this_month"].default == 0.0
    assert f["feeders_spent_this_month"].default == 0.0
    assert isinstance(f["spent_this_month"].default, float)


def test_sums_this_months_tv_expenses_and_the_feeders_slice(client, db_session, keeper):
    from tests.test_expenses import mk_invert
    mk_invert(db_session, keeper)
    add_expense(db_session, keeper, "12.50", "feeders")
    add_expense(db_session, keeper, "7.25", "feeders")
    add_expense(db_session, keeper, "30.00", "substrate_decor")          # this month, not feeders
    add_expense(db_session, keeper, "99.00", "feeders", spent_on=_last_month(_today()))
    add_expense(db_session, keeper, "55.00", "feeders", spent_on=_next_month(_today()))
    add_expense(db_session, keeper, "400.00", "feeders", app=HV)         # other app
    out = advanced(client, keeper)
    assert out["spent_this_month"] == 49.75
    assert out["feeders_spent_this_month"] == 19.75


def test_month_edges_are_inclusive_first_exclusive_next(client, db_session, keeper):
    from tests.test_expenses import mk_invert
    mk_invert(db_session, keeper)
    first = _first_of_month(_today())
    add_expense(db_session, keeper, "1.00", "other", spent_on=first)
    add_expense(db_session, keeper, "2.00", "other", spent_on=first - timedelta(days=1))
    add_expense(db_session, keeper, "4.00", "other", spent_on=_next_month(_today()))
    assert advanced(client, keeper)["spent_this_month"] == 1.0


def test_other_keepers_expenses_never_count(client, db_session, keeper):
    from tests.test_expenses import mk_invert
    mk_invert(db_session, keeper)
    other = mk_user(db_session, "other")
    add_expense(db_session, other, "250.00", "feeders")
    out = advanced(client, keeper)
    assert out["spent_this_month"] == 0.0 and out["feeders_spent_this_month"] == 0.0


def test_a_co_keepers_logged_expense_counts_for_the_owner(client, db_session, keeper):
    from tests.test_expenses import mk_invert
    mk_invert(db_session, keeper)
    helper = mk_user(db_session, "helper")
    add_expense(db_session, keeper, "8.00", "feeders", created_by=helper)
    assert advanced(client, keeper)["feeders_spent_this_month"] == 8.0


def test_no_expenses_is_zero(client, db_session, keeper):
    from tests.test_expenses import mk_invert
    mk_invert(db_session, keeper)
    out = advanced(client, keeper)
    assert out["spent_this_month"] == 0.0 and out["feeders_spent_this_month"] == 0.0


def test_empty_collection_still_reports_the_fields(client, db_session, keeper):
    """The early return for a keeper with no animals carries the real figures
    (supplies are often bought before the first animal)."""
    out = advanced(client, keeper)
    assert out["total_animals"] == 0
    assert out["spent_this_month"] == 0.0 and out["feeders_spent_this_month"] == 0.0
    add_expense(db_session, keeper, "21.00", "feeders")
    add_expense(db_session, keeper, "4.00", "shipping")
    out = advanced(client, keeper)
    assert out["total_animals"] == 0
    assert out["spent_this_month"] == 25.0 and out["feeders_spent_this_month"] == 21.0
