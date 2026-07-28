"""Activity feeds must never expose a private keeper's collection.

This is the husbandry-invariant test for the P0 found on 2026-07-28: the
unauthenticated `/activity/global` endpoint joined `users` only to decorate
rows with a username and avatar, and returned activity for EVERY account
regardless of `collection_visibility`. Animal names, species, photo URLs and
feeding outcomes for private collections were readable by anonymous callers.

Two properties are asserted, and they fail for different reasons:

  1. Anonymous callers see only public accounts' activity.
  2. FOLLOWERS also see only public accounts' activity. Follows are one-sided
     and need no approval from the followed keeper, so being followed is not
     consent. Without this, switching to private would hide a keeper from
     strangers while leaving them fully visible to anyone who followed them
     first — which is worse than useless, because the setting says otherwise.

Both need real rows, so the module is Postgres-gated. It will SKIP until
TEST_DATABASE_URL is set; that skip is now visible rather than silent (see
conftest.py).
"""
from __future__ import annotations

import uuid

import pytest

from app.models.activity_feed import ActivityFeed
from app.models.follow import Follow
from app.models.user import User

pytestmark = pytest.mark.requires_postgres


def _make_user(db_session, *, visibility: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:12]}@example.test",
        username=f"keeper_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
        collection_visibility=visibility,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _log_activity(db_session, user: User, name: str) -> ActivityFeed:
    row = ActivityFeed(
        user_id=user.id,
        action_type="new_tarantula",
        target_id=str(uuid.uuid4()),
        # The metadata is the point: this is what leaked.
        activity_metadata={"tarantula_name": name, "species_name": "Brachypelma hamorii"},
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_global_feed_excludes_private_accounts(client, db_session):
    private_user = _make_user(db_session, visibility="private")
    public_user = _make_user(db_session, visibility="public")
    _log_activity(db_session, private_user, "SECRET-SPIDER")
    _log_activity(db_session, public_user, "SHARED-SPIDER")
    db_session.commit()

    response = client.get("/api/v1/activity/global")
    assert response.status_code == 200
    body = response.text

    assert "SECRET-SPIDER" not in body, (
        "A private keeper's animal reached the unauthenticated global feed."
    )
    assert "SHARED-SPIDER" in body


def test_following_a_private_keeper_does_not_expose_their_activity(
    client, db_session, test_user, auth_headers
):
    private_user = _make_user(db_session, visibility="private")
    _log_activity(db_session, private_user, "SECRET-SPIDER")
    db_session.add(Follow(follower_id=test_user.id, followed_id=private_user.id))
    db_session.commit()

    response = client.get("/api/v1/activity/feed", headers=auth_headers)
    assert response.status_code == 200

    assert "SECRET-SPIDER" not in response.text, (
        "Following is not consent — a private keeper's activity reached a follower."
    )


def test_visibility_is_rechecked_on_read_not_frozen_at_write(client, db_session):
    """Going private must retroactively hide activity already logged.

    Enforcing visibility only when the activity row is CREATED would leave
    everything logged beforehand permanently public, so the control would
    silently apply to the future only.
    """
    user = _make_user(db_session, visibility="public")
    _log_activity(db_session, user, "WAS-PUBLIC-SPIDER")
    db_session.commit()

    assert "WAS-PUBLIC-SPIDER" in client.get("/api/v1/activity/global").text

    user.collection_visibility = "private"
    db_session.commit()

    assert "WAS-PUBLIC-SPIDER" not in client.get("/api/v1/activity/global").text, (
        "Activity logged while public stayed visible after the keeper went private."
    )
