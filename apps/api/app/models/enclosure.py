"""
Enclosure model for communal and solo tarantula setups
"""
from sqlalchemy import Column, String, Text, Boolean, Integer, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class Enclosure(Base):
    __tablename__ = "enclosures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # e.g., "Balfouri Colony 1"

    # Communal settings
    is_communal = Column(Boolean, default=False)
    species_id = Column(UUID(as_uuid=True), ForeignKey("species.id"), nullable=True)  # For same-species communals
    population_count = Column(Integer, nullable=True)  # For untracked communals

    # Enclosure properties
    enclosure_type = Column(String(50))  # terrestrial/arboreal/fossorial
    enclosure_size = Column(String(50))  # e.g., "18x18x12 inches"
    substrate_type = Column(String(100))
    substrate_depth = Column(String(50))
    last_substrate_change = Column(Date, nullable=True)
    target_temp_min = Column(Numeric(5, 2), nullable=True)  # Fahrenheit
    target_temp_max = Column(Numeric(5, 2), nullable=True)
    target_humidity_min = Column(Numeric(5, 2), nullable=True)  # Percentage
    target_humidity_max = Column(Numeric(5, 2), nullable=True)
    water_dish = Column(Boolean, default=True)
    misting_schedule = Column(String(100), nullable=True)
    last_enclosure_cleaning = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="enclosures")
    species = relationship("Species")
    inhabitants = relationship("Tarantula", back_populates="enclosure")
    feeding_logs = relationship("FeedingLog", back_populates="enclosure", cascade="all, delete-orphan")
    molt_logs = relationship("MoltLog", back_populates="enclosure", cascade="all, delete-orphan")
    substrate_changes = relationship("SubstrateChange", back_populates="enclosure", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Enclosure {self.name}>"
