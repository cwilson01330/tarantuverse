"""Co-keeper invites and memberships (PRD-shared-keeping rung 3, T8/T9/T11/T12)."""
from __future__ import annotations

import asyncio
import inspect
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.models.collection_member import MAX_MEMBERS_PER_COLLECTION, CollectionMember
from app.models.user import User
from app.routers import collection_members as cm
from app.schemas.collection_member import AcceptByToken, InviteCreate, RoleUpdate

NOW = datetime.now(timezone.utc)


class Q:
    def __init__(self, first=None, rows=None):
        self._first, self._rows = first, rows

    def filter(self, *a, **k):
        return self

    order_by = with_for_update = filter

    def first(self):
        return self._first

    def all(self):
        return list(self._rows) if self._rows is not None else ([] if self._first is None else [self._first])


class SeqQ(Q):
    """Answers successive .first() calls from a list — e.g. the invite, then
    "no existing membership"."""

    def __init__(self, *answers):
        super().__init__()
        self._answers = list(answers)

    def first(self):
        return self._answers.pop(0) if self._answers else None


class DB:
    def __init__(self, by_model=None):
        self.by_model, self.added, self.commits = by_model or {}, [], 0

    def query(self, model, *_):
        return self.by_model.get(getattr(model, "class_", model), Q())

    def add(self, o):
        if getattr(o, "id", None) is None:
            o.id = uuid.uuid4()
        if getattr(o, "created_at", None) is None:
            o.created_at = NOW
        self.added.append(o)

    def commit(self):
        self.commits += 1

    def refresh(self, o):
        pass

    def rollback(self):
        pass


def person(email="owner@example.com", premium=True, verified=True):
    return NS(id=uuid.uuid4(), email=email, username=email.split("@")[0], display_name=None,
              avatar_url=None, is_active=True, is_verified=verified, is_premium_for_app=lambda app: premium)


def invite_row(owner, email="alex@example.com", role="logger", status="pending", expires=None, token="t" * 43):
    return CollectionMember(
        id=uuid.uuid4(), owner_user_id=owner.id, app="tarantuverse", role=role, invited_email=email,
        invite_token_hash=cm._hash(token), invite_expires_at=expires or NOW + timedelta(days=3),
        status=status, created_at=NOW,
    )


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    sent = []

    async def fake_send(owner, m, raw):
        sent.append((m.invited_email, raw))
        return True

    monkeypatch.setattr(cm, "_send_invite", fake_send)
    monkeypatch.setattr(cm, "_notify", lambda *a, **k: None)
    return sent


# ── inviting ─────────────────────────────────────────────────────────────────

class TestInvite:
    def call(self, owner, db, email="alex@example.com", role="logger"):
        return run(cm.invite, request=None, body=InviteCreate(app="tarantuverse", email=email, role=role),
                   current_user=owner, db=db)

    def test_needs_premium_for_that_app(self):
        with pytest.raises(HTTPException) as e:
            self.call(person(premium=False), DB())
        assert e.value.status_code == 402 and e.value.detail["source"] == "shared_keeping"

    def test_cannot_invite_yourself(self):
        with pytest.raises(HTTPException) as e:
            self.call(person(), DB(), email="OWNER@example.com ")
        assert e.value.status_code == 422

    def test_creates_a_pending_invite_with_only_the_token_hash_stored(self, quiet):
        owner = person()
        db = DB()
        out = self.call(owner, db)
        (row,) = db.added
        (_, raw) = quiet[0]
        assert row.status == "pending" and row.invited_email == "alex@example.com"
        assert row.invite_token_hash == cm._hash(raw) and raw not in (row.invite_token_hash or "")
        assert out.accept_url.endswith(f"/invite#{raw}") and "?" not in out.accept_url
        assert row.invite_expires_at - NOW <= cm.INVITE_TTL + timedelta(seconds=5)

    def test_the_cap_is_ten_live_members_and_invites(self):
        owner = person()
        rows = [invite_row(owner, email=f"p{i}@example.com") for i in range(MAX_MEMBERS_PER_COLLECTION)]
        with pytest.raises(HTTPException) as e:
            self.call(owner, DB({CollectionMember: Q(rows=rows)}))
        assert e.value.status_code == 409

    def test_expired_invites_dont_count_toward_the_cap(self):
        owner = person()
        rows = [invite_row(owner, email=f"p{i}@example.com", expires=NOW - timedelta(minutes=1))
                for i in range(MAX_MEMBERS_PER_COLLECTION)]
        self.call(owner, DB({CollectionMember: Q(rows=rows)}))
        assert all(r.status == "expired" for r in rows)

    def test_a_second_invite_to_the_same_address_is_refused(self):
        owner = person()
        with pytest.raises(HTTPException) as e:
            self.call(owner, DB({CollectionMember: Q(rows=[invite_row(owner)])}))
        assert e.value.status_code == 409

    def test_the_invite_email_escapes_the_inviters_name(self, monkeypatch):
        from app.services.email import EmailService
        seen = {}

        async def capture(to_email, subject, content):
            seen["html"] = content

        monkeypatch.setattr(EmailService, "send_email", staticmethod(capture))
        asyncio.run(EmailService.send_collection_invite_email(
            "a@b.co", '<a href="https://evil">Cory</a>', "logger", "https://x/invite#t", 7))
        assert "<a href=\"https://evil\">" not in seen["html"] and "&lt;a href=" in seen["html"]


# ── accepting (T11) ──────────────────────────────────────────────────────────

class TestAccept:
    def setup_method(self):
        self.owner = person()
        self.row = invite_row(self.owner)

    def by_token(self, user, token="t" * 43, rows=None):
        db = DB({CollectionMember: SeqQ(self.row, None), User: Q(self.owner)})
        if rows is not None:
            db.by_model[CollectionMember] = rows
        return run(cm.accept_by_token, request=None, body=AcceptByToken(token=token), current_user=user, db=db)

    def test_matching_verified_account_becomes_an_active_member(self):
        alex = person("Alex@Example.com")
        out = self.by_token(alex)
        assert self.row.status == "active" and self.row.member_user_id == alex.id
        assert self.row.invite_token_hash is None            # single use
        assert out.role == "logger" and out.owner.id == self.owner.id

    def test_unverified_accounts_cannot_accept(self):
        with pytest.raises(HTTPException) as e:
            self.by_token(person("alex@example.com", verified=False))
        assert (e.value.status_code, e.value.detail) == (403, cm.VERIFY_FIRST)

    def test_a_forwarded_link_is_useless_to_anyone_else(self):
        with pytest.raises(HTTPException) as e:
            self.by_token(person("mallory@example.com"))
        assert (e.value.status_code, e.value.detail) == (403, cm.WRONG_EMAIL)
        assert self.row.status == "pending"

    def test_expired_invites_are_gone(self):
        self.row.invite_expires_at = NOW - timedelta(seconds=1)
        with pytest.raises(HTTPException) as e:
            self.by_token(person("alex@example.com"))
        assert e.value.status_code == 410

    @pytest.mark.parametrize("state", ["unknown", "removed", "active", "declined"])
    def test_unusable_invites_all_look_the_same(self, state):
        if state == "unknown":
            self.row = None
        else:
            self.row.status = state
        with pytest.raises(HTTPException) as e:
            self.by_token(person("alex@example.com"))
        assert (e.value.status_code, e.value.detail) == (404, cm.INVITE_UNAVAILABLE)

    def test_the_owner_cannot_accept_their_own_invite(self):
        self.row.invited_email = self.owner.email
        with pytest.raises(HTTPException) as e:
            self.by_token(self.owner)
        assert e.value.status_code == 409

    def test_in_app_accept_of_someone_elses_invite_is_a_404(self):
        db = DB({CollectionMember: Q(self.row), User: Q(self.owner)})
        with pytest.raises(HTTPException) as e:
            run(cm.accept_in_app, request=None, invite_id=self.row.id, current_user=person("mallory@example.com"), db=db)
        assert e.value.status_code == 404

    def test_accepting_twice_keeps_one_membership(self):
        alex = person("alex@example.com")
        existing = invite_row(self.owner, status="active")
        db = DB({CollectionMember: SeqQ(self.row, existing), User: Q(self.owner)})
        out = run(cm.accept_by_token, request=None, body=AcceptByToken(token="t" * 43), current_user=alex, db=db)
        assert out.membership_id == existing.id and self.row.status == "expired"
        assert self.row.invite_token_hash is None

    def test_the_token_is_looked_up_by_hash_only(self):
        src = inspect.getsource(cm.accept_by_token)
        assert "invite_token_hash == _hash(body.token)" in src


# ── shared with me ───────────────────────────────────────────────────────────

class TestSharedWithMe:
    def test_invites_stay_hidden_until_your_email_is_verified(self):
        owner = person()
        db = DB({CollectionMember: Q(rows=[invite_row(owner)]), User: Q(owner)})
        out = run(cm.shared_with_me, current_user=person("alex@example.com", verified=False), db=db)
        assert out.invites == [] and out.email_verified is False

    def test_a_lapsed_owner_shows_as_read_only(self):
        owner = person(premium=False)
        me = person("alex@example.com")
        row = invite_row(owner, role="keeper", status="active")
        row.member_user_id = me.id
        db = DB({CollectionMember: Q(rows=[row]), User: Q(owner)})
        out = run(cm.shared_with_me, current_user=me, db=db)
        (c,) = out.collections
        assert c.read_only and c.role == "viewer"


# ── management is the owner's alone (T8) ─────────────────────────────────────

class TestManagement:
    def test_every_management_route_is_scoped_to_the_owner(self):
        for fn in (cm.change_role, cm.remove_member):
            assert "_owned_membership(db, membership_id, current_user)" in inspect.getsource(fn)
        assert "CollectionMember.owner_user_id == owner.id" in inspect.getsource(cm._owned_membership)
        assert "CollectionMember.owner_user_id == current_user.id" in inspect.getsource(cm.resend_invite)
        assert "CollectionMember.owner_user_id == current_user.id" in inspect.getsource(cm.list_members)

    def test_someone_elses_membership_is_a_404(self):
        with pytest.raises(HTTPException) as e:
            run(cm.change_role, membership_id=uuid.uuid4(), body=RoleUpdate(role="keeper"),
                current_user=person(), db=DB({CollectionMember: Q(None)}))
        assert e.value.status_code == 404

    def test_removal_ends_access_and_the_link(self):
        owner = person()
        row = invite_row(owner, status="active")
        row.member_user_id = uuid.uuid4()
        run(cm.remove_member, membership_id=row.id, current_user=owner, db=DB({CollectionMember: Q(row)}))
        assert row.status == "removed" and row.invite_token_hash is None and row.ended_at is not None

    def test_you_can_only_leave_your_own_membership(self):
        assert "CollectionMember.member_user_id == current_user.id" in inspect.getsource(cm.leave)
        with pytest.raises(HTTPException) as e:
            run(cm.leave, membership_id=uuid.uuid4(), current_user=person(), db=DB())
        assert e.value.status_code == 404

    def test_resending_needs_premium_and_retires_the_old_link(self, quiet):
        owner = person()
        row = invite_row(owner)
        old = row.invite_token_hash
        run(cm.resend_invite, request=None, membership_id=row.id, current_user=owner,
            db=DB({CollectionMember: Q(row), User: Q(None)}))
        assert row.invite_token_hash != old and row.status == "pending"
        with pytest.raises(HTTPException) as e:
            run(cm.resend_invite, request=None, membership_id=row.id, current_user=person(premium=False),
                db=DB({CollectionMember: Q(row)}))
        assert e.value.status_code == 402
