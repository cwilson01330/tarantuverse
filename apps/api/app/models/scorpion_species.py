"""
Scorpion species model — catalog of keepable scorpion taxa.

Mirrors the tarantula `Species` model in shape but scorpion-specific in
detail: total body length instead of leg span, a `venom_severity` tier
(mild / moderate / medically_significant) instead of the binary
`medically_significant_venom` flag, and a `communal_suitable` flag that
matters for Pandinus / Heterometrus colonies.

Per the v1 scorpion plan, the catalog is a SEPARATE table from `species`
(which stays tarantula-only). When taxon #3 arrives — mantises,
centipedes, whatever — ADR-X will consolidate `species`,
`scorpion_species`, and the future catalog into a single
polymorphic-friendly `inverts_catalog` table.
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


class ScorpionSpecies(Base):
    __tablename__ = "scorpion_species"
    __table_args__ = (
        # Mirror what the migration's CHECK constraints enforce so the
        # ORM raises before round-tripping bad values to Postgres.
        CheckConstraint(
            "care_level IN ('beginner', 'intermediate', 'advanced')",
            name='scorpion_species_care_level_check',
        ),
        CheckConstraint(
            "venom_severity IN ('mild', 'moderate', 'medically_significant')",
            name='scorpion_species_venom_severity_check',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Taxonomy
    scientific_name = Column(String(255), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(
        String(255), unique=True, nullable=False, index=True,
    )
    slug = Column(String(160), unique=True, nullable=False, index=True)
    common_names = Column(ARRAY(String), default=list)
    genus = Column(String(100), index=True)
    family = Column(String(100))
    # Scorpions are Order Scorpiones — surfaced so the catalog can grow
    # to other arachnid orders later without renaming.
    order_name = Column(String(100))

    # Care profile — VARCHAR + CHECK rather than PG ENUM, matching the
    # migration (enum-double-create has bitten prior migrations).
    care_level = Column(String(20), default='beginner')
    temperament = Column(String(100))
    native_region = Column(String(200))
    adult_size = Column(String(50))  # Human-readable: '4-5 inches'
    adult_length_min_mm = Column(Numeric(6, 2))  # Structured min/max in mm
    adult_length_max_mm = Column(Numeric(6, 2))
    growth_rate = Column(String(50))
    # terrestrial / scansorial / fossorial / psammophile
    type = Column(String(50))

    # Climate
    temperature_min = Column(Integer)
    temperature_max = Column(Integer)
    humidity_min = Column(Integer)
    humidity_max = Column(Integer)

    # Enclosure — no `sling` size for scorpions; juvenile/adult only.
    enclosure_size_juvenile = Column(String(100))
    enclosure_size_adult = Column(String(100))
    substrate_depth = Column(String(100))
    substrate_type = Column(String(200))

    # Feeding
    prey_size = Column(String(200))
    feeding_frequency_juvenile = Column(String(100))
    feeding_frequency_adult = Column(String(100))

    # Behavior
    water_dish_required = Column(Boolean, default=False)
    burrowing = Column(String(50))  # none / light / heavy
    # Whether the species is documented as safe-to-keep communally.
    # Drives the colony picker UX — only flagged species get the
    # "create colony" affordance highlighted.
    communal_suitable = Column(Boolean, default=False)

    # SAFETY — the headline scorpion field.
    venom_severity = Column(String(30), nullable=False, default='mild')
    venom_notes = Column(Text)

    # Documentation
    care_guide = Column(Text)
    image_url = Column(String(500))

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
        "User", backref="submitted_scorpion_species", foreign_keys=[submitted_by],
    )

    def __repr__(self):
        return f"<ScorpionSpecies {self.scientific_name}>"
