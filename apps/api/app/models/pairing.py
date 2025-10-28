from sqlalchemy import Column, String, Date, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class PairingOutcome(str, enum.Enum):
    """Pairing outcome types"""
    SUCCESSFUL = "successful"
    UNSUCCESSFUL = "unsuccessful"
    UNKNOWN = "unknown"
    IN_PROGRESS = "in_progress"


class PairingType(str, enum.Enum):
    """Pairing method types"""
    NATURAL = "natural"
    ASSISTED = "assisted"
    FORCED = "forced"


class Pairing(Base):
    """Breeding pairing between male and female tarantulas"""
    __tablename__ = "pairings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    male_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False, index=True)
    female_id = Column(UUID(as_uuid=True), ForeignKey("tarantulas.id", ondelete="CASCADE"), nullable=False, index=True)

    paired_date = Column(Date, nullable=False, index=True)
    separated_date = Column(Date, nullable=True)

    pairing_type = Column(SQLEnum(PairingType), default=PairingType.NATURAL, nullable=False)
    outcome = Column(SQLEnum(PairingOutcome), default=PairingOutcome.IN_PROGRESS, nullable=False)

    notes = Column(Text, nullable=True)
    created_at = Column(Date, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="pairings")
    male = relationship("Tarantula", foreign_keys=[male_id], back_populates="pairings_as_male")
    female = relationship("Tarantula", foreign_keys=[female_id], back_populates="pairings_as_female")
    egg_sacs = relationship("EggSac", back_populates="pairing", cascade="all, delete-orphan")
