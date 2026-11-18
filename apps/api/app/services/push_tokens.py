"""Push addresses per app (HV day one, spec 2026-11-17 §5 calls 3, 4, 12; §6).

One address per (account, app) in `push_tokens`. The rules:

- Registering without an app means Tarantuverse (old clients; the TV app sent
  its token first, and an HV build from before its OTA lands here too).
- Sending picks the notification's app; if the account only has the other
  app's address, that one is used (an old HV build that registered as TV still
  gets its HV reminders); else the legacy `notification_preferences.
  expo_push_token`; else nothing.
- The legacy column keeps being written for Tarantuverse registrations, so the
  prefs GET response and anything still reading it keep working.

Every write here flushes; the caller owns the commit.
"""
from typing import Any, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.models.notification_preferences import NotificationPreferences
from app.models.push_token import PUSH_APPS, PushToken

DEFAULT_APP = "tarantuverse"


def normalize_app(app: Optional[str]) -> str:
    """None means Tarantuverse. Anything outside PUSH_APPS is a bug upstream."""
    if app is None:
        return DEFAULT_APP
    if app not in PUSH_APPS:
        raise ValueError(f"unknown app {app!r}")
    return app


def _other(app: str) -> str:
    return "herpetoverse" if app == "tarantuverse" else "tarantuverse"


def _row_token(db: Session, user_id, app: str) -> Optional[str]:
    row = (
        db.query(PushToken)
        .filter(PushToken.user_id == user_id, PushToken.app == app)
        .first()
    )
    # getattr: some unit tests hand create_notification a fake session whose
    # every query returns the prefs object, which has no `token`.
    return getattr(row, "token", None) or None


def push_token_for(db: Session, user_id, app: Optional[str], prefs: Any = None) -> Optional[str]:
    """The address a notification for `app` goes to, or None.

    Own app's address, else the other app's, else the legacy column. `prefs`
    may be passed when the caller already loaded the row.
    """
    app = normalize_app(app)
    token = _row_token(db, user_id, app) or _row_token(db, user_id, _other(app))
    if token:
        return token
    if prefs is None:
        prefs = (
            db.query(NotificationPreferences)
            .filter(NotificationPreferences.user_id == user_id)
            .first()
        )
    return getattr(prefs, "expo_push_token", None) or None


def set_push_token(db: Session, user_id, app: Optional[str], token: str) -> None:
    """Store `token` as this account's address for `app` (insert or replace).

    The account's OTHER app row holding the very same token is removed: an
    Expo token belongs to one app install, so it can't be both apps' address.
    That is the HV build from before its OTA, which registered without `app`
    and left the HV phone's token under tarantuverse; once it registers as
    herpetoverse, the stale tarantuverse copy goes. Other accounts are never
    touched.

    A Tarantuverse registration also writes the legacy column.
    """
    app = normalize_app(app)
    db.query(PushToken).filter(
        PushToken.user_id == user_id,
        PushToken.app == _other(app),
        PushToken.token == token,
    ).delete(synchronize_session=False)
    stmt = pg_insert(PushToken.__table__).values(user_id=user_id, app=app, token=token)
    db.execute(
        stmt.on_conflict_do_update(
            constraint="uq_push_tokens_user_app",
            set_={"token": stmt.excluded.token, "updated_at": func.now()},
        )
    )
    if app == DEFAULT_APP:
        from app.services.notification_prefs import ensure_notification_preferences

        ensure_notification_preferences(db, user_id).expo_push_token = token
    db.flush()


def clear_push_token(db: Session, user_id, app: Optional[str]) -> None:
    """Forget this account's address for `app`.

    Tarantuverse also clears the legacy column (as the DELETE route always
    did). Herpetoverse clears it only when it holds the same address, so an HV
    sign-out can't leave the phone reachable through the fallback.
    """
    app = normalize_app(app)
    row = (
        db.query(PushToken)
        .filter(PushToken.user_id == user_id, PushToken.app == app)
        .first()
    )
    removed = row.token if row is not None else None
    if row is not None:
        db.delete(row)
    prefs = (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.user_id == user_id)
        .first()
    )
    if prefs is not None and prefs.expo_push_token is not None:
        if app == DEFAULT_APP or prefs.expo_push_token == removed:
            prefs.expo_push_token = None
    db.flush()
