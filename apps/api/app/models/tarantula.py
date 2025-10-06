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


class Tarantula(Base):
    __tablename__ = "tarantulas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    species_id = Column(UUID(as_uuid=True), ForeignKey("species.id"), nullable=True)

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
    enclosure_size = Column(String(50))  # e.g., "10x10x10 inches"
    substrate_type = Column(String(100))

    # Privacy
    is_public = Column(Boolean, default=False)

    # Notes
    notes = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="tarantulas")
    species = relationship("Species", backref="tarantulas")

    def __repr__(self):
        return f"<Tarantula {self.name or self.scientific_name}>"
