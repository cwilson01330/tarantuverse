"""
Invert — unified per-animal model (Phase A1 of ADR-005).

Mirrors the migration's `inverts` table. Wide schema covering the
union of tarantula + scorpion + centipede fields. Sex / source reuse
the SHARED Postgres enums (UPPERCASE values per the shared-DB-enum-
casing memory) — same convention as `Tarantula` and `Scorpion`.

Why one wide table over per-taxon attrs tables:
* Query simplicity (no joins to fetch the detail card).
* The HV `animals` table proved this pattern works at our scale.
* Taxon-specific columns are nullable; the API and UI just hide
  unset fields per taxon, mirroring how care sheets already work.

The taxon-specific column list is intentionally narrow today —
extend it in additive migrations when a new taxon needs a column.
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, Enum as SQLEnum, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base
# Reuse the shared sex / source PG enums from the tarantula module
# (the original definition site). They're UPPERCASE in prod; the
# default SQLAlchemy serialization (write the enum name) matches.
from app.models.tarantula import Sex, Source


class Invert(Base):
    __tablename__ = "inverts"
    __table_args__ = (
        CheckConstraint(
            "taxon IN ('tarantula', 'scorpion', 'centipede', "
            "'whip_spider', 'vinegaroon', 'true_spider', "
            "'millipede', 'mantis', 'other')",
            name='inverts_taxon_check',
        ),
        CheckConstraint(
            "life_stage IS NULL OR "
            "life_stage IN ('sling', 'juvenile', 'adult')",
            name='inverts_life_stage_check',
        ),
        CheckConstraint(
            "enclosure_type IS NULL OR "
            "enclosure_type IN ('terrestrial', 'arboreal', 'fossorial')",
            name='inverts_enclosure_type_check',
        ),
        CheckConstraint(
            "visibility IS NULL OR visibility IN ('private', 'public')",
            name='inverts_visibility_check',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Taxon discriminator — lowercase value.
    taxon = Column(String(20), nullable=False, index=True)

    species_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invert_species.id", ondelete="SET NULL"),
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
        nullable=True, index=True,
    )

    # Identity (every taxon)
    name = Column(String(100))
    common_name = Column(String(100))
    scientific_name = Column(String(255))
    # NB: no values_callable — see app.models.tarantula. The shared PG
    # enum stores UPPERCASE names (MALE / FEMALE / UNKNOWN).
    sex = Column(SQLEnum(Sex), default=Sex.UNKNOWN)

    # Acquisition (every taxon)
    date_acquired = Column(Date)
    source = Column(SQLEnum(Source))
    price_paid = Column(Numeric(10, 2))

    # Tarantula-only
    life_stage = Column(String(20))  # sling | juvenile | adult

    # Scorpion + centipede growth tracking
    current_instar = Column(Integer)
    current_length_mm = Column(Numeric(6, 2))

    # Centipede-only growth tracking
    current_segment_count = Column(Integer)
    current_leg_pair_count = Column(Integer)

    # Husbandry — every taxon
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

    # Feeding pause (mirrors tarantula + scorpion behavior)
    feeding_paused_reason = Column(String(40))
    feeding_paused_until = Column(Date)

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
    user = relationship("User", backref="inverts")
    species = relationship("InvertSpecies", backref="inverts")
    enclosure = relationship("Enclosure")
    colony = relationship("ScorpionColony")

    def __repr__(self):
        return f"<Invert {self.taxon}:{self.name or self.scientific_name}>"
