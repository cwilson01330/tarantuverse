"""
Tarantula model
"""
from sqlalchemy import Column, String, Text, Boolean, Numeric, Date, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.database import Base


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class Source(str, enum.Enum):
    BRED = "bred"
    BOUGHT = "bought"
    WILD_CAUGHT = "wild_caught"


class EnclosureType(str, enum.Enum):
    TERRESTRIAL = "terrestrial"
    ARBOREAL = "arboreal"
    FOSSORIAL = "fossorial"


class Tarantula(Base):
    __tablename__ = "tarantulas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    species_id = Column(UUID(as_uuid=True), ForeignKey("species.id"), nullable=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="SET NULL"), nullable=True)

    # Basic Info
    name = Column(String(100))  # Pet name
    common_name = Column(String(100))
    scientific_name = Column(String(255))
    sex = Column(SQLEnum(Sex), default=Sex.UNKNOWN)

    # Acquisition
    date_acquired = Column(Date)
    source = Column(SQLEnum(Source))
    price_paid = Column(Numeric(10, 2))

    # Husbandry
    enclosure_type = Column(SQLEnum(EnclosureType))
    enclosure_size = Column(String(50))  # e.g., "10x10x10 inches"
    substrate_type = Column(String(100))
    substrate_depth = Column(String(50))  # e.g., "3 inches"
    last_substrate_change = Column(Date)
    target_temp_min = Column(Numeric(5, 2))  # Fahrenheit
    target_temp_max = Column(Numeric(5, 2))
    target_humidity_min = Column(Numeric(5, 2))  # Percentage
    target_humidity_max = Column(Numeric(5, 2))
    water_dish = Column(Boolean, default=True)
    misting_schedule = Column(String(100))  # e.g., "2x per week"
    last_enclosure_cleaning = Column(Date)
    enclosure_notes = Column(Text)  # Modifications, decor, etc.

    # Media
    photo_url = Column(String(500))

    # Privacy
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default='private')  # private, public

    # Notes
    notes = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="tarantulas")
    species = relationship("Species", backref="tarantulas")
    enclosure = relationship("Enclosure", back_populates="inhabitants")

    # Breeding relationships
    pairings_as_male = relationship("Pairing", foreign_keys="Pairing.male_id", back_populates="male")
    pairings_as_female = relationship("Pairing", foreign_keys="Pairing.female_id", back_populates="female")
    offspring_record = relationship("Offspring", back_populates="tarantula", uselist=False)  # One-to-one if kept

    def __repr__(self):
        return f"<Tarantula {self.name or self.scientific_name}>"
