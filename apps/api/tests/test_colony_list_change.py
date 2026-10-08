"""The collection's colony rows show a 30-day headcount change.

It's a plain sum of what the keeper logged — no modelling — and it's None,
not 0, when nothing moved the count in the window, so a colony nobody has
counted doesn't claim "±0".
"""
import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS

from app.models.colony import Colony, ColonyEvent
from app.models.collection_member import CollectionMember
from app.models.feeding_log import FeedingLog
from app.models.invert_species import InvertSpecies
from app.models.user import User
from app.routers import colonies as cr


class Q:
    def __init__(self, rows=None, first=None):
        self._rows, self._first = rows or [], first

    def filter(self, *a, **k):
        return self

    order_by = group_by = filter

    def all(self):
        return list(self._rows)

    def first(self):
        return self._first


class DB:
    def __init__(self, by_model):
        self.by_model = by_model

    def query(self, model, *_):
        return self.by_model.get(getattr(model, "class_", model), Q())


def colony(owner_id):
    c = Colony(id=uuid.uuid4(), user_id=owner_id, taxon="roach", name="Dubia", stage_counts={"Nymphs": 660},
               count_is_estimated=True, is_active=True)
    return c


def run(**kw):
    return asyncio.run(inspect.unwrap(cr.list_colonies)(include_inactive=False, status_filter=None, collection=None, **kw))


def test_change_is_the_sum_of_logged_deltas_in_the_window():
    me = NS(id=uuid.uuid4(), is_active=True)
    a, b = colony(me.id), colony(me.id)
    db = DB({
        Colony: Q(rows=[a, b]),
        FeedingLog: Q(rows=[]),
        ColonyEvent: Q(rows=[(a.id, 106)]),
        InvertSpecies: Q(),
        User: Q(first=me),
        CollectionMember: Q(),
    })
    items = {i.id: i for i in run(current_user=me, db=db)}
    assert items[a.id].change_30d == 106
    assert items[b.id].change_30d is None  # nothing counted → no claim


def test_the_window_query_ignores_uncounted_events_and_is_one_query():
    src = inspect.getsource(inspect.unwrap(cr.list_colonies))
    assert "ColonyEvent.count_delta.isnot(None)" in src
    assert "ColonyEvent.count_delta != 0" in src
    assert "ColonyEvent.occurred_at >= since" in src
    assert ".group_by(ColonyEvent.colony_id)" in src
    assert cr.CHANGE_WINDOW_DAYS == 30
