"""Email-verification link lifetime and the self-serve resend endpoint.

Context (Sept 2026): every password signup got its verification email and
Resend reported all of them delivered, yet a handful of accounts never
verified. All of them had the same shape — link expired, zero animals — and
the mobile login screen answered "Email not verified" with an alert and no
way to request a new link. These tests pin the three fixes:

  1. one shared TTL, now 72h, used by every path that mints a token
  2. a resend endpoint that takes the address in a JSON body (not the URL)
  3. identical responses for every outcome, so it can't enumerate accounts
"""
from __future__ import annotations

import asyncio
import inspect
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers import auth as auth_router
from app.schemas.user import ResendVerificationRequest
from app.utils.auth import EMAIL_VERIFICATION_TTL, new_email_verification_token

APP = Path(__file__).resolve().parents[1] / "app"


# ── fakes ─────────────────────────────────────────────────────────────────────

class _Query:
    def __init__(self, user):
        self._user = user
        self.filters = []

    def filter(self, *criteria):
        self.filters.extend(criteria)
        return self

    def first(self):
        return self._user


class _DB:
    def __init__(self, user=None):
        self.user = user
        self.commits = 0
        self.last_query = None

    def query(self, _model):
        self.last_query = _Query(self.user)
        return self.last_query

    def commit(self):
        self.commits += 1


def _user(verified: bool):
    return SimpleNamespace(
        email="keeper+ts@example.com",
        is_verified=verified,
        verification_token="old-token",
        verification_token_expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )


@pytest.fixture
def sent(monkeypatch):
    calls = []

    async def fake_send(to_email, link):
        calls.append((to_email, link))

    monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
    monkeypatch.setattr(auth_router.EmailService, "send_verification_email", fake_send)
    return calls


def _resend(db, *, body=None, query=None):
    # Call past slowapi's decorator; it needs a live ASGI request otherwise.
    fn = inspect.unwrap(auth_router.resend_verification)
    return asyncio.run(fn(request=None, payload=body, email=query, db=db))


# ── 1. TTL ────────────────────────────────────────────────────────────────────

def test_the_link_lives_for_three_days():
    assert EMAIL_VERIFICATION_TTL == timedelta(hours=72)


def test_the_helper_stamps_the_shared_ttl():
    token, expires = new_email_verification_token()
    assert len(token) >= 32
    delta = expires - datetime.now(timezone.utc)
    assert timedelta(hours=71, minutes=59) < delta <= timedelta(hours=72)


def test_the_email_promises_the_window_the_server_honors():
    from app.services.email import _verification_window

    assert _verification_window() == "3 days"


@pytest.mark.parametrize("path", ["routers/auth.py", "routers/admin.py"])
def test_no_issuing_path_hand_rolls_its_own_expiry(path):
    """Register, self-serve resend and admin resend all used to write
    `timedelta(hours=24)` inline — which is how a lifetime change could land
    in one place and not the others. The only inline 24h left should be the
    password-reset tokens, which deliberately keep the short window."""
    src = (APP / path).read_text(encoding="utf-8")
    assert "new_email_verification_token()" in src
    hand_rolled = re.findall(
        r"verification_token_expires_at\s*=\s*datetime\.now\([^)]*\)\s*\+\s*timedelta",
        src,
    )
    assert hand_rolled == []


def test_password_reset_links_stay_short():
    # They grant access on their own; the verification relaxation must not
    # have leaked into them.
    src = (APP / "routers/auth.py").read_text(encoding="utf-8")
    assert "expires = datetime.now(timezone.utc) + timedelta(hours=24)" in src


# ── 2. body, not URL ──────────────────────────────────────────────────────────

def test_resend_reads_the_address_from_the_json_body(sent):
    db = _DB(_user(verified=False))
    _resend(db, body=ResendVerificationRequest(email="keeper+ts@example.com"))
    assert len(sent) == 1
    assert sent[0][0] == "keeper+ts@example.com"


def test_the_query_param_still_works_for_builds_already_in_the_field(sent):
    db = _DB(_user(verified=False))
    _resend(db, query="keeper+ts@example.com")
    assert len(sent) == 1


def test_the_body_wins_over_the_query_param(sent):
    db = _DB(_user(verified=False))
    _resend(
        db,
        body=ResendVerificationRequest(email="keeper+ts@example.com"),
        query="someone-else@example.com",
    )
    # The lookup value is what was filtered on; the fake returns the same user
    # either way, so assert on the criterion itself.
    criterion = db.last_query.filters[0]
    assert criterion.right.value == "keeper+ts@example.com"


def test_an_empty_address_is_rejected_not_silently_ignored(sent):
    with pytest.raises(HTTPException) as e:
        _resend(_DB(None), body=ResendVerificationRequest(email="   "))
    assert e.value.status_code == 422
    assert sent == []


def test_a_plus_address_arrives_intact(sent):
    """The old web client put the address in the URL un-encoded, so `+`
    became a space and the lookup matched nobody."""
    db = _DB(_user(verified=False))
    _resend(db, body=ResendVerificationRequest(email="keeper+ts@example.com"))
    assert "+" in db.last_query.filters[0].right.value


# ── 3. behaviour + no enumeration ─────────────────────────────────────────────

def test_an_unverified_account_gets_a_fresh_token_and_email(sent):
    user = _user(verified=False)
    db = _DB(user)
    _resend(db, body=ResendVerificationRequest(email=user.email))

    assert user.verification_token != "old-token"
    assert user.verification_token_expires_at > datetime.now(timezone.utc) + timedelta(hours=71)
    assert db.commits == 1
    assert user.verification_token in sent[0][1]


def test_an_expired_link_is_exactly_the_case_this_rescues(sent):
    user = _user(verified=False)  # expiry is in 2020
    _resend(_DB(user), body=ResendVerificationRequest(email=user.email))
    assert len(sent) == 1


def test_a_verified_account_is_left_alone(sent):
    user = _user(verified=True)
    db = _DB(user)
    _resend(db, body=ResendVerificationRequest(email=user.email))
    assert sent == []
    assert db.commits == 0
    assert user.verification_token == "old-token"


@pytest.mark.parametrize(
    "user",
    [None, _user(verified=True), _user(verified=False)],
    ids=["no-account", "already-verified", "sent"],
)
def test_every_outcome_says_the_same_thing(sent, user):
    out = _resend(_DB(user), body=ResendVerificationRequest(email="a@example.com"))
    assert out == {"message": auth_router.RESEND_VERIFICATION_MESSAGE}


def test_a_mail_outage_does_not_leak_that_the_account_exists(monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("resend down")

    monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
    monkeypatch.setattr(auth_router.EmailService, "send_verification_email", boom)

    out = _resend(_DB(_user(verified=False)), body=ResendVerificationRequest(email="a@example.com"))
    assert out == {"message": auth_router.RESEND_VERIFICATION_MESSAGE}
