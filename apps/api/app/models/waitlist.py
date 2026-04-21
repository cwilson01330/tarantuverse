"""
Waitlist model — pre-launch email capture for Herpetoverse (and future brands).
Brand-scoped so a single table serves multiple properties.
"""
from sqlalchemy import Column, String, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class WaitlistSignup(Base):
    __tablename__ = "waitlist_signups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, index=True)
    brand = Column(String(32), nullable=False, index=True)  # "herpetoverse", "tarantuverse"
    source = Column(String(64), nullable=True)  # e.g. "landing_page", "cross_promo_banner"
    user_agent = Column(String(512), nullable=True)
    ip_hash = Column(String(64), nullable=True)  # truncated sha256 of client IP
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("email", "brand", name="uq_waitlist_email_brand"),
    )

    def __repr__(self):
        return f"<WaitlistSignup {self.email} ({self.brand})>"
