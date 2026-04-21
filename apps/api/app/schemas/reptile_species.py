"""ReptileSpecies schemas

Pydantic schemas for the reptile_species table. Parallel to `species` schemas
but reptile-specific — multiple temp zones, UVB fields, CITES/IUCN, brumation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import date, datetime
from decimal import Decimal
import uuid


class ReptileSpeciesBase(BaseModel):
    # Taxonomy
    scientific_name: str = Field(..., max_length=255)
    common_names: List[str] = []
    genus: Optional[str] = Field(None, max_length=100)
    family: Optional[str] = Field(None, max_length=100)
    order_name: Optional[str] = Field(None, max_length=100)

    # Care classification
    care_level: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    handleability: Optional[str] = Field(
        None, pattern="^(docile|defensive|nippy|hands_off)$"
    )
    activity_period: Optional[str] = Field(
        None, pattern="^(diurnal|nocturnal|crepuscular)$"
    )

    # Geography / size
    native_region: Optional[str] = Field(None, max_length=200)
    adult_length_min_in: Optional[Decimal] = None
    adult_length_max_in: Optional[Decimal] = None
    adult_weight_min_g: Optional[Decimal] = None
    adult_weight_max_g: Optional[Decimal] = None

    # Climate
    temp_cool_min: Optional[Decimal] = None
    temp_cool_max: Optional[Decimal] = None
    temp_warm_min: Optional[Decimal] = None
    temp_warm_max: Optional[Decimal] = None
    temp_basking_min: Optional[Decimal] = None
    temp_basking_max: Optional[Decimal] = None
    temp_night_min: Optional[Decimal] = None
    temp_night_max: Optional[Decimal] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    humidity_shed_boost_min: Optional[int] = None
    humidity_shed_boost_max: Optional[int] = None

    # UVB
    uvb_required: bool = False
    uvb_type: Optional[str] = Field(None, pattern="^(T5_HO|T8|not_required)$")
    uvb_distance_min_in: Optional[Decimal] = None
    uvb_distance_max_in: Optional[Decimal] = None
    uvb_replacement_months: Optional[int] = None

    # Enclosure
    enclosure_type: Optional[str] = Field(
        None, pattern="^(terrestrial|arboreal|semi_arboreal|fossorial)$"
    )
    enclosure_min_hatchling: Optional[str] = Field(None, max_length=100)
    enclosure_min_juvenile: Optional[str] = Field(None, max_length=100)
    enclosure_min_adult: Optional[str] = Field(None, max_length=100)
    bioactive_suitable: bool = False

    # Substrate
    substrate_safe_list: List[str] = []
    substrate_avoid_list: List[str] = []
    substrate_depth_min_in: Optional[Decimal] = None
    substrate_depth_max_in: Optional[Decimal] = None

    # Diet
    diet_type: Optional[str] = Field(
        None, pattern="^(strict_carnivore|insectivore|omnivore|herbivore)$"
    )
    prey_size_hatchling: Optional[str] = Field(None, max_length=100)
    prey_size_juvenile: Optional[str] = Field(None, max_length=100)
    prey_size_adult: Optional[str] = Field(None, max_length=100)
    feeding_frequency_hatchling: Optional[str] = Field(None, max_length=100)
    feeding_frequency_juvenile: Optional[str] = Field(None, max_length=100)
    feeding_frequency_adult: Optional[str] = Field(None, max_length=100)
    supplementation_notes: Optional[str] = None

    # Water & behavior
    water_bowl_description: Optional[str] = Field(None, max_length=200)
    soaking_behavior: Optional[str] = None
    brumation_required: bool = False
    brumation_notes: Optional[str] = None
    defensive_displays: List[str] = []

    # Lifespan
    lifespan_captivity_min_yrs: Optional[int] = None
    lifespan_captivity_max_yrs: Optional[int] = None

    # Conservation / legal
    cites_appendix: Optional[str] = Field(None, pattern="^(I|II|III)$")
    iucn_status: Optional[str] = Field(None, pattern="^(LC|NT|VU|EN|CR|EW|EX|DD)$")
    wild_population_notes: Optional[str] = None

    # Morphs
    has_morph_market: bool = False
    morph_complexity: Optional[str] = Field(
        None, pattern="^(none|simple|moderate|complex)$"
    )

    # Documentation
    care_guide: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    source_url: Optional[str] = Field(None, max_length=500)
    sources: Optional[List[Any]] = None


class ReptileSpeciesCreate(ReptileSpeciesBase):
    """Schema for creating a new reptile species (community submission)"""
    pass


class ReptileSpeciesUpdate(BaseModel):
    """Schema for updating a reptile species (all fields optional)"""
    common_names: Optional[List[str]] = None
    genus: Optional[str] = None
    family: Optional[str] = None
    order_name: Optional[str] = None
    care_level: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    handleability: Optional[str] = None
    activity_period: Optional[str] = None
    native_region: Optional[str] = None
    adult_length_min_in: Optional[Decimal] = None
    adult_length_max_in: Optional[Decimal] = None
    adult_weight_min_g: Optional[Decimal] = None
    adult_weight_max_g: Optional[Decimal] = None
    temp_cool_min: Optional[Decimal] = None
    temp_cool_max: Optional[Decimal] = None
    temp_warm_min: Optional[Decimal] = None
    temp_warm_max: Optional[Decimal] = None
    temp_basking_min: Optional[Decimal] = None
    temp_basking_max: Optional[Decimal] = None
    temp_night_min: Optional[Decimal] = None
    temp_night_max: Optional[Decimal] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    humidity_shed_boost_min: Optional[int] = None
    humidity_shed_boost_max: Optional[int] = None
    uvb_required: Optional[bool] = None
    uvb_type: Optional[str] = None
    uvb_distance_min_in: Optional[Decimal] = None
    uvb_distance_max_in: Optional[Decimal] = None
    uvb_replacement_months: Optional[int] = None
    enclosure_type: Optional[str] = None
    enclosure_min_hatchling: Optional[str] = None
    enclosure_min_juvenile: Optional[str] = None
    enclosure_min_adult: Optional[str] = None
    bioactive_suitable: Optional[bool] = None
    substrate_safe_list: Optional[List[str]] = None
    substrate_avoid_list: Optional[List[str]] = None
    substrate_depth_min_in: Optional[Decimal] = None
    substrate_depth_max_in: Optional[Decimal] = None
    diet_type: Optional[str] = None
    prey_size_hatchling: Optional[str] = None
    prey_size_juvenile: Optional[str] = None
    prey_size_adult: Optional[str] = None
    feeding_frequency_hatchling: Optional[str] = None
    feeding_frequency_juvenile: Optional[str] = None
    feeding_frequency_adult: Optional[str] = None
    supplementation_notes: Optional[str] = None
    water_bowl_description: Optional[str] = None
    soaking_behavior: Optional[str] = None
    brumation_required: Optional[bool] = None
    brumation_notes: Optional[str] = None
    defensive_displays: Optional[List[str]] = None
    lifespan_captivity_min_yrs: Optional[int] = None
    lifespan_captivity_max_yrs: Optional[int] = None
    cites_appendix: Optional[str] = None
    iucn_status: Optional[str] = None
    wild_population_notes: Optional[str] = None
    has_morph_market: Optional[bool] = None
    morph_complexity: Optional[str] = None
    care_guide: Optional[str] = None
    image_url: Optional[str] = None
    source_url: Optional[str] = None
    sources: Optional[List[Any]] = None
    is_verified: Optional[bool] = None
    content_last_reviewed_at: Optional[date] = None


class ReptileSpeciesResponse(ReptileSpeciesBase):
    id: uuid.UUID
    is_verified: bool
    submitted_by: Optional[uuid.UUID] = None
    verified_by: Optional[uuid.UUID] = None
    verified_at: Optional[datetime] = None
    community_rating: float = 0.0
    times_kept: int = 0
    content_last_reviewed_at: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
