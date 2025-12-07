"""
Promo Code models
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from datetime import datetime, timezone
from app.database import Base


class PromoCodeType(str, enum.Enum):
    LIFETIME = "lifetime"
    ONE_YEAR = "1year"
    SIX_MONTH = "6month"
    CUSTOM = "custom"


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    code_type = Column(String(20), nullable=False)  # PromoCodeType enum
    custom_duration_days = Column(Integer, nullable=True)
    usage_limit = Column(Integer, nullable=True)  # NULL = unlimited
    times_used = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by = relationship("User", foreign_keys=[created_by_admin_id])

    def __repr__(self):
        return f"<PromoCode {self.code} - {self.code_type}>"

    def is_valid(self) -> bool:
        """Check if promo code is valid for use"""
        if not self.is_active:
            return False

        # Check expiration
        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False

        # Check usage limit
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False

        return True

    def get_duration_days(self) -> int:
        """Get duration in days based on code type"""
        if self.code_type == PromoCodeType.LIFETIME:
            return 36500  # ~100 years
        elif self.code_type == PromoCodeType.ONE_YEAR:
            return 365
        elif self.code_type == PromoCodeType.SIX_MONTH:
            return 180
        elif self.code_type == PromoCodeType.CUSTOM:
            return self.custom_duration_days or 30
        return 30  # Default fallback
