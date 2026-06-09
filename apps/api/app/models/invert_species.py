"""
InvertSpecies — unified catalog model (Phase A1 of ADR-005).

Mirrors the migration's `invert_species` table. Wide schema with
nullable taxon-specific fields covering all three taxa today
(tarantula / scorpion / centipede) plus room for future inverts.

This is the canonical species catalog from Phase C onward. During the
transition (A1 → C1), `species` and `scorpion_species` still exist as
sources of truth; dual-write keeps them in sync. After Phase D drops
those legacy tables, this is the only catalog.
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric,
    String, Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


# Tuple kept in sync with the migration's TAXON_CHECK. When a new taxon
# is added, update this list AND alter the CHECK constraint in a
# follow-up migration.
INVERT_TAXON_VALUES = (
    'tarantula', 'scorpion', 'centipede',
    'whip_spider', 'vinegaroon', 'true_spider',
    'millipede', 'mantis', 'other',
)

# Species-level feeding mode (ADR-006). Drives husbandry copy and the
# feeding-reminder / refusal logic. Detritivores must NOT get live-prey
# cadence nudges.
INVERT_FEEDING_MODES = ('predator', 'detritivore', 'omnivore')


class InvertSpecies(Base):
    __tablename__ = "invert_species"
    __table_args__ = (
        CheckConstraint(
            "taxon IN ('tarantula', 'scorpion', 'centipede', "
            "'whip_spider', 'vinegaroon', 'true_spider', "
            "'millipede', 'mantis', 'other')",
            name='invert_species_taxon_check',
        ),
        CheckConstraint(
            "care_level IN ('beginner', 'intermediate', 'advanced')",
            name='invert_species_care_level_check',
        ),
        CheckConstraint(
            "feeding_mode IN ('predator', 'detritivore', 'omnivore')",
            name='invert_species_feeding_mode_check',
        ),
        CheckConstraint(
            "venom_severity IS NULL OR "
            "venom_severity IN ('mild', 'moderate', 'medically_significant')",
            name='invert_species_venom_severity_check',
        ),
        CheckConstraint(
            "developmental_class IS NULL OR "
            "developmental_class IN ('anamorphic', 'epimorphic')",
            name='invert_species_developmental_class_check',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Taxon discriminator. Lowercase string; VARCHAR + CHECK rather
    # than PG enum per the enum-double-create memory.
    taxon = Column(String(20), nullable=False, index=True)

    # Identity
    scientific_name = Column(String(255), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(
        String(255), unique=True, nullable=False, index=True,
    )
    slug = Column(String(160), unique=True, nullable=False, index=True)
    common_names = Column(ARRAY(String), default=list)
    genus = Column(String(100), index=True)
    family = Column(String(100))
    order_name = Column(String(100))

    # Care profile
    care_level = Column(String(20), default='beginner')
    temperament = Column(String(100))
    native_region = Column(String(200))
    adult_size = Column(String(50))
    adult_length_min_mm = Column(Numeric(6, 2))
    adult_length_max_mm = Column(Numeric(6, 2))
    growth_rate = Column(String(50))
    type = Column(String(50))  # terrestrial / arboreal / fossorial / scansorial / psammophile

    # Climate
    temperature_min = Column(Integer)
    temperature_max = Column(Integer)
    humidity_min = Column(Integer)
    humidity_max = Column(Integer)

    # Enclosure
    enclosure_size_sling = Column(String(100))
    enclosure_size_juvenile = Column(String(100))
    enclosure_size_adult = Column(String(100))
    substrate_depth = Column(String(100))
    substrate_type = Column(String(200))

    # Feeding
    # feeding_mode drives husbandry copy + the reminder/refusal logic
    # (ADR-006). 'predator' = live prey (default), 'detritivore' =
    # decaying plant matter (millipedes), 'omnivore' = both.
    feeding_mode = Column(String(20), nullable=False, server_default='predator')
    prey_size = Column(String(200))
    feeding_frequency_sling = Column(String(100))
    feeding_frequency_juvenile = Column(String(100))
    feeding_frequency_adult = Column(String(100))

    # Behavior
    water_dish_required = Column(Boolean, default=False)
    webbing_amount = Column(String(50))  # tarantula
    burrowing = Column(String(50))  # all
    communal_suitable = Column(Boolean, default=False)  # mostly scorpion

    # Safety — taxon-specific. Nullable wide columns rather than JSONB.
    urticating_hairs = Column(Boolean, default=False)  # tarantula
    medically_significant_venom = Column(Boolean, default=False)  # tarantula
    venom_severity = Column(String(30))  # scorpion + centipede
    venom_notes = Column(Text)  # scorpion + centipede

    # Centipede-specific
    developmental_class = Column(String(20))  # anamorphic | epimorphic
    typical_segment_count = Column(Integer)
    typical_leg_pair_count = Column(Integer)

    # Documentation
    care_guide = Column(Text)
    image_url = Column(String(500))
    image_attribution = Column(Text)
    source_url = Column(String(500))

    # Community
    is_verified = Column(Boolean, default=False)
    submitted_by = Column(
        UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )
    community_rating = Column(Numeric(3, 2))
    times_kept = Column(Integer, default=0)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    submitted_by_user = relationship(
        "User", backref="submitted_invert_species", foreign_keys=[submitted_by],
    )

    def __repr__(self):
        return f"<InvertSpecies {self.taxon}:{self.scientific_name}>"
