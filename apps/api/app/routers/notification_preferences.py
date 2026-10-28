"""
Notification preferences routes
"""
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.notification_preferences import NotificationPreferences
from app.schemas.notification_preferences import (
    NON_NULLABLE_FIELDS,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationPreferencesBase
)
from app.services.notification_prefs import ensure_notification_preferences
from app.utils.access import policy
from app.utils.dependencies import get_current_user
from app.utils.digest_unsubscribe_token import read_unsubscribe_token
from app.utils.frontend_origin import resolve_frontend_origin
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/notification-preferences", tags=["notification-preferences"])


def update_values(preferences: NotificationPreferencesUpdate) -> dict:
    """The fields a PUT should write: only those the client sent, minus an
    explicit null on a column that can't hold one (see NON_NULLABLE_FIELDS)."""
    return {
        field: value
        for field, value in preferences.model_dump(exclude_unset=True).items()
        if not (value is None and field in NON_NULLABLE_FIELDS)
    }


@router.get("/", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's notification preferences (creates default if doesn't exist)"""
    # Every keeper has a row; create the defaults if this one never got one.
    prefs = ensure_notification_preferences(db, current_user.id)
    db.commit()
    db.refresh(prefs)

    return prefs


@router.put("/", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    preferences: NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update notification preferences"""
    prefs = ensure_notification_preferences(db, current_user.id)

    # Update fields that were provided
    for field, value in update_values(preferences).items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return prefs


from pydantic import BaseModel


class PushTokenBody(BaseModel):
    token: str
    tz_offset_minutes: int | None = None


@router.post("/push-token", response_model=NotificationPreferencesResponse)
async def update_push_token(
    payload: PushTokenBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register the Expo push token (+ device timezone for the daily digest).

    Accepts a JSON body {token, tz_offset_minutes?}. The previous signature took
    `token` as a bare str, which FastAPI treats as a QUERY param — so the app's
    JSON-body registration 422'd and no tokens were ever saved (ADR-009).
    """
    prefs = ensure_notification_preferences(db, current_user.id)

    prefs.expo_push_token = payload.token
    if payload.tz_offset_minutes is not None:
        prefs.tz_offset_minutes = payload.tz_offset_minutes
    db.commit()
    db.refresh(prefs)
    return prefs


@router.delete("/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def delete_push_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove Expo push notification token (e.g., on logout)"""
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    if prefs:
        prefs.expo_push_token = None
        db.commit()

    return None


@router.get("/email-unsubscribe")
@limiter.limit("30/minute")
@policy("public")
async def email_unsubscribe_page(
    request: Request,
    token: str = Query(""),
):
    """GET changes nothing: mail scanners and link prefetchers open every URL in
    an email, so a state-changing GET would unsubscribe people who never asked.
    It sends the browser to the web page, where the keeper confirms and the page
    POSTs. A forged or garbled token is a 404."""
    if read_unsubscribe_token(token) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    origin = resolve_frontend_origin(None)
    return RedirectResponse(
        f"{origin}/unsubscribe/{quote(token, safe='')}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.post("/email-unsubscribe")
@limiter.limit("30/minute")
@policy("public")
async def email_unsubscribe(
    request: Request,
    token: str = Query(""),
    db: Session = Depends(get_db),
):
    """One-click unsubscribe from the daily email digest. No login: the signed
    token (it carries only the user id, never expires) is the whole capability
    and can only switch `email_digest_enabled` off. POST serves both the
    List-Unsubscribe-Post one-click header and the web page's button.

    A forged or garbled token is a 404. A genuine token for an account that is
    gone, or has no preferences row, is a success: unsubscribing is idempotent.
    """
    user_id = read_unsubscribe_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    prefs = (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.user_id == user_id)
        .first()
    )
    if prefs is not None and prefs.email_digest_enabled:
        prefs.email_digest_enabled = False
        db.commit()
    return {"ok": True}
