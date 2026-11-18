"""HV day one, Task 1: one push address per (account, app), and every
notification goes to the right app.

Tarantuverse and Herpetoverse are different Expo projects, so a token from one
can't show a notification in the other. Before this change both apps wrote the
same `notification_preferences.expo_push_token` and overwrote each other.

- `push_tokens` holds one row per (user, app); register without `app` = TV.
- `create_notification(app=...)` picks that app's address, else the other
  app's, else the legacy column (spec §5 call 3/4/12, §6).
- Social (DM, follow, forum) = tarantuverse; sitter/transfer/co-keeper
  notifications follow the app they concern.
- The migration attributes existing addresses: HV animals and no inverts ->
  herpetoverse, everything else -> tarantuverse.
"""
import ast
import importlib.util
import pathlib
import uuid
from types import SimpleNamespace as NS

import pytest

from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.services import digest_service, notification_service
from app.services.digest_service import run_feeding_digests
from app.services.notification_service import create_notification
from app.utils.auth import create_access_token

API = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = API / "alembic" / "versions" / "pta_20261118_push_tokens_per_app.py"

TV = "ExponentPushToken[tv-device]"
HV = "ExponentPushToken[hv-device]"


def mk_user(db):
    tag = uuid.uuid4().hex[:8]
    u = User(id=uuid.uuid4(), email=f"pt-{tag}@test.local", username=f"pt_{tag}",
             is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def register(client, user, token, app=None):
    body = {"token": token, "tz_offset_minutes": 0}
    if app is not None:
        body["app"] = app
    r = client.post("/api/v1/notification-preferences/push-token", json=body, headers=hdr(user))
    assert r.status_code == 200, r.text
    return r.json()


def rows(db, user):
    from app.models.push_token import PushToken
    return {r.app: r.token for r in db.query(PushToken).filter(PushToken.user_id == user.id).all()}


def prefs_of(db, user):
    db.expire_all()
    return db.query(NotificationPreferences).filter(NotificationPreferences.user_id == user.id).first()


@pytest.fixture()
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(notification_service.PushNotificationService, "send_notification",
                        staticmethod(lambda **kw: sent.append(kw)))
    return sent


def sent_to(pushes):
    return [p["expo_push_token"] for p in pushes]


def load_migration():
    spec = importlib.util.spec_from_file_location("pta_migration", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def snake(client, user, name="Monty"):
    r = client.post("/api/v1/animals/", json={"name": name, "taxon": "snake", "scientific_name": "Python regius"},
                    headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def spider(client, user, name="Rosie"):
    r = client.post("/api/v1/inverts/", json={"taxon": "tarantula", "name": name}, headers=hdr(user))
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── registering ──────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_register_per_app_stores_two_rows(client, db_session):
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    register(client, u, TV, app="tarantuverse")
    assert rows(db_session, u) == {"herpetoverse": HV, "tarantuverse": TV}
    # The legacy column is TV's only: an HV registration never overwrites it.
    assert prefs_of(db_session, u).expo_push_token == TV
    register(client, u, "ExponentPushToken[hv-new]", app="herpetoverse")
    assert rows(db_session, u) == {"herpetoverse": "ExponentPushToken[hv-new]", "tarantuverse": TV}
    assert prefs_of(db_session, u).expo_push_token == TV


@pytest.mark.requires_postgres
def test_register_without_app_is_tarantuverse(client, db_session):
    u = mk_user(db_session)
    body = register(client, u, TV)
    assert rows(db_session, u) == {"tarantuverse": TV}
    assert body["expo_push_token"] == TV  # GET/POST responses keep the legacy field


@pytest.mark.requires_postgres
def test_register_rejects_unknown_app(client, db_session):
    u = mk_user(db_session)
    r = client.post("/api/v1/notification-preferences/push-token",
                    json={"token": TV, "app": "reptiverse"}, headers=hdr(u))
    assert r.status_code == 422


@pytest.mark.requires_postgres
def test_delete_with_app_clears_only_that_app(client, db_session):
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    register(client, u, TV, app="tarantuverse")
    r = client.delete("/api/v1/notification-preferences/push-token?app=herpetoverse", headers=hdr(u))
    assert r.status_code == 204
    assert rows(db_session, u) == {"tarantuverse": TV}
    assert prefs_of(db_session, u).expo_push_token == TV

    r = client.delete("/api/v1/notification-preferences/push-token", headers=hdr(u))  # no app = TV
    assert r.status_code == 204
    assert rows(db_session, u) == {}
    assert prefs_of(db_session, u).expo_push_token is None


@pytest.mark.requires_postgres
def test_put_expo_push_token_is_a_tarantuverse_write(client, db_session):
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    r = client.put("/api/v1/notification-preferences/", json={"expo_push_token": TV}, headers=hdr(u))
    assert r.status_code == 200, r.text
    assert rows(db_session, u) == {"herpetoverse": HV, "tarantuverse": TV}


# ── sending ──────────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_notification_goes_to_its_apps_address(client, db_session, pushes):
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    register(client, u, TV, app="tarantuverse")

    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        body="1 animal is due for feeding.", deeplink="/feeding-day", app="herpetoverse")
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        body="1 animal is due for feeding.", deeplink="/feeding-day", app="tarantuverse")
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        body="1 animal is due for feeding.", deeplink="/feeding-day")  # None = TV
    assert sent_to(pushes) == [HV, TV, TV]


@pytest.mark.requires_postgres
def test_falls_back_to_the_other_apps_address(client, db_session, pushes):
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        deeplink="/feeding-day", app="tarantuverse")
    assert sent_to(pushes) == [HV]

    v = mk_user(db_session)
    register(client, v, TV, app="tarantuverse")
    create_notification(db_session, user_id=v.id, type="feeding_digest", title="Feeding day",
                        deeplink="/feeding-day", app="herpetoverse")
    assert sent_to(pushes) == [HV, TV]


@pytest.mark.requires_postgres
def test_legacy_column_is_the_last_fallback(db_session, pushes):
    from app.services.notification_prefs import ensure_notification_preferences
    u = mk_user(db_session)
    prefs = ensure_notification_preferences(db_session, u.id)
    prefs.expo_push_token = "ExponentPushToken[legacy]"
    db_session.commit()
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        deeplink="/feeding-day", app="herpetoverse")
    assert sent_to(pushes) == ["ExponentPushToken[legacy]"]


@pytest.mark.requires_postgres
def test_no_address_no_push(db_session, pushes):
    u = mk_user(db_session)
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        deeplink="/feeding-day", app="herpetoverse")
    assert pushes == []


@pytest.mark.requires_postgres
def test_direct_message_and_follow_go_to_tarantuverse(client, db_session, pushes):
    sender, keeper = mk_user(db_session), mk_user(db_session)
    # HV registers last, so a single shared address would now be HV's.
    register(client, keeper, TV, app="tarantuverse")
    register(client, keeper, HV, app="herpetoverse")

    r = client.post("/api/v1/messages/direct/send",
                    json={"recipient_username": keeper.username, "content": "hi"}, headers=hdr(sender))
    assert r.status_code == 200, r.text
    r = client.post(f"/api/v1/follows/{keeper.username}", headers=hdr(sender))
    assert r.status_code == 200, r.text

    assert [(p["data"]["type"], p["expo_push_token"]) for p in pushes] == [
        ("direct_message", TV), ("new_follower", TV)]


def _app_kw(call: ast.Call):
    for kw in call.keywords:
        if kw.arg == "app":
            return kw.value
    return None


def _calls(path: pathlib.Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            name = f.id if isinstance(f, ast.Name) else getattr(f, "attr", None)
            if name == "create_notification":
                out.append(node)
    return out


def test_social_notifications_name_tarantuverse():
    for mod in ("direct_messages", "follows", "forums"):
        calls = _calls(API / "app" / "routers" / f"{mod}.py")
        assert calls, mod
        for c in calls:
            v = _app_kw(c)
            assert isinstance(v, ast.Constant) and v.value == "tarantuverse", f"{mod}.py:{c.lineno}"


def test_transfer_notifications_name_their_app():
    calls = _calls(API / "app" / "routers" / "transfers.py")
    apps = sorted(_app_kw(c).value for c in calls if isinstance(_app_kw(c), ast.Constant))
    assert len(calls) == 3
    # animal claim -> herpetoverse; colony + invert claims -> tarantuverse
    assert apps == ["herpetoverse", "tarantuverse", "tarantuverse"]


def test_every_caller_names_an_app():
    """A new notification must say which app it belongs to. The digest is the
    one exception until Task 3 splits it per app (default = tarantuverse)."""
    missing = []
    for path in sorted((API / "app").rglob("*.py")):
        if path.name in ("notification_service.py", "digest_service.py"):
            continue
        for c in _calls(path):
            if _app_kw(c) is None:
                missing.append(f"{path.relative_to(API)}:{c.lineno}")
    assert missing == []


# ── sitter and co-keeper notifications follow their app ──────────────────────

class _Q:
    def filter(self, *a, **k):
        return self

    def first(self):
        return None


class _DB:
    def query(self, *a, **k):
        return _Q()

    def rollback(self):
        pass


def _pass(app):
    return NS(id=uuid.uuid4(), owner_user_id=uuid.uuid4(), app=app, label="Sam")


def test_sitter_notifications_follow_the_pass_app(monkeypatch):
    from app.routers import sitter_passes as sp
    sent = []
    monkeypatch.setattr(notification_service, "create_notification", lambda db, **kw: sent.append(kw))
    target = NS(name="Monty", feeding_paused_reason=None)
    for app in ("herpetoverse", "tarantuverse"):
        sp._notify_sitter_log(_DB(), _pass(app), target, True)
        sp._notify_fed_while_paused(_DB(), _pass(app), target)
        sp._notify_locked(_DB(), _pass(app))
    assert [kw["app"] for kw in sent] == ["herpetoverse"] * 3 + ["tarantuverse"] * 3


def test_collection_member_notifications_follow_the_membership_app(monkeypatch):
    from app.routers import collection_members as cm
    sent = []
    monkeypatch.setattr(notification_service, "create_notification", lambda db, **kw: sent.append(kw))
    cm._notify(_DB(), uuid.uuid4(), "collection_member_left", "t", "b", {"app": "herpetoverse"}, app="herpetoverse")
    cm._notify(_DB(), uuid.uuid4(), "collection_member_left", "t", "b", {"app": "tarantuverse"}, app="tarantuverse")
    assert [kw["app"] for kw in sent] == ["herpetoverse", "tarantuverse"]


@pytest.mark.requires_postgres
def test_sitter_log_on_hv_pass_pushes_to_hv(client, db_session, pushes):
    from app.routers import sitter_passes as sp
    u = mk_user(db_session)
    register(client, u, HV, app="herpetoverse")
    register(client, u, TV, app="tarantuverse")
    p = NS(id=uuid.uuid4(), owner_user_id=u.id, app="herpetoverse", label="Sam")
    sp._notify_sitter_log(db_session, p, NS(name="Monty"), True)
    assert sent_to(pushes) == [HV]


# ── migration attribution ────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_migration_attributes_existing_addresses(client, db_session):
    from app.services.notification_prefs import ensure_notification_preferences

    hv_only, tv_only, both, empty = (mk_user(db_session) for _ in range(4))
    snake(client, hv_only)
    spider(client, tv_only)
    snake(client, both)
    spider(client, both)
    tokens = {}
    for u in (hv_only, tv_only, both, empty):
        tokens[u.id] = f"ExponentPushToken[{u.username}]"
        ensure_notification_preferences(db_session, u.id).expo_push_token = tokens[u.id]
    db_session.commit()

    load_migration().copy_legacy_tokens(db_session.connection())
    db_session.expire_all()

    assert rows(db_session, hv_only) == {"herpetoverse": tokens[hv_only.id]}
    assert rows(db_session, tv_only) == {"tarantuverse": tokens[tv_only.id]}
    assert rows(db_session, both) == {"tarantuverse": tokens[both.id]}
    assert rows(db_session, empty) == {"tarantuverse": tokens[empty.id]}

    # Running it again changes nothing (ON CONFLICT DO NOTHING).
    load_migration().copy_legacy_tokens(db_session.connection())
    assert rows(db_session, hv_only) == {"herpetoverse": tokens[hv_only.id]}


@pytest.mark.requires_postgres
def test_old_client_without_app_still_reaches_hv_only_keeper(client, db_session, monkeypatch, pushes):
    """Review focus 2: an HV app from before its OTA re-registers without `app`
    (so it lands as tarantuverse). An HV-only keeper must still get HV reminders."""
    from app.services.notification_prefs import ensure_notification_preferences

    u = mk_user(db_session)
    snake(client, u)
    ensure_notification_preferences(db_session, u.id).expo_push_token = HV
    db_session.commit()
    load_migration().copy_legacy_tokens(db_session.connection())
    db_session.expire_all()
    assert rows(db_session, u) == {"herpetoverse": HV}

    # The HV address goes away, then the old HV build registers without `app`.
    r = client.delete("/api/v1/notification-preferences/push-token?app=herpetoverse", headers=hdr(u))
    assert r.status_code == 204
    register(client, u, HV)
    assert rows(db_session, u) == {"tarantuverse": HV}

    # The digest (HV animal due) still reaches that phone ...
    # (Task 3: the digest reads the HV due animals themselves, not a count.)
    # (Step 2: the switches are on for this new account, so the one due HV
    # animal gets a per-animal push, which needs the row's id and meal fields.)
    monkeypatch.setattr(digest_service, "_animal_overdue_items",
                        lambda db, uid, tz: [NS(id=uuid.uuid4(), name="Monty", common_name=None,
                                                scientific_name=None, last_feeding_date=None,
                                                last_offered_date=None, days_since_last_feeding=None)])
    out = run_feeding_digests(db_session, only_user_id=str(u.id), ignore_schedule=True)
    assert out["sent"] == 1
    # ... and so does an HV-addressed notification.
    create_notification(db_session, user_id=u.id, type="feeding_digest", title="Feeding day",
                        deeplink="/feeding-day", app="herpetoverse")
    assert sent_to(pushes) == [HV, HV]


# ── merging case-duplicate accounts keeps one address per app ────────────────

@pytest.mark.requires_postgres
def test_merge_moves_push_addresses_and_keeps_the_keepers_per_app(db_session, tmp_path):
    """merge_case_duplicate_accounts.py aborts a pair when the spare has rows in
    a table it doesn't know, so push_tokens needs a rule: (user_id, app) is
    unique -> the spare's address moves unless the keeper has one for that app."""
    import json
    import merge_case_duplicate_accounts as mg
    from app.models.push_token import PushToken
    from tests.test_merge_case_duplicate_accounts import HASH_A, HASH_B, Scene

    scene = Scene(db_session)
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 5)
    scene.add(PushToken(user_id=keeper.id, app="tarantuverse", token=TV),
              PushToken(user_id=spare.id, app="tarantuverse", token="ExponentPushToken[spare-tv]"),
              PushToken(user_id=spare.id, app="herpetoverse", token=HV))
    backup = tmp_path / "b.json"
    result, _out = scene.run(apply=True, backup=str(backup))
    assert scene.plan_for(result, keeper).status == "ok"
    db_session.expire_all()
    assert rows(db_session, keeper) == {"tarantuverse": TV, "herpetoverse": HV}
    assert rows(db_session, spare) == {}
    dropped = json.loads(backup.read_text())["groups"][0]["dropped"]
    assert [(d["table"], d["row"]["token"]) for d in dropped] == [("push_tokens", "ExponentPushToken[spare-tv]")]
