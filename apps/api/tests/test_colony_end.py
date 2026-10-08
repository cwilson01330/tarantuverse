"""End a colony (with a reason) -- the colony counterpart of mark-died.

A colony is a population, so it doesn't "die"; it ends. These pin the rules
that can't be fixed after the fact: ending is its own endpoint (never an
incidental PUT), reopening is a correction that must not be blocked by the
free-tier cap, an ended colony stops counting toward that cap and leaves the
working list, a stranger scanning its printed QR label gets a 404, and the
unarchive path can no longer walk a free keeper past the cap.

No Postgres: handlers are called directly against a tiny fake session, the
same style as test_colony_qr.py / test_colony_list_change.py.
"""
import asyncio
import importlib.util
import inspect
import pathlib
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.models.colony import COLONY_END_REASONS, Colony
from app.models.user import User
from app.routers import colonies as cr
from app.routers import qr
from app.schemas.colony import ColonyEndRequest, ColonyListItem, ColonyResponse, ColonyUpdate
from app.services.export_service import COLONY_FIELDS
from app.utils import limits


def run(coro):
    return asyncio.run(coro)


# ── fakes ────────────────────────────────────────────────────────────────────

class Q:
    """Records every filter clause (as SQL text) and answers .first()/.all()."""

    def __init__(self, first=None, rows=None):
        self._first, self._rows = first, rows or []
        self.clauses = []

    def filter(self, *clauses, **k):
        self.clauses.extend(str(c.compile(dialect=postgresql.dialect())) for c in clauses)
        return self

    order_by = group_by = filter

    def first(self):
        return self._first

    def all(self):
        return list(self._rows)


class DB:
    def __init__(self, colony=None, rows=None):
        self.q = Q(first=colony, rows=rows)
        self.commits = 0

    def query(self, *_):
        return self.q

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def owner_user(**kw):
    return NS(id=uuid.uuid4(), is_active=True, **kw)


def make_colony(owner, **kw):
    fields = dict(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name="Dwarf whites",
        stage_counts={"adults": 10}, count_is_estimated=False, visibility="private",
        is_active=True, created_at=datetime.now(timezone.utc),
    )
    fields.update(kw)
    return Colony(**fields)


# ── schema ───────────────────────────────────────────────────────────────────

def test_reasons_are_the_four_the_spec_lists():
    assert COLONY_END_REASONS == ("crashed", "sold", "merged", "other")


def test_request_needs_a_known_reason_and_defaults_the_rest():
    r = ColonyEndRequest(reason="crashed")
    assert r.ended_at is None and r.notes is None
    for bad in ("", "died", "CRASHED", None):
        with pytest.raises(ValidationError):
            ColonyEndRequest(reason=bad)
    with pytest.raises(ValidationError):
        ColonyEndRequest()  # reason is required


def test_request_rejects_a_future_date_but_allows_today_and_the_past():
    ColonyEndRequest(reason="sold", ended_at=date.today())
    ColonyEndRequest(reason="sold", ended_at=date(2020, 1, 1))
    with pytest.raises(ValidationError):
        ColonyEndRequest(reason="sold", ended_at=date.today() + timedelta(days=3))


def test_notes_are_capped_at_2000_and_blank_means_none():
    assert ColonyEndRequest(reason="other", notes="x" * 2000).notes == "x" * 2000
    with pytest.raises(ValidationError):
        ColonyEndRequest(reason="other", notes="x" * 2001)
    assert ColonyEndRequest(reason="other", notes="   ").notes is None
    assert ColonyEndRequest(reason="other", notes="  hi ").notes == "hi"


def test_the_generic_update_cannot_set_the_end_fields():
    assert not {"ended_at", "end_reason", "end_notes"} & set(ColonyUpdate.model_fields)


def test_responses_carry_the_end_fields_as_optional():
    for field in ("ended_at", "end_reason", "end_notes"):
        assert ColonyResponse.model_fields[field].is_required() is False
    for field in ("ended_at", "end_reason"):
        assert ColonyListItem.model_fields[field].is_required() is False


# ── migration + model ────────────────────────────────────────────────────────

def _migration():
    path = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "cen_20261007_colony_end.py"
    spec = importlib.util.spec_from_file_location("cen_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_chains_from_the_colony_qr_head_and_is_the_only_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    root = pathlib.Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    m = _migration()
    assert m.revision == "cen_20261007_colony_end"
    assert m.down_revision == "cqr_20261006_colony_qr_sessions"
    heads = script.get_heads()
    assert len(heads) == 1
    # Our revision is the head, or an ancestor of it once later work lands.
    assert m.revision in {r.revision for r in script.walk_revisions()}


def test_migration_adds_three_nullable_columns_an_index_and_the_check():
    m = _migration()
    up, down = inspect.getsource(m.upgrade), inspect.getsource(m.downgrade)
    for col in ("ended_at", "end_reason", "end_notes"):
        assert f"'{col}'" in up and f"'{col}'" in down
    assert "nullable=True" in up and "nullable=False" not in up
    assert "create_index" in up and "drop_index" in down
    assert "create_check_constraint" in up and "drop_constraint" in down
    for reason in COLONY_END_REASONS:
        assert f"'{reason}'" in m.PREDICATE


def test_model_mirrors_the_migration():
    t = Colony.__table__
    assert t.c.ended_at.nullable and t.c.ended_at.index
    assert t.c.end_reason.nullable and t.c.end_reason.type.length == 20
    assert t.c.end_notes.nullable
    check = [c for c in t.constraints if getattr(c, "name", None) == "colonies_end_reason_check"]
    assert check and str(check[0].sqltext) == _migration().PREDICATE


# ── POST /colonies/{id}/end ──────────────────────────────────────────────────

def test_routes_are_registered_at_keeper_level():
    from app.main import app

    paths = {(r.path, tuple(sorted(r.methods))) for r in app.routes if hasattr(r, "methods")}
    assert ("/api/v1/colonies/{colony_id}/end", ("POST",)) in paths
    assert ("/api/v1/colonies/{colony_id}/reopen", ("POST",)) in paths
    assert cr.end_colony.__access_policy__ == "keeper"
    assert cr.reopen_colony.__access_policy__ == "keeper"
    # Same access helper every other colony write uses.
    assert "load_colony(db, current_user, colony_id, \"keeper\")" in inspect.getsource(cr.end_colony)


def test_end_records_the_date_reason_and_notes_and_keeps_the_colony():
    me = owner_user()
    colony = make_colony(me)
    db = DB(colony)
    out = run(cr.end_colony(colony.id, ColonyEndRequest(
        reason="merged", ended_at=date(2026, 9, 1), notes="Folded into the big tub."),
        current_user=me, db=db))
    assert (colony.ended_at, colony.end_reason, colony.end_notes) == (
        date(2026, 9, 1), "merged", "Folded into the big tub.")
    assert out.ended_at == date(2026, 9, 1) and out.end_reason == "merged"
    assert out.stage_counts == {"adults": 10}  # nothing deleted or zeroed
    assert colony.is_active is True            # archive state is separate
    assert db.commits == 1


def test_end_defaults_the_date_to_today():
    me = owner_user()
    colony = make_colony(me)
    run(cr.end_colony(colony.id, ColonyEndRequest(reason="crashed"), current_user=me, db=DB(colony)))
    assert colony.ended_at == date.today()
    assert colony.end_notes is None


def test_ending_twice_is_a_409_and_changes_nothing():
    me = owner_user()
    colony = make_colony(me, ended_at=date(2026, 8, 1), end_reason="sold", end_notes="n")
    db = DB(colony)
    with pytest.raises(HTTPException) as e:
        run(cr.end_colony(colony.id, ColonyEndRequest(reason="crashed"), current_user=me, db=db))
    assert e.value.status_code == 409
    assert (colony.ended_at, colony.end_reason, colony.end_notes) == (date(2026, 8, 1), "sold", "n")
    assert db.commits == 0


def test_a_stranger_or_missing_colony_is_a_404_and_nothing_is_written():
    stranger = owner_user()
    # The colony belongs to someone else; the stranger has no membership row.
    colony = make_colony(owner_user())
    db = DB(colony)
    # require() looks the owner up (User) and then the membership; both miss.
    db.q._first = None
    with pytest.raises(HTTPException) as e:
        run(cr.end_colony(uuid.uuid4(), ColonyEndRequest(reason="other"), current_user=stranger, db=db))
    assert e.value.status_code == 404
    assert colony.ended_at is None and db.commits == 0


# ── POST /colonies/{id}/reopen ───────────────────────────────────────────────

def test_reopen_clears_all_three_fields():
    me = owner_user()
    colony = make_colony(me, ended_at=date(2026, 9, 1), end_reason="crashed", end_notes="mites")
    db = DB(colony)
    out = run(cr.reopen_colony(colony.id, current_user=me, db=db))
    assert (colony.ended_at, colony.end_reason, colony.end_notes) == (None, None, None)
    assert out.ended_at is None and out.end_reason is None and out.end_notes is None
    assert db.commits == 1


def test_reopening_a_running_colony_is_a_409():
    me = owner_user()
    colony = make_colony(me)
    db = DB(colony)
    with pytest.raises(HTTPException) as e:
        run(cr.reopen_colony(colony.id, current_user=me, db=db))
    assert e.value.status_code == 409 and db.commits == 0


def test_reopen_never_checks_the_free_cap():
    """It's a correction -- like reviving an animal, it can't be refused because
    of a billing limit."""
    me = owner_user()
    colony = make_colony(me, ended_at=date(2026, 9, 1), end_reason="sold")
    with patch.object(cr, "enforce_collection_limit", side_effect=AssertionError("must not be called")), \
         patch.object(limits, "enforce_collection_limit", side_effect=AssertionError("must not be called")):
        run(cr.reopen_colony(colony.id, current_user=me, db=DB(colony)))
    assert "enforce_collection_limit" not in inspect.getsource(cr.reopen_colony)
    assert colony.ended_at is None


# ── exclusions ───────────────────────────────────────────────────────────────

def _sql(query) -> str:
    return str(query.statement.compile(dialect=postgresql.dialect()))


def test_the_cap_query_excludes_ended_colonies():
    sql = _sql(limits.active_colonies_query(Session(), uuid.uuid4()))
    assert "colonies.ended_at IS NULL" in sql
    # ...and kept its existing exclusions.
    assert "colonies.transferred_out_at IS NULL" in sql
    assert "colonies.is_active IS true" in sql


def _list(status_filter=None, include_inactive=False):
    me = owner_user()
    db = DB(rows=[])
    out = run(cr.list_colonies(
        include_inactive=include_inactive, status_filter=status_filter,
        collection=None, current_user=me, db=db))
    assert out == []
    return " AND ".join(db.q.clauses)


def test_the_default_list_hides_ended_colonies_archived_or_not():
    plain = _list()
    assert "colonies.ended_at IS NULL" in plain and "colonies.is_active IS true" in plain
    with_archived = _list(include_inactive=True)
    assert "colonies.ended_at IS NULL" in with_archived
    assert "is_active" not in with_archived
    assert "colonies.ended_at IS NULL" in _list("active")


def test_status_ended_lists_only_ended_colonies():
    sql = _list("ended")
    assert "colonies.ended_at IS NOT NULL" in sql and "ended_at IS NULL" not in sql


def test_status_past_is_archived_or_ended():
    sql = _list("past")
    assert "colonies.is_active IS false" in sql
    assert "colonies.ended_at IS NOT NULL" in sql and " OR " in sql


def test_status_filter_rejects_unknown_values():
    status = cr.list_colonies.__wrapped__ if hasattr(cr.list_colonies, "__wrapped__") else cr.list_colonies
    default = inspect.signature(status).parameters["status_filter"].default
    assert default.alias == "status"
    assert any("active|ended|past" in str(getattr(m, "pattern", "")) for m in default.metadata)


def test_the_admin_user_list_count_excludes_ended_colonies():
    from app.routers import admin

    assert "Colony.ended_at.is_(None)" in inspect.getsource(admin)


# ── public /col/{id} ─────────────────────────────────────────────────────────

class _PublicQ:
    def __init__(self, result):
        self.result = result

    def filter(self, *a, **k):
        return self

    order_by = limit = filter

    def first(self):
        return self.result if not isinstance(self.result, list) else (self.result[0] if self.result else None)

    def all(self):
        return self.result if isinstance(self.result, list) else []


class _PublicDB:
    def __init__(self, rows):
        self.rows = rows

    def query(self, model):
        return _PublicQ(self.rows.get(model))


def _public(colony, owner, viewer):
    from app.models.invert_species import InvertSpecies
    from app.models.photo import Photo

    db = _PublicDB({Colony: colony, User: owner, InvertSpecies: None, Photo: []})
    return run(qr.get_public_colony_profile(str(colony.id), db=db, current_user=viewer))


def _public_colony(owner, **kw):
    d = dict(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name="Dwarf whites", species_id=None,
        species=None, photo_url=None, stage_counts={"adults": 10}, count_is_estimated=False,
        transferred_out_at=None, ended_at=None, enclosure_type=None, enclosure_size=None,
        substrate_type=None, substrate_depth=None, last_substrate_change=None, target_temp_min=None,
        target_temp_max=None, target_humidity_min=None, target_humidity_max=None, water_dish=None,
        date_acquired=None, source=None, notes=None, sitter_note=None, location=None, visibility="public",
    )
    d.update(kw)
    return NS(**d)


def test_an_ended_colony_is_a_404_to_strangers_and_anonymous_but_not_the_owner():
    owner = NS(id=uuid.uuid4(), username="k", collection_visibility="public")
    colony = _public_colony(owner, ended_at=date(2026, 9, 1))
    for viewer in (None, NS(id=uuid.uuid4(), username="other")):
        with pytest.raises(HTTPException) as e:
            _public(colony, owner, viewer)
        assert e.value.status_code == 404
    assert _public(colony, owner, owner)["is_owner"] is True


def test_a_running_public_colony_is_still_visible():
    owner = NS(id=uuid.uuid4(), username="k", collection_visibility="public")
    assert _public(_public_colony(owner), owner, None)["is_owner"] is False


def test_the_ended_rule_sits_beside_the_transferred_rule():
    src = inspect.getsource(qr.get_public_colony_profile)
    assert "not is_owner and colony.ended_at is not None" in src
    assert "not is_owner and colony.transferred_out_at is not None" in src


# ── unarchive can't walk past the cap ────────────────────────────────────────

def _put(colony, me, **payload):
    return run(cr.update_colony(colony.id, ColonyUpdate(**payload), current_user=me, db=DB(colony)))


def test_unarchiving_enforces_the_cap_for_the_owner():
    me = owner_user()
    colony = make_colony(me, is_active=False)
    with patch.object(cr, "enforce_collection_limit") as cap:
        out = _put(colony, me, is_active=True)
    cap.assert_called_once()
    assert cap.call_args.args[1] is me  # the OWNER's cap
    assert out.is_active is True and colony.is_active is True


def test_a_refused_unarchive_leaves_the_colony_archived_and_uncommitted():
    me = owner_user()
    colony = make_colony(me, is_active=False)
    db = DB(colony)
    boom = HTTPException(status_code=402, detail={"message": "limit"})
    with patch.object(cr, "enforce_collection_limit", side_effect=boom):
        with pytest.raises(HTTPException) as e:
            run(cr.update_colony(colony.id, ColonyUpdate(is_active=True), current_user=me, db=db))
    assert e.value.status_code == 402
    assert colony.is_active is False and db.commits == 0


def test_archiving_is_never_blocked():
    me = owner_user()
    colony = make_colony(me, is_active=True)
    with patch.object(cr, "enforce_collection_limit", side_effect=AssertionError("archiving must not hit the cap")):
        out = _put(colony, me, is_active=False)
    assert out.is_active is False


@pytest.mark.parametrize("extra", [
    dict(is_active=True),                                   # already active: no change in the count
    dict(is_active=False, ended_at=date(2026, 9, 1), end_reason="sold"),  # ended: never counted
    dict(is_active=False, transferred_out_at=datetime.now(timezone.utc)),  # handed off: never counted
])
def test_no_cap_check_when_the_count_does_not_change(extra):
    me = owner_user()
    colony = make_colony(me, **extra)
    with patch.object(cr, "enforce_collection_limit", side_effect=AssertionError("count unchanged")):
        _put(colony, me, is_active=True)


def test_an_unrelated_edit_on_an_archived_colony_is_not_cap_checked():
    me = owner_user()
    colony = make_colony(me, is_active=False)
    with patch.object(cr, "enforce_collection_limit", side_effect=AssertionError("no is_active in payload")):
        out = _put(colony, me, name="Renamed")
    assert out.name == "Renamed" and colony.is_active is False


# ── export ───────────────────────────────────────────────────────────────────

def test_export_includes_the_end_fields():
    for field in ("ended_at", "end_reason", "end_notes"):
        assert field in COLONY_FIELDS
    assert len(COLONY_FIELDS) == len(set(COLONY_FIELDS))
    columns = set(Colony.__table__.c.keys())
    assert set(COLONY_FIELDS) <= columns
