"""HV's animal list takes the same lifecycle `status` as /inverts/ (ADR-015).

Before this, HV had /animals/{id}/died and /revive but no way to LIST the
dead: the records we promise to keep were unreachable from any client. These
pin which rows each view filters to, by reading the SQL the route builds.
"""
import asyncio
import uuid
from types import SimpleNamespace as NS

import pytest

from app.routers import animals as ar


class RecordingQuery:
    def __init__(self):
        self.clauses = []

    def options(self, *a):
        return self

    def filter(self, *clauses):
        self.clauses.extend(str(c) for c in clauses)
        return self

    def order_by(self, *a):
        return self

    def all(self):
        return []


def run(status):
    q = RecordingQuery()
    owner = NS(id=uuid.uuid4())
    db = NS(query=lambda *_: q)
    ar.scope_collection = lambda *_a, **_k: NS(owner=owner)  # own collection
    fn = getattr(ar.get_animals, "__wrapped__", ar.get_animals)
    asyncio.run(fn(taxon=None, collection=None, status=status, current_user=owner, db=db))
    return " AND ".join(q.clauses)


@pytest.fixture(autouse=True)
def _restore(monkeypatch):
    monkeypatch.setattr(ar, "scope_collection", ar.scope_collection)


def test_default_is_the_living_collection():
    sql = run(None)
    assert "animals.died_at IS NULL" in sql
    assert "animals.transferred_out_at IS NULL" in sql


def test_active_matches_the_default():
    assert run("active") == run(None)


def test_deceased_lists_only_the_dead():
    sql = run("deceased")
    assert "animals.died_at IS NOT NULL" in sql
    assert "transferred_out_at" not in sql


def test_transferred_lists_only_handed_off():
    sql = run("transferred")
    assert "animals.transferred_out_at IS NOT NULL" in sql
    assert "died_at" not in sql


def test_feeding_status_skips_died_animals():
    """Feeding Day must never list an animal that died (ADR-015). It used an
    inlined filter that only excluded transfers."""
    q = RecordingQuery()
    owner = NS(id=uuid.uuid4())
    db = NS(query=lambda *_: q)
    ar.scope_collection = lambda *_a, **_k: NS(owner=owner)
    fn = getattr(ar.list_feeding_status, "__wrapped__", ar.list_feeding_status)
    asyncio.run(fn(tz_offset_minutes=None, collection=None, current_user=owner, db=db))
    sql = " AND ".join(q.clauses)
    assert "animals.died_at IS NULL" in sql
    assert "animals.transferred_out_at IS NULL" in sql
