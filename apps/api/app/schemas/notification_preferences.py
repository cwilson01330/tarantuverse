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

    # Feeder colony low-stock local notification
    feeder_low_stock_enabled: bool = True

    # Push Notifications (future)
    push_notifications_enabled: bool = True
    direct_messages_enabled: bool = True
    forum_replies_enabled: bool = True
    new_followers_enabled: bool = True
    community_activity_enabled: bool = False
    sitter_activity_enabled: bool = True

    # Quiet hours (enforced server-side on every push, on the keeper's clock)
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = Field("22:00", pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")
    quiet_hours_end: str = Field("08:00", pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")

    # Daily feeding digest (services/digest_service.py) — the one animal-care
    # reminder the server actually sends. Optional on the response so a row
    # written before these existed still serializes.
    daily_digest_enabled: Optional[bool] = True
    digest_hour: Optional[int] = 9  # keeper's local hour, 0-23
    tz_offset_minutes: Optional[int] = None  # JS getTimezoneOffset(); positive = west of UTC


# Columns that are NOT NULL in the table (plus tz_offset_minutes, which nothing
# should clear: the digest would fall back to UTC). An explicit null from a
# client is ignored rather than turned into a 500 or a silent timezone loss.
NON_NULLABLE_FIELDS = frozenset({
    "daily_digest_enabled", "digest_hour", "tz_offset_minutes",
    "feeder_low_stock_enabled", "sitter_activity_enabled",
})


class NotificationPreferencesUpdate(BaseModel):
    """Schema for updating notification preferences (all fields optional)"""
    feeding_reminders_enabled: Optional[bool] = None
    feeding_reminder_hours: Optional[int] = Field(None, ge=1, le=168)

    substrate_reminders_enabled: Optional[bool] = None
    substrate_reminder_days: Optional[int] = Field(None, ge=1, le=365)

    molt_predictions_enabled: Optional[bool] = None

    maintenance_reminders_enabled: Optional[bool] = None
    maintenance_reminder_days: Optional[int] = Field(None, ge=1, le=365)

    feeder_low_stock_enabled: Optional[bool] = None

    push_notifications_enabled: Optional[bool] = None
    direct_messages_enabled: Optional[bool] = None
    forum_replies_enabled: Optional[bool] = None
    new_followers_enabled: Optional[bool] = None
    community_activity_enabled: Optional[bool] = None
    sitter_activity_enabled: Optional[bool] = None

    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(None, pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")
    quiet_hours_end: Optional[str] = Field(None, pattern=r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$")

    daily_digest_enabled: Optional[bool] = None
    digest_hour: Optional[int] = Field(None, ge=0, le=23)
    # Sent alongside digest_hour so "9 AM" means 9 AM where the keeper is.
    # Real offsets run from -14:00 to +12:00.
    tz_offset_minutes: Optional[int] = Field(None, ge=-840, le=720)

    expo_push_token: Optional[str] = None


class NotificationPreferencesResponse(NotificationPreferencesBase):
    """Schema for notification preferences response"""
    id: uuid.UUID
    user_id: uuid.UUID
    expo_push_token: Optional[str] = None

    class Config:
        from_attributes = True
