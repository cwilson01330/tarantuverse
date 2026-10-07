"""Premium advanced analytics cover every taxon (audit A4, 2026-10-07).

The endpoint read the legacy `tarantulas` table and matched logs on
`tarantula_id` alone, so a premium mantis keeper got an empty page and a
tarantula keeper's invert-only logs (the Brooke bug) went uncounted.
"""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS

from sqlalchemy.dialects import postgresql

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.routers import analytics


def _animal(taxon, **kw):
    base = dict(
        id=uuid.uuid4(), taxon=taxon, name=None, common_name=None, scientific_name=f"{taxon} sp",
        sex="unknown", price_paid=None, enclosure_type=None, date_acquired=None,
        transferred_out_at=None, died_at=None,
    )
    base.update(kw)
    return NS(**base)


class _Q:
    def __init__(self, db, entities):
        self.db, self.entities = db, entities
    def filter(self, *clauses):
        self.db.clauses.extend(clauses)
        return self
    def group_by(self, *a):
        return self
    def order_by(self, *a):
        return self
    def all(self):
        return self.db.animals if self.entities[0] is Invert else []
    def scalar(self):
        return self.db.scalar


class FakeDB:
    def __init__(self, animals, scalar=0):
        self.animals, self.scalar, self.clauses = animals, scalar, []
    def query(self, *entities):
        return _Q(self, entities)


PREMIUM = NS(id=uuid.uuid4(), get_subscription_limits=lambda: {"can_use_analytics": True, "is_premium": True})


def _run(db):
    return asyncio.run(analytics.get_advanced_analytics(current_user=PREMIUM, db=db))


def test_a_mantis_only_keeper_gets_a_real_page():
    today = date.today()
    db = FakeDB([
        _animal("mantis", sex="female", price_paid=20, scientific_name="Phyllocrania paradoxa", date_acquired=today),
        _animal("mantis", sex="male", scientific_name="Phyllocrania paradoxa"),
        _animal("true_spider", scientific_name="Phidippus regius"),
    ], scalar=4)
    r = _run(db)
    assert r.total_animals == 3
    assert r.taxon_distribution == {"mantis": 2, "true_spider": 1}
    assert r.unique_species == 2
    assert r.sex_distribution == {"male": 1, "female": 1, "unknown": 1}
    assert r.collection_value_total == 20.0
    assert r.total_molts_logged == 4 and r.total_feedings_logged == 4
    assert [g.count for g in r.collection_growth] == [1]


def test_transferred_and_dead_animals_leave_the_current_breakdowns():
    gone = _animal("scorpion", transferred_out_at=datetime.now(timezone.utc), price_paid=100)
    dead = _animal("scorpion", died_at=date.today(), price_paid=100)
    r = _run(FakeDB([_animal("scorpion"), gone, dead]))
    assert r.total_animals == 1 and r.collection_value_total == 0.0
    assert r.taxon_distribution == {"scorpion": 1}


def test_unique_species_is_not_capped_at_ten():
    r = _run(FakeDB([_animal("tarantula", scientific_name=f"Genus sp{i}") for i in range(14)]))
    assert len(r.species_distribution) == 10
    assert r.unique_species == 14


def test_no_prey_taxa_dont_get_a_feeding_bill():
    r = _run(FakeDB([_animal("millipede"), _animal("isopod"), _animal("mantis")]))
    assert r.estimated_monthly_feeding_cost == 2.0   # the mantis only: 4 x $0.50


def test_logs_are_matched_on_either_parent_column():
    db = FakeDB([_animal("tarantula")], scalar=1)
    _run(db)
    sql = " ".join(
        str(c.compile(dialect=postgresql.dialect())) for c in db.clauses
        if "molt_logs" in str(c) or "feeding_logs" in str(c)
    )
    for table in ("molt_logs", "feeding_logs"):
        assert f"{table}.invert_id IN" in sql and f"{table}.tarantula_id IN" in sql


def test_free_users_still_get_402():
    from fastapi import HTTPException
    import pytest
    free = NS(id=uuid.uuid4(), get_subscription_limits=lambda: {"can_use_analytics": False})
    with pytest.raises(HTTPException) as e:
        asyncio.run(analytics.get_advanced_analytics(current_user=free, db=FakeDB([])))
    assert e.value.status_code == 402


def test_router_no_longer_reads_the_legacy_table():
    import inspect
    assert "Tarantula" not in inspect.getsource(analytics)
