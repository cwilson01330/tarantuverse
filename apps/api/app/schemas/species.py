"""
Species schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


class SpeciesBase(BaseModel):
    """Base species schema"""
    scientific_name: str = Field(..., max_length=255)
    common_names: List[str] = []
    genus: Optional[str] = Field(None, max_length=100)
    family: Optional[str] = Field(None, max_length=100)

    care_level: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced|expert)$")
    temperament: Optional[str] = None
    native_region: Optional[str] = None
    adult_size: Optional[str] = None
    growth_rate: Optional[str] = None
    type: Optional[str] = None

    # Husbandry
    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    enclosure_size_sling: Optional[str] = None
    enclosure_size_juvenile: Optional[str] = None
    enclosure_size_adult: Optional[str] = None
    substrate_depth: Optional[str] = None
    substrate_type: Optional[str] = None

    # Feeding
    prey_size: Optional[str] = None
    feeding_frequency_sling: Optional[str] = None
    feeding_frequency_juvenile: Optional[str] = None
    feeding_frequency_adult: Optional[str] = None

    # Additional Care
    water_dish_required: bool = True
    webbing_amount: Optional[str] = None
    burrowing: bool = False

    # Safety Information
    urticating_hairs: bool = True  # New World tarantulas
    medically_significant_venom: bool = False  # Old World arboreals

    # Documentation
    care_guide: Optional[str] = None
    image_url: Optional[str] = None
    source_url: Optional[str] = None


class SpeciesCreate(SpeciesBase):
    """Schema for creating a new species"""
    is_verified: bool = False  # Can be set to True by admins


class SpeciesUpdate(BaseModel):
    """Schema for updating a species (all fields optional)"""
    scientific_name: Optional[str] = None
    common_names: Optional[List[str]] = None
    genus: Optional[str] = None
    family: Optional[str] = None
    care_level: Optional[str] = None
    temperament: Optional[str] = None
    native_region: Optional[str] = None
    adult_size: Optional[str] = None
    growth_rate: Optional[str] = None
    type: Optional[str] = None
    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    enclosure_size_sling: Optional[str] = None
    enclosure_size_juvenile: Optional[str] = None
    enclosure_size_adult: Optional[str] = None
    substrate_depth: Optional[str] = None
    substrate_type: Optional[str] = None
    prey_size: Optional[str] = None
    feeding_frequency_sling: Optional[str] = None
    feeding_frequency_juvenile: Optional[str] = None
    feeding_frequency_adult: Optional[str] = None
    water_dish_required: Optional[bool] = None
    webbing_amount: Optional[str] = None
    burrowing: Optional[bool] = None
    urticating_hairs: Optional[bool] = None
    medically_significant_venom: Optional[bool] = None
    care_guide: Optional[str] = None
    image_url: Optional[str] = None
    source_url: Optional[str] = None


class SpeciesResponse(SpeciesBase):
    """Schema for species response"""
    id: uuid.UUID
    scientific_name_lower: str
    is_verified: bool
    submitted_by: Optional[uuid.UUID]
    community_rating: float
    times_kept: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class SpeciesSearchResult(BaseModel):
    """Minimal species info for autocomplete/search"""
    id: uuid.UUID
    scientific_name: str
    common_names: List[str]
    genus: Optional[str]
    care_level: Optional[str]
    image_url: Optional[str]

    class Config:
        from_attributes = True
