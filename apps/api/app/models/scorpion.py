"""
Scorpion model — per-animal record.

Mirrors the tarantula model shape: same husbandry fields, same media /
privacy / notes columns, same feeding-pause mechanism. Reuses the
SHARED `sex` and `source` Postgres enums (UPPERCASE values per the
shared-DB-enum-casing rule) — that's why this file imports `Sex` and
`Source` directly from `app.models.tarantula` rather than declaring
new enum classes. One source of truth for the shared enums means a
later rename only has to happen in one place.

Scorpion-specific deltas vs tarantulas:
* `current_instar` — scorpions count instars (typically 1-7); useful
  on the molt log + growth chart.
* `current_length_mm` — total body length in mm, NOT leg span. Adult
  size on the species sheet is in the same unit so they line up.
* `colony_id` — nullable pointer to a `ScorpionColony`. Communal setups
  are first-class in v1.
* No `life_stage` enum (yet). Scorpion cadence isn't sling/juvenile/
  adult the way tarantulas are — premolt prediction is deferred (D4)
  until we have real keeper data.

`enclosure_type` is intentionally VARCHAR rather than the EnclosureType
PG enum used on `tarantulas`. The migration's column type is `varchar(30)`
to avoid an alembic ENUM round-trip; the schema layer validates the
allowed values.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SQLEnum, ForeignKey, Integer,
    Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base
# Reuse the tarantula model's Sex / Source enums verbatim — they map
# to the same shared Postgres enum types (`sex`, `source`) and we want
# one source of truth for the Python-side values.
from app.models.tarantula import Sex, Source


class Scorpion(Base):
    __tablename__ = "scorpions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpion_species.id", ondelete="SET NULL"),
        nullable=True,
    )
    enclosure_id = Column(
        UUID(as_uuid=True),
        ForeignKey("enclosures.id", ondelete="SET NULL"),
        nullable=True,
    )
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scorpion_colonies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Identity
    name = Column(String(100))
    common_name = Column(String(100))
    scientific_name = Column(String(255))
    # NB: no values_callable — see app.models.tarantula. The shared PG
    # enum stores UPPERCASE names (MALE / FEMALE / UNKNOWN), and the
    # default SQLAlchemy behavior of storing enum NAMES matches prod.
    sex = Column(SQLEnum(Sex), default=Sex.UNKNOWN)

    # Acquisition
    date_acquired = Column(Date)
    source = Column(SQLEnum(Source))
    price_paid = Column(Numeric(10, 2))

    # Scorpion-specific growth tracking. current_instar is the 1-7
    # instar number; nullable for keepers who haven't tracked it.
    current_instar = Column(Integer)
    current_length_mm = Column(Numeric(6, 2))

    # Husbandry — mirrors tarantulas. enclosure_type is VARCHAR here
    # to avoid the alembic ENUM round-trip; schemas validate values.
    enclosure_type = Column(String(30))
    enclosure_size = Column(String(50))
    substrate_type = Column(String(100))
    substrate_depth = Column(String(50))
    last_substrate_change = Column(Date)
    target_temp_min = Column(Numeric(5, 2))
    target_temp_max = Column(Numeric(5, 2))
    target_humidity_min = Column(Numeric(5, 2))
    target_humidity_max = Column(Numeric(5, 2))
    water_dish = Column(Boolean, default=True)
    misting_schedule = Column(String(100))
    last_enclosure_cleaning = Column(Date)
    enclosure_notes = Column(Text)

    # Feeding pause (mirrors tarantula; allows premolt / post-rehouse
    # suppression of overdue alerts).
    feeding_paused_reason = Column(String(40), nullable=True)
    feeding_paused_until = Column(Date, nullable=True)

    # Media / privacy / notes
    photo_url = Column(String(500))
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default='private')
    notes = Column(Text)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="scorpions")
    species = relationship("ScorpionSpecies", backref="scorpions")
    enclosure = relationship("Enclosure")
    colony = relationship(
        "ScorpionColony",
        back_populates="members",
        foreign_keys=[colony_id],
    )

    # Breeding — Phase 5 wires the scorpion_pairings table and updates
    # broods to FK to it. For now `broods` is the only breeding-shaped
    # relationship we expose.
    broods_as_mother = relationship(
        "Brood",
        foreign_keys="Brood.mother_scorpion_id",
        back_populates="mother",
    )
    broods_as_father = relationship(
        "Brood",
        foreign_keys="Brood.father_scorpion_id",
        back_populates="father",
    )

    def __repr__(self):
        return f"<Scorpion {self.name or self.scientific_name}>"
