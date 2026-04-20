"""
Feeder colony model — a user's stock/colony of a single feeder species.

Supports two inventory modes per colony:
  - 'count'      — single integer (e.g. "200 crickets")
  - 'life_stage' — JSONB bucketed counts (e.g. {"adults": 30, "nymphs": 150, "pinheads": 400})

Optional enclosure link; the application layer must ensure the enclosure's
`purpose` column equals 'feeder' (not enforced at the DB level).
"""
from sqlalchemy import Column, String, Boolean, Integer, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from ..database import Base


class FeederColony(Base):
    __tablename__ = "feeder_colonies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feeder_species_id = Column(UUID(as_uuid=True), ForeignKey("feeder_species.id", ondelete="SET NULL"), nullable=True, index=True)
    enclosure_id = Column(UUID(as_uuid=True), ForeignKey("enclosures.id", ondelete="SET NULL"), nullable=True)

    name = Column(String(100), nullable=False)

    # Inventory
    inventory_mode = Column(String(20), nullable=False, default="count")  # count | life_stage
    count = Column(Integer, nullable=True)
    life_stage_counts = Column(JSONB, nullable=True)  # e.g. {"adults": 30, "nymphs": 150}

    # Care tracking (denormalized "last X" fields updated from care logs)
    last_restocked = Column(Date, nullable=True)
    last_cleaned = Column(Date, nullable=True)
    last_fed_date = Column(Date, nullable=True)

    food_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Low-stock threshold — when count (or sum of meaningful life-stage buckets)
    # drops below this, a local notification fires (if the pref is enabled).
    low_threshold = Column(Integer, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user = relationship("User", back_populates="feeder_colonies")
    feeder_species = relationship("FeederSpecies")
    enclosure = relationship("Enclosure")
    care_logs = relationship(
        "FeederCareLog",
        back_populates="colony",
        cascade="all, delete-orphan",
        order_by="FeederCareLog.logged_at.desc()",
    )

    def __repr__(self):
        return f"<FeederColony {self.name}>"
