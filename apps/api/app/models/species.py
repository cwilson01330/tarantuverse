"""
Species model
"""
from sqlalchemy import Column, String, Text, ARRAY, Enum as SQLEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
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
    scientific_name = Column(String(255), unique=True, nullable=False, index=True)
    common_names = Column(ARRAY(String), default=[])
    genus = Column(String(100), index=True)

    care_level = Column(SQLEnum(CareLevel), default=CareLevel.BEGINNER)
    temperament = Column(String(100))  # e.g., "docile", "defensive", "skittish"
    native_region = Column(String(200))
    adult_size = Column(String(50))  # e.g., "6-7 inches leg span"
    growth_rate = Column(String(50))  # e.g., "slow", "medium", "fast"

    care_guide = Column(Text)  # Markdown formatted care guide
    image_url = Column(String(500))

    # Full-text search vector
    searchable = Column(TSVECTOR)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Species {self.scientific_name}>"
