"""
Content report model - for reporting objectionable content
"""
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum
from app.database import Base


class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    REVIEWING = "reviewing"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReportType(str, enum.Enum):
    FORUM_POST = "forum_post"
    FORUM_REPLY = "forum_reply"
    DIRECT_MESSAGE = "direct_message"
    USER_PROFILE = "user_profile"
    TARANTULA_LISTING = "tarantula_listing"
    OTHER = "other"


class ContentReport(Base):
    __tablename__ = "content_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Content identification
    report_type = Column(SQLEnum(ReportType), nullable=False, index=True)
    content_id = Column(String(255), nullable=False, index=True)  # ID of the reported content (forum post, message, etc.)
    content_url = Column(String(500), nullable=True)  # Optional URL to the content

    # Report details
    reason = Column(String(100), nullable=False)  # Category: harassment, spam, illegal, etc.
    description = Column(Text, nullable=True)  # Additional details from reporter
    status = Column(SQLEnum(ReportStatus), nullable=False, default=ReportStatus.PENDING, index=True)

    # Moderation
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    moderation_notes = Column(Text, nullable=True)
    action_taken = Column(String(255), nullable=True)  # "content_removed", "user_warned", "user_banned", etc.

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ContentReport {self.id} - {self.report_type} - {self.status}>"
