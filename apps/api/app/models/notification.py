"""
Notification model — the in-app notification center (ADR-009).

One row per notify-worthy event for a user. Written by
`services/notification_service.create_notification`, which is the single
chokepoint; push delivery is an optional side-effect of creating a row, so the
center works even when push can't be delivered yet.
"""
from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid

from ..database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String(50), nullable=False)  # feeding_digest | direct_message | forum_reply | new_follower | community_activity | transfer_claimed | system
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    deeplink = Column(String(500), nullable=True)  # semantic path the client maps by platform
    data = Column(JSONB, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read", "created_at"),
    )

    def __repr__(self):
        return f"<Notification {self.type} u={self.user_id} read={self.is_read}>"
