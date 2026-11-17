"""Forums paused switch (spec 2026-11-17, Task 1).

Flag `feature.forums_enabled` OFF: every forum + legacy board write -> 403
`forums_paused` with nothing stored, every read -> 404, admins unaffected,
direct messages untouched. Flag ON: behaviour as before.
"""
import ast
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app.models.forum import ForumCategory, ForumPost, ForumThread
from app.models.message import Message
from app.models.message_reply import MessageReply
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.services import settings_service
from app.utils.auth import create_access_token, get_password_hash

pytestmark = pytest.mark.requires_postgres

KEY = "feature.forums_enabled"
ROUTERS = Path(__file__).resolve().parents[1] / "app" / "routers"


def set_flag(db, on: bool):
    row = db.query(SystemSetting).filter(SystemSetting.key == KEY).first()
    if row is None:
        row = SystemSetting(key=KEY, value="true", value_type="bool",
                            category="feature_flags", label="Forums")
        db.add(row)
    row.value = "true" if on else "false"
    db.commit()
    settings_service.invalidate_cache()
    # The maintenance middleware reads settings through its own connection, which
    # can't see this test's uncommitted transaction; load the cache from the test
    # session so every reader in the request sees the value set here.
    settings_service._load_cache(db)


@pytest.fixture(autouse=True)
def _reset_cache():
    settings_service.invalidate_cache()
    yield
    settings_service.invalidate_cache()


def make_user(db, **flags):
    u = User(
        id=str(uuid.uuid4()),
        email=f"fp-{uuid.uuid4().hex[:8]}@test.local",
        username=f"fp_{uuid.uuid4().hex[:8]}",
        hashed_password=get_password_hash("TestPass1!"),
        is_active=True,
        is_verified=True,
        created_at=datetime.utcnow() - timedelta(days=30),
        **flags,
    )
    db.add(u)
    db.commit()
    return u


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


@pytest.fixture()
def keeper(db_session):
    return make_user(db_session)


@pytest.fixture()
def admin(db_session):
    return make_user(db_session, is_admin=True)


@pytest.fixture()
def seeded(db_session, keeper):
    """A category, a thread with a post, a board message with a reply."""
    cat = ForumCategory(name="General", slug=f"general-{uuid.uuid4().hex[:6]}", display_order=1)
    db_session.add(cat)
    db_session.commit()
    thread = ForumThread(category_id=cat.id, author_id=keeper.id, title="Hello",
                         slug="hello", post_count=1)
    db_session.add(thread)
    db_session.commit()
    post = ForumPost(thread_id=thread.id, author_id=keeper.id, content="First")
    db_session.add(post)
    msg = Message(user_id=str(keeper.id), title="Board", content="Board post")
    db_session.add(msg)
    db_session.commit()
    reply = MessageReply(message_id=msg.id, user_id=str(keeper.id), content="Reply")
    db_session.add(reply)
    db_session.commit()
    return {"cat": cat, "thread": thread, "post": post, "msg": msg, "reply": reply}


def counts(db):
    db.expire_all()
    return (
        db.query(ForumCategory).count(), db.query(ForumThread).count(),
        db.query(ForumPost).count(), db.query(Message).count(),
        db.query(MessageReply).count(),
    )


# ── status ───────────────────────────────────────────────────────────────────

def test_status_reports_forum_flag(client, db_session):
    set_flag(db_session, True)
    assert client.get("/api/v1/system/status").json()["features"]["forums_enabled"] is True
    set_flag(db_session, False)
    assert client.get("/api/v1/system/status").json()["features"]["forums_enabled"] is False


# ── flag on ──────────────────────────────────────────────────────────────────

def test_flag_on_changes_nothing(client, db_session, keeper, seeded):
    set_flag(db_session, True)
    h = headers(keeper)
    assert client.get("/api/v1/forums/categories").status_code == 200
    r = client.post("/api/v1/forums/threads", headers=h, json={
        "title": "New thread", "category_id": seeded["cat"].id, "content": "Body text for a thread"})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    r = client.post(f"/api/v1/forums/threads/{tid}/posts", headers=h, json={"content": "A reply long enough"})
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/messages/", headers=h, json={"title": "T", "content": "C"})
    assert r.status_code == 201, r.text


# ── paused ───────────────────────────────────────────────────────────────────

def paused_writes(s):
    cid, tid, pid = s["cat"].id, s["thread"].id, s["post"].id
    mid, rid = s["msg"].id, s["reply"].id
    F, M = "/api/v1/forums", "/api/v1/messages"
    return [
        ("post", f"{F}/threads", {"title": "x", "category_id": cid, "content": "Some thread body"}),
        ("patch", f"{F}/threads/{tid}", {"title": "changed"}),
        ("delete", f"{F}/threads/{tid}", None),
        ("post", f"{F}/threads/{tid}/posts", {"content": "A reply long enough"}),
        ("patch", f"{F}/posts/{pid}", {"content": "edited"}),
        ("delete", f"{F}/posts/{pid}", None),
        ("post", f"{F}/categories", {"name": "N", "slug": "n-new"}),
        ("patch", f"{F}/categories/{cid}", {"name": "Renamed"}),
        ("delete", f"{F}/categories/{cid}", None),
        ("post", f"{M}/", {"title": "t", "content": "c"}),
        ("put", f"{M}/{mid}", {"title": "changed"}),
        ("delete", f"{M}/{mid}", None),
        ("post", f"{M}/{mid}/replies", {"content": "r"}),
        ("delete", f"{M}/replies/{rid}", None),
        ("post", f"{M}/{mid}/likes", None),
        ("post", f"{M}/{mid}/reactions", {"emoji": "x"}),
    ]


def test_paused_refuses_every_write(client, db_session, keeper, seeded):
    set_flag(db_session, False)
    before = counts(db_session)
    snapshot = (seeded["thread"].title, seeded["post"].content, seeded["msg"].title)
    for method, url, body in paused_writes(seeded):
        kw = {"headers": headers(keeper)}
        if body is not None:
            kw["json"] = body
        r = getattr(client, method)(url, **kw)
        assert r.status_code == 403, f"{method} {url} -> {r.status_code} {r.text}"
        assert r.json() == {"detail": "Forums are paused.", "code": "forums_paused"}, f"{method} {url}"
    assert counts(db_session) == before
    db_session.expire_all()
    assert (seeded["thread"].title, seeded["post"].content, seeded["msg"].title) == snapshot
    assert db_session.query(Message).filter(Message.id == seeded["msg"].id).one().id


def paused_reads(s):
    F, M = "/api/v1/forums", "/api/v1/messages"
    return [
        f"{F}/categories", f"{F}/categories/{s['cat'].slug}",
        f"{F}/categories/{s['cat'].slug}/threads", f"{F}/threads/{s['thread'].id}",
        f"{F}/threads/{s['thread'].id}/posts",
        f"{M}/", f"{M}/{s['msg'].id}", f"{M}/{s['msg'].id}/replies",
    ]


def test_paused_hides_reads(client, db_session, keeper, seeded):
    set_flag(db_session, False)
    views_before = seeded["thread"].view_count
    for url in paused_reads(seeded):
        assert client.get(url).status_code == 404, f"anon {url}"
        assert client.get(url, headers=headers(keeper)).status_code == 404, f"keeper {url}"
    db_session.expire_all()
    assert seeded["thread"].view_count == views_before


def test_admin_unaffected_when_paused(client, db_session, admin, seeded):
    set_flag(db_session, False)
    h = headers(admin)
    for url in paused_reads(seeded):
        assert client.get(url, headers=h).status_code == 200, url
    r = client.post("/api/v1/forums/threads", headers=h, json={
        "title": "Admin thread", "category_id": seeded["cat"].id, "content": "Admin thread body"})
    assert r.status_code == 200, r.text  # route has no status_code override: 200
    r = client.post("/api/v1/forums/categories", headers=h, json={"name": "Mod", "slug": "mod-cat"})
    assert r.status_code == 200, r.text


def test_superuser_counts_as_admin(client, db_session, seeded):
    su = make_user(db_session, is_superuser=True)
    set_flag(db_session, False)
    assert client.get("/api/v1/forums/categories", headers=headers(su)).status_code == 200


# ── static: no route can skip the gate ───────────────────────────────────────

@pytest.mark.parametrize("fname", ["forums.py", "messages.py"])
def test_every_forum_and_board_route_is_gated(fname):
    tree = ast.parse((ROUTERS / fname).read_text(encoding="utf-8"))
    seen = 0
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        methods = [
            d.func.attr for d in node.decorator_list
            if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
            and isinstance(d.func.value, ast.Name) and d.func.value.id == "router"
        ]
        if not methods:
            continue
        seen += 1
        want = "hide_read_if_paused" if methods[0] == "get" else "refuse_write_if_paused"
        calls = [
            (c.func.id, c.lineno) for c in ast.walk(node)
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)
            and c.func.id in ("hide_read_if_paused", "refuse_write_if_paused")
        ]
        assert calls and calls[0][0] == want, f"{fname}::{node.name} must call {want}"
        # first statement after the docstring
        body = [n for n in node.body
                if not (isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant))]
        first = body[0]
        assert isinstance(first, ast.Expr) and isinstance(first.value, ast.Call) \
            and getattr(first.value.func, "id", None) == want, \
            f"{fname}::{node.name}: the gate must be the first statement"
    assert seen == (14 if fname == "forums.py" else 10)


# ── direct messages are not part of the switch ───────────────────────────────

def test_direct_messages_untouched(client, db_session, keeper):
    other = make_user(db_session)
    set_flag(db_session, False)
    r = client.post("/api/v1/messages/direct/send", headers=headers(keeper),
                    json={"recipient_username": other.username, "content": "hi"})
    assert r.status_code == 200, r.text
    r = client.get("/api/v1/messages/direct/unread-count", headers=headers(other))
    assert r.status_code == 200, r.text
