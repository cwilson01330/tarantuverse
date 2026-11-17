"""Forums paused (spec 2026-11-17, Task 2): forum content leaves search, the
activity feeds, discover and the achievements gallery while the flag is off.
Admins see everything; flag ON changes nothing. Reuses Task 1's helpers.
"""
import uuid

import pytest

import app.main  # noqa: F401  (registers every model before mappers configure)
from app.models.achievement import AchievementDefinition, UserAchievement
from app.models.activity_feed import ActivityFeed
from app.models.follow import Follow
from app.models.forum import ForumCategory, ForumPost, ForumThread
from tests.test_forums_pause import _reset_cache, headers, make_user, set_flag  # noqa: F401

pytestmark = pytest.mark.requires_postgres

FORUM_KEYS = ("first_post", "contributor_10")


@pytest.fixture()
def keeper(db_session):
    u = make_user(db_session, collection_visibility="public")
    return u


@pytest.fixture()
def admin(db_session):
    return make_user(db_session, is_admin=True, collection_visibility="public")


@pytest.fixture()
def content(db_session, keeper):
    cat = ForumCategory(name="General", slug=f"g-{uuid.uuid4().hex[:6]}", display_order=1)
    db_session.add(cat)
    db_session.commit()
    thread = ForumThread(category_id=cat.id, author_id=keeper.id, title="Zebrafinch thread",
                         slug="zf", post_count=1)
    db_session.add(thread)
    db_session.commit()
    db_session.add(ForumPost(thread_id=thread.id, author_id=keeper.id, content="x"))
    for at in ("forum_thread", "forum_post", "feeding"):
        db_session.add(ActivityFeed(user_id=keeper.id, action_type=at,
                                    target_id=str(thread.id), activity_metadata={"t": "Zebrafinch"}))
    db_session.commit()
    return thread


@pytest.fixture()
def defs(db_session):
    out = {}
    for key, name in (("first_post", "First Post"), ("contributor_10", "Contributor"), ("zz_other", "Other")):
        d = db_session.query(AchievementDefinition).filter_by(key=key).first()
        if d is None:
            d = AchievementDefinition(key=key, name=name, description="d", icon="x",
                                      category="community", tier="bronze", requirement_count=1)
            db_session.add(d)
            db_session.commit()
        out[key] = d
    return out


def types(feed):
    return {a["action_type"] for a in feed["activities"]}


def feeds(client, keeper):
    h = headers(keeper)
    return [
        client.get("/api/v1/activity/feed", headers=h).json(),
        client.get("/api/v1/activity/global").json(),
        client.get(f"/api/v1/activity/user/{keeper.username}").json(),
    ]


def test_paused_search_has_no_forum_results(client, db_session, keeper, content):
    set_flag(db_session, False)
    j = client.get("/api/v1/search", params={"q": "Zebrafinch"}, headers=headers(keeper)).json()
    assert j["forums"] == []
    assert j["total_results"] == 0
    j = client.get("/api/v1/search", params={"q": "Zebrafinch", "type": "forums"}).json()
    assert j["forums"] == [] and j["total_results"] == 0


def test_paused_feeds_drop_forum_items(client, db_session, keeper, content):
    set_flag(db_session, False)
    db_session.add(Follow(follower_id=keeper.id, followed_id=keeper.id))
    db_session.commit()
    for feed in feeds(client, keeper):
        assert not types(feed) & {"forum_thread", "forum_post"}
    g = client.get("/api/v1/activity/global").json()
    assert "feeding" in types(g)
    for path in ("/api/v1/activity/global", f"/api/v1/activity/user/{keeper.username}"):
        for at in ("forums", "forum_thread", "forum_post"):
            r = client.get(path, params={"action_type": at})
            assert r.status_code == 200
            assert r.json()["activities"] == [] and r.json()["total"] == 0
    r = client.get("/api/v1/activity/feed", params={"action_type": "forums"}, headers=headers(keeper))
    assert r.status_code == 200 and r.json()["activities"] == []


def test_paused_discover_has_no_threads(client, db_session, keeper, content):
    set_flag(db_session, False)
    r = client.get("/api/v1/discover/")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["trending_threads"] == []
    assert j["stats"]["total_forum_threads"] is None
    assert not {a["activity_type"] for a in j["recent_activity"]} & {"forum_thread", "forum_post"}


def test_paused_hides_unearned_forum_badges(client, db_session, keeper, defs):
    set_flag(db_session, True)
    on = client.get("/api/v1/achievements/", headers=headers(keeper)).json()
    set_flag(db_session, False)
    off = client.get("/api/v1/achievements/", headers=headers(keeper)).json()
    keys = {a["key"] for a in off["achievements"]}
    assert not keys & set(FORUM_KEYS)
    assert off["total_available"] == on["total_available"] - 2


def test_paused_keeps_earned_forum_badges(client, db_session, keeper, defs):
    db_session.add(UserAchievement(user_id=keeper.id, achievement_id=defs["first_post"].id))
    db_session.commit()
    set_flag(db_session, False)
    j = client.get("/api/v1/achievements/", headers=headers(keeper)).json()
    by = {a["key"]: a for a in j["achievements"]}
    assert by["first_post"]["earned_at"] is not None
    assert "contributor_10" not in by
    assert j["total_earned"] >= 1


def test_paused_admin_sees_forum_badges(client, db_session, admin, defs):
    set_flag(db_session, False)
    keys = {a["key"] for a in client.get("/api/v1/achievements/", headers=headers(admin)).json()["achievements"]}
    assert set(FORUM_KEYS) <= keys


def test_paused_admin_search_and_feeds_unchanged(client, db_session, admin, content):
    set_flag(db_session, False)
    j = client.get("/api/v1/search", params={"q": "Zebrafinch"}, headers=headers(admin)).json()
    assert len(j["forums"]) == 1
    g = client.get("/api/v1/activity/global", headers=headers(admin)).json()
    assert "forum_thread" in types(g)  # global feed is anonymous-capable; see report


def test_flag_on_surfaces_unchanged(client, db_session, keeper, content, defs):
    set_flag(db_session, True)
    h = headers(keeper)
    j = client.get("/api/v1/search", params={"q": "Zebrafinch"}, headers=h).json()
    assert len(j["forums"]) == 1 and j["total_results"] >= 1
    for feed in feeds(client, keeper)[1:]:
        assert {"forum_thread", "forum_post"} <= types(feed)
    r = client.get("/api/v1/activity/global", params={"action_type": "forums"}).json()
    assert types(r) == {"forum_thread", "forum_post"}
    d = client.get("/api/v1/discover/").json()
    assert len(d["trending_threads"]) == 1
    assert d["stats"]["total_forum_threads"] >= 1
    keys = {a["key"] for a in client.get("/api/v1/achievements/", headers=h).json()["achievements"]}
    assert set(FORUM_KEYS) <= keys
