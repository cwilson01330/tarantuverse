"""
Follow model for user following relationships
"""
from sqlalchemy import Column, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Follow(Base):
    __tablename__ = "follows"

    follower_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followed_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    follower = relationship("User", foreign_keys=[follower_id], backref="following")
    followed = relationship("User", foreign_keys=[followed_id], backref="followers")

    # Ensure a user can't follow the same person twice
    __table_args__ = (
        UniqueConstraint('follower_id', 'followed_id', name='unique_follow'),
    )

    def __repr__(self):
        return f"<Follow follower={self.follower_id} followed={self.followed_id}>"
