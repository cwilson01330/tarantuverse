"""Snake model

Parallel to Tarantula per ADR-002 §D1. NOT a tarantula clone — snakes have
genuinely different husbandry semantics:

  - No substrate_depth obsession (snakes live ON substrate, not IN it for most species)
  - No urticating_hairs / webbing / misting (tarantula-specific concepts)
  - Length + weight in real units (inches, grams) vs. tarantula leg span
  - Ecdysis (shedding) instead of molting — handled by ShedLog model (separate)
  - Brumation tracking — not a tarantula concept
  - Feeding expressed as schedule phrase (realistic keeper usage) with
    last_fed_at denormalized for dashboard speed

The `Sex` and `Source` enums are imported from the tarantula module because
the DB enum types are shared (see migration for rationale).
"""
from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base
from app.models.tarantula import Sex, Source  # shared enums


class Snake(Base):
    __tablename__ = "snakes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reptile_species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reptile_species.id"),
        nullable=True,
        index=True,
    )
    enclosure_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enclosures.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Basic identity
    name = Column(String(100))  # Pet name
    common_name = Column(String(100))  # "Ball Python"
    scientific_name = Column(String(255))  # "Python regius"

    # Reuse shared DB enum types. create_type=False on the migration side; here
    # the Python enum class is the same one the tarantulas column uses.
    # Do NOT set values_callable — SQLAlchemy's default (write .name) is what
    # matches the prod enum values (MALE/FEMALE/UNKNOWN, BRED/BOUGHT/WILD_CAUGHT).
    # Tarantula's column uses the same default and has worked in prod since day 1.
    sex = Column(
        SQLEnum(Sex, name="sex", create_type=False),
        default=Sex.UNKNOWN,
    )

    # Acquisition
    date_acquired = Column(Date)
    hatch_date = Column(Date, nullable=True)  # CB provenance
    source = Column(
        SQLEnum(Source, name="source", create_type=False)
    )
    source_breeder = Column(String(255))  # Morph provenance — crucial for snakes
    price_paid = Column(Numeric(10, 2))

    # Current state (measured, not computed from species defaults)
    current_weight_g = Column(Numeric(8, 2), nullable=True)
    current_length_in = Column(Numeric(6, 2), nullable=True)

    # Husbandry reference — fine-grained conditions live in environment_readings
    feeding_schedule = Column(String(200), nullable=True)  # e.g., "1 medium rat every 10-14 days"
    last_fed_at = Column(DateTime(timezone=True), nullable=True)  # denormalized for dashboard
    last_shed_at = Column(Date, nullable=True)  # denormalized
    brumation_active = Column(Boolean, default=False)
    brumation_started_at = Column(Date, nullable=True)

    # Media
    photo_url = Column(String(500))

    # Privacy
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default="private")

    # Notes
    notes = Column(Text)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="snakes")
    reptile_species = relationship("ReptileSpecies", backref="snakes")
    enclosure = relationship("Enclosure", backref="snake_inhabitants")

    def __repr__(self):
        return f"<Snake {self.name or self.scientific_name}>"
