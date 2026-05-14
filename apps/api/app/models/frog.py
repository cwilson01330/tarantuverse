"""Frog model

Parallel to Snake + Lizard + Tarantula per ADR-002 §D1. Structurally
identical to Lizard — frogs share the same per-animal record shape
(name, species link, enclosure link, denormalized last_fed_at /
last_shed_at, brumation flags, privacy, notes) even though the
underlying biology diverges.

Note on naming: frogs are amphibians, not reptiles. The species
catalog table is still called `reptile_species` — see frg_20260513
migration docstring for the rationale on keeping the legacy name.

Overlapping-but-distinct from snakes / lizards:
  - Humidity is critical (most species 70-90%) — captured on the
    species sheet, not here.
  - Shedding happens (skin sloughed and typically eaten) — same
    shed_logs table, just different observations.
  - The `brumation_*` columns double as aestivation (African bullfrogs
    cocoon during dry season). UX is identical so we don't rename.
  - Diet varies wildly (fruit flies → pinkies) but that's a species
    concern, not per-animal.

Shared DB enum types (`sex`, `source`) are imported from the tarantula
module — same UPPERCASE-name convention as Snake + Lizard.
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
from app.models.tarantula import Sex, Source  # shared DB enums


class Frog(Base):
    __tablename__ = "frogs"

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
    name = Column(String(100))
    common_name = Column(String(100))
    scientific_name = Column(String(255))

    # Shared DB enum types — see snake/lizard/tarantula model notes.
    sex = Column(
        SQLEnum(Sex, name="sex", create_type=False),
        default=Sex.UNKNOWN,
    )

    # Acquisition
    date_acquired = Column(Date)
    hatch_date = Column(Date, nullable=True)
    source = Column(
        SQLEnum(Source, name="source", create_type=False)
    )
    source_breeder = Column(String(255))
    price_paid = Column(Numeric(10, 2))

    # Current state (measured, not derived from species)
    current_weight_g = Column(Numeric(8, 2), nullable=True)
    current_length_in = Column(Numeric(6, 2), nullable=True)

    # Husbandry reference. brumation_* doubles as aestivation; see
    # module docstring.
    feeding_schedule = Column(String(200), nullable=True)
    last_fed_at = Column(DateTime(timezone=True), nullable=True)
    last_shed_at = Column(Date, nullable=True)
    brumation_active = Column(Boolean, default=False)
    brumation_started_at = Column(Date, nullable=True)

    # Feeding pause — same shape as snake/lizard.
    feeding_paused_reason = Column(String(40), nullable=True)
    feeding_paused_until = Column(Date, nullable=True)

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
    user = relationship("User", backref="frogs")
    reptile_species = relationship("ReptileSpecies", backref="frogs")
    enclosure = relationship("Enclosure", backref="frog_inhabitants")

    def __repr__(self):
        return f"<Frog {self.name or self.scientific_name}>"
