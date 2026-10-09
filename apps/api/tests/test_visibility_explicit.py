"""Hidden animals stay hidden (2026-10-09).

Turning a collection private->public used to flip EVERY private animal to
public, so a breeder's hidden holdbacks went public each time they reopened
their profile. `inverts.visibility_explicit` now records that the keeper chose
an animal's visibility, and `_cascade_collection_to_public` skips those rows —
on `inverts` and on the legacy `tarantulas`/`scorpions` mirrors.

In-memory SQLite built from the real model tables; no Postgres needed.
"""
import asyncio
import uuid
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers every table on the metadata)
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.scorpion import Scorpion
from app.models.tarantula import Tarantula
from app.models.user import User
from app.routers import auth, centipedes, inverts, scorpions, tarantulas, whip_spiders
from app.schemas.invert import InvertCreate, InvertUpdate
from app.schemas.scorpion import ScorpionUpdate
from app.schemas.tarantula import TarantulaUpdate
from app.utils.animal_visibility import visibility_changed


@compiles(JSONB, "sqlite")
def _jsonb_as_json(_type, _compiler, **_kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _array_as_json(_type, _compiler, **_kw):
    return "JSON"


@compiles(TSVECTOR, "sqlite")
def _tsvector_as_text(_type, _compiler, **_kw):
    return "TEXT"


TABLES = (Invert, Tarantula, Scorpion, InvertSpecies)


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")

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


def _owner(visibility="public"):
    return NS(id=OWNER_ID, username="cory", collection_visibility=visibility,
              is_superuser=False, is_admin=False)


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


class _UserQuery:
    def __init__(self, user):
        self.user = user

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.user


def _run(coro):
    return asyncio.run(coro)


def _invert(session, taxon="centipede", visibility="private", explicit=False):
    row = Invert(id=uuid.uuid4(), user_id=OWNER_ID, taxon=taxon,
                 name=f"{taxon}-{uuid.uuid4().hex[:4]}",
                 visibility=visibility, visibility_explicit=explicit)
    session.add(row)
    session.flush()
    return row


def _tarantula_pair(session, visibility="private", explicit=False):
    """A legacy tarantula row plus its `inverts` mirror (same id)."""
    tid = uuid.uuid4()
    session.add(Tarantula(id=tid, user_id=OWNER_ID, name="T", visibility=visibility))
    session.add(Invert(id=tid, user_id=OWNER_ID, taxon="tarantula", name="T",
                       visibility=visibility, visibility_explicit=explicit))
    session.flush()
    return tid


def _scorpion_pair(session, visibility="private", explicit=False):
    sid = uuid.uuid4()
    session.add(Scorpion(id=sid, user_id=OWNER_ID, name="S", visibility=visibility))
    session.add(Invert(id=sid, user_id=OWNER_ID, taxon="scorpion", name="S",
                       visibility=visibility, visibility_explicit=explicit))
    session.flush()
    return sid


def _vis(session, model, row_id):
    session.expire_all()
    return session.get(model, row_id).visibility


def _set_collection(session, user, visibility):
    """What both collection-visibility routes do: cascade only on private->public."""
    flipping_to_public = visibility == "public" and user.collection_visibility != "public"
    user.collection_visibility = visibility
    if flipping_to_public:
        auth._cascade_collection_to_public(session, user.id)
    session.flush()


# ── The cascade ──────────────────────────────────────────────────────────────

def test_hidden_animal_survives_repeated_reopening(session):
    user = _owner("public")
    db = DB(session, user)
    animal = _invert(session, visibility="public")

    # The keeper hides it through the normal edit route.
    _run(inverts.update_invert(animal.id, InvertUpdate(visibility="private"),
                               current_user=user, db=db))
    assert session.get(Invert, animal.id).visibility_explicit is True

    for _ in range(2):
        _set_collection(session, user, "private")
        _set_collection(session, user, "public")
        assert _vis(session, Invert, animal.id) == "private"


def test_default_private_animal_still_flips(session):
    user = _owner("private")
    animal = _invert(session, visibility="private", explicit=False)
    _set_collection(session, user, "public")
    assert _vis(session, Invert, animal.id) == "public"


def test_cascade_leaves_other_keepers_alone(session):
    user = _owner("private")
    other = Invert(id=uuid.uuid4(), user_id=uuid.uuid4(), taxon="centipede",
                   name="theirs", visibility="private")
    session.add(other)
    session.flush()
    _set_collection(session, user, "public")
    assert _vis(session, Invert, other.id) == "private"


def test_legacy_mirrors_stay_in_sync(session):
    user = _owner("private")
    hidden_t = _tarantula_pair(session, explicit=True)
    default_t = _tarantula_pair(session, explicit=False)
    hidden_s = _scorpion_pair(session, explicit=True)
    default_s = _scorpion_pair(session, explicit=False)

    _set_collection(session, user, "public")

    for rid, legacy in ((hidden_t, Tarantula), (hidden_s, Scorpion)):
        assert _vis(session, Invert, rid) == "private"
        assert _vis(session, legacy, rid) == "private"
    for rid, legacy in ((default_t, Tarantula), (default_s, Scorpion)):
        assert _vis(session, Invert, rid) == "public"
        assert _vis(session, legacy, rid) == "public"


def test_legacy_row_without_mirror_flips_as_before(session):
    user = _owner("private")
    tid = uuid.uuid4()
    session.add(Tarantula(id=tid, user_id=OWNER_ID, name="orphan", visibility="private"))
    session.flush()
    _set_collection(session, user, "public")
    assert _vis(session, Tarantula, tid) == "public"


# ── Create: inheritance is not a choice ──────────────────────────────────────

@pytest.mark.parametrize("collection", ["private", "public"])
def test_create_inheritance_does_not_mark_explicit(session, collection):
    user = _owner(collection)
    row = inverts.create_invert_row(
        DB(session, user), user, InvertCreate(taxon="centipede", name="new"),
        enforce_limit=False,
    )
    assert row.visibility == collection
    assert row.visibility_explicit is False


def test_create_with_chosen_visibility_is_explicit(session):
    user = _owner("public")
    row = inverts.create_invert_row(
        DB(session, user), user,
        InvertCreate(taxon="centipede", name="holdback", visibility="private"),
        enforce_limit=False,
    )
    assert row.visibility == "private"
    assert row.visibility_explicit is True


# ── Update: only a CHANGE is a choice ────────────────────────────────────────

def test_echoed_visibility_is_not_a_choice(session):
    """Edit forms send `visibility` back on every save."""
    user = _owner("private")
    db = DB(session, user)
    animal = _invert(session, visibility="private")
    _run(inverts.update_invert(animal.id, InvertUpdate(name="renamed", visibility="private"),
                               current_user=user, db=db))
    assert session.get(Invert, animal.id).visibility_explicit is False
    _set_collection(session, user, "public")
    assert _vis(session, Invert, animal.id) == "public"


def test_legacy_tarantula_edit_marks_mirror(session):
    user = _owner("public")
    tid = _tarantula_pair(session, visibility="public")
    _run(tarantulas.update_tarantula(tid, TarantulaUpdate(visibility="private"),
                                     current_user=user, db=DB(session, user)))
    session.expire_all()
    assert session.get(Invert, tid).visibility_explicit is True
    assert session.get(Tarantula, tid).visibility == "private"
    _set_collection(session, user, "private")
    _set_collection(session, user, "public")
    assert _vis(session, Tarantula, tid) == "private"
    assert _vis(session, Invert, tid) == "private"


def test_legacy_scorpion_edit_marks_mirror(session):
    user = _owner("public")
    sid = _scorpion_pair(session, visibility="public")
    _run(scorpions.update_scorpion(sid, ScorpionUpdate(visibility="private"),
                                   current_user=user, db=DB(session, user)))
    session.expire_all()
    assert session.get(Invert, sid).visibility_explicit is True


def test_invert_route_on_tarantula_keeps_legacy_in_sync(session):
    user = _owner("public")
    tid = _tarantula_pair(session, visibility="public")
    _run(inverts.update_invert(tid, InvertUpdate(visibility="private"),
                               current_user=user, db=DB(session, user)))
    session.commit()
    _set_collection(session, user, "private")
    _set_collection(session, user, "public")
    assert _vis(session, Tarantula, tid) == "private"
    assert _vis(session, Invert, tid) == "private"


@pytest.mark.parametrize("module,fn,taxon,schema_attr", [
    (centipedes, "update_centipede", "centipede", "CentipedeUpdate"),
    (whip_spiders, "update_whip_spider", "whip_spider", "WhipSpiderUpdate"),
])
def test_facade_routes_mark_explicit(session, module, fn, taxon, schema_attr):
    user = _owner("public")
    animal = _invert(session, taxon=taxon, visibility="public")
    payload = getattr(module, schema_attr)(visibility="private")
    _run(getattr(module, fn)(animal.id, payload, current_user=user, db=DB(session, user)))
    session.expire_all()
    assert session.get(Invert, animal.id).visibility_explicit is True


def test_visibility_changed_rules():
    row = NS(visibility="private")
    assert visibility_changed(row, {"name": "x"}) is False
    assert visibility_changed(row, {"visibility": "private"}) is False
    assert visibility_changed(row, {"visibility": None}) is False
    assert visibility_changed(row, {"visibility": "public"}) is True


# ── Transfers: the buyer's new animal is not a choice ────────────────────────

def test_transfer_claim_does_not_mark_explicit():
    """The claimed Invert is built without visibility_explicit, so the model
    default (False) applies."""
    import inspect
    from app.routers import transfers

    assert "visibility_explicit" not in inspect.getsource(transfers)
    assert Invert.__table__.c.visibility_explicit.default.arg is False
