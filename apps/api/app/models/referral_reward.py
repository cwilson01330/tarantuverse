"""
ReferralReward model - tracks free months earned through referrals
"""
from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class ReferralReward(Base):
    __tablename__ = "referral_rewards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Which batch of 5 referrals triggered this reward (5, 10, 15, 20, 25, 30)
    referral_milestone = Column(Integer, nullable=False)

    # The free month period
    free_month_start = Column(DateTime(timezone=True), nullable=False)
    free_month_end = Column(DateTime(timezone=True), nullable=False)

    # Track when reward was granted
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    referrer = relationship("User", back_populates="referral_rewards")

    def __repr__(self):
        return f"<ReferralReward {self.referrer_id} milestone={self.referral_milestone}>"
