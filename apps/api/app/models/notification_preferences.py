"""
Notification preferences model
"""
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from ..database import Base


class NotificationPreferences(Base):
    """User notification preferences"""
    __tablename__ = "notification_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Local Notifications (scheduled on device)
    feeding_reminders_enabled = Column(Boolean, default=True)
    feeding_reminder_hours = Column(Integer, default=24)  # Hours after last feeding to remind

    substrate_reminders_enabled = Column(Boolean, default=True)
    substrate_reminder_days = Column(Integer, default=90)  # Days after last substrate change

    molt_predictions_enabled = Column(Boolean, default=True)

    maintenance_reminders_enabled = Column(Boolean, default=True)
    maintenance_reminder_days = Column(Integer, default=30)

    # Push Notifications (future - server sent)
    push_notifications_enabled = Column(Boolean, default=True)
    direct_messages_enabled = Column(Boolean, default=True)
    forum_replies_enabled = Column(Boolean, default=True)
    new_followers_enabled = Column(Boolean, default=True)
    community_activity_enabled = Column(Boolean, default=False)

    # Quiet hours
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String(5), default="22:00")  # Format: "HH:MM"
    quiet_hours_end = Column(String(5), default="08:00")

    # Expo push token (for push notifications)
    expo_push_token = Column(String(255), nullable=True)

    # Relationship
    user = relationship("User", back_populates="notification_preferences")
