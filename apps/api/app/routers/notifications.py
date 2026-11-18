"""
In-app notification center endpoints (ADR-009).

Reads the `notifications` table. Independent of push delivery — the center works
even before FCM/APNs are configured.
"""
import logging
import os
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse, UnreadCountResponse
from app.utils.dependencies import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


# Which app's bell is asking. Absent = no filter (every row), which is how every
# build before the per-app bell called these routes; HV store binaries that can
# never receive the OTA keep seeing their HV rows. Current clients send it.
AppParam = Optional[Literal["tarantuverse", "herpetoverse"]]


def _for_app(q, app: AppParam):
    """No `app` = all rows. `tarantuverse` = untagged + TV rows (HV rows stay
    out); `herpetoverse` = untagged + HV rows (hvr_20261118)."""
    if app is None:
        return q
    other = "tarantuverse" if app == "herpetoverse" else "herpetoverse"
    return q.filter(or_(Notification.app.is_(None), Notification.app != other))


@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    app: AppParam = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest-first list of the current user's notifications for `app`."""
    q = _for_app(db.query(Notification).filter(Notification.user_id == current_user.id), app)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    return q.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    app: AppParam = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unread notification count — powers the bell badge (replaces DM-only count)."""
    n = _for_app(
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False)),
        app,
    ).count()
    return {"unread_count": n}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    app: AppParam = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark read what this app's bell lists (the other app's rows stay unread)."""
    _for_app(
        db.query(Notification).filter(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        ),
        app,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dismiss (delete) a single notification."""
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    db.delete(notif)
    db.commit()
    return None


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_notifications(
    app: AppParam = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear (delete) what this app's bell lists; the other app's rows stay."""
    _for_app(
        db.query(Notification).filter(Notification.user_id == current_user.id), app
    ).delete(synchronize_session=False)
    db.commit()
    return None


@router.post("/run-digests")
async def run_digests(
    x_cron_secret: str = Header(None),
    test_user_id: str = Query(None, description="Test: run the digest for just this user id."),
    ignore_schedule: bool = Query(False, description="Test: bypass the hour + already-sent gates."),
    db: Session = Depends(get_db),
):
    """Secret-gated cron entrypoint (Render Cron, hourly): sends the daily
    feeding digest to users whose local digest hour is now. Not user-auth'd —
    guarded by the CRON_SECRET env var via the X-Cron-Secret header.

    Test hooks (still secret-gated): pass ?ignore_schedule=true&test_user_id=<uuid>
    to fire a digest for one user on demand, ignoring the schedule.
    """
    secret = os.environ.get("CRON_SECRET")
    if not secret or x_cron_secret != secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    # Local import avoids any import-time cycle (digest_service imports inverts router).
    from app.services.digest_email import send_digest_emails
    from app.services.digest_service import run_feeding_digests
    result = run_feeding_digests(db, only_user_id=test_user_id, ignore_schedule=ignore_schedule)
    # DigestEmail objects carry addresses: they are sent here and never returned.
    emails = result.pop("emails", [])
    result["emails_sent"] = await send_digest_emails(db, emails)
    # Premolt episodes (premolt v2): its own once-a-UTC-day guard, independent
    # of digest settings. Never allowed to break the digest result.
    # Synchronous DB work over every keeper, so it runs in the threadpool and
    # the single uvicorn worker keeps serving requests meanwhile. `db` is safe
    # to hand over: this handler is suspended on the await and touches the
    # session again only after the pass has returned (one thread at a time).
    try:
        from app.services import premolt_episodes
        result["premolt_episodes"] = await run_in_threadpool(
            premolt_episodes.run_premolt_episodes,
            db, force=ignore_schedule, only_user_id=test_user_id,
        )
    except Exception:
        logger.exception("[premolt] episode pass failed during run-digests")
        result["premolt_episodes"] = {"error": True}
    return result
