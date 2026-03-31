"""
System settings model — key/value store for runtime-configurable platform settings.

Categories:
  - feature_flags:  toggle features on/off globally
  - platform_limits: free-tier limits, upload sizes, rate limits
  - maintenance:    maintenance mode, custom messages
  - notifications:  default notification & email settings
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    value_type = Column(
        String(20), nullable=False, server_default="string"
    )  # string | int | float | bool | json
    category = Column(String(50), nullable=False, index=True)
    label = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_sensitive = Column(Boolean, nullable=False, server_default="false")
    updated_by_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_system_settings_category_key", "category", "key"),
    )

    def __repr__(self):
        return f"<SystemSetting {self.key}={self.value}>"
