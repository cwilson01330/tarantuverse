"""
Achievement/Badge models
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class AchievementDefinition(Base):
    """Badge/achievement definitions (seeded data)"""
    __tablename__ = "achievement_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(300), nullable=False)
    icon = Column(String(10), nullable=False)  # Emoji
    category = Column(String(50), nullable=False, index=True)  # collection, feeding, molts, community, breeding
    tier = Column(String(20), nullable=False)  # bronze, silver, gold, platinum
    requirement_count = Column(Integer, nullable=False)  # Threshold number
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user_achievements = relationship("UserAchievement", back_populates="achievement", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AchievementDefinition(key={self.key}, name={self.name}, tier={self.tier})>"


class UserAchievement(Base):
    """Track which users have earned which achievements"""
    __tablename__ = "user_achievements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    achievement_id = Column(UUID(as_uuid=True), ForeignKey("achievement_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    earned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Unique constraint: user can only earn achievement once
    __table_args__ = (UniqueConstraint('user_id', 'achievement_id', name='uq_user_achievement'),)

    # Relationships
    user = relationship("User", back_populates="achievements")
    achievement = relationship("AchievementDefinition", back_populates="user_achievements")

    def __repr__(self):
        return f"<UserAchievement(user_id={self.user_id}, achievement_id={self.achievement_id})>"
