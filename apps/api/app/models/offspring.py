from sqlalchemy import Column, String, Date, Text, Numeric, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class OffspringStatus(str, enum.Enum):
    """Status of offspring spiderling"""
    KEPT = "kept"  # Kept in personal collection
    SOLD = "sold"
    TRADED = "traded"
    GIVEN_AWAY = "given_away"
    DIED = "died"
    UNKNOWN = "unknown"


class Offspring(Base):
    """Individual spiderling from an egg sac"""
    __tablename__ = "offspring"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    egg_sac_id = Column(UUID(as_uuid=True), ForeignKey("egg_sacs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Optional link to tarantula record if kept in collection
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(SQLEnum(OffspringStatus), default=OffspringStatus.UNKNOWN, nullable=False)
    status_date = Column(Date, nullable=True)  # Date sold, traded, died, etc.

    # Details for sold/traded offspring
    buyer_info = Column(Text, nullable=True)  # Name, contact info, etc.
    price_sold = Column(Numeric(10, 2), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(Date, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="offspring")
    egg_sac = relationship("EggSac", back_populates="offspring")
    tarantula = relationship("Tarantula", back_populates="offspring_record")
