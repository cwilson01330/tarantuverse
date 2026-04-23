"""Lizard model

Parallel to Snake + Tarantula per ADR-002 §D1. Structurally identical
to Snake — lizards share the same core husbandry tracking shape (name,
species link, enclosure link, denormalized last_fed_at / last_shed_at,
brumation flags, privacy, notes) even though the underlying biology
diverges.

Overlapping-but-distinct from snakes:
  - Shedding is patchy, not whole-skin — same log table, just different
    observations.
  - UVB/diet/basking are first-class in the *species* record, not here.
  - Tail autotomy (gecko tail drops) is NOT captured in v1 — defer.

Shared DB enum types (`sex`, `source`) are imported from the tarantula
module; see Snake model for the rationale on why we don't set
values_callable.
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


class Lizard(Base):
    __tablename__ = "lizards"

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

    # Shared DB enum types — see snake/tarantula model notes.
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

    # Husbandry reference
    feeding_schedule = Column(String(200), nullable=True)
    last_fed_at = Column(DateTime(timezone=True), nullable=True)
    last_shed_at = Column(Date, nullable=True)
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
    user = relationship("User", backref="lizards")
    reptile_species = relationship("ReptileSpecies", backref="lizards")
    enclosure = relationship("Enclosure", backref="lizard_inhabitants")

    def __repr__(self):
        return f"<Lizard {self.name or self.scientific_name}>"
