"""Share cards print lengths in the card AUTHOR's units (U2).

- The sharer's own users.measurement_units wins; a co-keeper who never chose
  falls back to the owner's; nobody chose -> imperial (what storage is).
- The units ride in the render token, so the renderer prints what the author
  saw; card links freeze them into the snapshot like the rest of the text.
- Link previews of public animals speak for the owner, in the owner's units.
- Only lengths convert. Weights stay grams; storage is never written.
"""
import asyncio
import uuid
from datetime import date
from types import SimpleNamespace as NS

import pytest
from fastapi import Response

from app.routers import share_cards as sc
from app.schemas.share_card import ShareCardCreate
from app.services.share_card import CardSubject, MoltFacts, compose_card
from app.utils.share_token import sign_render_token

ANIMAL_ID = uuid.uuid4()
MOLT_ID = uuid.uuid4()


def run(c):
    return asyncio.run(c)


def tv_subject(**kw):
    base = dict(
        app="tarantuverse", taxon="tarantula", name="Rosie", scientific_name="Brachypelma hamorii",
        common_name="Mexican redknee", sex="female", date_acquired=date(2025, 8, 14), photo_url=None,
        molt_count=9, latest_span_in=3.5,
    )
    base.update(kw)
    return CardSubject(**base)


def hv_subject(**kw):
    base = dict(
        app="herpetoverse", taxon="snake", name="Juniper", scientific_name="Python regius",
        common_name="Ball python", sex="female", date_acquired=date(2024, 3, 1), photo_url=None,
        weight_g=1412.0, length_in=38.5, shed_count=14,
    )
    base.update(kw)
    return CardSubject(**base)


def fact(card, label):
    return next((r["value"] for r in card["facts"] if r["label"] == label), None)


# ── compose_card ─────────────────────────────────────────────────────────────

MOLT = MoltFacts(number=9, molted_on=date(2026, 9, 29), span_before=3.2, span_after=3.5)


@pytest.mark.parametrize("units, want", [
    (None, "3.2 → 3.5 in"),
    ("imperial", "3.2 → 3.5 in"),
    ("metric", "8.1 → 8.9 cm"),
])
def test_molt_size_change_in_author_units(units, want):
    card = compose_card("molt", tv_subject(), ["size_change"], molt=MOLT, units=units)
    assert fact(card, "Leg span") == want
    assert card["notes"]["facts"] == [want]


def test_molt_after_only_metric():
    m = MoltFacts(number=1, molted_on=date(2026, 9, 29), span_before=None, span_after=4.0)
    card = compose_card("molt", tv_subject(), ["size_change"], molt=m, units="metric")
    assert fact(card, "Leg span") == "10.2 cm"


def test_tv_profile_size_metric_and_imperial():
    assert fact(compose_card("profile", tv_subject(), ["size"], units="metric"), "Leg span") == "8.9 cm"
    assert fact(compose_card("profile", tv_subject(), ["size"]), "Leg span") == "3.5 in"


def test_tv_profile_body_length_from_mm():
    s = tv_subject(taxon="scorpion", latest_span_in=None, length_mm=62.0)
    assert fact(compose_card("profile", s, ["size"], units="metric"), "Body length") == "62 mm"
    assert fact(compose_card("profile", s, ["size"], units="imperial"), "Body length") == "2.44 in"


def test_leg_span_taxon_never_prints_a_body_length():
    s = tv_subject(latest_span_in=None, length_mm=62.0)
    assert fact(compose_card("profile", s, ["size"], units="metric"), "Leg span") is None


def test_legacy_preformatted_size_still_prints():
    """Older callers pass latest_size text and no raw values."""
    s = tv_subject(latest_span_in=None, latest_size="4.1 in")
    assert fact(compose_card("profile", s, ["size"], units="metric"), "Leg span") == "4.1 in"


@pytest.mark.parametrize("units, want", [(None, "38.5 in"), ("metric", "97.8 cm")])
def test_hv_profile_length(units, want):
    card = compose_card("profile", hv_subject(), ["length", "weight"], units=units)
    assert fact(card, "Length") == want
    # Weights never convert.
    assert fact(card, "Weight") == "1.41 kg"


def test_unknown_units_value_reads_as_imperial():
    assert fact(compose_card("profile", hv_subject(), ["length"], units="furlongs"), "Length") == "38.5 in"


# ── router: who the author is ────────────────────────────────────────────────

def test_user_units_picks_first_explicit_choice():
    assert sc._user_units(NS(measurement_units=None), NS(measurement_units="metric")) == "metric"
    assert sc._user_units(NS(measurement_units="imperial"), NS(measurement_units="metric")) == "imperial"
    assert sc._user_units(NS(), NS(measurement_units=None)) is None
    assert sc._user_units(None) is None
    assert sc._user_units(NS(measurement_units="bogus")) is None


class FakeDB:
    def __init__(self):
        self.added, self.commits = [], 0
        self.links: dict = {}

    def add(self, obj):
        self.added.append(obj)
        if getattr(obj, "code", None):
            self.links[obj.code] = obj

    def commit(self):
        self.commits += 1


@pytest.fixture
def world(monkeypatch):
    owner = NS(id=uuid.uuid4(), share_defaults=None, collection_visibility="public", measurement_units="metric")
    keeper = NS(id=uuid.uuid4(), share_defaults=None, measurement_units=None)
    animal = NS(id=ANIMAL_ID, user_id=owner.id)

    monkeypatch.setattr(sc, "_load_subject", lambda db, user, app, aid, need: (animal, owner, tv_subject()))
    monkeypatch.setattr(sc, "_load_subject_unchecked", lambda db, app, aid: (animal, owner, tv_subject()))
    monkeypatch.setattr(sc, "_load_molt", lambda db, aid, mid: MOLT)
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, aid: True)
    monkeypatch.setattr(sc, "_find_link", lambda db, code: db.links.get(code))
    return NS(owner=owner, keeper=keeper)


def create(user, db, **kw):
    body = dict(app="tarantuverse", animal_id=ANIMAL_ID, kind="molt", molt_id=MOLT_ID, shape="post",
                fields=["size_change"])
    body.update(kw)
    return run(sc.create_share_card(ShareCardCreate(**body), db=db, current_user=user))


def render(out, db):
    return run(sc.share_card_data(out.image_url.rsplit("/", 1)[1], response=Response(), db=db))


def test_sharer_units_ride_the_token(world):
    world.keeper.measurement_units = "imperial"
    db = FakeDB()
    out = create(world.keeper, db)
    # The owner is metric, but the imperial co-keeper made the card.
    assert fact(render(out, db), "Leg span") == "3.2 → 3.5 in"


def test_cokeeper_who_never_chose_gets_the_owners_units(world):
    db = FakeDB()
    out = create(world.keeper, db)
    assert fact(render(out, db), "Leg span") == "8.1 → 8.9 cm"


def test_nobody_chose_means_imperial(world):
    world.owner.measurement_units = None
    db = FakeDB()
    out = create(world.owner, db)
    assert fact(render(out, db), "Leg span") == "3.2 → 3.5 in"


def test_token_units_win_over_a_later_change(world):
    db = FakeDB()
    out = create(world.owner, db)  # metric when shared
    world.owner.measurement_units = "imperial"
    assert fact(render(out, db), "Leg span") == "8.1 → 8.9 cm"


def test_old_token_without_units_uses_the_owners(world):
    token = sign_render_token({"app": "tarantuverse", "kind": "molt", "animal_id": str(ANIMAL_ID),
                               "molt_id": str(MOLT_ID), "fields": ["size_change"], "shape": "post"})
    data = run(sc.share_card_data(token, response=Response(), db=FakeDB()))
    assert fact(data, "Leg span") == "8.1 → 8.9 cm"


def test_card_link_freezes_the_authors_units(world):
    db = FakeDB()
    out = create(world.owner, db, link=True)
    world.owner.measurement_units = "imperial"
    payload = run(sc.get_card_link(out.code, response=Response(), db=db))
    assert fact(payload, "Leg span") == "8.1 → 8.9 cm"


def test_old_card_link_snapshots_are_served_unchanged(world):
    """Links made before units existed hold inches text; nothing rewrites them."""
    db = FakeDB()
    out = create(world.owner, db, link=True)
    link = db.links[out.code]
    link.payload = dict(link.payload, facts=[{"label": "Leg span", "value": "3.2 → 3.5 in"}])
    payload = run(sc.get_card_link(out.code, response=Response(), db=db))
    assert fact(payload, "Leg span") == "3.2 → 3.5 in"


class Q:
    def __init__(self, row):
        self.row = row

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.row


@pytest.mark.parametrize("owner_units, want", [("metric", "8.9 cm"), ("imperial", "3.5 in"), (None, "3.5 in")])
def test_public_card_uses_the_owners_units(monkeypatch, owner_units, want):
    owner = NS(id=uuid.uuid4(), collection_visibility="public", measurement_units=owner_units)
    row = NS(id=ANIMAL_ID, user_id=owner.id, died_at=None, transferred_out_at=None, visibility="public")
    db = NS(query=lambda model, *a: Q(owner if getattr(model, "__name__", "") == "User" else row))
    monkeypatch.setattr(sc, "_load_subject", lambda db, user, app, aid, need: (row, user, tv_subject()))
    card = run(sc.public_card("tarantuverse", ANIMAL_ID, db=db))
    assert fact(card, "Leg span") == want


def test_public_hv_card_has_no_length_row():
    """The HV link preview's field list has no length today; units don't add one."""
    assert "length" not in sc.PUBLIC_FIELDS["herpetoverse"]


# ── HV sitter card (U1 built it; checked here for reptiles) ─────────────────

def test_hv_sitter_card_species_temps_follow_the_keepers_units():
    from datetime import datetime, timezone

    from app.services.sitter_card import FeedingFacts, compose_animal_card

    a = NS(id="a1", name="Mango", common_name=None, scientific_name=None, taxon="lizard",
           photo_url=None, feeding_paused_reason=None, feeding_paused_until=None,
           brumation_active=False, sitter_note=None)
    sp = NS(handleability="docile", supplementation_notes=None, feeding_frequency_adult=None,
            water_bowl_description=None, humidity_min=None, humidity_max=None,
            temp_basking_min=95, temp_basking_max=104, temp_warm_min=None, temp_warm_max=None,
            temp_cool_min=72, temp_cool_max=78, temp_night_min=None, temp_night_max=None,
            uvb_required=False)
    now = datetime(2026, 10, 10, 15, 0, tzinfo=timezone.utc)

    def heat(units):
        c = compose_animal_card(a, sp, facts=FeedingFacts(), enclosure=None, feeds_on_cgd=False,
                                keeper_name="Cory", now=now, units=units)
        return [ln["text"] for s in c["sections"] if s["key"] == "heat" for ln in s["lines"]]

    assert heat(None)[:2] == ["Basking spot: 95–104°F.", "Cool side: 72–78°F."]
    assert heat("metric")[:2] == ["Basking spot: 35–40°C.", "Cool side: 22–26°C."]
