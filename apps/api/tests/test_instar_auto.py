"""The molt/instar count follows the molt log (utils/instar.py, 2026-10-07)."""
import inspect
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app.utils import instar
from app.utils.instar import adjust_instar_for_molt, is_newest

NOW = datetime(2026, 10, 7, tzinfo=timezone.utc)


def test_is_newest():
    assert is_newest(NOW, [NOW - timedelta(days=30), None])
    assert is_newest(NOW, [NOW])  # same day counts as newest
    assert not is_newest(NOW - timedelta(days=60), [NOW])
    assert is_newest(NOW, [])
    assert not is_newest(None, [])
    assert is_newest(datetime(2026, 10, 7), [NOW - timedelta(days=1)])  # naive vs aware


class _Q:
    def __init__(self, rows):
        self.rows = rows
    def filter(self, *a):
        return self
    def first(self):
        return self.rows[0] if self.rows else None
    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, invert, other_dates):
        self.invert, self.other_dates = invert, other_dates
    def query(self, *entities):
        from app.models.invert import Invert
        if entities and entities[0] is Invert:
            return _Q([self.invert] if self.invert else [])
        return _Q([(d,) for d in self.other_dates])


@pytest.fixture(autouse=True)
def no_mirror(monkeypatch):
    import app.services.inverts_dualwrite as dw
    monkeypatch.setattr(dw, "mirror_invert_update_to_legacy", lambda db, inv: None)


def molt(days_ago=0, **kw):
    base = dict(id=uuid.uuid4(), invert_id=uuid.uuid4(), tarantula_id=None, scorpion_id=None,
                molted_at=NOW - timedelta(days=days_ago))
    base.update(kw)
    return NS(**base)


def test_new_newest_molt_adds_one():
    inv = NS(current_instar=5)
    adjust_instar_for_molt(FakeDB(inv, [NOW - timedelta(days=20)]), molt(0), +1)
    assert inv.current_instar == 6


def test_backfilled_old_molt_leaves_the_count_alone():
    """A mantis already set to L6 whose keeper logs its earlier molts stays L6."""
    inv = NS(current_instar=6)
    adjust_instar_for_molt(FakeDB(inv, [NOW]), molt(90), +1)
    assert inv.current_instar == 6


def test_deleting_the_newest_molt_undoes_it_and_old_ones_dont():
    inv = NS(current_instar=6)
    adjust_instar_for_molt(FakeDB(inv, [NOW - timedelta(days=30)]), molt(0), -1)
    assert inv.current_instar == 5
    adjust_instar_for_molt(FakeDB(inv, [NOW]), molt(30), -1)
    assert inv.current_instar == 5


def test_unset_count_stays_unset():
    inv = NS(current_instar=None)
    adjust_instar_for_molt(FakeDB(inv, []), molt(0), +1)
    assert inv.current_instar is None


def test_never_below_zero_and_colony_molts_ignored():
    inv = NS(current_instar=0)
    adjust_instar_for_molt(FakeDB(inv, []), molt(0), -1)
    assert inv.current_instar == 0
    adjust_instar_for_molt(FakeDB(inv, []), molt(0, invert_id=None), +1)  # colony/enclosure molt
    assert inv.current_instar == 0


def test_every_per_animal_molt_route_keeps_the_count():
    from app.routers import molts
    src = inspect.getsource(molts)
    # tarantula, scorpion, centipede, whip spider, generic invert
    assert src.count("adjust_instar_for_molt(db, new_molt, +1)") == 5
    delete = inspect.getsource(molts.delete_molt_log)
    assert delete.index("adjust_instar_for_molt(db, molt, -1)") < delete.index("db.delete(molt)")
