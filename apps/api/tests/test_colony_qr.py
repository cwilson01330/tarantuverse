"""
QR upload + public page for population colonies (audit B1, ADR-010).

A colony had no label, no phone-photo upload and no public page. These pin the
parts that can't be fixed after the fact (a printed label outlives the deploy):
who may mint an upload token, that the token's photo lands on the COLONY and
is never capped, and that `/col/{id}` is exactly as private as `/i/{id}`.

No Postgres needed: the handlers are called directly against a small fake
session, the same way the structural qr tests read the source. The CHECK
constraint itself is exercised by the migration test only as text — running it
needs `alembic upgrade head` on a real database.
"""
import asyncio
import importlib
import inspect
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.colony import Colony
from app.models.invert_species import InvertSpecies
from app.models.photo import Photo
from app.models.qr_upload_session import QRUploadSession
from app.models.user import User
from app.routers import qr


def run(coro):
    return asyncio.run(coro)


# ── a tiny fake session ──────────────────────────────────────────────────────

class _Query:
    def __init__(self, result, sink):
        self._result = result
        self._sink = sink

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def first(self):
        return self._result if not isinstance(self._result, list) else (self._result[0] if self._result else None)

    def all(self):
        return self._result if isinstance(self._result, list) else ([] if self._result is None else [self._result])

    def update(self, values):
        self._sink.append(values)
        return 1


class FakeDB:
    """`rows` maps a model class to what `.first()` / `.all()` should return."""

    def __init__(self, rows=None):
        self.rows = rows or {}
        self.added = []
        self.updates = []
        self.commits = 0

    def query(self, model):
        return _Query(self.rows.get(model), self.updates)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass

    def rollback(self):
        pass


def make_user(**kw):
    return SimpleNamespace(id=kw.pop("id", uuid.uuid4()), username=kw.pop("username", "keeper"),
                           collection_visibility=kw.pop("collection_visibility", "private"), **kw)


def make_colony(owner, **kw):
    defaults = dict(
        id=uuid.uuid4(), user_id=owner.id, taxon="isopod", name="Dwarf whites", species_id=None,
        species=None, photo_url=None, stage_counts={"adults": 10, "juveniles": 20, "mixed": 0},
        count_is_estimated=True, transferred_out_at=None,
        enclosure_type="terrestrial", enclosure_size="12x12", substrate_type="coco", substrate_depth="3 in",
        last_substrate_change=None, target_temp_min=None, target_temp_max=None,
        target_humidity_min=None, target_humidity_max=None, water_dish=True,
        date_acquired=None, source="bought", notes="private note", sitter_note="sitter only",
        location="Garage rack 2", visibility="public",
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


# ── migration ────────────────────────────────────────────────────────────────

def _load_migration():
    import importlib.util, pathlib
    path = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "cqr_20261006_colony_qr_sessions.py"
    spec = importlib.util.spec_from_file_location("cqr_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_chains_from_the_current_head_and_is_the_only_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    heads = ScriptDirectory.from_config(cfg).get_heads()
    assert heads == ["cqr_20261006_colony_qr_sessions"]
    assert _load_migration().down_revision == "pin_20260930_premium_intro"


def test_migration_widens_the_check_and_downgrade_restores_it():
    m = _load_migration()
    # New: a session is one legacy parent and no colony, OR no legacy parent
    # and exactly one of invert / colony.
    assert "colony_id IS NULL" in m.NEW_PREDICATE
    assert "num_nonnulls(invert_id, colony_id) = 1" in m.NEW_PREDICATE
    # Old is the cip_20260527 predicate, byte for byte.
    cip = _cip_predicate()
    assert m.OLD_PREDICATE == cip
    src = inspect.getsource(m.downgrade)
    assert "DELETE FROM qr_upload_sessions WHERE colony_id IS NOT NULL" in src
    assert "drop_column" in src and "OLD_PREDICATE" in src


def _cip_predicate():
    import importlib.util, pathlib
    path = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "cip_20260527_widen_log_checks_for_inverts.py"
    spec = importlib.util.spec_from_file_location("cip_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod._exactly_one_or_invert_only(["tarantula_id", "animal_id", "scorpion_id"])


def test_model_has_a_cascading_indexed_colony_fk_and_the_widened_check():
    col = QRUploadSession.__table__.c.colony_id
    assert col.nullable and col.index
    fk = list(col.foreign_keys)[0]
    assert fk.target_fullname == "colonies.id" and fk.ondelete == "CASCADE"
    checks = [c for c in QRUploadSession.__table__.constraints if getattr(c, "name", None) == "qr_upload_sessions_must_have_exactly_one_parent"]
    assert checks and "colony_id" in str(checks[0].sqltext)


# ── POST /colonies/{id}/upload-session ───────────────────────────────────────

def test_routes_are_registered_and_tagged():
    from app.main import app

    paths = {r.path for r in app.routes}
    assert "/api/v1/colonies/{colony_id}/upload-session" in paths
    assert "/api/v1/col/{colony_id}" in paths
    assert qr.create_colony_upload_session.__access_policy__ == "owner_only"
    assert qr.get_public_colony_profile.__access_policy__ == "public"


def test_upload_session_uses_the_same_owner_rule_as_the_invert_route():
    src = inspect.getsource(qr.create_colony_upload_session)
    inv = inspect.getsource(qr.create_invert_upload_session)
    assert "Colony.user_id == current_user.id" in src
    assert "Invert.user_id == current_user.id" in inv
    assert qr.create_invert_upload_session.__access_policy__ == qr.create_colony_upload_session.__access_policy__


def test_a_stranger_or_unknown_colony_is_a_404():
    owner = make_user()
    stranger = make_user()
    # The owner filter is in the query, so a stranger's lookup finds nothing.
    db = FakeDB({Colony: None})
    with pytest.raises(HTTPException) as e:
        run(qr.create_colony_upload_session(str(uuid.uuid4()), db=db, current_user=stranger))
    assert e.value.status_code == 404
    assert not db.added


def test_owner_gets_a_colony_session_that_supersedes_the_old_one():
    owner = make_user()
    colony = make_colony(owner)
    db = FakeDB({Colony: colony})
    out = run(qr.create_colony_upload_session(str(colony.id), db=db, current_user=owner))
    assert out["upload_url"].endswith(f"/upload/{out['token']}")
    assert out["taxon"] == "isopod" and out["animal_name"] == "Dwarf whites"
    assert out["expires_in_minutes"] == qr.SESSION_TTL_MINUTES
    assert db.updates == [{"is_active": False}]
    (session,) = db.added
    assert str(session.colony_id) == str(colony.id)
    assert session.invert_id is None and session.tarantula_id is None
    assert session.user_id == owner.id


# ── GET /upload-sessions/{token} ─────────────────────────────────────────────

def _session_for(colony, user, **kw):
    return QRUploadSession(
        token="tok", colony_id=colony.id, user_id=user.id, used_count=kw.pop("used_count", 0),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10), is_active=True, **kw,
    )


def test_session_parent_resolves_a_colony():
    owner = make_user()
    colony = make_colony(owner)
    s = _session_for(colony, owner)
    s.colony = colony
    assert qr._session_parent(s) == ("colony", colony)
    assert qr._session_taxon_str("colony", colony) == "isopod"
    assert qr._display_name_for("colony", colony) == "Dwarf whites"


def test_session_info_returns_colony_context_with_species_names():
    owner = make_user()
    sp = SimpleNamespace(common_names=["Dwarf white isopod"], scientific_name="Trichorhina tomentosa")
    colony = make_colony(owner, species=sp, photo_url="https://x/p.jpg")
    s = _session_for(colony, owner)
    s.colony = colony
    db = FakeDB({QRUploadSession: s})
    out = run(qr.get_upload_session_info("tok", db=db))
    assert out["valid"] is True and out["kind"] == "colony"
    assert out["taxon"] == "isopod"
    assert out["display_name"] == "Dwarf whites"
    assert out["common_name"] == "Dwarf white isopod"
    assert out["scientific_name"] == "Trichorhina tomentosa"
    assert out["photo_url"] == "https://x/p.jpg"


def test_session_info_works_for_a_colony_with_no_species():
    owner = make_user()
    colony = make_colony(owner)
    s = _session_for(colony, owner)
    s.colony = colony
    out = run(qr.get_upload_session_info("tok", db=FakeDB({QRUploadSession: s})))
    assert out["common_name"] is None and out["scientific_name"] is None


# ── POST /upload-sessions/{token}/photo ──────────────────────────────────────

class _File:
    content_type = "image/jpeg"
    filename = "a.jpg"

    async def read(self):
        return b"\xff\xd8\xff-bytes"


def _upload(colony, owner, session=None):
    s = session or _session_for(colony, owner)
    s.colony = colony
    s.user = owner
    db = FakeDB({QRUploadSession: s})
    with patch.object(qr, "validate_image_bytes", return_value="image/jpeg"), \
         patch.object(qr.storage_service, "upload_photo", new=AsyncMock(return_value=("https://r2/p.jpg", "https://r2/t.jpg"))) as up, \
         patch("app.utils.limits.enforce_photo_cap", side_effect=AssertionError("colony photos are uncapped")) as cap:
        out = run(qr.upload_photo_via_token("tok", file=_File(), caption="hello", db=db))
    return out, db, s, up, cap


def test_photo_lands_on_the_colony_only_and_is_never_capped():
    owner = make_user()
    colony = make_colony(owner)
    out, db, s, up, cap = _upload(colony, owner)
    cap.assert_not_called()
    (photo,) = [o for o in db.added if isinstance(o, Photo)]
    assert str(photo.colony_id) == str(colony.id)
    # photos_must_have_exactly_one_parent: no legacy parent, colony only.
    assert photo.invert_id is None and photo.tarantula_id is None
    assert photo.animal_id is None and photo.scorpion_id is None
    assert out["success"] and out["kind"] == "colony" and out["taxon"] == "isopod"
    assert s.used_count == 1


def test_the_photo_goes_through_the_sanitising_storage_path():
    owner = make_user()
    out, db, s, up, cap = _upload(make_colony(owner), owner)
    up.assert_awaited_once()
    assert up.await_args.kwargs["content_type"] == "image/jpeg"
    assert "storage_service.upload_photo" in inspect.getsource(qr.upload_photo_via_token)


def test_first_photo_becomes_the_hero_and_a_later_one_does_not_replace_it():
    owner = make_user()
    colony = make_colony(owner)
    _upload(colony, owner)
    assert colony.photo_url == "https://r2/p.jpg"

    keeper = make_colony(owner, photo_url="https://old/hero.jpg")
    _upload(keeper, owner)
    assert keeper.photo_url == "https://old/hero.jpg"


def test_the_ten_photo_session_cap_still_applies_to_colonies():
    owner = make_user()
    colony = make_colony(owner)
    s = _session_for(colony, owner, used_count=qr.MAX_UPLOADS_PER_SESSION)
    s.colony = colony
    s.user = owner
    with pytest.raises(HTTPException) as e:
        run(qr.upload_photo_via_token("tok", file=_File(), caption=None, db=FakeDB({QRUploadSession: s})))
    assert e.value.status_code == 429


# ── GET /col/{id} mirrors GET /i/{id} ────────────────────────────────────────

def _profile(colony, owner, viewer, species=None):
    db = FakeDB({Colony: colony, User: owner, InvertSpecies: species, Photo: []})
    return run(qr.get_public_colony_profile(str(colony.id), db=db, current_user=viewer))


def test_the_visibility_rule_is_the_invert_rule():
    col, inv = inspect.getsource(qr.get_public_colony_profile), inspect.getsource(qr.get_public_invert_profile)
    for needle in ('is_owner = current_user and str(current_user.id) == str(',
                   'collection_public = owner and owner.collection_visibility == "public"',
                   'if not is_owner and not collection_public:',
                   'raise HTTPException(status_code=403, detail="This collection is private")'):
        assert needle in col and needle in inv


def test_a_private_collection_is_refused_to_strangers_and_anonymous():
    owner = make_user(collection_visibility="private")
    colony = make_colony(owner)
    for viewer in (None, make_user()):
        with pytest.raises(HTTPException) as e:
            _profile(colony, owner, viewer)
        assert e.value.status_code == 403


def test_a_private_colony_in_a_public_collection_is_refused_to_everyone_but_the_owner():
    """The add-colony form asks for a per-colony visibility (default private);
    a public collection must not override that choice."""
    owner = make_user(collection_visibility="public")
    colony = make_colony(owner, visibility="private")
    for viewer in (None, make_user()):
        with pytest.raises(HTTPException) as e:
            _profile(colony, owner, viewer)
        assert e.value.status_code == 403
    assert _profile(colony, owner, owner)["is_owner"] is True


def test_a_private_collection_still_shows_the_owner_their_own_colony():
    owner = make_user(collection_visibility="private")
    out = _profile(make_colony(owner), owner, owner)
    assert out["is_owner"] is True
    assert out["husbandry"]["enclosure_size"] == "12x12"
    assert out["notes"] == "private note"


def test_the_public_card_has_no_owner_only_or_extra_fields():
    owner = make_user(collection_visibility="public")
    colony = make_colony(owner)
    out = _profile(colony, owner, None)
    assert out["is_owner"] is False
    assert out["name"] == "Dwarf whites" and out["taxon"] == "isopod"
    assert out["population"] == {"total": 30, "stage_counts": {"adults": 10, "juveniles": 20, "mixed": 0}, "is_estimated": True}
    for owner_only in ("husbandry", "notes", "source", "date_acquired"):
        assert owner_only not in out
    flat = repr(out)
    for secret in ("sitter only", "Garage rack 2", "private note"):
        assert secret not in flat
    assert "location" not in out and "sitter_note" not in out and "enclosure_id" not in out


def test_every_public_key_is_one_invert_profile_also_exposes_or_is_colony_only():
    """Guard against someone adding a field to /col that /i would never show."""
    owner = make_user(collection_visibility="public")
    out = _profile(make_colony(owner), owner, None)
    invert_src = inspect.getsource(qr.get_public_invert_profile)
    colony_only = {"kind", "population"}
    for key in out:
        assert key in colony_only or f'"{key}"' in invert_src, key


def test_a_transferred_out_colony_is_hidden_from_non_owners_only():
    owner = make_user(collection_visibility="public")
    colony = make_colony(owner, transferred_out_at=datetime.now(timezone.utc))
    with pytest.raises(HTTPException) as e:
        _profile(colony, owner, None)
    assert e.value.status_code == 404
    assert _profile(colony, owner, owner)["is_owner"] is True


def test_unknown_and_malformed_ids():
    owner = make_user(collection_visibility="public")
    with pytest.raises(HTTPException) as e:
        run(qr.get_public_colony_profile("not-a-uuid", db=FakeDB(), current_user=None))
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        run(qr.get_public_colony_profile(str(uuid.uuid4()), db=FakeDB({Colony: None}), current_user=None))
    assert e.value.status_code == 404


def test_it_reads_colony_photos_by_colony_id():
    src = inspect.getsource(qr.get_public_colony_profile)
    assert "Photo.colony_id" in src and "Photo.invert_id" not in src
