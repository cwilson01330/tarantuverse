"""
Species model
"""
from sqlalchemy import Column, String, Text, ARRAY, Enum as SQLEnum, DateTime, Integer, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.database import Base


class CareLevel(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class Species(Base):
    __tablename__ = "species"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Taxonomy - stored in lowercase for case-insensitive matching
    scientific_name = Column(String(255), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(String(255), unique=True, nullable=False, index=True)  # Auto-populated lowercase
    common_names = Column(ARRAY(String), default=[])
    genus = Column(String(100), index=True)
    family = Column(String(100))

    # Basic Info
    care_level = Column(SQLEnum(CareLevel), default=CareLevel.BEGINNER)
    temperament = Column(String(100))  # e.g., "docile", "defensive", "skittish"
    native_region = Column(String(200))
    adult_size = Column(String(50))  # e.g., "6-7 inches leg span"
    growth_rate = Column(String(50))  # e.g., "slow", "medium", "fast"
    type = Column(String(50))  # "terrestrial", "arboreal", "fossorial"

    # Husbandry Details
    temperature_min = Column(Integer)  # Fahrenheit
    temperature_max = Column(Integer)
    humidity_min = Column(Integer)  # Percentage
    humidity_max = Column(Integer)
    enclosure_size_sling = Column(String(100))  # e.g., "2x2x3 inches"
    enclosure_size_juvenile = Column(String(100))
    enclosure_size_adult = Column(String(100))
    substrate_depth = Column(String(100))  # e.g., "3-4 inches"
    substrate_type = Column(String(200))  # e.g., "coco fiber, peat moss"

    # Feeding
    prey_size = Column(String(200))  # e.g., "prey 1/2 body size"
    feeding_frequency_sling = Column(String(100))  # e.g., "every 2-3 days"
    feeding_frequency_juvenile = Column(String(100))
    feeding_frequency_adult = Column(String(100))

    # Additional Care
    water_dish_required = Column(Boolean, default=True)
    webbing_amount = Column(String(50))  # "light", "moderate", "heavy"
    burrowing = Column(Boolean, default=False)

    # Safety Information
    urticating_hairs = Column(Boolean, default=True)  # New World tarantulas
    medically_significant_venom = Column(Boolean, default=False)  # Old World arboreals (Poecilotheria, etc.)

    # Documentation
    care_guide = Column(Text)  # Markdown formatted care guide
    image_url = Column(String(500))
    source_url = Column(String(500))  # Where the info came from

    # Community & Verification
    is_verified = Column(Boolean, default=False)  # Admin verified
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    community_rating = Column(Float, default=0.0)  # Average user rating
    times_kept = Column(Integer, default=0)  # How many users have this species

    # Full-text search vector
    searchable = Column(TSVECTOR)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    submitted_by_user = relationship("User", backref="submitted_species", foreign_keys=[submitted_by])

    def __repr__(self):
        return f"<Species {self.scientific_name}>"
