"""What's new: content file + loader (file-validation section).

Pure tests, no database. The router/unseen tests are added by later tasks.
"""
import copy
import json
from datetime import date
from pathlib import Path

import pytest

from app.services.whats_new import (
    DEFAULT_PATH,
    WHATS_NEW_APPS,
    WHATS_NEW_TARGETS,
    WhatsNewEntry,
    load_feed,
    validate_feed,
    week_of,
)


def _entry(**over):
    base = {
        "id": "2026-10-23-example",
        "published_on": "2026-10-23",
        "title": "A title",
        "body": "A body.",
        "premium": False,
    }
    base.update(over)
    return base


def _feed(tv=None, hv=None):
    return {
        "tarantuverse": [_entry()] if tv is None else tv,
        "herpetoverse": [] if hv is None else hv,
    }


def test_targets_are_exactly_the_spec_set():
    assert WHATS_NEW_TARGETS == (
        "expenses",
        "feeding_day",
        "analytics_advanced",
        "collection",
        "species",
        "settings",
    )
    assert WHATS_NEW_APPS == ("tarantuverse", "herpetoverse")


def test_real_file_is_valid():
    feed = load_feed()
    assert set(feed) == {"tarantuverse", "herpetoverse"}
    assert all(isinstance(e, WhatsNewEntry) for es in feed.values() for e in es)


TV_LAUNCH = {
    "2026-10-23-expenses",
    "2026-10-23-care-sheets",
    "2026-10-23-photo-timeline",
    "2026-10-23-feeding-cost",
    "2026-10-23-millipede-photos",
}
HV_LAUNCH = {
    "2026-10-23-expenses",
    "2026-10-23-care-sheets",
    "2026-10-23-photo-timeline",
}


def test_real_file_launch_entries():
    """Published entries are never removed or re-flagged (keepers may have
    seen them); later weeks only add entries."""
    feed = load_feed()
    tv = {e.id: e for e in feed["tarantuverse"]}
    hv = {e.id: e for e in feed["herpetoverse"]}
    assert TV_LAUNCH <= set(tv)
    assert HV_LAUNCH <= set(hv)
    assert {i for i in TV_LAUNCH if tv[i].premium} == {
        "2026-10-23-expenses",
        "2026-10-23-feeding-cost",
    }
    assert {i for i in HV_LAUNCH if hv[i].premium} == {"2026-10-23-expenses"}
    assert all(tv[i].published_on == date(2026, 10, 23) for i in TV_LAUNCH)
    assert all(hv[i].published_on == date(2026, 10, 23) for i in HV_LAUNCH)
    # HV care-sheets body is the TV care-sheets body.
    assert hv["2026-10-23-care-sheets"].body == tv["2026-10-23-care-sheets"].body
    assert tv["2026-10-23-feeding-cost"].action_target == "analytics_advanced"
    assert tv["2026-10-23-millipede-photos"].action_target == "species"
    assert hv["2026-10-23-expenses"].action_target == "expenses"


def test_real_file_is_plain_json_on_disk():
    # The file is read by path (Render runs from the repo); make sure it exists
    # where the loader looks and is UTF-8 JSON.
    assert DEFAULT_PATH.name == "whats_new.json"
    assert DEFAULT_PATH.parent.name == "content"
    json.loads(DEFAULT_PATH.read_text(encoding="utf-8"))


def _bad_cases():
    cases = []

    def add(name, raw, match):
        cases.append(pytest.param(raw, match, id=name))

    dup = _feed(tv=[_entry(), _entry(title="Other")])
    add("duplicate-id", dup, "2026-10-23-example")

    add("bad-date-string", _feed(tv=[_entry(published_on="23/10/2026")]), "published_on")
    add("date-not-a-string", _feed(tv=[_entry(published_on=20261023)]), "published_on")
    add("impossible-date", _feed(tv=[_entry(published_on="2026-02-30")]), "published_on")
    add("date-before-floor", _feed(tv=[_entry(published_on="2026-09-30")]), "published_on")
    add("title-61", _feed(tv=[_entry(title="x" * 61)]), "title")
    add("title-empty", _feed(tv=[_entry(title="")]), "title")
    add("body-221", _feed(tv=[_entry(body="x" * 221)]), "body")
    add("body-empty", _feed(tv=[_entry(body="")]), "body")
    add(
        "unknown-target",
        _feed(tv=[_entry(action={"label": "Go", "target": "nowhere"})]),
        "nowhere",
    )
    add(
        "action-label-31",
        _feed(tv=[_entry(action={"label": "x" * 31, "target": "expenses"})]),
        "action",
    )
    add(
        "action-label-empty",
        _feed(tv=[_entry(action={"label": "", "target": "expenses"})]),
        "action",
    )
    add(
        "action-extra-key",
        _feed(tv=[_entry(action={"label": "Go", "target": "expenses", "url": "x"})]),
        "action",
    )
    add("action-not-an-object", _feed(tv=[_entry(action="expenses")]), "action")
    add("premium-not-bool", _feed(tv=[_entry(premium="yes")]), "premium")
    add("premium-int", _feed(tv=[_entry(premium=1)]), "premium")
    add("id-bad-pattern", _feed(tv=[_entry(id="Bad Id")]), "id")
    add("id-no-date-prefix", _feed(tv=[_entry(id="expenses")]), "id")
    add("id-81", _feed(tv=[_entry(id="2026-10-23-" + "a" * 70)]), "id")
    # `$` would accept a trailing newline; the id must be rejected.
    add("id-trailing-newline", _feed(tv=[_entry(id="2026-10-23-x\n")]), "id")
    add("date-trailing-newline", _feed(tv=[_entry(published_on="2026-10-23\n")]), "published_on")
    add("entry-extra-key", _feed(tv=[_entry(image="x.png")]), "image")
    add("entry-missing-key", _feed(tv=[{k: v for k, v in _entry().items() if k != "body"}]), "body")
    add("entry-not-an-object", _feed(tv=["nope"]), "tarantuverse")

    extra = _feed()
    extra["android"] = []
    add("extra-top-level-key", extra, "android")

    missing = _feed()
    del missing["herpetoverse"]
    add("missing-top-level-key", missing, "herpetoverse")

    add("app-not-a-list", {"tarantuverse": {}, "herpetoverse": []}, "tarantuverse")
    add("top-level-not-object", [], "top-level")

    # Plain text only: no HTML, no markdown links.
    add("html-in-body", _feed(tv=[_entry(body="Use <b>bold</b>")]), "body")
    add("angle-bracket-title", _feed(tv=[_entry(title="a > b")]), "title")
    add("markdown-link", _feed(tv=[_entry(body="See [docs](http://x.test)")]), "body")
    add("html-in-action-label", _feed(tv=[_entry(action={"label": "<Go>", "target": "expenses"})]), "action")
    return cases


@pytest.mark.parametrize("raw,match", _bad_cases())
def test_bad_feed_rejected(raw, match):
    with pytest.raises(ValueError, match=match):
        validate_feed(raw)


def test_error_names_the_entry_id():
    raw = _feed(tv=[_entry(), _entry(id="2026-10-23-second", title="x" * 61)])
    with pytest.raises(ValueError, match="2026-10-23-second"):
        validate_feed(raw)


def test_same_id_may_appear_in_both_apps():
    # The launch entries share ids across the two apps' feeds.
    feed = validate_feed(_feed(tv=[_entry()], hv=[_entry()]))
    assert feed["tarantuverse"][0].id == feed["herpetoverse"][0].id


def test_boundary_lengths_accepted():
    feed = validate_feed(
        _feed(
            tv=[
                _entry(
                    id="2026-10-23-" + "a" * 69,
                    title="t" * 60,
                    body="b" * 220,
                    premium=True,
                    action={"label": "l" * 30, "target": "settings"},
                )
            ]
        )
    )
    e = feed["tarantuverse"][0]
    assert (len(e.id), len(e.title), len(e.body), len(e.action_label)) == (80, 60, 220, 30)
    assert e.premium is True and e.action_target == "settings"


def test_floor_date_accepted_and_no_action_gives_none():
    e = validate_feed(_feed(tv=[_entry(published_on="2026-10-01")]))["tarantuverse"][0]
    assert e.published_on == date(2026, 10, 1)
    assert e.action_label is None and e.action_target is None


def test_entries_are_frozen():
    e = validate_feed(_feed())["tarantuverse"][0]
    with pytest.raises(Exception):
        e.title = "changed"  # type: ignore[misc]


def test_validate_does_not_mutate_input():
    raw = _feed(tv=[_entry(action={"label": "Go", "target": "expenses"})])
    before = copy.deepcopy(raw)
    validate_feed(raw)
    assert raw == before


def test_week_of():
    assert week_of(date(2026, 10, 23)) == date(2026, 10, 19)
    assert week_of(date(2026, 10, 19)) == date(2026, 10, 19)
    assert week_of(date(2026, 10, 25)) == date(2026, 10, 19)
    assert week_of(date(2026, 10, 26)) == date(2026, 10, 26)


def test_sorted_newest_first():
    raw = _feed(
        tv=[
            _entry(id="2026-10-20-a", published_on="2026-10-20"),
            _entry(id="2026-10-23-b", published_on="2026-10-23"),
            _entry(id="2026-10-23-a", published_on="2026-10-23"),
            _entry(id="2026-10-21-z", published_on="2026-10-21"),
        ]
    )
    ids = [e.id for e in validate_feed(raw)["tarantuverse"]]
    assert ids == ["2026-10-23-a", "2026-10-23-b", "2026-10-21-z", "2026-10-20-a"]


def test_load_feed_from_tmp_path_and_cached(tmp_path: Path):
    p = tmp_path / "feed.json"
    p.write_text(json.dumps(_feed()), encoding="utf-8")
    first = load_feed(p)
    assert load_feed(p) is first  # lru_cache keyed by path
    assert first["herpetoverse"] == ()


def test_load_feed_invalid_file_raises(tmp_path: Path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(_feed(tv=[_entry(title="x" * 61)])), encoding="utf-8")
    with pytest.raises(ValueError, match="title"):
        load_feed(p)


def test_load_feed_not_json_raises(tmp_path: Path):
    p = tmp_path / "broken.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError, match="broken.json"):
        load_feed(p)


def test_default_path_is_the_one_load_feed_uses():
    assert DEFAULT_PATH.exists()
    assert load_feed() is load_feed(DEFAULT_PATH)


def test_load_feed_result_is_read_only(tmp_path: Path):
    # The cached feed is shared by every request: a caller's sort()/append()
    # or item assignment must not be able to corrupt it.
    p = tmp_path / "feed.json"
    p.write_text(json.dumps(_feed(tv=[_entry()], hv=[_entry()])), encoding="utf-8")
    feed = load_feed(p)
    with pytest.raises(TypeError):
        feed["tarantuverse"] = ()  # type: ignore[index]
    with pytest.raises(TypeError):
        del feed["tarantuverse"]  # type: ignore[attr-defined]
    entries = feed["tarantuverse"]
    assert isinstance(entries, tuple)
    with pytest.raises(AttributeError):
        entries.append(entries[0])  # type: ignore[attr-defined]
    with pytest.raises(AttributeError):
        entries.sort()  # type: ignore[attr-defined]
    with pytest.raises(TypeError):
        entries[0] = entries[0]  # type: ignore[index]


def test_real_feed_result_is_read_only():
    feed = load_feed()
    with pytest.raises(TypeError):
        feed["tarantuverse"] = ()  # type: ignore[index]
    assert isinstance(feed["herpetoverse"], tuple)


# ---------------------------------------------------------------------------
# Seen state + router (Task 2)
# ---------------------------------------------------------------------------
import uuid  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

from app.models.user import User  # noqa: E402
from app.routers import whats_new as wn_router  # noqa: E402
from app.routers.whats_new import compute_unseen, live_entries  # noqa: E402
from app.utils.auth import create_access_token  # noqa: E402
from app.utils.rate_limit import limiter  # noqa: E402


def _e(day: str, name: str = "x", premium: bool = False, target: str | None = None) -> WhatsNewEntry:
    return WhatsNewEntry(
        id=f"{day}-{name}",
        published_on=date.fromisoformat(day),
        title=f"T {name}",
        body=f"B {name}",
        premium=premium,
        action_label="Go" if target else None,
        action_target=target,
    )


TODAY = date(2026, 10, 23)  # a Friday; its week starts Monday 2026-10-19


def _ids(entries):
    return [e.id for e in entries]


class TestLiveEntries:
    def test_future_dated_dropped_and_newest_first(self):
        es = [_e("2026-10-20"), _e("2026-10-24", "future"), _e("2026-10-23"), _e("2026-10-21")]
        assert _ids(live_entries(es, TODAY)) == ["2026-10-23-x", "2026-10-21-x", "2026-10-20-x"]

    def test_today_is_live(self):
        assert _ids(live_entries([_e("2026-10-23")], TODAY)) == ["2026-10-23-x"]

    def test_empty(self):
        assert live_entries([], TODAY) == []


class TestComputeUnseen:
    def test_empty_feed(self):
        assert compute_unseen([], signed_up_on=date(2026, 10, 1), seen_through=None, today=TODAY) == []

    def test_signup_cutoff_day_before_excluded_day_after_included(self):
        signup = date(2026, 10, 21)
        es = [_e("2026-10-20", "before"), _e("2026-10-21", "same"), _e("2026-10-22", "after")]
        out = compute_unseen(es, signed_up_on=signup, seen_through=None, today=TODAY)
        assert _ids(out) == ["2026-10-22-after"]

    def test_seen_marker_excludes_at_or_before_marker(self):
        es = [_e("2026-10-20", "a"), _e("2026-10-21", "b"), _e("2026-10-22", "c")]
        out = compute_unseen(
            es, signed_up_on=date(2026, 10, 1), seen_through=date(2026, 10, 21), today=TODAY
        )
        assert _ids(out) == ["2026-10-22-c"]

    def test_marker_older_than_signup_does_not_lower_the_cutoff(self):
        es = [_e("2026-10-20", "a"), _e("2026-10-22", "b")]
        out = compute_unseen(
            es, signed_up_on=date(2026, 10, 21), seen_through=date(2026, 10, 1), today=TODAY
        )
        assert _ids(out) == ["2026-10-22-b"]

    def test_two_week_cap(self):
        # Newest entry's week is W = Mon 10-19; W-1 = Mon 10-12; W-2 = Mon 10-05.
        es = [
            _e("2026-10-23", "w0"),
            _e("2026-10-12", "w1-first-day"),
            _e("2026-10-11", "w2-last-day"),
            _e("2026-10-05", "w2"),
        ]
        out = compute_unseen(es, signed_up_on=date(2026, 10, 1), seen_through=None, today=TODAY)
        assert _ids(out) == ["2026-10-23-w0", "2026-10-12-w1-first-day"]

    def test_two_week_cap_follows_newest_live_entry_not_today(self):
        # Nothing published for a month: the newest entry's week still counts as
        # "this week" for the cap, so a returning keeper isn't shown nothing.
        es = [_e("2026-10-06", "old"), _e("2026-10-02", "older")]
        out = compute_unseen(
            es, signed_up_on=date(2026, 10, 1), seen_through=None, today=date(2026, 11, 20)
        )
        assert _ids(out) == ["2026-10-06-old", "2026-10-02-older"]

    def test_future_dated_never_returned_and_does_not_set_the_cap(self):
        es = [_e("2026-11-30", "draft"), _e("2026-10-23", "live"), _e("2026-10-05", "w2")]
        out = compute_unseen(es, signed_up_on=date(2026, 10, 1), seen_through=None, today=TODAY)
        assert _ids(out) == ["2026-10-23-live"]

    def test_dismissed_then_new_week_lands_shows_only_new_week(self):
        es = [_e("2026-10-23", "old-week"), _e("2026-10-27", "new-week")]
        out = compute_unseen(
            es, signed_up_on=date(2026, 10, 1), seen_through=date(2026, 10, 23), today=date(2026, 10, 28)
        )
        assert _ids(out) == ["2026-10-27-new-week"]

    def test_newest_first_with_stable_id_tiebreak(self):
        es = [_e("2026-10-22", "b"), _e("2026-10-23", "b"), _e("2026-10-23", "a")]
        out = compute_unseen(es, signed_up_on=date(2026, 10, 1), seen_through=None, today=TODAY)
        assert _ids(out) == ["2026-10-23-a", "2026-10-23-b", "2026-10-22-b"]

    def test_everything_seen_gives_empty(self):
        es = [_e("2026-10-23")]
        assert compute_unseen(
            es, signed_up_on=date(2026, 10, 1), seen_through=date(2026, 10, 23), today=TODAY
        ) == []


# ----- DB-backed route tests ------------------------------------------------

URL = "/api/v1/whats-new/"
SEEN_URL = "/api/v1/whats-new/seen"
TV, HV = "tarantuverse", "herpetoverse"


@pytest.fixture(autouse=True)
def _fresh_limiter():
    limiter.reset()
    yield
    limiter.reset()


def _feed_fixture():
    return {
        TV: (
            _e("2026-10-23", "tv-new", premium=True, target="expenses"),
            _e("2026-10-20", "tv-mid"),
            _e("2026-10-12", "tv-prev"),
            _e("2026-10-05", "tv-old"),
        ),
        HV: (_e("2026-10-23", "hv-new"),),
    }


@pytest.fixture()
def feed(monkeypatch):
    data = _feed_fixture()
    monkeypatch.setattr(wn_router, "load_feed", lambda: data)
    monkeypatch.setattr(wn_router, "_today", lambda: TODAY)
    return data


def _make_user(db, *, created_at=None, **cols):
    n = uuid.uuid4().hex[:8]
    user = User(
        id=str(uuid.uuid4()),
        email=f"wn-{n}@test.local",
        username=f"wn_{n}",
        hashed_password="x",
        is_active=True,
        is_verified=True,
        created_at=created_at or datetime(2026, 10, 1, 12, tzinfo=timezone.utc),
        **cols,
    )
    db.add(user)
    db.commit()
    return user


def _hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


@pytest.mark.requires_postgres
class TestWhatsNewRoutes:
    def test_get_requires_auth(self, client, feed):
        # No credentials: HTTPBearer answers 403 on this FastAPI version (401 on
        # newer ones); either way the route is closed. A bad token is a plain 401.
        assert client.get(URL, params={"app": TV}).status_code in (401, 403)
        bad = {"Authorization": "Bearer not-a-token"}
        assert client.get(URL, params={"app": TV}, headers=bad).status_code == 401

    def test_post_requires_auth(self, client, feed):
        assert client.post(SEEN_URL, json={"app": TV}).status_code in (401, 403)
        bad = {"Authorization": "Bearer not-a-token"}
        assert client.post(SEEN_URL, json={"app": TV}, headers=bad).status_code == 401

    def test_unseen_and_weeks_shapes(self, client, db_session, feed):
        user = _make_user(db_session)
        r = client.get(URL, params={"app": TV}, headers=_hdr(user))
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"weeks", "unseen"}
        # Two-week cap: tv-old (week of 10-05) is on the page but not the card.
        assert [e["id"] for e in body["unseen"]] == [
            "2026-10-23-tv-new",
            "2026-10-20-tv-mid",
            "2026-10-12-tv-prev",
        ]
        assert body["unseen"][0] == {
            "id": "2026-10-23-tv-new",
            "published_on": "2026-10-23",
            "title": "T tv-new",
            "body": "B tv-new",
            "premium": True,
            "action": {"label": "Go", "target": "expenses"},
        }
        assert body["unseen"][1]["action"] is None
        assert [w["week_of"] for w in body["weeks"]] == ["2026-10-19", "2026-10-12", "2026-10-05"]
        assert [[e["id"] for e in w["entries"]] for w in body["weeks"]] == [
            ["2026-10-23-tv-new", "2026-10-20-tv-mid"],
            ["2026-10-12-tv-prev"],
            ["2026-10-05-tv-old"],
        ]
        assert set(body["weeks"][0]["entries"][0]) == {
            "id", "published_on", "title", "body", "premium", "action",
        }

    def test_signup_mid_week_cutoff(self, client, db_session, feed):
        # Signed up 2026-10-19 (UTC); the 10-12 entry predates signup, 10-20 follows it.
        user = _make_user(db_session, created_at=datetime(2026, 10, 19, 8, tzinfo=timezone.utc))
        body = client.get(URL, params={"app": TV}, headers=_hdr(user)).json()
        assert [e["id"] for e in body["unseen"]] == ["2026-10-23-tv-new", "2026-10-20-tv-mid"]
        # The page still lists everything live.
        assert sum(len(w["entries"]) for w in body["weeks"]) == 4

    def test_signup_uses_utc_date(self, client, db_session, feed):
        # 23:30 on 10-19 in UTC-5 is 04:30 on 10-20 UTC: the 10-20 entry is NOT after signup.
        tz = timezone(timedelta(hours=-5))
        user = _make_user(db_session, created_at=datetime(2026, 10, 19, 23, 30, tzinfo=tz))
        body = client.get(URL, params={"app": TV}, headers=_hdr(user)).json()
        assert [e["id"] for e in body["unseen"]] == ["2026-10-23-tv-new"]

    def test_future_entry_hidden_from_weeks_and_unseen(self, client, db_session, monkeypatch, feed):
        monkeypatch.setitem(feed, TV, (_e("2026-10-30", "draft"), *feed[TV]))
        user = _make_user(db_session)
        body = client.get(URL, params={"app": TV}, headers=_hdr(user)).json()
        every = [e["id"] for w in body["weeks"] for e in w["entries"]] + [e["id"] for e in body["unseen"]]
        assert "2026-10-30-draft" not in every
        assert all(w["week_of"] != "2026-10-26" for w in body["weeks"])

    def test_apps_are_separate(self, client, db_session, feed):
        user = _make_user(db_session)
        h = _hdr(user)
        hv = client.get(URL, params={"app": HV}, headers=h).json()
        assert [e["id"] for e in hv["unseen"]] == ["2026-10-23-hv-new"]
        assert client.post(SEEN_URL, json={"app": TV}, headers=h).json() == {"seen_through": "2026-10-23"}
        tv = client.get(URL, params={"app": TV}, headers=h).json()
        assert tv["unseen"] == []
        hv = client.get(URL, params={"app": HV}, headers=h).json()
        assert [e["id"] for e in hv["unseen"]] == ["2026-10-23-hv-new"]
        db_session.refresh(user)
        assert user.whats_new_seen_tv == date(2026, 10, 23)
        assert user.whats_new_seen_hv is None

    def test_seen_sets_newest_live_date_and_is_idempotent(self, client, db_session, feed):
        user = _make_user(db_session)
        h = _hdr(user)
        for _ in range(2):
            r = client.post(SEEN_URL, json={"app": HV}, headers=h)
            assert r.status_code == 200
            assert r.json() == {"seen_through": "2026-10-23"}
        db_session.refresh(user)
        assert user.whats_new_seen_hv == date(2026, 10, 23)
        assert user.whats_new_seen_tv is None

    def test_seen_ignores_future_dated_entries(self, client, db_session, monkeypatch, feed):
        monkeypatch.setitem(feed, TV, (_e("2026-10-30", "draft"), *feed[TV]))
        user = _make_user(db_session)
        r = client.post(SEEN_URL, json={"app": TV}, headers=_hdr(user))
        assert r.json() == {"seen_through": "2026-10-23"}

    def test_seen_never_moves_backwards(self, client, db_session, feed):
        # Feed edited to drop its newest entry after keepers dismissed it.
        user = _make_user(db_session, whats_new_seen_tv=date(2026, 10, 30))
        r = client.post(SEEN_URL, json={"app": TV}, headers=_hdr(user))
        assert r.json() == {"seen_through": "2026-10-30"}
        db_session.refresh(user)
        assert user.whats_new_seen_tv == date(2026, 10, 30)

    def test_seen_moves_forward_when_feed_is_newer(self, client, db_session, feed):
        user = _make_user(db_session, whats_new_seen_tv=date(2026, 10, 12))
        r = client.post(SEEN_URL, json={"app": TV}, headers=_hdr(user))
        assert r.json() == {"seen_through": "2026-10-23"}

    def test_seen_with_empty_feed_leaves_null(self, client, db_session, monkeypatch, feed):
        monkeypatch.setitem(feed, TV, ())
        user = _make_user(db_session)
        r = client.post(SEEN_URL, json={"app": TV}, headers=_hdr(user))
        assert r.status_code == 200
        assert r.json() == {"seen_through": None}
        db_session.refresh(user)
        assert user.whats_new_seen_tv is None

    def test_dismissed_then_new_week_lands(self, client, db_session, monkeypatch, feed):
        user = _make_user(db_session)
        h = _hdr(user)
        client.post(SEEN_URL, json={"app": TV}, headers=h)
        monkeypatch.setitem(feed, TV, (_e("2026-10-27", "next-week"), *feed[TV]))
        monkeypatch.setattr(wn_router, "_today", lambda: date(2026, 10, 28))
        body = client.get(URL, params={"app": TV}, headers=h).json()
        assert [e["id"] for e in body["unseen"]] == ["2026-10-27-next-week"]

    def test_bad_app_is_422(self, client, db_session, feed):
        user = _make_user(db_session)
        h = _hdr(user)
        assert client.get(URL, params={"app": "android"}, headers=h).status_code == 422
        assert client.get(URL, headers=h).status_code == 422
        assert client.post(SEEN_URL, json={"app": "android"}, headers=h).status_code == 422
        assert client.post(SEEN_URL, json={}, headers=h).status_code == 422

    def test_real_feed_serves_through_the_router(self, client, db_session):
        # No monkeypatching: the committed file passes through the response models.
        user = _make_user(db_session, created_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
        r = client.get(URL, params={"app": TV}, headers=_hdr(user))
        assert r.status_code == 200
        assert isinstance(r.json()["weeks"], list)


def test_router_is_not_a_collection_router():
    # Per-user, non-collection data: plain get_current_user, no @policy tag.
    import inspect

    lines = [ln.strip() for ln in inspect.getsource(wn_router).splitlines()]
    assert not any(ln.startswith("@policy") for ln in lines)
    from tests.test_access_policies import COLLECTION_ROUTERS

    assert "whats_new" not in COLLECTION_ROUTERS
    assert not any(ln.startswith("from __future__") for ln in lines)
    assert any(
        ln == '@limiter.limit("30/minute")' for ln in lines
    )
