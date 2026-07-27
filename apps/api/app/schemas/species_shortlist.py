"""Schemas for the species shortlist."""
from datetime import datetime
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ShortlistCreate(BaseModel):
    species_id: uuid.UUID
    note: Optional[str] = Field(None, max_length=2000)


class ShortlistUpdate(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class ShortlistItem(BaseModel):
    """A shortlist row with enough species detail to render a browser row
    without a second round-trip per entry."""
    id: uuid.UUID
    species_id: uuid.UUID
    note: Optional[str] = None
    created_at: datetime

    # Denormalised from invert_species by the router.
    taxon: Optional[str] = None
    scientific_name: Optional[str] = None
    common_names: List[str] = []
    care_level: Optional[str] = None
    image_url: Optional[str] = None
    adult_size: Optional[str] = None
    type: Optional[str] = None
    venom_severity: Optional[str] = None
    is_verified: bool = False
    # True when the keeper already owns one — lets the UI say "in your
    # collection" instead of pretending this is still a wishlist item.
    owned: bool = False

    model_config = ConfigDict(from_attributes=True)


class ShortlistIdsResponse(BaseModel):
    """Just the species ids, for cheaply marking bookmark state across a
    browser list without shipping every full row."""
    species_ids: List[uuid.UUID]
