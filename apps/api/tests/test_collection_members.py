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

    def flush(self):
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


@pytest.fixture
def in_app_on(monkeypatch):
    """Email verification enforced — the only setting where is_verified means
    the account holder has proven they own the address."""
    monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", True)


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

    def test_in_app_accept_of_someone_elses_invite_is_a_404(self, in_app_on):
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


# ── security review 2026-09-29 ──────────────────────────────────────────────

class TestInAppNeedsRealVerification:
    """H1: with EMAIL_VERIFICATION_REQUIRED off, every account is "verified" at
    sign-up, so anyone could register the invitee's address. Only the emailed
    link (proof of inbox) may accept then."""

    def setup_method(self):
        self.owner = person()
        self.row = invite_row(self.owner)

    def test_flag_off_hides_invites_from_shared_with_me(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        db = DB({CollectionMember: Q(rows=[self.row]), User: Q(self.owner)})
        out = run(cm.shared_with_me, current_user=person("alex@example.com"), db=db)
        assert out.invites == []

    def test_flag_off_refuses_in_app_accept_even_for_a_matching_account(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        db = DB({CollectionMember: SeqQ(self.row, None), User: Q(self.owner)})
        with pytest.raises(HTTPException) as e:
            run(cm.accept_in_app, request=None, invite_id=self.row.id, current_user=person("ALEX@example.com"), db=db)
        assert (e.value.status_code, e.value.detail) == (404, cm.IN_APP_OFF)
        assert self.row.status == "pending"

    def test_flag_off_refuses_in_app_decline(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        with pytest.raises(HTTPException) as e:
            run(cm.decline_invite, invite_id=self.row.id, current_user=person("alex@example.com"),
                db=DB({CollectionMember: Q(self.row)}))
        assert e.value.status_code == 404 and self.row.status == "pending"

    def test_flag_off_still_accepts_by_emailed_link(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        alex = person("alex@example.com")
        db = DB({CollectionMember: SeqQ(self.row, None), User: Q(self.owner)})
        run(cm.accept_by_token, request=None, body=AcceptByToken(token="t" * 43), current_user=alex, db=db)
        assert self.row.status == "active"

    def test_flag_on_lists_and_accepts_in_app(self, in_app_on):
        alex = person("alex@example.com")
        out = run(cm.shared_with_me, current_user=alex,
                  db=DB({CollectionMember: Q(rows=[self.row]), User: Q(self.owner)}))
        assert [i.id for i in out.invites] == [self.row.id]
        run(cm.accept_in_app, request=None, invite_id=self.row.id, current_user=alex,
            db=DB({CollectionMember: SeqQ(self.row, None), User: Q(self.owner)}))
        assert self.row.status == "active" and self.row.member_user_id == alex.id

    def test_flag_off_sends_no_in_app_notification(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        calls = []
        monkeypatch.setattr(cm, "_notify", lambda *a, **k: calls.append(a))
        someone = person("alex@example.com")
        owner = person()
        db = DB({CollectionMember: Q(rows=[]), User: Q(someone)})
        run(cm.invite, request=None, body=InviteCreate(app="tarantuverse", email="alex@example.com", role="logger"),
            current_user=owner, db=db)
        assert calls == []


class TestResendRevival:
    """L1: reviving an expired invite is a new live invite — same cap and
    no-duplicate rules as inviting."""

    def test_reviving_is_refused_when_the_collection_is_full(self):
        owner = person()
        row = invite_row(owner, status="expired")
        others = [invite_row(owner, email=f"p{i}@example.com", status="active") for i in range(MAX_MEMBERS_PER_COLLECTION)]
        db = DB({CollectionMember: Q(row, rows=others), User: Q(owner)})
        with pytest.raises(HTTPException) as e:
            run(cm.resend_invite, request=None, membership_id=row.id, current_user=owner, db=db)
        assert e.value.status_code == 409 and row.status == "expired"

    def test_reviving_is_refused_when_that_address_already_has_an_open_invite(self):
        owner = person()
        row = invite_row(owner, status="expired")
        dupe = invite_row(owner, email=row.invited_email, token="u" * 43)
        db = DB({CollectionMember: Q(row, rows=[dupe]), User: Q(owner)})
        with pytest.raises(HTTPException) as e:
            run(cm.resend_invite, request=None, membership_id=row.id, current_user=owner, db=db)
        assert e.value.status_code == 409

    def test_a_dead_invite_to_the_same_address_does_not_block_revival(self):
        owner = person()
        row = invite_row(owner, status="expired")
        dead = invite_row(owner, email=row.invited_email, token="u" * 43, expires=NOW - timedelta(days=1))
        db = DB({CollectionMember: Q(row, rows=[dead]), User: Q(owner)})
        run(cm.resend_invite, request=None, membership_id=row.id, current_user=owner, db=db)
        assert row.status == "pending" and dead.status == "expired"


class TestAccountDeletion:
    """M2: an active co-keeper's account must be deletable (SET NULL vs the
    active-has-member CHECK), and failures must not leak database errors."""

    def test_active_memberships_end_before_the_user_row_goes(self):
        from app.models.collection_member import end_memberships_of

        captured = {}

        class UQ(Q):
            def update(self, values, **_):
                captured.update({getattr(k, "key", k): v for k, v in values.items()})
                return 1

        end_memberships_of(DB({CollectionMember: UQ()}), uuid.uuid4())
        assert captured["status"] == "left" and captured["ended_at"] is not None

    def test_both_deletion_paths_end_memberships_first(self):
        from app.routers import admin, auth

        for fn, delete_stmt in ((auth.delete_account, "User.id == uid).delete("), (admin.delete_user, "db.delete(user)")):
            src = inspect.getsource(inspect.unwrap(fn))
            assert "end_memberships_of(db," in src
            assert src.index("end_memberships_of(db,") < src.index(delete_stmt)

    def test_account_deletion_never_returns_the_raw_error(self):
        from app.routers import auth

        src = inspect.getsource(inspect.unwrap(auth.delete_account))
        assert "str(e)" not in src


def test_invite_subject_quotes_and_cleans_the_inviters_name(monkeypatch):
    from app.services.email import EmailService

    seen = {}

    async def capture(to_email, subject, content):
        seen["subject"] = subject

    monkeypatch.setattr(EmailService, "send_email", staticmethod(capture))
    asyncio.run(EmailService.send_collection_invite_email(
        to_email="a@example.com", inviter_name="Tarantuverse\r\nSecurity  Team" + "x" * 80, role="viewer",
        accept_link="https://example.com/invite#t", valid_days=7,
    ))
    subject = seen.get("subject", "")
    assert subject.startswith('"Tarantuverse Security Team') and "\n" not in subject and "\r" not in subject
    assert len(subject.split('"')[1]) <= 40


# ── invite codes (for inboxes whose filters block links) ────────────────────

class TestInviteCode:
    def setup_method(self):
        self.owner = person()
        self.row = invite_row(self.owner)
        self.code = cm._code_for(self.row.invite_token_hash)

    def accept(self, user, code, rows=None):
        db = DB({CollectionMember: Q(rows=rows if rows is not None else [self.row]), User: SeqQ(None, self.owner)})
        # _activate looks up an existing membership (none) via CollectionMember.first();
        db.by_model[CollectionMember]._first = None
        return run(cm.accept_by_code, request=None, body=cm.AcceptByCode(code=code), current_user=user, db=db)

    def test_code_shape_is_typeable(self):
        assert len(self.code) == 11 and self.code[5] == "-"
        assert all(c in cm.CODE_ALPHABET for c in self.code.replace("-", ""))

    def test_code_follows_the_token_and_the_server_secret(self, monkeypatch):
        other = cm._code_for(cm._hash("u" * 43))
        assert other != self.code
        monkeypatch.setattr(cm.settings, "API_SECRET_KEY", "a-different-secret")
        assert cm._code_for(self.row.invite_token_hash) != self.code  # a DB read alone can't derive it

    def test_matching_account_accepts_with_a_messily_typed_code(self):
        messy = " " + self.code.lower().replace("-", " ").replace("0", "o").replace("1", "l") + " "
        self.accept(person("Alex@example.com"), messy)
        assert self.row.status == "active" and self.row.invite_token_hash is None

    def test_wrong_code_is_a_404(self):
        wrong = cm._code_for(cm._hash("z" * 43))
        with pytest.raises(HTTPException) as e:
            self.accept(person("alex@example.com"), wrong)
        assert (e.value.status_code, e.value.detail) == (404, cm.CODE_NO_MATCH)
        assert self.row.status == "pending"

    def test_garbage_is_a_404(self):
        with pytest.raises(HTTPException) as e:
            self.accept(person("alex@example.com"), "not a code!!")
        assert e.value.status_code == 404

    def test_only_invites_to_your_own_address_are_considered(self):
        src = inspect.getsource(inspect.unwrap(cm.accept_by_code))
        assert "CollectionMember.invited_email == email" in src
        assert "CollectionMember.status == \"pending\"" in src
        assert "hmac.compare_digest" in src

    def test_the_right_code_for_a_different_email_still_fails(self):
        with pytest.raises(HTTPException) as e:
            self.accept(person("mallory@example.com"), self.code)
        assert e.value.status_code == 403  # _check_can_accept: WRONG_EMAIL

    def test_unverified_accounts_cannot_use_a_code(self):
        with pytest.raises(HTTPException) as e:
            self.accept(person("alex@example.com", verified=False), self.code)
        assert (e.value.status_code, e.value.detail) == (403, cm.VERIFY_FIRST)

    def test_works_with_in_app_invites_off(self, monkeypatch):
        monkeypatch.setattr(cm.settings, "EMAIL_VERIFICATION_REQUIRED", False)
        self.accept(person("alex@example.com"), self.code)
        assert self.row.status == "active"

    def test_resend_changes_the_code(self):
        owner = self.owner
        out = run(cm.resend_invite, request=None, membership_id=self.row.id, current_user=owner,
                  db=DB({CollectionMember: Q(self.row), User: Q(None)}))
        assert out.invite_code != self.code and out.invite_code == cm._code_for(self.row.invite_token_hash)


def test_the_invite_email_carries_the_code(monkeypatch):
    from app.services.email import EmailService

    seen = {}

    async def capture(to_email, subject, content):
        seen["html"] = content

    monkeypatch.setattr(EmailService, "send_email", staticmethod(capture))
    asyncio.run(EmailService.send_collection_invite_email(
        to_email="a@example.com", inviter_name="Sam", role="logger",
        accept_link="https://example.com/invite#t", valid_days=7, invite_code="ABCDE-12345",
    ))
    assert "ABCDE-12345" in seen["html"] and "Sharing" in seen["html"]
