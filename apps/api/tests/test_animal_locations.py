"""Herpetoverse locations — the HV twin of tests/test_locations.py.

WHY THE SCOPE MATTERS
---------------------
A keeper's location vocabulary is per keeper AND per product: Tarantuverse and
Herpetoverse are separate apps over one account, so "Rack 1" in the spider room
is not "Rack 1" in the reptile room. HV's helpers look at `animals` only; TV's
look at `inverts` + `colonies`, exactly as before. These tests pin that split,
plus the HV-side promises that mirror TV: one canonical spelling per keeper,
a rename onto an existing name merges, died/transferred animals aren't counted,
a keeper with no locations sees an empty list, and a share card can never
carry a location.

They run on an in-memory SQLite database built from the real model tables, so
they need no Postgres and always run.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers every table on the metadata)
from app.models.animal import Animal
from app.models.colony import Colony
from app.models.invert import Invert
from app.routers import animals as animals_router
from app.schemas.animal import AnimalCreate, AnimalUpdate
from app.utils.locations import (
    SCOPE_HERPETOVERSE,
    SCOPE_TARANTUVERSE,
    canonical_location,
    list_locations,
    rename_location,
)


@compiles(JSONB, "sqlite")
def _jsonb_as_json(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    for model in (Animal, Invert, Colony):
        model.__table__.create(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


USER = uuid.uuid4()
OTHER = uuid.uuid4()


def _animal(db, user=USER, **kw):
    a = Animal(id=uuid.uuid4(), user_id=user, taxon=kw.pop("taxon", "snake"), name=kw.pop("name", "x"), **kw)
    db.add(a)
    db.flush()
    return a


def _invert(db, user=USER, **kw):
    i = Invert(id=uuid.uuid4(), user_id=user, taxon="tarantula", name=kw.pop("name", "t"), **kw)
    db.add(i)
    db.flush()
    return i


def _colony(db, user=USER, **kw):
    c = Colony(id=uuid.uuid4(), user_id=user, taxon="isopod", name=kw.pop("name", "c"), **kw)
    db.add(c)
    db.flush()
    return c


def _names(entries):
    return [e["name"] for e in entries]


# ── Snap to the keeper's existing spelling (HV scope) ──────────────────────

def test_hv_canonical_snaps_to_the_keepers_existing_animal_spelling(db):
    _animal(db, location="Reptile Room")
    assert canonical_location(db, USER, "reptile room", SCOPE_HERPETOVERSE) == "Reptile Room"
    assert canonical_location(db, USER, "  REPTILE  ROOM. ", SCOPE_HERPETOVERSE) == "Reptile Room"
    assert canonical_location(db, USER, "  Rack 2 ", SCOPE_HERPETOVERSE) == "Rack 2"
    assert canonical_location(db, USER, "   ", SCOPE_HERPETOVERSE) is None


def test_snap_never_crosses_keepers(db):
    _animal(db, user=OTHER, location="Reptile Room")
    assert canonical_location(db, USER, "reptile room", SCOPE_HERPETOVERSE) == "reptile room"


# ── The scopes are separate vocabularies ────────────────────────────────────

def test_hv_scope_ignores_tarantuverse_rows_and_vice_versa(db):
    _invert(db, location="Spider Room")
    _colony(db, location="Isopod Shelf")
    _animal(db, location="Reptile Room")

    # HV does not snap onto a TV spelling, and does not list TV places.
    assert canonical_location(db, USER, "spider room", SCOPE_HERPETOVERSE) == "spider room"
    assert _names(list_locations(db, USER, SCOPE_HERPETOVERSE)) == ["Reptile Room"]

    # TV is unchanged: default scope is Tarantuverse and never sees animals.
    assert canonical_location(db, USER, "spider room") == "Spider Room"
    assert canonical_location(db, USER, "reptile room") == "reptile room"
    assert _names(list_locations(db, USER)) == ["Isopod Shelf", "Spider Room"]
    assert list_locations(db, USER) == list_locations(db, USER, SCOPE_TARANTUVERSE)


def test_the_same_place_name_can_exist_in_both_products(db):
    _invert(db, location="Rack 1")
    _animal(db, location="rack 1")  # HV keeps its own spelling
    assert _names(list_locations(db, USER)) == ["Rack 1"]
    assert _names(list_locations(db, USER, SCOPE_HERPETOVERSE)) == ["rack 1"]


def test_unknown_scope_is_an_error_not_a_silent_tv_fallback(db):
    with pytest.raises(ValueError):
        list_locations(db, USER, "nope")


# ── Listing ─────────────────────────────────────────────────────────────────

def test_no_locations_means_an_empty_list(db):
    _animal(db)  # no location
    assert list_locations(db, USER, SCOPE_HERPETOVERSE) == []


def test_list_excludes_died_and_transferred_animals(db):
    _animal(db, location="Rack 1")
    _animal(db, location="Rack 1", died_at=date.today())
    _animal(db, location="Rack 1", transferred_out_at=datetime.now(timezone.utc))
    _animal(db, user=OTHER, location="Rack 1")  # another keeper's
    assert list_locations(db, USER, SCOPE_HERPETOVERSE) == [{"name": "Rack 1", "count": 1}]


def test_list_groups_case_variants_under_the_first_spelling_stored(db):
    _animal(db, location="Rack 1")
    _animal(db, location="rack 1")
    out = list_locations(db, USER, SCOPE_HERPETOVERSE)
    assert len(out) == 1 and out[0]["count"] == 2


def test_tv_listing_still_excludes_dead_inverts_and_counts_colonies(db):
    _invert(db, location="Rack 1")
    _invert(db, location="Rack 1", died_at=date.today())
    _colony(db, location="Rack 1")
    assert list_locations(db, USER) == [{"name": "Rack 1", "count": 2}]


# ── Rename / merge ──────────────────────────────────────────────────────────

def test_hv_rename_merges_into_the_existing_spelling(db):
    a = _animal(db, location="Rack 1")
    b = _animal(db, location="Rack #1")
    c = _animal(db, location="Office")
    moved = rename_location(db, USER, "Rack #1", "rack 1", SCOPE_HERPETOVERSE)
    db.commit()
    assert moved == 1
    db.refresh(a), db.refresh(b), db.refresh(c)
    assert (a.location, b.location, c.location) == ("Rack 1", "Rack 1", "Office")


def test_hv_rename_leaves_tarantuverse_rows_and_other_keepers_alone(db):
    inv = _invert(db, location="Rack 1")
    col = _colony(db, location="Rack 1")
    other = _animal(db, user=OTHER, location="Rack 1")
    mine = _animal(db, location="Rack 1")
    assert rename_location(db, USER, "Rack 1", "Shelf A", SCOPE_HERPETOVERSE) == 1
    db.commit()
    for row in (inv, col, other, mine):
        db.refresh(row)
    assert (inv.location, col.location, other.location, mine.location) == ("Rack 1", "Rack 1", "Rack 1", "Shelf A")


def test_tv_rename_still_moves_inverts_and_colonies_but_not_animals(db):
    inv = _invert(db, location="Rack 1")
    col = _colony(db, location="Rack 1")
    an = _animal(db, location="Rack 1")
    assert rename_location(db, USER, "Rack 1", "Shelf A") == 2
    db.commit()
    for row in (inv, col, an):
        db.refresh(row)
    assert (inv.location, col.location, an.location) == ("Shelf A", "Shelf A", "Rack 1")


# ── Routes ──────────────────────────────────────────────────────────────────

def _me():
    return NS(id=USER, is_premium_for_app=lambda _app: True)


def _run(coro):
    return asyncio.run(coro)


def test_create_and_update_go_through_the_hv_scope(db):
    _animal(db, location="Reptile Room")
    _invert(db, location="Spider Room")

    created = _run(animals_router.create_animal(
        AnimalCreate(taxon="snake", name="Noodle", location="  reptile   room "),
        collection=None, db=db, current_user=_me(),
    ))
    assert created.location == "Reptile Room"

    # A TV spelling is NOT adopted by an HV write.
    updated = _run(animals_router.update_animal(
        created.id, AnimalUpdate(location="spider room"), current_user=_me(), db=db,
    ))
    assert updated.location == "spider room"

    cleared = _run(animals_router.update_animal(
        created.id, AnimalUpdate(location=""), current_user=_me(), db=db,
    ))
    assert cleared.location is None


def test_update_without_location_does_not_touch_it(db):
    a = _animal(db, location="Rack 1")
    out = _run(animals_router.update_animal(a.id, AnimalUpdate(name="Renamed"), current_user=_me(), db=db))
    assert out.location == "Rack 1"


def test_location_is_capped_at_the_column_width():
    out = AnimalCreate(taxon="snake", location="A" * 30 + " " + "B" * 30)
    assert out.location is not None and len(out.location) <= 40


def test_locations_route_is_empty_for_a_keeper_with_none(db):
    _animal(db)
    assert _run(animals_router.get_locations(collection=None, current_user=_me(), db=db)) == []


def test_rename_route_reports_the_merged_spelling_and_rejects_blank(db):
    _animal(db, location="Rack 1")
    _animal(db, location="Rack #1")
    res = _run(animals_router.rename_location_endpoint(
        animals_router.RenameLocationRequest(old="Rack #1", new="rack 1"),
        collection=None, current_user=_me(), db=db,
    ))
    assert (res.moved, res.name) == (1, "Rack 1")
    with pytest.raises(HTTPException) as ei:
        _run(animals_router.rename_location_endpoint(
            animals_router.RenameLocationRequest(old="Rack 1", new=" . "),
            collection=None, current_user=_me(), db=db,
        ))
    assert ei.value.status_code == 400


def test_bulk_location_touches_only_my_living_animals(db):
    mine = _animal(db)
    dead = _animal(db, died_at=date.today(), location="Old")
    theirs = _animal(db, user=OTHER)
    _animal(db, location="Rack 1")  # establishes the spelling
    res = _run(animals_router.bulk_set_location(
        animals_router.BulkLocationRequest(location="rack 1", animal_ids=[mine.id, dead.id, theirs.id]),
        collection=None, current_user=_me(), db=db,
    ))
    assert (res.updated, res.location) == (1, "Rack 1")
    for row in (mine, dead, theirs):
        db.refresh(row)
    assert (mine.location, dead.location, theirs.location) == ("Rack 1", "Old", None)

    cleared = _run(animals_router.bulk_set_location(
        animals_router.BulkLocationRequest(location=None, animal_ids=[mine.id]),
        collection=None, current_user=_me(), db=db,
    ))
    assert (cleared.updated, cleared.location) == (1, None)

    with pytest.raises(HTTPException) as ei:
        _run(animals_router.bulk_set_location(
            animals_router.BulkLocationRequest(location="x", animal_ids=[]),
            collection=None, current_user=_me(), db=db,
        ))
    assert ei.value.status_code == 400


def test_location_routes_are_declared_before_the_dynamic_animal_id_route():
    paths = [r.path for r in animals_router.router.routes]
    dyn = paths.index("/{animal_id}")
    for static in ("/locations", "/locations/rename", "/bulk-location"):
        assert paths.index(static) < dyn, static


def test_location_routes_carry_the_same_policies_as_tv():
    by_path = {r.path: r.endpoint for r in animals_router.router.routes}
    assert by_path["/locations"].__access_policy__ == "viewer"
    assert by_path["/locations/rename"].__access_policy__ == "keeper"
    assert by_path["/bulk-location"].__access_policy__ == "keeper"


# ── Privacy: a location can never reach a card, a sitter, or a transfer ─────

def test_share_cards_cannot_include_a_location():
    from app.services.share_card import FIELD_ALLOW

    for fields in FIELD_ALLOW.values():
        assert not any("location" in f or f in ("room", "rack", "shelf") for f in fields)


def test_transfer_claim_does_not_copy_the_sellers_location():
    import inspect
    from app.routers import transfers

    src = inspect.getsource(transfers._claim_animal_transfer)
    assert "location" not in src


def test_hv_importer_maps_location_columns_and_canonicalises():
    from app.services import import_service

    fields = {f["field"] for f in import_service.ANIMAL_IMPORT_FIELDS}
    assert "location" in fields
    for header in ("Location", "Room", "Rack", "Shelf"):
        assert import_service.ANIMAL_HEADER_SYNONYMS[header.lower()] == "location"

    import inspect
    from app.routers import import_export

    src = inspect.getsource(import_export._import_commit_animals)
    assert src.count("canonical_location(") == 2 and "SCOPE_HERPETOVERSE" in src
