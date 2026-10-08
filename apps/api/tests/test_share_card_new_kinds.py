"""Colony (TV), shed and weigh-in (HV) share cards.

Same two promises as the original kinds: only allow-listed, chosen fields
ever leave the server, and sharing changes nothing in the app. Plus the new
rules: each event id must belong to the card's animal, a colony needs keeper
access to ITS collection, and an ended / handed-off colony can't get a new
card while its existing links read as no longer shared.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException, Response

from app.routers import share_cards as sc
from app.schemas.share_card import ShareCardCreate
from app.services.share_card import (
    CARD_KINDS, DEFAULT_FIELDS, FIELD_ALLOW, CardSubject, ShedFacts, WeightFacts,
    clean_fields, compose_card, population_label, stages_label, weight_change_label,
)

TODAY = date(2026, 10, 7)
OWNER = NS(id=uuid.uuid4(), share_defaults=None, collection_visibility="private", is_active=True)
KEEPER = NS(id=uuid.uuid4(), share_defaults=None)
STRANGER = NS(id=uuid.uuid4(), share_defaults=None)
ANIMAL_ID = uuid.uuid4()
COLONY_ID = uuid.uuid4()
BASE = "https://pub.example.r2.dev"


def run(c):
    return asyncio.run(c)


@pytest.fixture(autouse=True)
def _r2_base(monkeypatch):
    from app.services.storage import storage_service
    monkeypatch.setattr(storage_service, "use_r2", True, raising=False)
    monkeypatch.setattr(storage_service, "public_url_base", BASE, raising=False)


def colony_subject(**kw):
    base = dict(
        app="tarantuverse", taxon="isopod", name="Dairy cows", scientific_name="Porcellio laevis",
        common_name="Dairy cow isopod", sex=None, date_acquired=date(2025, 3, 2),
        photo_url=f"{BASE}/photos/col.jpg", founded_date=None,
        stage_counts={"adults": 120, "juveniles": 200, "mancae": 40, "mixed": 0},
        count_is_estimated=True,
    )
    base.update(kw)
    return CardSubject(**base)


def juniper(**kw):
    base = dict(
        app="herpetoverse", taxon="snake", name="Juniper", scientific_name="Python regius",
        common_name="Ball python", sex="male", date_acquired=date(2025, 8, 14),
        photo_url=f"{BASE}/photos/jun.jpg",
    )
    base.update(kw)
    return CardSubject(**base)


# ── Allow-lists ──────────────────────────────────────────────────────────────

NEVER = ("price", "price_paid", "source", "notes", "enclosure", "enclosure_id", "location",
         "email", "username", "sitter_note", "retained_shed_notes", "context", "end_notes")


def test_kinds_are_registered_everywhere():
    for key in FIELD_ALLOW:
        assert key in DEFAULT_FIELDS
        assert key[1] in CARD_KINDS
        assert set(DEFAULT_FIELDS[key]) <= set(FIELD_ALLOW[key])


@pytest.mark.parametrize("key", [("tarantuverse", "colony"), ("herpetoverse", "shed"), ("herpetoverse", "weight")])
def test_never_allowed_fields_are_dropped(key):
    assert not set(FIELD_ALLOW[key]) & set(NEVER)
    assert clean_fields(*key, list(NEVER) + ["photo"]) == ["photo"]


def test_kinds_belong_to_one_app():
    for app, kind in (("herpetoverse", "colony"), ("tarantuverse", "shed"), ("tarantuverse", "weight"),
                      ("herpetoverse", "molt")):
        with pytest.raises(ValueError):
            clean_fields(app, kind, None)


def test_defaults():
    assert clean_fields("tarantuverse", "colony", None) == ["photo", "name", "species", "population"]
    assert clean_fields("herpetoverse", "shed", None) == ["photo", "name", "species", "shed_number", "shed_date"]
    assert clean_fields("herpetoverse", "weight", None) == ["photo", "name", "species", "weight", "change"]


# ── Colony compose ───────────────────────────────────────────────────────────

ALL_COLONY = list(FIELD_ALLOW[("tarantuverse", "colony")])


def test_colony_card_full():
    card = compose_card("colony", colony_subject(), ALL_COLONY, today=TODAY)
    assert card["header"] == "Colony"
    assert card["kind"] == "colony"
    assert card["name"] == "Dairy cows"
    assert card["scientific_name"] == "Porcellio laevis"
    assert card["common_name"] == "Dairy cow isopod"
    assert card["photo_url"].endswith("col.jpg")
    assert card["facts"] == [
        {"label": "Population", "value": "~360 isopods"},
        {"label": "Stages", "value": "~200 juveniles · ~120 adults · ~40 mancae"},
        {"label": "Colony since", "value": "2025"},
    ]
    assert card["notes"] == {
        "headline": "Dairy cows",
        "species_line": "Porcellio laevis",
        "facts": ["about 360 isopods", "~200 juveniles, ~120 adults, ~40 mancae", "since 2025"],
    }


def test_exact_count_says_no_about():
    card = compose_card("colony", colony_subject(count_is_estimated=False), ["population", "stages"], today=TODAY)
    assert card["facts"] == [
        {"label": "Population", "value": "360 isopods"},
        {"label": "Stages", "value": "200 juveniles · 120 adults · 40 mancae"},
    ]
    assert card["notes"]["facts"][0] == "360 isopods"


@pytest.mark.parametrize("counts,estimated,taxon,want", [
    ({"mixed": 1}, False, "isopod", "1 isopod"),
    ({"adults": 3, "nymphs": 9}, True, "roach", "~12 roaches"),
    ({"mixed": 50}, False, "other", "50 animals"),
    ({"mixed": 7}, False, "mantis", "7 mantises"),
    ({}, True, "isopod", None),
    ({"adults": 0}, False, "isopod", None),
    (None, False, "isopod", None),
    # JSONB can hold anything: only real integer counts count.
    ({"adults": True, "juveniles": "40", "mixed": 5.5, "nymphs": 4}, False, "roach", "4 roaches"),
])
def test_population_label(counts, estimated, taxon, want):
    assert population_label(taxon, counts, estimated) == want


def test_stages_need_two_buckets_and_keep_the_top_three():
    assert stages_label({"mixed": 300}, False) is None
    assert stages_label({"adults": 10, "mixed": 0}, False) is None
    assert stages_label({"a": 1, "b": 4, "c": 3, "d": 2}, False) == "4 b · 3 c · 2 d"
    assert stages_label({"adult_females": 6, "adult_males": 2}, False) == "6 adult females · 2 adult males"
    # A third bucket only while the line stays short; thousands get commas.
    long = {"adult_females": 1240, "adult_males": 310, "large_nymphs": 4200, "small_nymphs": 9000}
    assert stages_label(long, True) == "~9,000 small nymphs · ~4,200 large nymphs"
    assert population_label("roach", long, True) == "~14,750 roaches"


def test_empty_colony_has_no_population_row():
    card = compose_card("colony", colony_subject(stage_counts={}), ALL_COLONY, today=TODAY)
    assert [f["label"] for f in card["facts"]] == ["Colony since"]


def test_founded_prefers_founded_date_and_reads_month_when_young():
    card = compose_card("colony", colony_subject(founded_date=date(2026, 3, 9)), ["founded"], today=TODAY)
    assert card["facts"] == [{"label": "Colony since", "value": "Mar 2026"}]
    card = compose_card("colony", colony_subject(founded_date=None, date_acquired=None), ["founded"], today=TODAY)
    assert card["facts"] == []
    future = compose_card("colony", colony_subject(founded_date=date(2027, 1, 1)), ["founded"], today=TODAY)
    assert future["facts"] == []


def test_colony_without_name_uses_species_for_the_headline():
    card = compose_card("colony", colony_subject(), ["species", "population"], today=TODAY)
    assert card["name"] is None
    assert card["notes"]["headline"] == "Porcellio laevis"
    assert card["notes"]["species_line"] == "Dairy cow isopod"


def test_colony_unchosen_fields_are_absent():
    card = compose_card("colony", colony_subject(), ["photo"], today=TODAY)
    assert card["name"] is None and card["scientific_name"] is None and card["common_name"] is None
    assert card["facts"] == [] and card["notes"] == {"headline": None, "species_line": None, "facts": []}


# ── Shed compose ─────────────────────────────────────────────────────────────

ALL_SHED = list(FIELD_ALLOW[("herpetoverse", "shed")])


def shed7(**kw):
    base = dict(number=7, shed_on=date(2026, 10, 3), is_complete=True, has_retained=False,
                previous_on=date(2026, 8, 23))
    base.update(kw)
    return ShedFacts(**base)


def test_shed_card_full():
    card = compose_card("shed", juniper(), ALL_SHED, shed=shed7(), today=TODAY)
    assert card["header"] == "Specimen · shed no. 7"
    assert card["kind"] == "shed"
    assert card["common_name"] is None  # like the molt card
    assert card["facts"] == [
        {"label": "Shed on", "value": "Oct 3, 2026"},
        {"label": "Shed", "value": "Complete"},
        {"label": "Since last shed", "value": "41 days"},
        # Time in care AT the shed (acquired Aug 14 2025), not today.
        {"label": "In care", "value": "1 yr, 1 mo"},
    ]
    assert card["notes"] == {
        "headline": "Juniper, 7th shed",
        "species_line": "Python regius",
        "facts": ["Oct 3, 2026", "complete shed", "41 days since the last", "1 yr, 1 mo with me"],
    }
    early = compose_card("shed", juniper(), ["in_care"], shed=shed7(shed_on=date(2025, 9, 20)), today=TODAY)
    assert early["facts"] == [{"label": "In care", "value": "1 mo"}]


def test_first_shed_has_no_gap_row():
    card = compose_card("shed", juniper(), ["days_since_previous"], shed=shed7(number=1, previous_on=None), today=TODAY)
    assert card["facts"] == []


def test_shed_without_number_field():
    card = compose_card("shed", juniper(), ["name"], shed=shed7(), today=TODAY)
    assert card["header"] == "Specimen · shed"
    assert card["notes"]["headline"] == "Juniper"
    card = compose_card("shed", juniper(), ["shed_number"], shed=shed7(number=1), today=TODAY)
    assert card["notes"]["headline"] == "1st shed"
    assert compose_card("shed", juniper(), ["photo"], shed=shed7(), today=TODAY)["notes"]["headline"] == "Shed"


@pytest.mark.parametrize("complete,retained,want", [
    (True, False, "Complete"),
    (False, False, "Incomplete"),
    (True, True, "Complete, some retained"),
    (None, False, None),
])
def test_shed_completeness(complete, retained, want):
    card = compose_card("shed", juniper(), ["completeness"], shed=shed7(is_complete=complete, has_retained=retained), today=TODAY)
    assert card["facts"] == ([{"label": "Shed", "value": want}] if want else [])


def test_shed_card_needs_a_shed():
    with pytest.raises(ValueError):
        compose_card("shed", juniper(), ALL_SHED, today=TODAY)


# ── Weight compose ───────────────────────────────────────────────────────────

ALL_WEIGHT = list(FIELD_ALLOW[("herpetoverse", "weight")])


def test_weight_card_full():
    w = WeightFacts(weight_g=1236, weighed_on=date(2026, 10, 1), previous_g=1200)
    card = compose_card("weight", juniper(), ALL_WEIGHT, weight=w, today=TODAY)
    assert card["header"] == "Specimen · weigh-in"
    assert card["facts"] == [
        {"label": "Weight", "value": "1.24 kg"},
        {"label": "Change", "value": "+36 g (+3%)"},
        {"label": "Weighed", "value": "Oct 1, 2026"},
        {"label": "In care", "value": "1 yr, 1 mo"},
    ]
    assert card["notes"]["headline"] == "Juniper"
    assert card["notes"]["facts"][:2] == ["1.24 kg", "+36 g (+3%) since the last"]


@pytest.mark.parametrize("now,prev,want", [
    (1236, 1200, "+36 g (+3%)"),
    (1160, 1200, "−40 g (−3%)"),
    (1412, 1400, "+12 g (+0.9%)"),
    (1200, 1200, "0 g"),
    (2600, 1400, "+1.2 kg (+86%)"),
    (42, None, None),
    (10, 0, "+10 g"),
])
def test_weight_change(now, prev, want):
    assert weight_change_label(now, prev) == want


def test_first_weigh_in_has_no_change_row():
    w = WeightFacts(weight_g=42, weighed_on=date(2026, 10, 1), previous_g=None)
    card = compose_card("weight", juniper(name=None), ["weight", "change"], weight=w, today=TODAY)
    assert card["facts"] == [{"label": "Weight", "value": "42 g"}]
    assert card["notes"]["headline"] == "Weigh-in"


# ── Router ───────────────────────────────────────────────────────────────────

class FakeDB:
    def __init__(self):
        self.added, self.commits = [], 0
        self.links: dict[str, object] = {}

    def add(self, obj):
        self.added.append(obj)
        if getattr(obj, "code", None):
            self.links[obj.code] = obj

    def commit(self):
        self.commits += 1


def colony_row(**kw):
    base = dict(id=COLONY_ID, user_id=OWNER.id, taxon="isopod", name="Dairy cows", species_id=None,
                date_acquired=date(2025, 3, 2), founded_date=None, photo_url=f"{BASE}/photos/col.jpg",
                stage_counts={"adults": 120, "juveniles": 200}, count_is_estimated=True,
                visibility="private", is_active=True, ended_at=None, transferred_out_at=None,
                location="Rack B", notes="secret", sitter_note="secret too")
    base.update(kw)
    return NS(**base)


@pytest.fixture
def subjects(monkeypatch):
    """Owner and keeper may share; anyone else is a 404 (like the real resolver)."""
    state = {"colony": colony_row()}
    animal = NS(id=ANIMAL_ID, user_id=OWNER.id, visibility="private")

    def load_subject(db, user, app, animal_id, need):
        if user is not OWNER and user is not KEEPER:
            raise HTTPException(404, "Animal not found")
        return animal, OWNER, juniper()

    def load_colony_subject(db, user, colony_id, need):
        if user is not OWNER and user is not KEEPER:
            raise HTTPException(404, "Colony not found")
        col = state["colony"]
        return col, OWNER, sc._colony_subject(db, col)

    monkeypatch.setattr(sc, "_load_subject", load_subject)
    monkeypatch.setattr(sc, "_load_subject_unchecked", lambda db, app, animal_id: (animal, OWNER, juniper()))
    monkeypatch.setattr(sc, "_load_colony_subject", load_colony_subject)
    monkeypatch.setattr(sc, "_load_colony_subject_unchecked",
                        lambda db, cid: (state["colony"], None, sc._colony_subject(db, state["colony"])))
    monkeypatch.setattr(sc, "_find_link", lambda db, code: db.links.get(code))
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, aid: True)
    monkeypatch.setattr(sc, "_colony_live", lambda db, cid: not sc._colony_closed(state["colony"]))
    calls = {"shed": [], "weight": []}

    def load_shed(db, animal_id, shed_id):
        calls["shed"].append((animal_id, shed_id))
        return shed7()

    def load_weight(db, animal_id, wid):
        calls["weight"].append((animal_id, wid))
        return WeightFacts(weight_g=1236, weighed_on=date(2026, 10, 1), previous_g=1200)

    monkeypatch.setattr(sc, "_load_shed", load_shed)
    monkeypatch.setattr(sc, "_load_weight", load_weight)
    return NS(state=state, animal=animal, calls=calls)


def create(user, db, **kw):
    body = dict(app="tarantuverse", animal_id=COLONY_ID, kind="colony", shape="story")
    body.update(kw)
    return run(sc.create_share_card(ShareCardCreate(**body), db=db, current_user=user))


def data_for(out, db):
    return run(sc.share_card_data(out.image_url.rsplit("/", 1)[1], response=Response(), db=db))


def test_colony_card_round_trip(subjects):
    db = FakeDB()
    out = create(OWNER, db, fields=["name", "population", "notes", "location", "sitter_note"])
    assert out.fields == ["name", "population"]
    data = data_for(out, db)
    assert data["kind"] == "colony" and data["header"] == "Colony"
    assert data["facts"] == [{"label": "Population", "value": "~320 isopods"}]
    for secret in ("Rack B", "secret"):
        assert secret not in str(data)
    assert OWNER.share_defaults["tarantuverse:colony"] == {"fields": ["name", "population"], "frame": "specimen"}


def test_keeper_can_share_a_colony_and_stranger_gets_404(subjects):
    assert create(KEEPER, FakeDB()).image_url
    with pytest.raises(HTTPException) as e:
        create(STRANGER, FakeDB())
    assert e.value.status_code == 404


@pytest.mark.parametrize("closed", [{"ended_at": date(2026, 9, 1)}, {"transferred_out_at": datetime(2026, 9, 1, tzinfo=timezone.utc)}])
def test_ended_or_transferred_colony_cannot_get_a_new_card(subjects, closed):
    subjects.state["colony"] = colony_row(**closed)
    db = FakeDB()
    with pytest.raises(HTTPException) as e:
        create(OWNER, db, link=True)
    assert e.value.status_code == 409
    assert db.added == [] and db.commits == 0


def test_colony_card_link_goes_when_the_colony_ends(subjects):
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "population"])
    link = db.links[out.code]
    assert link.kind == "colony" and link.animal_id == COLONY_ID
    assert run(sc.get_card_link(out.code, response=Response(), db=db))["name"] == "Dairy cows"
    subjects.state["colony"] = colony_row(ended_at=date(2026, 10, 6))
    with pytest.raises(HTTPException) as e:
        run(sc.get_card_link(out.code, response=Response(), db=db))
    assert e.value.status_code == 410


def test_colony_links_never_use_the_animal_check(subjects, monkeypatch):
    """A colony id must not be looked up as an animal (and vice versa)."""
    db = FakeDB()
    out = create(OWNER, db, link=True)
    monkeypatch.setattr(sc, "_animal_exists", lambda *a: (_ for _ in ()).throw(AssertionError("animal check")))
    assert run(sc.get_card_link(out.code, response=Response(), db=db))["kind"] == "colony"


def test_sharing_a_colony_writes_no_visibility(subjects):
    db = FakeDB()
    create(OWNER, db, link=True)
    assert subjects.state["colony"].visibility == "private"
    assert OWNER.collection_visibility == "private"
    assert [type(o).__name__ for o in db.added] == ["CardLink"]


@pytest.mark.parametrize("kind,missing", [("shed", "shed_id"), ("weight", "weight_log_id")])
def test_event_cards_need_their_id(subjects, kind, missing):
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), app="herpetoverse", animal_id=ANIMAL_ID, kind=kind)
    assert e.value.status_code == 422 and missing in e.value.detail


@pytest.mark.parametrize("app,kind", [("herpetoverse", "colony"), ("tarantuverse", "shed"), ("tarantuverse", "weight")])
def test_kind_from_the_other_app_is_422(subjects, app, kind):
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), app=app, kind=kind, shed_id=uuid.uuid4(), weight_log_id=uuid.uuid4())
    assert e.value.status_code == 422


def test_shed_card_round_trip_reads_the_shed_under_this_animal(subjects):
    db = FakeDB()
    sid = uuid.uuid4()
    out = create(OWNER, db, app="herpetoverse", animal_id=ANIMAL_ID, kind="shed", shed_id=sid)
    data = data_for(out, db)
    assert data["header"] == "Specimen · shed no. 7"
    assert [f["label"] for f in data["facts"]] == ["Shed on"]
    assert subjects.calls["shed"] == [(ANIMAL_ID, sid), (ANIMAL_ID, sid)]


def test_weight_card_round_trip(subjects):
    db = FakeDB()
    wid = uuid.uuid4()
    out = create(OWNER, db, app="herpetoverse", animal_id=ANIMAL_ID, kind="weight", weight_log_id=wid, link=True)
    data = data_for(out, db)
    assert data["facts"] == [{"label": "Weight", "value": "1.24 kg"}, {"label": "Change", "value": "+36 g (+3%)"}]
    assert subjects.calls["weight"][0] == (ANIMAL_ID, wid)
    assert run(sc.get_card_link(out.code, response=Response(), db=db))["header"] == "Specimen · weigh-in"


def test_other_kinds_ignore_stray_event_ids(subjects):
    out = create(OWNER, FakeDB(), app="herpetoverse", animal_id=ANIMAL_ID, kind="profile",
                 shed_id=uuid.uuid4(), weight_log_id=uuid.uuid4())
    assert out.image_url
    assert subjects.calls == {"shed": [], "weight": []}


def test_defaults_route_accepts_new_kinds(subjects):
    got = run(sc.get_share_defaults(app="herpetoverse", kind="weight", current_user=NS(share_defaults=None)))
    assert got == {"fields": ["photo", "name", "species", "weight", "change"], "frame": "specimen"}


def test_router_still_never_writes_visibility():
    import inspect
    src = inspect.getsource(sc)
    for col in ("visibility =", "is_public =", "collection_visibility ="):
        assert col not in src


# ── Real loaders against a keyed fake DB ─────────────────────────────────────

class Stub:
    def __init__(self, db, key):
        self.db, self.key = db, key

    def filter(self, *clauses):
        from sqlalchemy.dialects import postgresql
        self.db.sql += [str(c.compile(dialect=postgresql.dialect())) for c in clauses]
        return self

    def order_by(self, *a):
        return self

    def limit(self, n):
        return self

    def first(self):
        return self.db.rows.get(self.key)

    def count(self):
        return self.db.counts.get(self.key, 0)

    def all(self):
        r = self.db.rows.get(self.key)
        return [r] if r else []


class KeyedDB:
    """query(Model) / query(Model.col) -> a stub keyed by 'Model' / 'Model.col'."""

    def __init__(self, rows=None, counts=None):
        self.rows, self.counts, self.sql = rows or {}, counts or {}, []

    def query(self, target, *a):
        if isinstance(target, type):
            key = target.__name__
        else:
            key = f"{target.class_.__name__}.{target.key}"
        return Stub(self, key)


def test_load_shed_numbers_and_gaps():
    shed = NS(id=uuid.uuid4(), shed_at=datetime(2026, 10, 3, 9, tzinfo=timezone.utc),
              is_complete_shed=False, has_retained_shed=True)
    db = KeyedDB(rows={"ShedLog": shed, "ShedLog.shed_at": (datetime(2026, 8, 23, 20, tzinfo=timezone.utc),)},
                 counts={"ShedLog": 6})
    got = sc._load_shed(db, ANIMAL_ID, shed.id)
    assert got == ShedFacts(number=7, shed_on=date(2026, 10, 3), is_complete=False, has_retained=True,
                            previous_on=date(2026, 8, 23))
    joined = " ".join(db.sql)
    assert "shed_logs.id" in joined and "shed_logs.animal_id" in joined


def test_load_shed_of_another_animal_is_404():
    db = KeyedDB()  # the (id AND animal_id) lookup finds nothing
    with pytest.raises(HTTPException) as e:
        sc._load_shed(db, ANIMAL_ID, uuid.uuid4())
    assert e.value.status_code == 404
    assert "shed_logs.animal_id" in db.sql[0] or "shed_logs.animal_id" in " ".join(db.sql)


def test_load_weight_previous_and_scope():
    row = NS(id=uuid.uuid4(), weighed_at=datetime(2026, 10, 1, tzinfo=timezone.utc), weight_g=1236)
    db = KeyedDB(rows={"WeightLog": row, "WeightLog.weight_g": (1200,)})
    assert sc._load_weight(db, ANIMAL_ID, row.id) == WeightFacts(weight_g=1236.0, weighed_on=date(2026, 10, 1), previous_g=1200.0)
    assert "weight_logs.animal_id" in " ".join(db.sql)
    first = sc._load_weight(KeyedDB(rows={"WeightLog": row}), ANIMAL_ID, row.id)
    assert first.previous_g is None
    with pytest.raises(HTTPException) as e:
        sc._load_weight(KeyedDB(), ANIMAL_ID, uuid.uuid4())
    assert e.value.status_code == 404


def test_another_keepers_colony_is_404():
    """The real colony loader: no membership in the owner's collection -> 404."""
    owner = NS(id=OWNER.id, is_active=True, is_premium_for_app=lambda app: True)
    db = KeyedDB(rows={"Colony": colony_row(), "User": owner, "CollectionMember": None})
    with pytest.raises(HTTPException) as e:
        sc._load_colony_subject(db, STRANGER, COLONY_ID, "keeper")
    assert e.value.status_code == 404
    col, got_owner, subj = sc._load_colony_subject(db, owner, COLONY_ID, "keeper")
    assert got_owner is owner and subj.name == "Dairy cows" and subj.taxon == "isopod"


@pytest.mark.parametrize("row,live", [
    (colony_row(), True),
    (colony_row(ended_at=date(2026, 9, 1)), False),
    (colony_row(transferred_out_at=datetime(2026, 9, 1, tzinfo=timezone.utc)), False),
    (None, False),
])
def test_colony_live(row, live):
    assert sc._colony_live(KeyedDB(rows={"Colony": row}), COLONY_ID) is live


def test_colony_photos_are_scoped_to_the_colony():
    db = KeyedDB()
    assert sc._load_photo_url(db, "tarantuverse", COLONY_ID, uuid.uuid4(), kind="colony") is None
    joined = " ".join(db.sql)
    assert "photos.id" in joined and "photos.colony_id" in joined and "photos.invert_id" not in joined


def test_colony_photo_picker_lists_colony_photos(monkeypatch):
    seen = {}
    monkeypatch.setattr(sc, "_load_colony_subject",
                        lambda db, user, cid, need: (colony_row(), OWNER, colony_subject()))

    def list_photos(db, app, animal_id, kind=None):
        seen["kind"] = kind
        return [NS(id=uuid.uuid4(), url=f"{BASE}/photos/col.jpg", thumbnail_url=None)]

    monkeypatch.setattr(sc, "_list_photos", list_photos)
    out = run(sc.list_share_photos(app="tarantuverse", animal_id=COLONY_ID, kind="colony", db=KeyedDB(), current_user=OWNER))
    assert seen["kind"] == "colony" and [p.is_main for p in out] == [True]


def test_colony_subject_reads_no_private_columns():
    subj = sc._colony_subject(KeyedDB(), colony_row())
    assert "Rack B" not in str(subj) and "secret" not in str(subj)


# ── Link previews for already-public colonies ────────────────────────────────

@pytest.mark.parametrize("col_kw,owner_vis,ok", [
    ({"visibility": "public"}, "public", True),
    ({"visibility": "private"}, "public", False),
    ({"visibility": "public"}, "private", False),
    ({"visibility": "public", "ended_at": date(2026, 9, 1)}, "public", False),
    ({"visibility": "public", "transferred_out_at": datetime(2026, 9, 1, tzinfo=timezone.utc)}, "public", False),
])
def test_public_colony_card_rule(col_kw, owner_vis, ok):
    col = colony_row(founded_date=date(2024, 1, 1), **col_kw)
    owner = NS(id=OWNER.id, collection_visibility=owner_vis)
    db = KeyedDB(rows={"Colony": col, "User": owner})
    if not ok:
        with pytest.raises(HTTPException) as e:
            run(sc.public_colony_card(COLONY_ID, db=db))
        assert e.value.status_code == 404
        return
    card = run(sc.public_colony_card(COLONY_ID, db=db))
    assert card["shape"] == "wide" and card["kind"] == "colony"
    # Only what /col already shows: no founding / acquisition date.
    assert [f["label"] for f in card["facts"]] == ["Population", "Stages"]
    assert col.visibility == col_kw["visibility"] and owner.collection_visibility == owner_vis
