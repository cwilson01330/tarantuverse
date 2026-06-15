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
    # ADR-010 Phase A — generic parents on the unified `inverts` surface.
    # Backfilled verbatim from male_id/female_id (Invert.id == Tarantula.id).
    # Nullable during expand; becomes the canonical parent ref at contract.
    male_invert_id = Column(UUID(as_uuid=True), ForeignKey("inverts.id", ondelete="CASCADE"), nullable=True, index=True)
    female_invert_id = Column(UUID(as_uuid=True), ForeignKey("inverts.id", ondelete="CASCADE"), nullable=True, index=True)

    paired_date = Column(Date, nullable=False, index=True)
    separated_date = Column(Date, nullable=True)

    # The pairingtype / pairingoutcome PG enums were created with the
    # lowercase Python enum *values* ("natural", "in_progress", …), but
    # SQLAlchemy's default behavior is to send the Python enum *name*
    # ("NATURAL", "IN_PROGRESS") — which makes inserts fail with
    # `invalid input value for enum pairingtype: "NATURAL"`. values_callable
    # tells SQLAlchemy to send the values instead. Don't apply this to
    # shared UPPERCASE enums (sex/source/carelevel) — those store the
    # names and would break.
    pairing_type = Column(
        SQLEnum(PairingType, values_callable=lambda x: [e.value for e in x]),
        default=PairingType.NATURAL,
        nullable=False,
    )
    outcome = Column(
        SQLEnum(PairingOutcome, values_callable=lambda x: [e.value for e in x]),
        default=PairingOutcome.IN_PROGRESS,
        nullable=False,
    )

    notes = Column(Text, nullable=True)
    created_at = Column(Date, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="pairings")
    male = relationship("Tarantula", foreign_keys=[male_id], back_populates="pairings_as_male")
    female = relationship("Tarantula", foreign_keys=[female_id], back_populates="pairings_as_female")
    # No backref to Invert: the DB ON DELETE CASCADE handles parent deletion,
    # and a backref without passive_deletes would try to NULL these on invert
    # delete (the bug class fixed 2026-06-11). Read-only nav only.
    male_invert = relationship("Invert", foreign_keys=[male_invert_id])
    female_invert = relationship("Invert", foreign_keys=[female_invert_id])
    egg_sacs = relationship("EggSac", back_populates="pairing", cascade="all, delete-orphan")
