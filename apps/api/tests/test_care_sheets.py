"""Printable sitter care sheets (routers/care_sheets.py).

The promises under test:
1. Only a keeper/owner of EVERY animal can make a sheet (404 otherwise).
2. A tampered token is a 404 and an expired one a 410; a share-card render
   token is not a care-sheet token.
3. The sheet is re-read live: died / transferred / gone animals drop off.
4. Allow-list: price, source, private notes, enclosure notes, the owner's
   email and username never appear.
5. Temperatures follow the units carried in the token (else the owner's).
"""
import asyncio
import inspect
import json
import time
import uuid
import zlib
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException, Response

from app.routers import care_sheets as cs
from app.routers import sitter_passes as sp
from app.schemas.care_sheet import CareSheetCreate
from app.services.share_card import allowed_photo_url
from app.utils import care_sheet_token as tok
from app.utils.access import Access
from app.utils.share_token import sign_render_token

BASE = "https://pub-test.r2.dev"
NOW = datetime.now(timezone.utc)
OWNER = NS(id=uuid.uuid4(), display_name="Cory", username="sentinel_handle",
           email="owner@sentinel.test", measurement_units=None, is_active=True)
STRANGER = NS(id=uuid.uuid4(), display_name="Mallory", measurement_units=None, is_active=True)


def run(c):
    return asyncio.run(c)


def invert(**kw):
    base = dict(
        id=uuid.uuid4(), user_id=OWNER.id, taxon="tarantula", name="Rosie",
        common_name="Mexican redknee", scientific_name="Brachypelma hamorii",
        sex=NS(value="female"), life_stage="adult", current_instar=9, location="Rack A",
        species_id=None, feeding_interval_days=14, feeding_paused_reason=None, feeding_paused_until=None,
        water_dish=True, misting_schedule=None, substrate_type="coco fiber", substrate_depth="4 in",
        target_temp_min=75, target_temp_max=80, target_humidity_min=None, target_humidity_max=None,
        photo_url=f"{BASE}/photos/abc.jpg", sitter_note="Water dish on the left.",
        # Sentinels: none of these may ever reach the sheet.
        notes="SENTINEL_PRIVATE_NOTES", price_paid=Decimal("999.99"), source="SENTINEL_SOURCE",
        enclosure_notes="SENTINEL_ENCLOSURE_NOTES", death_notes="SENTINEL_DEATH",
        died_at=None, transferred_out_at=None,
    )
    base.update(kw)
    return NS(**base)


class FakeQuery:
    def __init__(self, rows):
        self.rows = list(rows)

    def filter(self, *a, **k):
        return self

    options = order_by = limit = with_entities = filter

    def all(self):
        return list(self.rows)

    def first(self):
        return self.rows[0] if self.rows else None

    def __iter__(self):
        return iter(self.rows)


class FakeDB:
    def __init__(self, users=(), photos=()):
        self.users = {u.id: u for u in users}
        self.photos = list(photos)

    def query(self, *entities):
        name = getattr(entities[0], "__name__", None) or getattr(entities[0], "key", "")
        if name == "User":
            return UserQuery(self.users)
        if name == "url":  # Photo.url, Photo.thumbnail_url
            return FakeQuery(self.photos)
        return FakeQuery([])  # SitterGuide, InvertSpecies, ...


class UserQuery(FakeQuery):
    def __init__(self, users):
        super().__init__([])
        self.users = users
        self._id = None

    def filter(self, cond, *a, **k):
        self._id = getattr(getattr(cond, "right", None), "value", None)
        return self

    def first(self):
        return self.users.get(self._id)


def _active(rows):
    """What active_*_query returns: never a died or transferred animal."""
    return lambda db, uid: FakeQuery(
        [r for r in rows if r.user_id == uid and r.died_at is None and r.transferred_out_at is None]
    )


@pytest.fixture
def world(monkeypatch):
    rosie = invert()
    dead = invert(name="Gone", died_at=NOW.date())
    sold = invert(name="Sold", transferred_out_at=NOW)
    rows = [rosie, dead, sold]
    for mod in (cs, sp):
        monkeypatch.setattr(mod, "active_inverts_query", _active(rows))
        monkeypatch.setattr(mod, "active_colonies_query", _active([]))
        monkeypatch.setattr(mod, "active_animals_query", _active([]))
    feed = NS(accepted=True, fed_at=NOW - timedelta(days=3), food_type="Cricket", food_size="Medium",
              quantity=2, notes="SENTINEL_FEED_NOTE", invert_id=rosie.id)
    monkeypatch.setattr(sp, "_feedings_by_parent",
                        lambda db, col, ids, now: {rosie.id: [feed]} if rosie.id in ids else {})
    monkeypatch.setattr(sp, "_premolt_likely", lambda db, inv: False)
    monkeypatch.setattr(cs, "allowed_photo_url", lambda url: allowed_photo_url(url, base=BASE))

    def scope(db, user, app, collection=None, need="viewer"):
        if collection not in (None, OWNER.id) or user is not OWNER:
            raise HTTPException(404, "Collection not found")
        return Access(owner=OWNER, actor=user, role="owner", app=app)

    monkeypatch.setattr(cs, "scope_collection", scope)
    return NS(rosie=rosie, dead=dead, sold=sold)


def create(user, db, **kw):
    body = dict(app="tarantuverse", animal_ids=[], note=None)
    body.update(kw)
    fn = inspect.unwrap(cs.create_care_sheet)
    return run(fn(request=None, body=CareSheetCreate(**body), current_user=user, db=db))


def read(token, db):
    fn = inspect.unwrap(cs.read_care_sheet)
    return run(fn(request=None, token=token, response=Response(), db=db))


# ── 1. ownership ──────────────────────────────────────────────────────────────

def test_owner_gets_a_url_on_the_right_origin(world):
    out = create(OWNER, FakeDB([OWNER]), animal_ids=[world.rosie.id], note="Back Sunday")
    assert out.url.startswith("https://www.tarantuverse.com/care-sheet/")
    assert out.expires_at > NOW + timedelta(hours=23)


def test_hv_url_points_at_herpetoverse(world, monkeypatch):
    snake = NS(id=uuid.uuid4(), user_id=OWNER.id, died_at=None, transferred_out_at=None)
    monkeypatch.setattr(cs, "active_animals_query", _active([snake]))
    out = create(OWNER, FakeDB([OWNER]), app="herpetoverse", animal_ids=[snake.id])
    assert out.url.startswith("https://herpetoverse.com/care-sheet/")


def test_stranger_cannot_make_a_sheet_of_someone_elses_animals(world):
    with pytest.raises(HTTPException) as e:
        create(STRANGER, FakeDB([OWNER, STRANGER]), animal_ids=[world.rosie.id], collection=str(OWNER.id))
    assert e.value.status_code == 404


def test_every_animal_must_be_the_owners_and_active(world):
    for bad in (uuid.uuid4(), world.dead.id, world.sold.id):
        with pytest.raises(HTTPException) as e:
            create(OWNER, FakeDB([OWNER]), animal_ids=[world.rosie.id, bad])
        assert e.value.status_code == 404


def test_hv_sheet_cannot_carry_colonies_and_needs_an_animal(world):
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB([OWNER]), app="herpetoverse", colony_ids=[uuid.uuid4()])
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB([OWNER]))
    assert e.value.status_code == 422


def test_limits_are_in_the_schema():
    with pytest.raises(Exception):
        CareSheetCreate(app="tarantuverse", animal_ids=[uuid.uuid4() for _ in range(61)])
    with pytest.raises(Exception):
        CareSheetCreate(app="tarantuverse", animal_ids=[uuid.uuid4()], note="x" * 501)


# ── 2. tokens ─────────────────────────────────────────────────────────────────

def test_token_roundtrip_and_tamper():
    t, _ = tok.sign_care_sheet_token({"app": "tarantuverse", "n": "Hé — ünïcode"})
    claims, err = tok.read_care_sheet_token(t)
    assert err is None and claims["n"] == "Hé — ünïcode"
    body, sig = t.split(".")
    flipped = body[:-2] + ("A" if body[-2] != "A" else "B") + body[-1]
    assert tok.read_care_sheet_token(f"{flipped}.{sig}") == (None, tok.INVALID)
    assert tok.read_care_sheet_token("garbage") == (None, tok.INVALID)


def test_expired_token_is_410_and_tampered_is_404():
    t, _ = tok.sign_care_sheet_token({"app": "tarantuverse"}, now=time.time() - 2 * 86400)
    with pytest.raises(HTTPException) as e:
        read(t, FakeDB())
    assert e.value.status_code == 410
    with pytest.raises(HTTPException) as e:
        read(t[:-3] + "xyz", FakeDB())
    assert e.value.status_code == 404


def test_share_card_token_is_not_a_care_sheet_token():
    t = sign_render_token({"app": "tarantuverse"})
    assert tok.read_care_sheet_token(t)[0] is None


def test_token_is_compact_for_a_full_sheet():
    ids = [uuid.uuid4().hex for _ in range(60)]
    t, _ = tok.sign_care_sheet_token({"app": "tarantuverse", "i": ids, "n": "é" * 500})
    assert len(t) < 6000


def test_decompression_is_bounded():
    import hashlib, hmac
    raw = zlib.compress(b"{" + b" " * 200_000 + b"}")
    sig = hmac.new(tok._key(), raw, hashlib.sha256).digest()
    assert tok.read_care_sheet_token(f"{tok._b64(raw)}.{tok._b64(sig)}") == (None, tok.INVALID)


# ── 3–5. the sheet ────────────────────────────────────────────────────────────

def _sheet(world, units=None, ids=None, owner_units=None):
    OWNER.measurement_units = owner_units
    try:
        db = FakeDB([OWNER], photos=[(f"{BASE}/photos/abc.jpg", f"{BASE}/thumbnails/thumb_abc.jpg")])
        out = create(OWNER, db, animal_ids=ids or [world.rosie.id], note="Back Sunday", units=units)
        # Kill the dead/sold animals AFTER the sheet was made: they must drop off.
        return read(out.token, db)
    finally:
        OWNER.measurement_units = None


def test_sheet_contents(world):
    sheet = _sheet(world)
    assert sheet["keeper_name"] == "Cory" and sheet["note"] == "Back Sunday"
    (a,) = sheet["animals"]
    assert a["name"] == "Rosie" and a["sex"] == "female" and a["current_instar"] == 9
    assert a["location"] == "Rack A" and a["substrate"] == "coco fiber, 4 in deep"
    assert a["last_meal"] == "2 medium cricket"
    assert a["feeding"]["state"] == "not_due" and a["feeding"]["interval_days"] == 14
    assert a["photo_url"] == f"{BASE}/thumbnails/thumb_abc.jpg"
    keys = {s["key"] for s in a["sections"]}
    assert keys <= set(cs.PRINT_SECTIONS) and "note" in keys
    assert set(sheet) == {"app", "keeper_name", "note", "generated_on", "expires_at", "units",
                          "house_rules", "routine", "animals", "skipped"}


def test_closed_animals_are_skipped_at_view_time(world):
    db = FakeDB([OWNER])
    out = create(OWNER, db, animal_ids=[world.rosie.id])
    claims, _ = tok.read_care_sheet_token(out.token)
    # Same token, but the claims now also name animals that died / were sold.
    claims["i"] += [world.dead.id.hex, world.sold.id.hex, uuid.uuid4().hex]
    sheet = cs.build_sheet(db, claims)
    assert [a["name"] for a in sheet["animals"]] == ["Rosie"]
    assert sheet["skipped"] == 3


def test_animals_of_another_owner_never_appear(world):
    other = invert(user_id=STRANGER.id, name="NotYours")
    claims = {"app": "tarantuverse", "o": OWNER.id.hex, "b": OWNER.id.hex, "i": [other.id.hex], "exp": int(time.time()) + 3600}
    sheet = cs.build_sheet(FakeDB([OWNER]), claims)
    assert sheet["animals"] == []


def test_deactivated_owner_kills_the_sheet(world):
    out = create(OWNER, FakeDB([OWNER]), animal_ids=[world.rosie.id])
    OWNER.is_active = False
    try:
        with pytest.raises(HTTPException) as e:
            read(out.token, FakeDB([OWNER]))
        assert e.value.status_code == 404
    finally:
        OWNER.is_active = True


def test_co_keeper_sheet_dies_with_their_role(world, monkeypatch):
    claims = {"app": "tarantuverse", "o": OWNER.id.hex, "b": STRANGER.id.hex,
              "i": [world.rosie.id.hex], "exp": int(time.time()) + 3600}
    monkeypatch.setattr(cs, "resolve_role", lambda db, u, o, app: None)
    with pytest.raises(HTTPException) as e:
        cs.build_sheet(FakeDB([OWNER, STRANGER]), claims)
    assert e.value.status_code == 404
    monkeypatch.setattr(cs, "resolve_role", lambda db, u, o, app: "keeper")
    assert len(cs.build_sheet(FakeDB([OWNER, STRANGER]), claims)["animals"]) == 1


def test_allow_list_never_leaks_private_fields(world):
    dumped = json.dumps(_sheet(world), default=str)
    for sentinel in ("SENTINEL", "999.99", "owner@sentinel.test", "sentinel_handle"):
        assert sentinel not in dumped


def test_photo_outside_our_storage_is_dropped(world):
    world.rosie.photo_url = "https://evil.example/track.jpg"
    (a,) = _sheet(world)["animals"]
    assert a["photo_url"] is None


def test_units_follow_the_token_then_the_owner(world):
    def heat(sheet):
        (a,) = sheet["animals"]
        return " ".join(l["text"] for s in a["sections"] if s["key"] == "heat" for l in s["lines"])

    assert "75–80°F" in heat(_sheet(world))
    assert "24–27°C" in heat(_sheet(world, units="metric"))
    assert "24–27°C" in heat(_sheet(world, owner_units="metric"))
    # The keeper's stored choice beats the device hint.
    assert "75–80°F" in heat(_sheet(world, units="metric", owner_units="imperial"))
    assert _sheet(world, units="metric")["units"] == "metric"


def test_public_read_is_not_cached_or_indexed(world):
    out = create(OWNER, FakeDB([OWNER]), animal_ids=[world.rosie.id])
    resp = Response()
    run(inspect.unwrap(cs.read_care_sheet)(request=None, token=out.token, response=resp, db=FakeDB([OWNER])))
    assert "no-store" in resp.headers["cache-control"]
    assert "noindex" in resp.headers["x-robots-tag"]
