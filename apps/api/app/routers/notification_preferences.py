"""
Notification preferences routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.notification_preferences import NotificationPreferences
from app.schemas.notification_preferences import (
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    NotificationPreferencesBase
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/notification-preferences", tags=["notification-preferences"])


@router.get("/", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's notification preferences (creates default if doesn't exist)"""
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    # Create default preferences if they don't exist
    if not prefs:
        prefs = NotificationPreferences(
            user_id=current_user.id,
            feeding_reminders_enabled=True,
            feeding_reminder_hours=24,
            substrate_reminders_enabled=True,
            substrate_reminder_days=90,
            molt_predictions_enabled=True,
            maintenance_reminders_enabled=True,
            maintenance_reminder_days=30,
            push_notifications_enabled=True,
            direct_messages_enabled=True,
            forum_replies_enabled=True,
            new_followers_enabled=True,
            community_activity_enabled=False,
            quiet_hours_enabled=False,
            quiet_hours_start="22:00",
            quiet_hours_end="08:00"
        )
        db.add(prefs)
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
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    # Create if doesn't exist
    if not prefs:
        prefs = NotificationPreferences(user_id=current_user.id)
        db.add(prefs)

    # Update fields that were provided
    update_data = preferences.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return prefs


@router.post("/push-token", response_model=NotificationPreferencesResponse)
async def update_push_token(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update Expo push notification token"""
    prefs = db.query(NotificationPreferences).filter(
        NotificationPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = NotificationPreferences(user_id=current_user.id)
        db.add(prefs)

    prefs.expo_push_token = token
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
