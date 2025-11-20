"""
Notification preferences schemas
"""
from pydantic import BaseModel, Field
from typing import Optional
import uuid


class NotificationPreferencesBase(BaseModel):
    """Base notification preferences schema"""
    # Local Notifications
    feeding_reminders_enabled: bool = True
    feeding_reminder_hours: int = Field(24, ge=1, le=168)  # 1 hour to 1 week

    substrate_reminders_enabled: bool = True
    substrate_reminder_days: int = Field(90, ge=1, le=365)

    molt_predictions_enabled: bool = True

    maintenance_reminders_enabled: bool = True
    maintenance_reminder_days: int = Field(30, ge=1, le=365)

    # Push Notifications (future)
    push_notifications_enabled: bool = True
    direct_messages_enabled: bool = True
    forum_replies_enabled: bool = True
    new_followers_enabled: bool = True
    community_activity_enabled: bool = False

    # Quiet hours
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = Field("22:00", pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")
    quiet_hours_end: str = Field("08:00", pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")


class NotificationPreferencesUpdate(BaseModel):
    """Schema for updating notification preferences (all fields optional)"""
    feeding_reminders_enabled: Optional[bool] = None
    feeding_reminder_hours: Optional[int] = Field(None, ge=1, le=168)

    substrate_reminders_enabled: Optional[bool] = None
    substrate_reminder_days: Optional[int] = Field(None, ge=1, le=365)

    molt_predictions_enabled: Optional[bool] = None

    maintenance_reminders_enabled: Optional[bool] = None
    maintenance_reminder_days: Optional[int] = Field(None, ge=1, le=365)

    push_notifications_enabled: Optional[bool] = None
    direct_messages_enabled: Optional[bool] = None
    forum_replies_enabled: Optional[bool] = None
    new_followers_enabled: Optional[bool] = None
    community_activity_enabled: Optional[bool] = None

    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(None, pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")
    quiet_hours_end: Optional[str] = Field(None, pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")

    expo_push_token: Optional[str] = None


class NotificationPreferencesResponse(NotificationPreferencesBase):
    """Schema for notification preferences response"""
    id: uuid.UUID
    user_id: uuid.UUID
    expo_push_token: Optional[str] = None

    class Config:
        from_attributes = True
