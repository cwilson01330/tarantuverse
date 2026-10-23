"""Expense split service (spec 2026-10-22 §1): which animals a purchase is
divided across, and the to-the-cent division. Pure tests - the three
`active_*_query` helpers are replaced with fakes that, like the real ones,
return only the owner's OPEN rows, so these tests prove the service goes
through them rather than reading raw tables."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.expense import ExpenseShare, MAX_EXPENSE_SHARES
from app.services import expense_split as es
from app.services.expense_split import build_shares, divide_amount, resolve_targets

OWNER = uuid.uuid4()
OTHER = uuid.uuid4()
T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


class FakeQuery:
    def __init__(self, rows):
        self.rows = list(rows)

    def all(self):
        return list(self.rows)

    def __iter__(self):
        return iter(self.rows)


def row(n=0, user_id=OWNER, location=None, id=None, **kw):
    return NS(
        id=id or uuid.uuid4(), user_id=user_id, location=location,
        created_at=T0 + timedelta(days=n), **kw,
    )


def _active(rows):
    """What active_*_query returns: only the asked-for owner's open rows."""
    return lambda db, uid: FakeQuery([r for r in rows if r.user_id == uid and not getattr(r, "closed", False)])


@pytest.fixture
def world(monkeypatch):
    w = NS(
        a=row(1, location="Rack 2"),
        b=row(2, location="Rack 2"),
        c=row(3, location="Rack 9"),
        foreign=row(1, user_id=OTHER),
        closed=row(1, closed=True),
        colony=row(0, location="Rack 2"),
        hv1=row(5, location="Rack 2"),
        hv2=row(4),
    )
    monkeypatch.setattr(es, "active_inverts_query", _active([w.a, w.b, w.c, w.foreign, w.closed]))
    monkeypatch.setattr(es, "active_colonies_query", _active([w.colony]))
    monkeypatch.setattr(es, "active_animals_query", _active([w.hv1, w.hv2]))
    # canonical_location(...) calls this to learn the keeper's stored spellings.
    monkeypatch.setattr("app.utils.locations.existing_locations",
                        lambda db, uid, scope="tarantuverse": ["Rack 2", "Rack 9"])
    return w


def ids(targets):
    return [(k, i) for k, i in targets]


# ── divide_amount ─────────────────────────────────────────────────────────────

def test_divide_exact():
    assert divide_amount(Decimal("10.00"), 3) == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]
    assert divide_amount(Decimal("0.01"), 3) == [Decimal("0.01"), Decimal("0.00"), Decimal("0.00")]
    assert divide_amount(Decimal("30.00"), 15) == [Decimal("2.00")] * 15
    for amount, n in [(Decimal("99.99"), 7), (Decimal("100000"), 500), (Decimal("5"), 1), (Decimal("0.10"), 4)]:
        parts = divide_amount(amount, n)
        assert len(parts) == n
        assert sum(parts) == amount
        assert all(p == p.quantize(Decimal("0.01")) for p in parts)


def test_divide_rounds_input_half_up_to_cents():
    assert divide_amount(Decimal("10.005"), 1) == [Decimal("10.01")]
    assert divide_amount(Decimal("10.004"), 1) == [Decimal("10.00")]


def test_divide_requires_a_positive_count():
    with pytest.raises(ValueError):
        divide_amount(Decimal("1.00"), 0)


# ── collection / location ─────────────────────────────────────────────────────

def test_collection_tv_includes_open_inverts_and_colonies_only(world):
    targets, label = resolve_targets(None, OWNER, "tarantuverse", "collection")
    assert label is None
    got = {i for _, i in targets}
    assert got == {world.a.id, world.b.id, world.c.id, world.colony.id}
    assert world.foreign.id not in got and world.closed.id not in got


def test_collection_hv_uses_animals_and_never_colonies(world):
    targets, _ = resolve_targets(None, OWNER, "herpetoverse", "collection")
    assert {k for k, _ in targets} == {"animal"}
    assert {i for _, i in targets} == {world.hv1.id, world.hv2.id}


def test_location_matches_case_and_spacing(world):
    targets, label = resolve_targets(None, OWNER, "tarantuverse", "location", location="rack 2 ")
    assert label == "Rack 2"
    assert {i for _, i in targets} == {world.a.id, world.b.id, world.colony.id}


def test_location_matches_stored_spelling_differences(world):
    world.a.location = "RACK  2"
    targets, label = resolve_targets(None, OWNER, "tarantuverse", "location", location="Rack 2")
    assert world.a.id in {i for _, i in targets}


def test_location_hv(world):
    targets, label = resolve_targets(None, OWNER, "herpetoverse", "location", location="rack 2")
    assert ids(targets) == [("animal", world.hv1.id)]


def test_location_with_no_animals_is_400(world):
    for bad in ("Attic", "   ", None, ""):
        with pytest.raises(HTTPException) as e:
            resolve_targets(None, OWNER, "tarantuverse", "location", location=bad)
        assert e.value.status_code == 400
        assert e.value.detail == "No animals at that location"


# ── animals mode ──────────────────────────────────────────────────────────────

def test_animals_mode_rejects_foreign_closed_or_other_app_ids_404(world):
    for bad in (world.foreign.id, world.closed.id, uuid.uuid4()):
        with pytest.raises(HTTPException) as e:
            resolve_targets(None, OWNER, "tarantuverse", "animals", invert_ids=[world.a.id, bad])
        assert e.value.status_code == 404
        assert e.value.detail == "Animal not found"
    # a colony id sent as an invert id (wrong table) is not found either
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "animals", invert_ids=[world.colony.id])
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "animals", colony_ids=[world.a.id])
    assert e.value.status_code == 404
    # an HV animal id is not a TV animal and vice versa
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "animals", invert_ids=[world.hv1.id])
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "herpetoverse", "animals", animal_ids=[world.a.id])
    assert e.value.status_code == 404


def test_animals_mode_dedupes(world):
    targets, _ = resolve_targets(
        None, OWNER, "tarantuverse", "animals",
        invert_ids=[world.a.id, world.a.id, str(world.b.id)], colony_ids=[world.colony.id, world.colony.id],
    )
    assert ids(targets) == [("invert", world.a.id), ("invert", world.b.id), ("colony", world.colony.id)]


def test_animals_mode_accepts_string_ids(world):
    targets, _ = resolve_targets(None, OWNER, "herpetoverse", "animals", animal_ids=[str(world.hv1.id)])
    assert ids(targets) == [("animal", world.hv1.id)]


def test_colony_ids_on_herpetoverse_is_400(world):
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "herpetoverse", "animals", colony_ids=[world.colony.id])
    assert e.value.status_code == 400
    assert e.value.detail == "Colonies are Tarantuverse only"


def test_animal_ids_on_tarantuverse_is_400(world):
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "animals", animal_ids=[world.hv1.id])
    assert e.value.status_code == 400
    assert e.value.detail == "Use invert or colony ids on Tarantuverse"


def test_invert_ids_on_herpetoverse_is_400(world):
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "herpetoverse", "animals", invert_ids=[world.a.id])
    assert e.value.status_code == 400
    assert e.value.detail == "Use animal ids on Herpetoverse"


def test_animals_mode_with_no_ids_is_400(world):
    for app in ("tarantuverse", "herpetoverse"):
        with pytest.raises(HTTPException) as e:
            resolve_targets(None, OWNER, app, "animals")
        assert e.value.status_code == 400
        assert e.value.detail == "Pick at least one animal"


# ── limits, none, unknown, order ──────────────────────────────────────────────

def test_more_than_500_is_400(monkeypatch):
    many = [row(i) for i in range(MAX_EXPENSE_SHARES + 1)]
    monkeypatch.setattr(es, "active_inverts_query", _active(many))
    monkeypatch.setattr(es, "active_colonies_query", _active([]))
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "collection")
    assert e.value.status_code == 400
    assert e.value.detail == "A purchase can be split across at most 500 animals"
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "animals", invert_ids=[r.id for r in many])
    assert e.value.status_code == 400
    # exactly 500 is fine
    ok, _ = resolve_targets(None, OWNER, "tarantuverse", "animals", invert_ids=[r.id for r in many[:500]])
    assert len(ok) == 500


def test_none_mode_returns_no_targets(world):
    assert resolve_targets(None, OWNER, "tarantuverse", "none") == ([], None)
    assert resolve_targets(None, OWNER, "herpetoverse", "none") == ([], None)


def test_unknown_mode_is_400(world):
    with pytest.raises(HTTPException) as e:
        resolve_targets(None, OWNER, "tarantuverse", "everything")
    assert e.value.status_code == 400


def test_order_is_inverts_or_animals_then_colonies_by_created_at_then_id(monkeypatch):
    same = T0
    lo, hi = sorted([uuid.uuid4(), uuid.uuid4()])
    late = row(9)
    early = row(1)
    tie_hi = row(5, id=hi)
    tie_lo = row(5, id=lo)
    col_early = row(0)
    col_late = row(8)
    monkeypatch.setattr(es, "active_inverts_query", _active([late, tie_hi, early, tie_lo]))
    monkeypatch.setattr(es, "active_colonies_query", _active([col_late, col_early]))
    monkeypatch.setattr(es, "active_animals_query", _active([late, early]))
    targets, _ = resolve_targets(None, OWNER, "tarantuverse", "collection")
    assert ids(targets) == [
        ("invert", early.id), ("invert", tie_lo.id), ("invert", tie_hi.id), ("invert", late.id),
        ("colony", col_early.id), ("colony", col_late.id),
    ]
    hv, _ = resolve_targets(None, OWNER, "herpetoverse", "collection")
    assert ids(hv) == [("animal", early.id), ("animal", late.id)]
    # animals mode orders the same way regardless of the order sent
    picked, _ = resolve_targets(None, OWNER, "tarantuverse", "animals",
                                invert_ids=[late.id, early.id], colony_ids=[col_late.id])
    assert ids(picked) == [("invert", early.id), ("invert", late.id), ("colony", col_late.id)]


# ── build_shares ──────────────────────────────────────────────────────────────

def test_build_shares_sets_fk_amount_and_position():
    i, c, a = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    shares = build_shares(Decimal("10.00"), [("invert", i), ("colony", c), ("animal", a)])
    assert all(isinstance(s, ExpenseShare) for s in shares)
    assert [s.position for s in shares] == [0, 1, 2]
    assert [s.amount for s in shares] == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]
    assert (shares[0].invert_id, shares[0].colony_id, shares[0].animal_id) == (i, None, None)
    assert (shares[1].invert_id, shares[1].colony_id, shares[1].animal_id) == (None, c, None)
    assert (shares[2].invert_id, shares[2].colony_id, shares[2].animal_id) == (None, None, a)
    assert all(s.expense_id is None for s in shares)
    assert sum(s.amount for s in shares) == Decimal("10.00")


def test_build_shares_with_no_targets_is_empty():
    assert build_shares(Decimal("10.00"), []) == []
