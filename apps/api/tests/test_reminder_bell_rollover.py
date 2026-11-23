"""Yesterday's feeding reminders leave the bell when today's arrive (2026-11-23).

Every daily digest writes `feeding_digest` / `feeding_due` rows, and nobody
opens them (0 of ~400 since 2026-11-18), so the unread badge only ever grows
(31 on the owner's own account). Today's run is the current state of what's
due, so before writing it the digest marks that app's OLDER unread reminder
rows read. Only reminder rows, only the same app (Tarantuverse rows are app
NULL/'tarantuverse', Herpetoverse rows 'herpetoverse'), only rows created
before this run; nothing is deleted.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.notification import Notification
from tests.test_reminder_pushes import due_animal, mk_prefs, mk_user, pushes, run  # noqa: F401


def _row(db, user, type_, *, app=None, days_ago=1, read=False):
    n = Notification(
        user_id=user.id, type=type_, title="old", body="old", app=app, is_read=read,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )
    db.add(n)
    db.commit()
    return n


@pytest.mark.requires_postgres
def test_todays_tv_digest_marks_older_tv_reminders_read(client, db_session, pushes):
    u = mk_user(db_session)
    mk_prefs(db_session, u, smart=False)
    due_animal(client, u, "Rosie")
    old_digest = _row(db_session, u, "feeding_digest")
    old_due = _row(db_session, u, "feeding_due", days_ago=2)
    old_tv_tagged = _row(db_session, u, "feeding_digest", app="tarantuverse")
    hv_old = _row(db_session, u, "feeding_digest", app="herpetoverse")
    dm = _row(db_session, u, "direct_message")

    run(db_session, u)

    for n in (old_digest, old_due, old_tv_tagged, hv_old, dm):
        db_session.refresh(n)
    assert old_digest.is_read and old_due.is_read and old_tv_tagged.is_read
    assert not hv_old.is_read, "another app's reminders stay as they are"
    assert not dm.is_read, "only reminder rows roll over"
    unread_tv = [
        n for n in db_session.query(Notification)
        .filter(Notification.user_id == u.id, Notification.is_read.is_(False),
                Notification.type.in_(("feeding_digest", "feeding_due")))
        .all()
        if n.app != "herpetoverse"
    ]
    assert unread_tv, "today's reminder is in the bell"
    assert all(n.title != "old" for n in unread_tv), "only today's Tarantuverse reminder is unread"


@pytest.mark.requires_postgres
def test_nothing_due_leaves_the_bell_alone(client, db_session, pushes):
    u = mk_user(db_session)
    mk_prefs(db_session, u, smart=False)
    old = _row(db_session, u, "feeding_digest")
    run(db_session, u)
    db_session.refresh(old)
    assert not old.is_read, "no new reminder today, so yesterday's is still the latest"


@pytest.mark.requires_postgres
def test_other_keepers_rows_untouched(client, db_session, pushes):
    u = mk_user(db_session)
    other = mk_user(db_session)
    mk_prefs(db_session, u, smart=False)
    due_animal(client, u, "Rosie")
    theirs = _row(db_session, other, "feeding_digest")
    run(db_session, u)
    db_session.refresh(theirs)
    assert not theirs.is_read
