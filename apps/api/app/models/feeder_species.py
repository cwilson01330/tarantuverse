"""
Feeder species model — separate from tarantula species (different care profile shape).
"""
from sqlalchemy import Column, String, Boolean, Integer, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
import uuid

from ..database import Base


class FeederSpecies(Base):
    __tablename__ = "feeder_species"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scientific_name = Column(String(150), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(String(150), unique=True, nullable=False, index=True)
    common_names = Column(ARRAY(String), nullable=True)

    # Classification & care profile
    category = Column(String(20), nullable=False, index=True)  # cricket | roach | larvae | other
    care_level = Column(String(20), nullable=True)  # easy | moderate | hard

    # Environmental ranges
    temperature_min = Column(Integer, nullable=True)  # Fahrenheit
    temperature_max = Column(Integer, nullable=True)
    humidity_min = Column(Integer, nullable=True)  # Percent
    humidity_max = Column(Integer, nullable=True)

    # Feeder-specific
    typical_adult_size_mm = Column(Integer, nullable=True)
    supports_life_stages = Column(Boolean, nullable=False, default=False)
    # JSONB array of stage names, e.g. ["adults", "nymphs", "pinheads"] for Dubia
    default_life_stages = Column(JSONB, nullable=True)
    prey_size_notes = Column(Text, nullable=True)
    care_notes = Column(Text, nullable=True)

    image_url = Column(String(500), nullable=True)
    is_verified = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    def __repr__(self):
        return f"<FeederSpecies {self.scientific_name}>"
