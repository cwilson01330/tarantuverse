"""Animal lists and public keeper profiles read the right animals (audit 2026-10-08).

- H1: the legacy per-taxon lists (`/centipedes/`, `/whip-spiders/`,
  `/scorpions/`) kept animals that died or were transferred out, so they stayed
  in the collection grid, its chip counts and the cap notice.
- H2: `/keepers/{u}/collection/` and `/stats/` read the legacy `tarantulas`
  table only — every other taxon was invisible on a public profile — and
  listed dead and sold tarantulas too. The `/keeper/{u}/{slug}` page had the
  same blind spot and published the owner's private notes.
- M15: basic collection analytics counted dead animals.

In-memory SQLite built from the real model tables; no Postgres needed.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers every table on the metadata)
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.molt_log import MoltLog
from app.models.photo import Photo
from app.models.scorpion import Scorpion
from app.models.substrate_change import SubstrateChange
from app.models.tarantula import Sex
from app.models.user import User
from app.routers import analytics, centipedes, keepers, scorpions, tarantulas, whip_spiders


@compiles(JSONB, "sqlite")
def _jsonb_as_json(_type, _compiler, **_kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _array_as_json(_type, _compiler, **_kw):
    return "JSON"


@compiles(TSVECTOR, "sqlite")
def _tsvector_as_text(_type, _compiler, **_kw):
    return "TEXT"


TABLES = (Invert, Scorpion, FeedingLog, MoltLog, SubstrateChange, Photo, InvertSpecies)


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")

    # The log tables' CHECK constraints call Postgres' num_nonnulls().
    @event.listens_for(engine, "connect")
    def _pg_functions(dbapi_conn, _record):
        dbapi_conn.create_function("num_nonnulls", -1, lambda *a: sum(x is not None for x in a))

    for model in TABLES:
        model.__table__.create(engine)
    s = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


OWNER_ID = uuid.uuid4()
VISITOR_ID = uuid.uuid4()


def _owner(**kw):
    base = dict(id=OWNER_ID, username="cory", display_name="Cory", avatar_url=None,
                collection_visibility="public")
    base.update(kw)
    return NS(**base)


class _UserQuery:
    def __init__(self, user):
        self.user = user
    def filter(self, *a, **k):
        return self
    def first(self):
        return self.user


class DB:
    """Real SQLite session for animal tables; `User` lookups answer from a
    stub (the users table uses Postgres-only column types)."""
    def __init__(self, session, user):
        self.session, self.user = session, user
    def query(self, *entities):
        if entities and entities[0] is User:
            return _UserQuery(self.user)
        return self.session.query(*entities)
    def __getattr__(self, name):
        return getattr(self.session, name)


def _add(session, taxon="tarantula", user=OWNER_ID, **kw):
    row = Invert(id=uuid.uuid4(), user_id=user, taxon=taxon,
                 name=kw.pop("name", f"{taxon}-{uuid.uuid4().hex[:4]}"), **kw)
    session.add(row)
    session.flush()
    return row


def _run(coro):
    return asyncio.run(coro)


# ── H1: legacy per-taxon lists ──────────────────────────────────────────────

@pytest.mark.parametrize("module,fn,taxon", [
    (centipedes, "list_centipedes", "centipede"),
    (whip_spiders, "list_whip_spiders", "whip_spider"),
])
def test_legacy_lists_drop_dead_and_transferred(session, module, fn, taxon):
    alive = _add(session, taxon)
    _add(session, taxon, died_at=date.today())
    _add(session, taxon, transferred_out_at=datetime.now(timezone.utc))
    _add(session, taxon, user=VISITOR_ID)
    _add(session, "tarantula")
    rows = _run(getattr(module, fn)(current_user=NS(id=OWNER_ID), db=session))
    assert [r.id for r in rows] == [alive.id]


def test_scorpion_list_drops_dead_and_transferred(session):
    alive = _add(session, "scorpion")
    dead = _add(session, "scorpion", died_at=date.today())
    _add(session, "scorpion", transferred_out_at=datetime.now(timezone.utc))
    # A legacy-only straggler that died must not reappear through the UNION,
    # nor a legacy row whose inverts mirror is dead.
    session.add(Scorpion(id=uuid.uuid4(), user_id=OWNER_ID, name="old", died_at=date.today()))
    session.add(Scorpion(id=dead.id, user_id=OWNER_ID, name=dead.name))
    straggler = Scorpion(id=uuid.uuid4(), user_id=OWNER_ID, name="straggler")
    session.add(straggler)
    session.flush()
    rows = _run(scorpions.list_scorpions(colony_id=None, current_user=NS(id=OWNER_ID), db=session))
    assert {r.id for r in rows} == {alive.id, straggler.id}


# ── H2: public keeper profile ───────────────────────────────────────────────

def _profile_fixture(session):
    pub_t = _add(session, "tarantula", visibility="public", sex=Sex.FEMALE,
                 scientific_name="Brachypelma hamorii", price_paid=40, notes="secret", location="Rack 1")
    pub_m = _add(session, "mantis", visibility="public", sex=Sex.MALE, scientific_name="Phyllocrania paradoxa")
    priv = _add(session, "isopod", visibility="private", scientific_name="Armadillidium vulgare")
    _add(session, "scorpion", visibility="public", died_at=date.today())
    _add(session, "centipede", visibility="public", transferred_out_at=datetime.now(timezone.utc))
    _add(session, "tarantula", visibility="public", user=VISITOR_ID)
    return pub_t, pub_m, priv


def test_visitor_sees_public_active_animals_of_every_taxon_without_private_fields(session):
    pub_t, pub_m, _ = _profile_fixture(session)
    db = DB(session, _owner())
    rows = _run(keepers.get_keeper_collection("cory", db=db, current_user=NS(id=VISITOR_ID)))
    assert {r.id for r in rows} == {pub_t.id, pub_m.id}
    assert {r.taxon for r in rows} == {"tarantula", "mantis"}
    t = next(r for r in rows if r.id == pub_t.id)
    assert t.price_paid is None and t.notes is None and t.location is None
    assert t.sex == "female"


def test_owner_sees_every_active_animal_with_their_own_fields(session):
    pub_t, pub_m, priv = _profile_fixture(session)
    db = DB(session, _owner())
    rows = _run(keepers.get_keeper_collection("cory", db=db, current_user=NS(id=OWNER_ID)))
    assert {r.id for r in rows} == {pub_t.id, pub_m.id, priv.id}
    assert next(r for r in rows if r.id == pub_t.id).notes == "secret"


def test_private_collection_is_refused_to_visitors(session):
    _profile_fixture(session)
    db = DB(session, _owner(collection_visibility="private"))
    with pytest.raises(HTTPException) as e:
        _run(keepers.get_keeper_collection("cory", db=db, current_user=None))
    assert e.value.status_code == 404


def test_stats_count_what_the_list_shows(session):
    _profile_fixture(session)
    db = DB(session, _owner())
    visitor = _run(keepers.get_keeper_stats("cory", db=db, current_user=None))
    assert visitor["total_public"] == 2
    assert visitor["unique_species"] == 2
    assert visitor["sex_distribution"] == {"male": 1, "female": 1, "unknown": 0}
    assert (visitor["males"], visitor["females"], visitor["unsexed"]) == (1, 1, 0)
    assert visitor["by_taxon"] == {"tarantula": 1, "mantis": 1}
    own = _run(keepers.get_keeper_stats("cory", db=db, current_user=NS(id=OWNER_ID)))
    assert own["total_public"] == 3 and own["sex_distribution"]["unknown"] == 1


def test_unique_species_counts_unlinked_animals_by_name():
    sid = uuid.uuid4()
    rows = [
        ("tarantula", "female", sid, "Brachypelma hamorii"),
        ("tarantula", "male", sid, "Brachypelma hamorii"),
        ("mantis", None, None, "Phyllocrania  paradoxa"),
        ("mantis", None, None, "phyllocrania paradoxa"),
        ("other", None, None, None),
    ]
    s = keepers.summarize_profile_animals("x", rows)
    assert s["unique_species"] == 2 and s["total_public"] == 5


def test_profile_routes_no_longer_read_the_legacy_table():
    import inspect
    src = inspect.getsource(keepers)
    assert "Tarantula)" not in src and "TarantulaResponse" not in src


# ── /keeper/{username}/{slug} ───────────────────────────────────────────────

def test_slug_page_resolves_any_taxon_and_never_publishes_notes(session):
    m = _add(session, "mantis", name="Gerald", visibility="public", notes="private")
    db = DB(session, _owner())
    r = _run(tarantulas.get_public_tarantula("cory", "gerald", db=db))
    assert r["tarantula"]["id"] == str(m.id)
    assert r["tarantula"]["taxon"] == "mantis"
    assert r["tarantula"]["notes"] is None
    # by id too
    assert _run(tarantulas.get_public_tarantula("cory", str(m.id), db=db))["tarantula"]["id"] == str(m.id)


@pytest.mark.parametrize("kw", [
    {"visibility": "private"},
    {"visibility": "public", "died_at": date.today()},
    {"visibility": "public", "transferred_out_at": datetime.now(timezone.utc)},
])
def test_slug_page_hides_private_dead_and_transferred(session, kw):
    _add(session, "tarantula", name="Rampart", **kw)
    db = DB(session, _owner())
    with pytest.raises(HTTPException) as e:
        _run(tarantulas.get_public_tarantula("cory", "rampart", db=db))
    assert e.value.status_code == 404


def test_slug_page_respects_a_private_collection(session):
    _add(session, "tarantula", name="Rampart", visibility="public")
    db = DB(session, _owner(collection_visibility="private"))
    with pytest.raises(HTTPException):
        _run(tarantulas.get_public_tarantula("cory", "rampart", db=db))


def test_public_slug_is_unchanged_for_tarantulas():
    assert tarantulas.public_slug(NS(taxon="tarantula", name=None, common_name=None, scientific_name="X y")) == "tarantula"
    assert tarantulas.public_slug(NS(name="Big Red", common_name=None, scientific_name=None)) == "big-red"
    assert tarantulas.public_slug(NS(taxon="mantis", name=None, common_name=None, scientific_name="Hymenopus coronatus")) == "hymenopus-coronatus"


# ── M15: basic analytics ────────────────────────────────────────────────────

def test_collection_analytics_leave_out_dead_and_transferred(session):
    _add(session, "tarantula", sex=Sex.FEMALE)
    _add(session, "mantis")
    _add(session, "scorpion", died_at=date.today(), sex=Sex.MALE)
    _add(session, "centipede", transferred_out_at=datetime.now(timezone.utc))
    r = _run(analytics.get_collection_analytics(current_user=NS(id=OWNER_ID), db=session))
    assert r.total_tarantulas == 2
    assert r.sex_distribution["male"] == 0
