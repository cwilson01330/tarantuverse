"""
Activity feed model for tracking user actions
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ActivityFeed(Base):
    __tablename__ = "activity_feed"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(50), nullable=False)
    # Action types: 'new_tarantula', 'molt', 'feeding', 'follow', 'forum_thread', 'forum_post'
    target_type = Column(String(50), nullable=True)
    # Target types: 'tarantula', 'user', 'thread', 'post'
    target_id = Column(String, nullable=True)  # String to support both UUID and integer IDs
    activity_metadata = Column(JSONB, nullable=True)
    # Flexible storage for action-specific data (species name, thread title, etc.)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    user = relationship("User")
