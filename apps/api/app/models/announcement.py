"""
Announcement model for admin-managed banners
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from datetime import datetime, timezone
from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=False)
    banner_type = Column(String(20), nullable=False, default="info")  # info, sale, update, coupon
    link_url = Column(String(500), nullable=True)
    link_text = Column(String(100), nullable=True)
    coupon_code = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    priority = Column(Integer, default=0, nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by = relationship("User", foreign_keys=[created_by_id])

    def __repr__(self):
        return f"<Announcement {self.title} - {self.banner_type}>"

    def is_currently_active(self) -> bool:
        """Check if announcement should be shown right now"""
        if not self.is_active:
            return False
        now = datetime.now(timezone.utc)
        if self.starts_at and self.starts_at > now:
            return False
        if self.expires_at and self.expires_at < now:
            return False
        return True
