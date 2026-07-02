"""
In-app notification center endpoints (ADR-009).

Reads the `notifications` table. Independent of push delivery — the center works
even before FCM/APNs are configured.
"""
import os
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse, UnreadCountResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest-first list of the current user's notifications."""
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    return q.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unread notification count — powers the bell badge (replaces DM-only count)."""
    n = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .count()
    )
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


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
    from app.services.digest_service import run_feeding_digests
    return run_feeding_digests(db, only_user_id=test_user_id, ignore_schedule=ignore_schedule)
