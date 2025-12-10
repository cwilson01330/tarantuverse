"""
User block model - for blocking abusive users
"""
from sqlalchemy import Column, String, ForeignKey, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(String(500), nullable=True)  # Optional reason for block
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Composite index for fast lookups
    __table_args__ = (
        Index('ix_blocker_blocked', 'blocker_id', 'blocked_id', unique=True),
    )

    def __repr__(self):
        return f"<UserBlock {self.blocker_id} blocked {self.blocked_id}>"
