"""Keeper-set cost per feeding (2026-10-22).

The advanced-analytics "Est. Monthly Feeding Cost" multiplied every feeding
by a fixed $0.50; a keeper reported that as far too high. Keepers now set
their own figure (`users.feeding_cost_per_meal`, PUT /analytics/feeding-cost/).
NULL keeps the old 0.50 so nobody's number moves until they choose.
"""
import asyncio
import inspect
import uuid
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
from pydantic import ValidationError

from app.models.user import User
from app.routers import analytics
from app.schemas.analytics import FeedingCostUpdate
from tests.test_advanced_analytics_every_taxon import FakeDB, _animal


def _keeper(cost=None):
    return NS(
        id=uuid.uuid4(),
        feeding_cost_per_meal=cost,
        get_subscription_limits=lambda: {"can_use_analytics": True, "is_premium": True},
    )


def _analytics(user, animals, scalar=0):
    return asyncio.run(analytics.get_advanced_analytics(current_user=user, db=FakeDB(animals, scalar=scalar)))


class _DB:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def _set(user, value):
    db = _DB()
    out = asyncio.run(inspect.unwrap(analytics.set_feeding_cost)(
        payload=FeedingCostUpdate(cost_per_feeding=value), current_user=user, db=db))
    return out, db


def test_unset_keeps_the_old_default():
    r = _analytics(_keeper(), [_animal("mantis")])
    assert r.cost_per_feeding == 0.50 and r.cost_per_feeding_is_default is True
    assert r.estimated_monthly_feeding_cost == 2.0  # 4 x 0.50


def test_keeper_cost_drives_the_estimate_from_recent_feedings():
    # FakeDB's scalar answers every count; 12 feedings in the last 30 days.
    r = _analytics(_keeper(Decimal("0.15")), [_animal("tarantula")], scalar=12)
    assert r.cost_per_feeding == 0.15 and r.cost_per_feeding_is_default is False
    assert r.estimated_monthly_feeding_cost == pytest.approx(1.80)


def test_keeper_cost_drives_the_fallback_estimate_too():
    r = _analytics(_keeper(Decimal("0.10")), [_animal("tarantula"), _animal("scorpion"), _animal("isopod")])
    assert r.estimated_monthly_feeding_cost == pytest.approx(0.80)  # 2 predators x 4 x 0.10


def test_zero_is_a_real_answer():
    # Keepers who breed their own feeders.
    r = _analytics(_keeper(Decimal("0")), [_animal("tarantula")], scalar=20)
    assert r.estimated_monthly_feeding_cost == 0.0 and r.cost_per_feeding_is_default is False


def test_empty_collection_still_reports_the_keepers_cost():
    r = _analytics(_keeper(Decimal("0.25")), [])
    assert r.cost_per_feeding == 0.25 and r.cost_per_feeding_is_default is False


def test_set_rounds_to_cents_and_saves():
    user = _keeper()
    out, db = _set(user, 0.126)
    assert user.feeding_cost_per_meal == Decimal("0.13")
    assert out.cost_per_feeding == 0.13 and out.is_default is False
    assert db.commits == 1


def test_null_goes_back_to_the_default():
    user = _keeper(Decimal("0.20"))
    out, _ = _set(user, None)
    assert user.feeding_cost_per_meal is None
    assert out.cost_per_feeding == 0.50 and out.is_default is True


@pytest.mark.parametrize("bad", [-0.01, 1000.01])
def test_out_of_range_is_refused(bad):
    with pytest.raises(ValidationError):
        FeedingCostUpdate(cost_per_feeding=bad)


def test_model_has_the_column_and_its_check():
    assert "feeding_cost_per_meal" in User.__table__.c
    checks = {c.name for c in User.__table__.constraints}
    assert "users_feeding_cost_per_meal_check" in checks


def test_migration_chains_from_the_previous_head():
    import pathlib
    src =(pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "fcm_20261022_feeding_cost.py").read_text()
    assert 'down_revision: Union[str, None] = "vex_20261009_visibility_explicit"' in src
