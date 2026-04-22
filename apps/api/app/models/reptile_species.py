"""ReptileSpecies model

Parallel to the existing `Species` (tarantula) model. Separate table because
the reptile field set is materially richer — multiple temperature zones, UVB
requirements, humidity shed-boost, CITES/IUCN conservation status, brumation
profiles, per-life-stage feeding schedules.

Per ADR-002 §D1 and PRD-herpetoverse-v1.md §5.3.
"""
from sqlalchemy import (
    Column,
    String,
    Text,
    ARRAY,
    Date,
    DateTime,
    Integer,
    Float,
    Boolean,
    Numeric,
    ForeignKey,
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.database import Base


class ReptileCareLevel(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class ReptileSpecies(Base):
    __tablename__ = "reptile_species"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Taxonomy
    scientific_name = Column(String(255), unique=True, nullable=False, index=True)
    scientific_name_lower = Column(
        String(255), unique=True, nullable=False, index=True
    )
    common_names = Column(ARRAY(String), default=[])
    genus = Column(String(100), index=True)
    family = Column(String(100))
    order_name = Column(String(100))  # 'order' is a SQL reserved word — avoid

    # Care classification
    care_level = Column(
        SQLEnum(
            ReptileCareLevel,
            name="reptilecarelevel",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReptileCareLevel.BEGINNER,
    )
    handleability = Column(String(30))  # 'docile' | 'defensive' | 'nippy' | 'hands_off'
    activity_period = Column(String(30))  # 'diurnal' | 'nocturnal' | 'crepuscular'

    # Geography / size
    native_region = Column(String(200))
    adult_length_min_in = Column(Numeric(6, 2))
    adult_length_max_in = Column(Numeric(6, 2))
    adult_weight_min_g = Column(Numeric(8, 2))
    adult_weight_max_g = Column(Numeric(8, 2))

    # Climate — multiple zones; shed-boost humidity is a real husbandry concept
    temp_cool_min = Column(Numeric(5, 2))
    temp_cool_max = Column(Numeric(5, 2))
    temp_warm_min = Column(Numeric(5, 2))
    temp_warm_max = Column(Numeric(5, 2))
    temp_basking_min = Column(Numeric(5, 2))
    temp_basking_max = Column(Numeric(5, 2))
    temp_night_min = Column(Numeric(5, 2))
    temp_night_max = Column(Numeric(5, 2))
    humidity_min = Column(Integer)
    humidity_max = Column(Integer)
    humidity_shed_boost_min = Column(Integer)
    humidity_shed_boost_max = Column(Integer)

    # UVB
    uvb_required = Column(Boolean, default=False)
    uvb_type = Column(String(30))  # 'T5_HO' | 'T8' | 'not_required'
    uvb_distance_min_in = Column(Numeric(5, 2))
    uvb_distance_max_in = Column(Numeric(5, 2))
    uvb_replacement_months = Column(Integer)

    # Enclosure
    enclosure_type = Column(String(30))  # 'terrestrial' | 'arboreal' | 'semi_arboreal' | 'fossorial'
    enclosure_min_hatchling = Column(String(100))
    enclosure_min_juvenile = Column(String(100))
    enclosure_min_adult = Column(String(100))
    bioactive_suitable = Column(Boolean, default=False)

    # Substrate
    substrate_safe_list = Column(ARRAY(String), default=[])
    substrate_avoid_list = Column(ARRAY(String), default=[])
    substrate_depth_min_in = Column(Numeric(5, 2))
    substrate_depth_max_in = Column(Numeric(5, 2))

    # Diet
    diet_type = Column(String(30))  # 'strict_carnivore' | 'insectivore' | 'omnivore' | 'herbivore'
    prey_size_hatchling = Column(String(100))
    prey_size_juvenile = Column(String(100))
    prey_size_adult = Column(String(100))
    feeding_frequency_hatchling = Column(String(100))
    feeding_frequency_juvenile = Column(String(100))
    feeding_frequency_adult = Column(String(100))
    supplementation_notes = Column(Text)

    # Water & behavior
    water_bowl_description = Column(String(200))
    soaking_behavior = Column(Text)
    brumation_required = Column(Boolean, default=False)
    brumation_notes = Column(Text)
    defensive_displays = Column(ARRAY(String), default=[])

    # Lifespan
    lifespan_captivity_min_yrs = Column(Integer)
    lifespan_captivity_max_yrs = Column(Integer)

    # Conservation / legal
    cites_appendix = Column(String(5))  # 'I' | 'II' | 'III' | null
    iucn_status = Column(String(5))  # 'LC'|'NT'|'VU'|'EN'|'CR'|'EW'|'EX'|'DD'
    wild_population_notes = Column(Text)

    # Morphs (informational; full data lives in `genes` table)
    has_morph_market = Column(Boolean, default=False)
    morph_complexity = Column(String(20))  # 'none' | 'simple' | 'moderate' | 'complex'

    # Documentation
    care_guide = Column(Text)
    image_url = Column(String(500))
    source_url = Column(String(500))
    sources = Column(JSONB, nullable=True)  # array of {title, url, publication_date}

    # Community / verification
    is_verified = Column(Boolean, default=False)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True))
    community_rating = Column(Float, default=0.0)
    times_kept = Column(Integer, default=0)

    # Audit / staleness
    content_last_reviewed_at = Column(Date)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    submitted_by_user = relationship(
        "User",
        backref="submitted_reptile_species",
        foreign_keys=[submitted_by],
    )
    verified_by_user = relationship(
        "User",
        foreign_keys=[verified_by],
    )

    def __repr__(self):
        return f"<ReptileSpecies {self.scientific_name}>"
