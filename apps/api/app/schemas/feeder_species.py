"""
Pydantic schemas for FeederSpecies.

Admin-curated reference data. Public read; write is admin-gated at the router.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
import uuid


# Keep in sync with router validation & PRD §3
FEEDER_CATEGORIES = {"cricket", "roach", "larvae", "other"}
FEEDER_CARE_LEVELS = {"easy", "moderate", "hard"}


class FeederSpeciesBase(BaseModel):
    scientific_name: str = Field(..., max_length=150)
    common_names: Optional[List[str]] = None
    category: str = Field(..., pattern=r"^(cricket|roach|larvae|other)$")
    care_level: Optional[str] = Field(None, pattern=r"^(easy|moderate|hard)$")

    temperature_min: Optional[int] = Field(None, ge=0, le=130)
    temperature_max: Optional[int] = Field(None, ge=0, le=130)
    humidity_min: Optional[int] = Field(None, ge=0, le=100)
    humidity_max: Optional[int] = Field(None, ge=0, le=100)

    typical_adult_size_mm: Optional[int] = Field(None, ge=0, le=500)
    supports_life_stages: bool = False
    # e.g. ["adults", "nymphs", "pinheads"] for Dubia roaches
    default_life_stages: Optional[List[str]] = None
    prey_size_notes: Optional[str] = None
    care_notes: Optional[str] = None

    image_url: Optional[str] = Field(None, max_length=500)


class FeederSpeciesCreate(FeederSpeciesBase):
    pass


class FeederSpeciesUpdate(BaseModel):
    scientific_name: Optional[str] = Field(None, max_length=150)
    common_names: Optional[List[str]] = None
    category: Optional[str] = Field(None, pattern=r"^(cricket|roach|larvae|other)$")
    care_level: Optional[str] = Field(None, pattern=r"^(easy|moderate|hard)$")
    temperature_min: Optional[int] = Field(None, ge=0, le=130)
    temperature_max: Optional[int] = Field(None, ge=0, le=130)
    humidity_min: Optional[int] = Field(None, ge=0, le=100)
    humidity_max: Optional[int] = Field(None, ge=0, le=100)
    typical_adult_size_mm: Optional[int] = Field(None, ge=0, le=500)
    supports_life_stages: Optional[bool] = None
    default_life_stages: Optional[List[str]] = None
    prey_size_notes: Optional[str] = None
    care_notes: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)
    is_verified: Optional[bool] = None


class FeederSpeciesResponse(FeederSpeciesBase):
    id: uuid.UUID
    is_verified: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class FeederSpeciesListItem(BaseModel):
    """Lightweight entry for pickers/autocomplete."""
    id: uuid.UUID
    scientific_name: str
    common_names: Optional[List[str]] = None
    category: str
    care_level: Optional[str] = None
    image_url: Optional[str] = None
    supports_life_stages: bool = False
    default_life_stages: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)
