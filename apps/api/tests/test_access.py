"""utils/access — the co-keeper resolver (PRD-shared-keeping rung 3, T7/T9/T12).

No database: the resolver's decisions are pure functions of the owner, the
caller and one membership row, so a small model-aware fake session is enough.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.collection_member import CollectionMember
from app.models.invert import Invert
from app.models.user import User
from app.utils import access as ac


class Q:
    def __init__(self, first=None):
        self._first = first

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._first


class DB:
    def __init__(self, by_model=None):
        self.by_model = by_model or {}
        self.queried = []

    def query(self, model, *_):
        self.queried.append(model)
        return self.by_model.get(model, Q())


def user(premium=True, active=True):
    return NS(id=uuid.uuid4(), is_active=active, is_premium_for_app=lambda app: premium)


def member(role="logger", app="tarantuverse"):
    return NS(role=role, app=app, status="active")


class TestResolveRole:
    def test_owner_is_owner_without_a_lookup(self):
        u = user()
        db = DB()
        assert ac.resolve_role(db, u, u, "tarantuverse") == "owner"
        assert db.queried == []

    def test_active_member_gets_their_role(self):
        for role in ("viewer", "logger", "keeper"):
            db = DB({CollectionMember: Q(member(role))})
            assert ac.resolve_role(db, user(), user(), "tarantuverse") == role

    def test_no_membership_is_no_access(self):
        assert ac.resolve_role(DB(), user(), user(), "tarantuverse") is None

    def test_deactivated_owner_shares_nothing(self):
        db = DB({CollectionMember: Q(member("keeper"))})
        assert ac.resolve_role(db, user(), user(active=False), "tarantuverse") is None

    def test_lapsed_owner_caps_everyone_at_viewer(self):
        """T12: read-only, never locked out."""
        for role in ("logger", "keeper", "viewer"):
            db = DB({CollectionMember: Q(member(role))})
            assert ac.resolve_role(db, user(), user(premium=False), "tarantuverse") == "viewer"

    def test_unknown_role_in_the_row_grants_nothing(self):
        db = DB({CollectionMember: Q(member("admin"))})
        assert ac.resolve_role(db, user(), user(), "tarantuverse") is None

    def test_unknown_app_is_a_programming_error(self):
        with pytest.raises(ValueError):
            ac.resolve_role(DB(), user(), user(), "petverse")

    def test_the_lookup_is_scoped_to_owner_member_app_and_active(self):
        import inspect
        src = inspect.getsource(ac.resolve_role)
        for clause in ("CollectionMember.owner_user_id == owner.id",
                       "CollectionMember.member_user_id == user.id",
                       "CollectionMember.app == app",
                       'CollectionMember.status == "active"'):
            assert clause in src, clause


class TestRequire:
    def test_no_access_is_a_404_like_missing(self):
        me, them = user(), user()
        db = DB({User: Q(them)})
        with pytest.raises(HTTPException) as e:
            ac.require(db, me, them.id, "tarantuverse", "viewer", not_found="Animal not found")
        assert (e.value.status_code, e.value.detail) == (404, "Animal not found")

    def test_too_low_a_role_is_a_403(self):
        me, them = user(), user()
        db = DB({User: Q(them), CollectionMember: Q(member("viewer"))})
        with pytest.raises(HTTPException) as e:
            ac.require(db, me, them.id, "tarantuverse", "logger")
        assert (e.value.status_code, e.value.detail) == (403, ac.ROLE_TOO_LOW)

    def test_enough_role_returns_owner_and_actor(self):
        me, them = user(), user()
        db = DB({User: Q(them), CollectionMember: Q(member("keeper"))})
        a = ac.require(db, me, them.id, "tarantuverse", "logger")
        assert a.owner is them and a.actor is me and a.role == "keeper"
        assert not a.is_owner and a.logged_by_user_id == me.id

    def test_owner_needs_no_lookup_and_is_never_attributed(self):
        me = user()
        a = ac.require(DB(), me, me.id, "herpetoverse", "keeper")
        assert a.is_owner and a.owner is me and a.logged_by_user_id is None

    def test_owner_only_needs_are_refused_to_keepers(self):
        me, them = user(), user()
        db = DB({User: Q(them), CollectionMember: Q(member("keeper"))})
        with pytest.raises(HTTPException) as e:
            ac.require(db, me, them.id, "tarantuverse", "owner")
        assert e.value.status_code == 403

    def test_missing_owner_is_a_404(self):
        with pytest.raises(HTTPException) as e:
            ac.require(DB({User: Q(None)}), user(), uuid.uuid4(), "tarantuverse", "viewer")
        assert e.value.status_code == 404

    def test_scope_defaults_to_your_own_collection(self):
        me = user()
        assert ac.scope_collection(DB(), me, "tarantuverse").is_owner


class TestLoaders:
    def test_missing_row_and_no_access_look_identical(self):
        me, them = user(), user()
        inv = NS(id=uuid.uuid4(), user_id=them.id)
        missing = DB({Invert: Q(None)})
        not_mine = DB({Invert: Q(inv), User: Q(them)})
        errs = []
        for db in (missing, not_mine):
            with pytest.raises(HTTPException) as e:
                ac.load_invert(db, me, inv.id, "viewer")
            errs.append((e.value.status_code, e.value.detail))
        assert errs[0] == errs[1] == (404, "Animal not found")

    def test_loader_checks_the_rows_owner_in_the_right_app(self, monkeypatch):
        seen = []
        monkeypatch.setattr(ac, "require", lambda db, u, owner_id, app, need, not_found="": seen.append((owner_id, app, need)) or "ok")
        owner_id = uuid.uuid4()
        db = DB({Invert: Q(NS(id=uuid.uuid4(), user_id=owner_id))})
        ac.load_invert(db, user(), uuid.uuid4(), "logger")
        assert seen == [(owner_id, "tarantuverse", "logger")]


class TestPolicyTag:
    def test_tags_the_function(self):
        @ac.policy("logger")
        def f():
            pass
        assert f.__access_policy__ == "logger"

    def test_rejects_unknown_levels(self):
        with pytest.raises(ValueError):
            ac.policy("admin")


def test_every_model_mapper_configures():
    """Adding logged_by_user_id gave several log tables a SECOND foreign key to
    users, which makes any bare relationship("User") ambiguous. SQLAlchemy only
    notices when mappers configure — i.e. at API startup on Render. This makes
    the suite notice first."""
    import app.models  # noqa: F401  (registers every model)
    from sqlalchemy.orm import configure_mappers
    configure_mappers()
