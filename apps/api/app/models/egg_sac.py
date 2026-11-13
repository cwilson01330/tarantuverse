from sqlalchemy import CheckConstraint, Column, String, Date, Text, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class EggSac(Base):
    """Egg sac from a breeding pairing"""
    __tablename__ = "egg_sacs"
    __table_args__ = (
        CheckConstraint(
            "pairing_id IS NOT NULL OR mother_invert_id IS NOT NULL",
            name="egg_sacs_parent_check",
        ),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('hatched', 'failed')",
            name="egg_sacs_outcome_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pairing_id = Column(UUID(as_uuid=True), ForeignKey("pairings.id", ondelete="CASCADE"), nullable=True, index=True)
    # The mother, set for every sac (from the pairing's female when there is
    # one). A sac without a pairing (a wild-caught gravid female) has only this.
    mother_invert_id = Column(UUID(as_uuid=True), ForeignKey("inverts.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    laid_date = Column(Date, nullable=False, index=True)
    pulled_date = Column(Date, nullable=True)
    # A projection, normally in the future — kept separate from hatch_date
    # so a prediction is never mistaken for an event. See the
    # egg_20260826_expected_hatch migration.
    expected_hatch_date = Column(Date, nullable=True)
    hatch_date = Column(Date, nullable=True)

    # Incubation conditions
    incubation_temp_min = Column(Integer, nullable=True)  # Fahrenheit
    incubation_temp_max = Column(Integer, nullable=True)  # Fahrenheit
    incubation_humidity_min = Column(Integer, nullable=True)  # Percentage
    incubation_humidity_max = Column(Integer, nullable=True)  # Percentage

    # Counts
    spiderling_count = Column(Integer, nullable=True)  # Total count
    viable_count = Column(Integer, nullable=True)  # Viable/healthy count

    # NULL = waiting; 'hatched' | 'failed' (utils/broods.EGG_SAC_OUTCOMES).
    outcome = Column(String(20), nullable=True)

    notes = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)

    created_at = Column(Date, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="egg_sacs")
    pairing = relationship("Pairing", back_populates="egg_sacs")
    mother = relationship("Invert", foreign_keys=[mother_invert_id])
    offspring = relationship("Offspring", back_populates="egg_sac", cascade="all, delete-orphan")
