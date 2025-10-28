from sqlalchemy import Column, String, Date, Text, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class EggSac(Base):
    """Egg sac from a breeding pairing"""
    __tablename__ = "egg_sacs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pairing_id = Column(UUID(as_uuid=True), ForeignKey("pairings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    laid_date = Column(Date, nullable=False, index=True)
    pulled_date = Column(Date, nullable=True)
    hatch_date = Column(Date, nullable=True)

    # Incubation conditions
    incubation_temp_min = Column(Integer, nullable=True)  # Fahrenheit
    incubation_temp_max = Column(Integer, nullable=True)  # Fahrenheit
    incubation_humidity_min = Column(Integer, nullable=True)  # Percentage
    incubation_humidity_max = Column(Integer, nullable=True)  # Percentage

    # Counts
    spiderling_count = Column(Integer, nullable=True)  # Total count
    viable_count = Column(Integer, nullable=True)  # Viable/healthy count

    notes = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)

    created_at = Column(Date, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="egg_sacs")
    pairing = relationship("Pairing", back_populates="egg_sacs")
    offspring = relationship("Offspring", back_populates="egg_sac", cascade="all, delete-orphan")
