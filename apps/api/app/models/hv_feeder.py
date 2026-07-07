"""Herpetoverse feeder-keeping models (ADR-012).

HV's OWN feeder feature — separate from TV's `feeder_species` / `feeder_colonies`
so reptile/aquatic feeders (rodents, fish, chicks, larger insects) and, crucially,
FROZEN stock inventory don't mix with TV's live-invert catalog and can be gated as
an HV-premium feature independently.

Three tables:
  - hv_feeder_species : HV feeder catalog (rodent | fish | insect | chick | other)
  - hv_feeder_stocks  : a keeper's stock of one feeder — live colony OR frozen
                        inventory. `sized_counts` buckets a size ladder
                        (pinky/fuzzy/hopper/adult…).
  - hv_feeder_logs    : restock / used / cleaned / bred / died / count_correction
"""
from sqlalchemy import (
    Column, String, Boolean, Integer, Text, Date, DateTime, ForeignKey,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from ..database import Base


HV_FEEDER_CATEGORIES = ("rodent", "fish", "insect", "chick", "other")
HV_FEEDER_FORMS = ("live", "frozen")
HV_FEEDER_INVENTORY_MODES = ("count", "sized")
HV_FEEDER_LOG_TYPES = (
    "restock", "used", "cleaned", "bred", "died", "count_correction",
)


class HvFeederSpecies(Base):
    __tablename__ = "hv_feeder_species"
    __table_args__ = (
        CheckConstraint(
            "category IN ('rodent', 'fish', 'insect', 'chick', 'other')",
            name="hv_feeder_species_category_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scientific_name = Column(String(150), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(String(150), unique=True, nullable=False, index=True)
    common_names = Column(ARRAY(String), nullable=True)

    category = Column(String(20), nullable=False, index=True)
    care_level = Column(String(20), nullable=True)  # easy | moderate | hard (live only)

    # Environmental ranges — meaningful for LIVE feeders only.
    temperature_min = Column(Integer, nullable=True)  # Fahrenheit
    temperature_max = Column(Integer, nullable=True)
    humidity_min = Column(Integer, nullable=True)  # Percent
    humidity_max = Column(Integer, nullable=True)

    # Size ladder for prey sizing / inventory buckets, ordered small→large,
    # e.g. mice: ["pinky","fuzzy","hopper","weanling","adult","jumbo"].
    supports_sizes = Column(Boolean, nullable=False, default=False)
    typical_sizes = Column(JSONB, nullable=True)

    typical_adult_size_mm = Column(Integer, nullable=True)
    prey_size_notes = Column(Text, nullable=True)
    care_notes = Column(Text, nullable=True)       # husbandry for live feeders
    handling_notes = Column(Text, nullable=True)   # thaw / food-safety for frozen

    image_url = Column(String(500), nullable=True)
    is_verified = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    def __repr__(self):
        return f"<HvFeederSpecies {self.scientific_name}>"


class HvFeederStock(Base):
    __tablename__ = "hv_feeder_stocks"
    __table_args__ = (
        CheckConstraint(
            "form IN ('live', 'frozen')", name="hv_feeder_stocks_form_check",
        ),
        CheckConstraint(
            "inventory_mode IN ('count', 'sized')",
            name="hv_feeder_stocks_inventory_mode_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    hv_feeder_species_id = Column(
        UUID(as_uuid=True), ForeignKey("hv_feeder_species.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    name = Column(String(100), nullable=False)

    # live colony vs frozen freezer stock
    form = Column(String(20), nullable=False, default="frozen")

    # Inventory
    inventory_mode = Column(String(20), nullable=False, default="count")
    count = Column(Integer, nullable=True)
    # {"pinky": 20, "hopper": 8, "adult": 12} — keyed by the size ladder.
    sized_counts = Column(JSONB, nullable=True)

    storage_location = Column(String(120), nullable=True)  # "chest freezer", "rack 2"

    last_restocked = Column(Date, nullable=True)
    last_used = Column(Date, nullable=True)
    last_cleaned = Column(Date, nullable=True)  # live only

    # Low-stock threshold — total count (or sum of sized buckets) below this
    # fires a badge / optional local reminder.
    low_threshold = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    user = relationship("User", backref="hv_feeder_stocks")
    hv_feeder_species = relationship("HvFeederSpecies")
    logs = relationship(
        "HvFeederLog",
        back_populates="stock",
        cascade="all, delete-orphan",
        order_by="HvFeederLog.logged_at.desc()",
    )

    def __repr__(self):
        return f"<HvFeederStock {self.name} ({self.form})>"


class HvFeederLog(Base):
    __tablename__ = "hv_feeder_logs"
    __table_args__ = (
        CheckConstraint(
            "log_type IN ('restock', 'used', 'cleaned', 'bred', 'died', 'count_correction')",
            name="hv_feeder_logs_log_type_check",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hv_feeder_stock_id = Column(
        UUID(as_uuid=True), ForeignKey("hv_feeder_stocks.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )

    log_type = Column(String(30), nullable=False)
    # Which size bucket this log touched (sized stock); null for count mode.
    size = Column(String(30), nullable=True)
    # Signed adjustment applied to the stock: +restock, -used, etc.
    count_delta = Column(Integer, nullable=True)

    logged_at = Column(Date, nullable=False, server_default=func.current_date(), index=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    stock = relationship("HvFeederStock", back_populates="logs")

    def __repr__(self):
        return f"<HvFeederLog {self.log_type} @ {self.logged_at}>"
