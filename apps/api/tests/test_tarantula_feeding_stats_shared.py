"""GET /tarantulas/{id}/feeding-stats on the shared web detail page (B5, 2026-10-07).

The web tarantula page now redirects to the shared invert page, which shows
this richer card (streak, longest gap, prey mix) for tarantulas. Two things
have to hold for that card to be honest:

  * it reads feedings by EITHER parent column (utils/legacy_logs), or the
    1,317 invert-only feedings vanish from the streak and the prey chart;
  * co-keepers reach it at viewer level, like /inverts/{id}/feeding-stats,
    instead of a 404 that the page would have to paper over.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

from sqlalchemy.dialects import postgresql

from app.models.feeding_log import FeedingLog
from app.models.tarantula import Tarantula
from app.routers import tarantulas as router


class _Q:
    def __init__(self, db, entities):
        self.db, self.entities = db, entities

    def filter(self, *clauses):
        if self.entities[0] is FeedingLog:
            self.db.feeding_clauses.extend(clauses)
        return self

    def order_by(self, *a):
        return self

    def all(self):
        return self.db.feedings if self.entities[0] is FeedingLog else []

    def first(self):
        if self.entities[0] is Tarantula:
            return self.db.tarantula
        return None  # Invert.feeding_interval_days lookup -> no keeper cadence


class FakeDB:
    def __init__(self, tarantula, feedings):
        self.tarantula, self.feedings, self.feeding_clauses = tarantula, feedings, []

    def query(self, *entities):
        return _Q(self, entities)


def _feeding(days_ago, accepted=True, food="cricket"):
    return NS(fed_at=datetime.now(timezone.utc) - timedelta(days=days_ago), accepted=accepted, food_type=food)


def test_shared_viewer_gets_stats_from_logs_on_either_column(monkeypatch):
    tid = uuid.uuid4()
    calls = []
    monkeypatch.setattr(router, "load_invert", lambda db, user, iid, need, **kw: calls.append((iid, need)))
    owner_spider = NS(id=tid, user_id=uuid.uuid4(), feeding_paused_reason=None, feeding_paused_until=None,
                      species_id=None, life_stage=None)
    db = FakeDB(owner_spider, [_feeding(20), _feeding(10, accepted=False), _feeding(3, food="roach")])
    co_keeper = NS(id=uuid.uuid4())

    r = asyncio.run(router.get_feeding_stats(tarantula_id=tid, tz_offset_minutes=None, current_user=co_keeper, db=db))

    assert calls == [(tid, "viewer")]
    assert r.total_feedings == 3 and r.total_refused == 1
    assert r.current_streak_accepted == 1
    sql = " ".join(str(c.compile(dialect=postgresql.dialect())) for c in db.feeding_clauses)
    assert "feeding_logs.tarantula_id" in sql and "feeding_logs.invert_id" in sql and " OR " in sql


def test_policy_is_viewer_and_has_no_owner_filter():
    import inspect

    fn = inspect.unwrap(router.get_feeding_stats)
    assert getattr(fn, "__access_policy__", None) == "viewer"
    assert "current_user.id" not in inspect.getsource(fn)


def test_public_pages_respect_a_private_animal():
    """The animal-page visibility toggle must actually hide the animal from
    non-owners on the QR pages and link previews (2026-10-07)."""
    import inspect
    from app.routers import qr, share_cards
    for fn in (qr.get_public_tarantula_profile, qr.get_public_invert_profile):
        src = inspect.getsource(fn)
        assert 'visibility == "private"' in src and "This animal is private" in src
    assert 'visibility", None) == "private"' in inspect.getsource(share_cards.public_card)
