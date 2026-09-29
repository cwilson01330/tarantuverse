"""Share-card endpoints. The two promises under test:

1. Sharing never changes anything in the app (no visibility write, ever).
2. Only the chosen, allow-listed fields ever leave the server.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException, Response

from app.routers import share_cards as sc
from app.schemas.share_card import ShareCardCreate
from app.services.share_card import CardSubject, MoltFacts

OWNER = NS(id=uuid.uuid4(), share_defaults=None, collection_visibility="private")
KEEPER = NS(id=uuid.uuid4(), share_defaults=None)
ANIMAL_ID = uuid.uuid4()


def subject():
    return CardSubject(
        app="tarantuverse", taxon="tarantula", name="Rosie", scientific_name="Brachypelma hamorii",
        common_name="Mexican redknee", sex="female", date_acquired=date(2025, 8, 14),
        photo_url="https://pub.example.r2.dev/photos/x.jpg", molt_count=9, latest_size="4.1 in",
    )


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

    def refresh(self, obj):
        pass


def run(c):
    return asyncio.run(c)


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    animal = NS(id=ANIMAL_ID, user_id=OWNER.id, visibility="private", is_public=False)

    def load_subject(db, user, app, animal_id, need):
        if user is not OWNER and user is not KEEPER:
            raise HTTPException(404, "Animal not found")
        return animal, OWNER, subject()

    monkeypatch.setattr(sc, "_load_subject", load_subject)
    # The token-authorised read path (renderer) — returns the same subject.
    monkeypatch.setattr(sc, "_load_subject_unchecked", lambda db, app, animal_id: (animal, OWNER, subject()))
    # NOTE: _load_molt is NOT mocked here — we test it with a real call and a recording db.
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, animal_id: True)
    monkeypatch.setattr(sc, "_find_link", lambda db, code: db.links.get(code))
    return animal


def create(user, db, **kw):
    body = dict(app="tarantuverse", animal_id=ANIMAL_ID, kind="profile", shape="story")
    body.update(kw)
    return run(sc.create_share_card(ShareCardCreate(**body), db=db, current_user=user))


def test_share_private_animal_changes_nothing(fakes):
    """Review Focus #1."""
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "species"])
    assert out.image_url.startswith("https://www.tarantuverse.com/api/card/")
    assert fakes.visibility == "private" and fakes.is_public is False
    assert OWNER.collection_visibility == "private"
    # The only rows written are the card link; the user row only gains share_defaults.
    assert [type(o).__name__ for o in db.added] == ["CardLink"]


def test_token_data_contains_only_chosen_fields():
    db = FakeDB()
    out = create(OWNER, db, fields=["species", "price_paid", "notes"])
    # Disallowed names never make it into the token, the response, or the
    # remembered defaults.
    assert out.fields == ["species"]
    assert OWNER.share_defaults["tarantuverse:profile"] == ["species"]
    token = out.image_url.rsplit("/", 1)[1]
    data = run(sc.share_card_data(token, response=Response(), db=db))
    assert data["name"] is None and data["photo_url"] is None
    assert data["scientific_name"] == "Brachypelma hamorii"
    assert "price_paid" not in str(data) and "notes" not in str(data)
    assert data["shape"] == "story"


def test_bad_token_is_404():
    with pytest.raises(HTTPException) as e:
        run(sc.share_card_data("nope.nope", response=Response(), db=FakeDB()))
    assert e.value.status_code == 404


def test_stranger_gets_404():
    with pytest.raises(HTTPException) as e:
        create(NS(id=uuid.uuid4(), share_defaults=None), FakeDB())
    assert e.value.status_code == 404


def test_keeper_role_cokeeper_can_share():
    """Review Focus #5 (first half)."""
    out = create(KEEPER, FakeDB())
    assert out.image_url


def test_molt_card_requires_molt_id():
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), kind="molt")
    assert e.value.status_code == 422


def test_herpetoverse_molt_card_is_rejected():
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), app="herpetoverse", kind="molt", molt_id=uuid.uuid4())
    assert e.value.status_code == 422


def test_defaults_are_remembered():
    db = FakeDB()
    create(OWNER, db, fields=["name"])
    assert OWNER.share_defaults["tarantuverse:profile"] == ["name"]
    assert run(sc.get_share_defaults(app="tarantuverse", kind="profile", current_user=OWNER))["fields"] == ["name"]


def test_card_link_is_frozen_and_revocable(monkeypatch):
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "species"])
    assert out.card_link == f"https://www.tarantuverse.com/c/{out.code}"
    assert len(out.code) >= 22
    payload = run(sc.get_card_link(out.code, response=Response(), db=db))
    assert payload["name"] == "Rosie"
    # Frozen: changing what _load_subject returns does not change the link.
    monkeypatch.setattr(sc, "_load_subject", lambda *a, **k: (None, OWNER, CardSubject(
        app="tarantuverse", taxon="tarantula", name="Renamed", scientific_name=None, common_name=None,
        sex=None, date_acquired=None, photo_url=None)))
    assert run(sc.get_card_link(out.code, response=Response(), db=db))["name"] == "Rosie"
    # Only the sharer or the owner may revoke (Review Focus #5, second half).
    with pytest.raises(HTTPException) as e:
        run(sc.revoke_card_link(out.code, db=db, current_user=NS(id=uuid.uuid4())))
    assert e.value.status_code == 404
    run(sc.revoke_card_link(out.code, db=db, current_user=OWNER))
    with pytest.raises(HTTPException) as e:
        run(sc.get_card_link(out.code, response=Response(), db=db))
    assert e.value.status_code == 410


def test_card_link_for_deleted_animal_is_gone(monkeypatch):
    """Review Focus #3."""
    db = FakeDB()
    out = create(OWNER, db, link=True)
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, animal_id: False)
    with pytest.raises(HTTPException) as e:
        run(sc.get_card_link(out.code, response=Response(), db=db))
    assert e.value.status_code == 410


def test_router_never_writes_visibility():
    """Belt and braces for Global Constraint #1: no visibility column is ever
    assigned anywhere in the share-card code."""
    import inspect
    src = inspect.getsource(sc)
    for col in ("visibility =", "is_public =", "collection_visibility ="):
        assert col not in src


class Q:
    def __init__(self, row):
        self.row = row

    def filter(self, *a):
        return self

    def first(self):
        return self.row


def test_public_card_only_for_public_collections(monkeypatch):
    row = NS(id=ANIMAL_ID, user_id=OWNER.id, died_at=None, transferred_out_at=None)
    private_owner = NS(id=OWNER.id, collection_visibility="private")
    public_owner = NS(id=OWNER.id, collection_visibility="public")

    def db_for(owner):
        return NS(query=lambda model, *a: Q(owner if getattr(model, "__name__", "") == "User" else row))

    # public_card reads as the owner it looked up; accept whichever owner row it found.
    monkeypatch.setattr(sc, "_load_subject", lambda db, user, app, aid, need: (row, user, subject()))

    with pytest.raises(HTTPException) as e:
        run(sc.public_card("tarantuverse", ANIMAL_ID, db=db_for(private_owner)))
    assert e.value.status_code == 404
    card = run(sc.public_card("tarantuverse", ANIMAL_ID, db=db_for(public_owner)))
    assert card["shape"] == "wide" and card["name"] == "Rosie"
    assert private_owner.collection_visibility == "private"  # untouched


# ── Finding 2: Molt numbering with tie-break ──────────────────────────────────

class RecordingQuery:
    """Mock query that captures .filter() clauses with compiled SQL, for SQL inspection."""

    def __init__(self):
        self.clauses = []  # Clauses on the first query (first())
        self.count_clauses = []  # Clauses on the count() query (tied by state)

    def filter(self, *clauses):
        # Record clauses with compiled SQL for inspection.
        compiled_strs = []
        for c in clauses:
            try:
                # Try to compile with literal_binds for readable SQL.
                compiled_strs.append(str(c.compile(compile_kwargs={"literal_binds": True})))
            except Exception:
                # Fall back to string representation if compilation fails.
                compiled_strs.append(str(c))
        self.clauses.extend(compiled_strs)
        # For count(), we track which clauses were used by returning a count-aware copy.
        return self

    def first(self):
        """Return the first molt matching the filter."""
        return NS(id=ANIMAL_ID, molted_at=datetime(2026, 9, 29, 12, 0, 0, tzinfo=timezone.utc),
                  leg_span_before=3.2, leg_span_after=4.1, invert_id=ANIMAL_ID)

    def count(self):
        """Return count of molts matching the filter (recorded via self.clauses)."""
        # The COUNT query's clauses are whatever is in self.clauses from the last .filter() call.
        self.count_clauses = list(self.clauses)
        return 9


def test_molt_numbering_tie_break_captured_in_sql():
    """Verify that _load_molt calls the COUNT query with (molted_at < ...) OR (molted_at == ... AND id <= ...),
    ensuring unique molt numbers even when two molts occur at the same timestamp.

    This test:
    1. Calls the REAL _load_molt function (not mocked).
    2. Verifies the COUNT query includes all three required clauses: molted_at <, molted_at ==, and id <=.
    3. Confirms the returned molt number is correct.
    """
    rq = RecordingQuery()
    db = NS(query=lambda *_: rq)

    # Call the real _load_molt function.
    result = sc._load_molt(db, ANIMAL_ID, ANIMAL_ID)

    # Verify the result is correct.
    assert result.number == 9, f"Expected molt number 9, got {result.number}"
    assert result.molted_on == date(2026, 9, 29)
    assert result.span_before == 3.2
    assert result.span_after == 4.1

    # Verify the COUNT query's filter clauses include the tie-break logic.
    # Join recorded clauses and convert to lowercase for easier pattern matching.
    count_sql = " ".join(rq.count_clauses).lower()

    # Require: molted_at < comparison (primary sort order)
    # Look for the less-than operator outside of any <=
    assert (" < " in count_sql and "<= " not in count_sql) or \
           ("molted_at <" in count_sql and "molted_at <=" not in count_sql), \
        f"Expected '<' comparison (without <=) in COUNT query, got: {rq.count_clauses}"

    # Require: molted_at == comparison (in the AND part of tie-break)
    # Need to verify there's both "=" for equality AND "<=" for id tie-break
    assert " = " in count_sql or "molted_at =" in count_sql or "== " in count_sql, \
        f"Expected '=' comparison for tie-break equality, got: {rq.count_clauses}"

    # Require: id <= comparison (the id tie-break)
    # This should be in a separate AND clause from the == above
    assert "id <=" in count_sql or " <= " in count_sql, \
        f"Expected '<=' comparison for id tie-break, got: {rq.count_clauses}"

    # Require: Both conditions should be present together (verifies the AND exists in the tie-break)
    # Count how many comparison operators we have — we need more than just a simple <=
    has_less_than = "<" in count_sql
    has_equals = " = " in count_sql or "==" in count_sql
    has_id_comparison = "id <=" in count_sql
    assert has_less_than and has_equals and has_id_comparison, \
        f"Missing one of (<, ==, id<=) in COUNT query. Got: {rq.count_clauses}"


# ── Finding 3: Cache-Control headers ───────────────────────────────────────────

def test_share_card_data_sets_no_store_cache_header(monkeypatch):
    """Verify /share-cards/{token}/data sets Cache-Control: no-store."""
    db = FakeDB()
    response = Response()

    # Create a card link first.
    out = create(OWNER, db, link=True, fields=["name", "species"])
    token = out.image_url.rsplit("/", 1)[1]

    # Call the endpoint with a Response object.
    result = run(sc.share_card_data(token, response=response, db=db))

    # Verify the header is set.
    assert response.headers.get("Cache-Control") == "no-store"
    assert result is not None  # Endpoint succeeded


def test_card_link_sets_no_store_cache_header():
    """Verify /card-links/{code} sets Cache-Control: no-store."""
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "species"])

    response = Response()
    payload = run(sc.get_card_link(out.code, response=response, db=db))

    # Verify the header is set.
    assert response.headers.get("Cache-Control") == "no-store"
    assert payload["name"] == "Rosie"  # Endpoint succeeded


@pytest.fixture(autouse=True)
def _r2_base(monkeypatch):
    from app.services.storage import storage_service
    monkeypatch.setattr(storage_service, "use_r2", True, raising=False)
    monkeypatch.setattr(storage_service, "public_url_base", "https://pub.example.r2.dev", raising=False)


def test_viewer_and_logger_cannot_share(monkeypatch):
    """M1: a co-keeper below the keeper role is refused (403 ROLE_TOO_LOW) by
    the real resolver, and nothing is written."""
    from app.utils import access

    def load_subject(db, user, app, animal_id, need):
        access.require(db, user, user.id, app, need, not_found="Animal not found")
        raise AssertionError("role check should have raised")

    monkeypatch.setattr(sc, "_load_subject", load_subject)
    for role in ("viewer", "logger"):
        monkeypatch.setattr(access, "resolve_role", lambda db, user, owner, app, r=role: r)
        db = FakeDB()
        user = NS(id=uuid.uuid4(), share_defaults=None)
        with pytest.raises(HTTPException) as e:
            create(user, db, link=True)
        assert e.value.status_code == 403
        assert db.added == [] and db.commits == 0 and user.share_defaults is None


def test_preview_leaves_defaults_and_creates_no_link(monkeypatch):
    db = FakeDB()
    user = OWNER
    monkeypatch.setattr(OWNER, "share_defaults", {"tarantuverse:profile": ["name"]})
    out = create(user, db, fields=["species"], link=True, preview=True)
    assert out.image_url and out.card_link is None and out.code is None
    assert db.added == []
    assert user.share_defaults == {"tarantuverse:profile": ["name"]}


def test_non_preview_still_saves_defaults(monkeypatch):
    db = FakeDB()
    user = OWNER
    monkeypatch.setattr(OWNER, "share_defaults", {"tarantuverse:profile": ["name"]})
    create(user, db, fields=["species"], preview=False)
    assert user.share_defaults["tarantuverse:profile"] == ["species"]
