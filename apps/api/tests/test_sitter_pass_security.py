"""Sitter-pass security controls (PRD-shared-keeping threat table).

One test class per control. No database: passes are plain objects and the
DB session is a tiny fake, because every control here is decided in code
that doesn't need Postgres to be exercised.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from app.config import settings
from app.routers import sitter_passes as sp
from app.utils import sitter_pass as auth
from app.utils.auth import create_access_token, decode_access_token

APP = Path(__file__).resolve().parents[1] / "app"
NOW = datetime.now(timezone.utc)


def make_pass(**kw):
    raw, h, prefix = auth.new_pass_token()
    base = dict(
        id=uuid.uuid4(), token_hash=h, token_prefix=prefix, revoked_at=None, locked_at=None,
        starts_at=NOW - timedelta(hours=1), expires_at=NOW + timedelta(days=3),
        open_count=0, last_used_at=None,
    )
    base.update(kw)
    return raw, NS(**base)


class FakeQuery:
    def __init__(self, result=None, count=0):
        self.result, self._count = result, count

    def filter(self, *a, **k):
        return self

    options = order_by = limit = with_for_update = populate_existing = filter

    def first(self):
        return self.result

    def one(self):
        return self.result

    def count(self):
        return self._count

    def all(self):
        return [] if self.result is None else [self.result]

    def __iter__(self):
        return iter(self.all())


class FakeDB:
    def __init__(self, result=None, count=0):
        self.q = FakeQuery(result, count)
        self.commits = 0

    def query(self, *_):
        return self.q

    def commit(self):
        self.commits += 1


def creds(token: str):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


# ── T2: tokens are never stored raw ──────────────────────────────────────────

class TestTokens:
    def test_only_the_hash_is_persisted(self):
        raw, h, prefix = auth.new_pass_token()
        assert h == auth.hash_pass_token(raw) and h != raw and len(h) == 64
        assert raw.startswith(prefix) and len(prefix) == 6

    def test_256_bits_and_unique(self):
        tokens = {auth.new_pass_token()[0] for _ in range(200)}
        assert len(tokens) == 200
        assert all(len(t) >= 43 for t in tokens)  # token_urlsafe(32) → 43 chars

    def test_the_model_has_no_raw_token_column(self):
        from app.models.sitter_pass import KeeperPass
        assert "token" not in KeeperPass.__table__.c
        assert {"token_hash", "token_prefix"} <= set(KeeperPass.__table__.c.keys())


# ── T6: a pass is never a user, and vice versa ───────────────────────────────

class TestSeparatePrincipal:
    def test_pass_session_is_rejected_as_a_user_token(self):
        _, p = make_pass()
        session, _ = auth.create_pass_session(p)
        assert decode_access_token(session) is None

    def test_user_token_is_rejected_as_a_pass_session(self):
        token = create_access_token({"sub": str(uuid.uuid4())})
        assert auth.decode_pass_session(token) is None

    def test_forged_claims_with_the_user_key_fail(self):
        _, p = make_pass()
        forged = jwt.encode({"typ": "sitter_pass", "aud": "sitter-pass", "pid": str(p.id),
                             "th": p.token_hash[:16], "exp": NOW + timedelta(hours=1)},
                            settings.API_SECRET_KEY, algorithm="HS256")
        assert auth.decode_pass_session(forged) is None

    def test_wrong_type_or_audience_fails(self):
        key = auth._session_key()
        for claims in ({"typ": "user", "aud": "sitter-pass"}, {"typ": "sitter_pass", "aud": "web"}):
            t = jwt.encode({**claims, "pid": str(uuid.uuid4()), "exp": NOW + timedelta(hours=1)},
                           key, algorithm="HS256")
            assert auth.decode_pass_session(t) is None


# ── T9: every request re-checks the pass ─────────────────────────────────────

class TestSessionRechecks:
    def check(self, p, token=None):
        token = token or auth.create_pass_session(p)[0]
        return auth.get_current_pass(credentials=creds(token), db=FakeDB(p))

    def test_live_pass_is_accepted(self):
        _, p = make_pass()
        assert self.check(p) is p

    @pytest.mark.parametrize("change", [
        {"revoked_at": NOW},
        {"expires_at": NOW - timedelta(seconds=1)},
        {"starts_at": NOW + timedelta(days=1)},
    ], ids=["revoked", "expired", "not-started"])
    def test_existing_session_dies_with_the_pass(self, change):
        _, p = make_pass()
        token = auth.create_pass_session(p)[0]
        for k, v in change.items():
            setattr(p, k, v)
        with pytest.raises(HTTPException) as e:
            self.check(p, token)
        assert e.value.status_code == 401 and e.value.detail == auth.UNAVAILABLE

    def test_a_pin_lockout_does_not_end_reading(self):
        """Review M1: whoever tripped the lockout already has the list, so
        blocking reads only strands the real sitter. Logging pauses instead."""
        _, p = make_pass()
        token = auth.create_pass_session(p)[0]
        p.locked_at = NOW
        assert self.check(p, token) is p

    def test_rotation_kills_sessions_from_the_old_link(self):
        _, p = make_pass()
        old_session = auth.create_pass_session(p)[0]
        p.token_hash = auth.new_pass_token()[1]       # what rotate does
        with pytest.raises(HTTPException):
            self.check(p, old_session)
        assert self.check(p) is p                       # a fresh session works

    def test_missing_credentials(self):
        with pytest.raises(HTTPException) as e:
            auth.get_current_pass(credentials=None, db=FakeDB(None))
        assert e.value.status_code == 401

    def test_session_never_outlives_the_pass(self):
        _, p = make_pass(expires_at=NOW + timedelta(minutes=30))
        _, exp = auth.create_pass_session(p)
        assert exp <= p.expires_at

    def test_session_is_short(self):
        _, p = make_pass(expires_at=datetime.now(timezone.utc) + timedelta(days=3))
        before = datetime.now(timezone.utc)
        _, exp = auth.create_pass_session(p)
        # Measured from creation, not module import — the full suite takes
        # longer than any fixed allowance.
        assert exp - before <= auth.PASS_SESSION_TTL + timedelta(seconds=1)


# ── T1/T5: exchange — one message for every failure ──────────────────────────

class TestExchange:
    def call(self, db, token):
        fn = inspect.unwrap(sp.exchange)
        return asyncio.run(fn(request=None, body=sp.ExchangeRequest(token=token), db=db))

    @pytest.mark.parametrize("state", ["missing", "revoked", "expired"])
    def test_every_dead_link_looks_the_same(self, state):
        raw, p = make_pass()
        if state == "revoked":
            p.revoked_at = NOW
        elif state == "expired":
            p.expires_at = NOW - timedelta(minutes=1)
        with pytest.raises(HTTPException) as e:
            self.call(FakeDB(None if state == "missing" else p), raw)
        assert (e.value.status_code, e.value.detail) == (404, auth.UNAVAILABLE)

    def test_scheduled_pass_reveals_only_its_start(self):
        raw, p = make_pass(starts_at=NOW + timedelta(days=2))
        with pytest.raises(HTTPException) as e:
            self.call(FakeDB(p), raw)
        assert e.value.status_code == 409
        assert set(e.value.detail) == {"status", "starts_at"}

    def test_a_pin_locked_link_still_opens(self):
        raw, p = make_pass(locked_at=NOW)
        out = self.call(FakeDB(p), raw)
        assert auth.decode_pass_session(out["session"]) == p.id

    def test_live_pass_returns_a_session_and_counts_the_open(self):
        raw, p = make_pass()
        db = FakeDB(p)
        out = self.call(db, raw)
        assert auth.decode_pass_session(out["session"]) == p.id
        assert p.open_count == 1 and db.commits == 1

    def test_the_token_travels_in_the_body_not_the_url(self):
        route = next(r for r in sp.sitter_router.routes if r.path == "/exchange")
        assert route.methods == {"POST"}
        assert not route.dependant.query_params and not route.dependant.path_params


# ── T6: the sitter surface is an allowlist ───────────────────────────────────

def _deps(dependant):
    for d in dependant.dependencies:
        yield d.call
        yield from _deps(d)


class TestAllowlist:
    def test_sitter_router_is_exactly_the_allowlist(self):
        # Adding a route here is a security decision: the PRD's T6 control is
        # that a pass can do only what this set allows, nothing else.
        routes = {(tuple(sorted(r.methods)), r.path) for r in sp.sitter_router.routes}
        assert routes == {
            (("POST",), "/exchange"),
            (("GET",), "/pass"),
            (("POST",), "/unlock"),
            (("POST",), "/feedings"),
            (("DELETE",), "/feedings/{feeding_id}"),
        }

    def test_no_sitter_route_accepts_a_user_login(self):
        from app.utils.dependencies import get_current_user, get_current_user_optional
        for r in sp.sitter_router.routes:
            calls = set(_deps(r.dependant))
            assert get_current_user not in calls and get_current_user_optional not in calls

    def test_every_route_but_exchange_requires_a_pass(self):
        for r in sp.sitter_router.routes:
            if r.path == "/exchange":
                continue
            calls = set(_deps(r.dependant))
            assert calls & {auth.get_current_pass, auth.get_current_pass_with_claims}, r.path

    def test_every_write_requires_an_unlocked_session(self):
        for r in sp.sitter_router.routes:
            if r.path.startswith("/feedings"):
                assert auth.get_logging_pass in set(_deps(r.dependant)), r.path

    def test_every_keeper_route_requires_a_user(self):
        from app.utils.dependencies import get_current_user
        for r in sp.keeper_router.routes:
            assert get_current_user in set(_deps(r.dependant)), r.path

    def test_maintenance_mode_never_blocks_the_exchange(self):
        src = (APP / "main.py").read_text(encoding="utf-8")
        assert '"/api/v1/sitter/exchange",' in src


# ── T1: windows and limits ───────────────────────────────────────────────────

class TestWindow:
    def test_thirty_days_is_the_max(self):
        sp._validate_window(NOW, NOW + timedelta(days=30), NOW)
        with pytest.raises(HTTPException) as e:
            sp._validate_window(NOW, NOW + timedelta(days=30, minutes=1), NOW)
        assert e.value.status_code == 422

    def test_end_must_be_in_the_future_and_after_start(self):
        with pytest.raises(HTTPException):
            sp._validate_window(NOW - timedelta(days=2), NOW - timedelta(days=1), NOW)
        with pytest.raises(HTTPException):
            sp._validate_window(NOW + timedelta(days=2), NOW + timedelta(days=1), NOW)

    def test_db_enforces_the_same_limits(self):
        from app.models.sitter_pass import KeeperPass
        checks = {c.name: str(c.sqltext) for c in KeeperPass.__table__.constraints if c.name}
        assert "interval '30 days'" in checks["keeper_passes_window_max"]
        assert checks["keeper_passes_logging_requires_pin"] == "NOT can_log OR pin_hash IS NOT NULL"
        assert KeeperPass.__table__.c.expires_at.nullable is False


class TestFreeLimit:
    def user(self, premium):
        return NS(id=uuid.uuid4(), is_premium_for_app=lambda app: premium)

    def test_third_open_pass_needs_premium(self):
        with pytest.raises(HTTPException) as e:
            sp._enforce_free_limit(FakeDB(count=2), self.user(False), "tarantuverse", NOW)
        assert e.value.status_code == 402
        assert e.value.detail["source"] == "shared_keeping" and e.value.detail["limit"] == 2

    def test_second_is_fine(self):
        assert sp._enforce_free_limit(FakeDB(count=1), self.user(False), "tarantuverse", NOW) is False

    def test_premium_is_unlimited(self):
        assert sp._enforce_free_limit(FakeDB(count=99), self.user(True), "herpetoverse", NOW) is True


class TestAnimalKinds:
    def test_a_tv_pass_cannot_carry_an_hv_animal(self):
        ref = NS(kind="animal", id=uuid.uuid4())
        with pytest.raises(HTTPException) as e:
            sp._resolve_animals(FakeDB(), NS(id=uuid.uuid4()), "tarantuverse", [ref])
        assert e.value.status_code == 422

    def test_an_hv_pass_cannot_carry_an_invert(self):
        ref = NS(kind="invert", id=uuid.uuid4())
        with pytest.raises(HTTPException) as e:
            sp._resolve_animals(FakeDB(), NS(id=uuid.uuid4()), "herpetoverse", [ref])
        assert e.value.status_code == 422

    def test_someone_elses_animal_is_a_404(self, monkeypatch):
        monkeypatch.setattr(sp, "active_inverts_query", lambda db, uid: FakeQuery())
        ref = NS(kind="invert", id=uuid.uuid4())
        with pytest.raises(HTTPException) as e:
            sp._resolve_animals(FakeDB(), NS(id=uuid.uuid4()), "tarantuverse", [ref])
        assert e.value.status_code == 404


# ── the payload's top level is an allowlist too ──────────────────────────────

def test_payload_top_level_keys():
    """Cards are allowlisted in services/sitter_card.py; this pins the wrapper."""
    import ast
    tree = ast.parse(inspect.getsource(sp.build_pass_payload))
    ret = [n for n in ast.walk(tree) if isinstance(n, ast.Return)][-1]
    keys = {k.value for k in ret.value.keys}
    assert keys == {"app", "keeper_name", "label", "starts_at", "expires_at", "can_log",
                    "logging_unlocked", "logging_locked", "routine", "cards"}


# ── fixes from the independent security review (2026-09-28) ─────────────────

class TestReviewFixes:
    def test_deactivated_owner_kills_existing_sessions(self):
        _, p = make_pass(owner=NS(is_active=True))
        token = auth.create_pass_session(p)[0]
        p.owner.is_active = False
        with pytest.raises(HTTPException) as e:
            auth.get_current_pass(credentials=creds(token), db=FakeDB(p))
        assert e.value.detail == auth.UNAVAILABLE

    def test_deactivated_owner_cannot_be_exchanged(self):
        raw, p = make_pass(owner=NS(is_active=False))
        with pytest.raises(HTTPException) as e:
            asyncio.run(inspect.unwrap(sp.exchange)(
                request=None, body=sp.ExchangeRequest(token=raw), db=FakeDB(p)))
        assert (e.value.status_code, e.value.detail) == (404, auth.UNAVAILABLE)

    def test_keeper_name_never_falls_back_to_the_username(self):
        """A forwarded link must not reveal the keeper's platform identity."""
        assert sp._keeper_name(NS(display_name=None, username="real_handle")) == "Your keeper"
        assert sp._keeper_name(NS(display_name="  ", username="real_handle")) == "Your keeper"
        assert sp._keeper_name(NS(display_name="Cory", username="real_handle")) == "Cory"

    def test_revoke_and_rotate_work_during_maintenance(self):
        src = (APP / "main.py").read_text(encoding="utf-8")
        pattern = src.split('re.fullmatch(r"', 1)[1].split('"', 1)[0]
        import re
        pid = str(uuid.uuid4())
        assert re.fullmatch(pattern, f"/api/v1/sitter-passes/{pid}/revoke")
        assert re.fullmatch(pattern, f"/api/v1/sitter-passes/{pid}/rotate")
        # …but only those two: creating links still waits for maintenance.
        assert not re.fullmatch(pattern, "/api/v1/sitter-passes/")
        assert not re.fullmatch(pattern, f"/api/v1/sitter-passes/{pid}")

    def test_open_passes_are_never_capped(self):
        """A live link the keeper can't see is a live link they can't revoke."""
        import ast
        tree = ast.parse(inspect.getsource(sp.list_passes))
        assigns = {n.targets[0].id: ast.unparse(n.value) for n in ast.walk(tree)
                   if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)}
        assert ".limit(" not in assigns["open_passes"]
