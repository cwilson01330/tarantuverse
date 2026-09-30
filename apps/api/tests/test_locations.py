"""Keeper locations — one canonical spelling per keeper.

WHY THIS MATTERS
----------------
"Spider room", "spider room" and "Spider Room " are one place. If the app
files them as three, a keeper with a big collection ends up with a list of
near-duplicates, the grouping stops meaning anything, and they stop using it.
These tests pin the write-side rules that stop that from ever happening, plus
the two read-side promises: a keeper with no locations sees nothing new, and a
rename onto an existing name merges rather than duplicates.

The pure-text tests need no database. The DB-backed ones use the shared
fixtures and skip when TEST_DATABASE_URL isn't set, like the rest of the suite.
"""
import uuid

import pytest

from app.utils.locations import (
    MAX_LOCATION_LEN,
    location_key,
    normalize_location,
    snap_to_existing,
)


# ── Pure text rules ──────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Spider room", "Spider room"),
        ("  Spider room  ", "Spider room"),
        ("Spider   room", "Spider room"),
        ("Spider\troom\n", "Spider room"),
        ("Rack 2.", "Rack 2"),
        ("Rack 2 -", "Rack 2"),
        ("Rack 2 - ", "Rack 2"),
        ("Office shelf, ", "Office shelf"),
    ],
)
def test_normalize_cleans_whitespace_and_trailing_punctuation(raw, expected):
    assert normalize_location(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "   ", "\n\t", "...", " - "])
def test_blank_or_punctuation_only_becomes_none(raw):
    assert normalize_location(raw) is None


def test_normalize_caps_length_without_leaving_trailing_space():
    long = "A" * 30 + " " + "B" * 30
    out = normalize_location(long)
    assert out is not None
    assert len(out) <= MAX_LOCATION_LEN
    assert not out.endswith(" ")


def test_normalize_keeps_internal_punctuation_and_case():
    # We only strip TRAILING punctuation; "Rack #1" and "Bob's room" are fine
    # spellings and the keeper's casing is theirs to keep.
    assert normalize_location("Rack #1") == "Rack #1"
    assert normalize_location("Bob's Room") == "Bob's Room"


def test_location_key_is_case_insensitive_and_none_safe():
    assert location_key("Spider Room") == location_key("spider room")
    assert location_key("Spider Room") == location_key("  SPIDER   ROOM. ")
    assert location_key(None) is None
    assert location_key("   ") is None


# ── Snap to the keeper's existing spelling ──────────────────────────────────

def test_snap_prefers_existing_spelling():
    existing = ["Spider Room", "Rack 2"]
    assert snap_to_existing("spider room", existing) == "Spider Room"
    assert snap_to_existing("  SPIDER ROOM ", existing) == "Spider Room"
    assert snap_to_existing("rack 2.", existing) == "Rack 2"


def test_snap_falls_back_to_normalised_new_value():
    assert snap_to_existing("Basement", ["Spider Room"]) == "Basement"
    assert snap_to_existing("  basement  ", []) == "basement"


def test_snap_blank_is_none_even_with_existing():
    assert snap_to_existing("", ["Spider Room"]) is None
    assert snap_to_existing(None, ["Spider Room"]) is None


# ── DB-backed: canonical write, listing, rename/merge ──────────────────────

def _make_invert(db, user, **kw):
    from app.models.invert import Invert

    inv = Invert(id=uuid.uuid4(), user_id=user.id, taxon="centipede", name=kw.pop("name", "x"), **kw)
    db.add(inv)
    db.flush()
    return inv


def test_canonical_location_snaps_across_keepers_own_rows(db_session, test_user):
    from app.utils.locations import canonical_location, list_locations

    user, _ = test_user
    _make_invert(db_session, user, location="Spider Room")

    assert canonical_location(db_session, user.id, "spider room") == "Spider Room"
    assert canonical_location(db_session, user.id, "SPIDER  ROOM.") == "Spider Room"
    # A different place is left as typed (normalised).
    assert canonical_location(db_session, user.id, "  Rack 2 ") == "Rack 2"

    listed = list_locations(db_session, user.id)
    assert [e["name"] for e in listed] == ["Spider Room"]
    assert listed[0]["count"] == 1


def test_list_locations_excludes_deceased_and_transferred(db_session, test_user):
    from datetime import date, datetime, timezone
    from app.utils.locations import list_locations

    user, _ = test_user
    _make_invert(db_session, user, location="Rack 1")
    _make_invert(db_session, user, location="Rack 1", died_at=date.today())
    _make_invert(db_session, user, location="Rack 1", transferred_out_at=datetime.now(timezone.utc))

    listed = list_locations(db_session, user.id)
    assert listed == [{"name": "Rack 1", "count": 1}]


def test_rename_merges_into_existing_spelling(db_session, test_user):
    from app.models.invert import Invert
    from app.utils.locations import list_locations, rename_location

    user, _ = test_user
    a = _make_invert(db_session, user, location="Rack 1")
    b = _make_invert(db_session, user, location="Rack #1")
    c = _make_invert(db_session, user, location="Office")

    moved = rename_location(db_session, user.id, "Rack #1", "rack 1")
    db_session.commit()
    assert moved == 1

    rows = {r.id: r.location for r in db_session.query(Invert).filter(Invert.user_id == user.id)}
    # Merged onto the EXISTING spelling of the target, not the typed one.
    assert rows[a.id] == "Rack 1"
    assert rows[b.id] == "Rack 1"
    assert rows[c.id] == "Office"
    assert [e["name"] for e in list_locations(db_session, user.id)] == ["Office", "Rack 1"]


def test_rename_to_blank_is_a_noop(db_session, test_user):
    from app.utils.locations import rename_location

    user, _ = test_user
    _make_invert(db_session, user, location="Rack 1")
    assert rename_location(db_session, user.id, "Rack 1", "   ") == 0


def test_keeper_with_no_locations_lists_nothing(db_session, test_user):
    from app.utils.locations import list_locations

    user, _ = test_user
    _make_invert(db_session, user)
    assert list_locations(db_session, user.id) == []
