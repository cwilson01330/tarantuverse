"""
Feeding log schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import uuid


class FeedingLogBase(BaseModel):
    """Base feeding log schema"""
    fed_at: datetime
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    quantity: int = 1  # For group feedings: "fed 8 roaches"
    accepted: bool = True
    # Snake-only: grams of prey. Populating this enables the prey-to-
    # body-weight ratio advisory on the feeding form. Nullable because
    # tarantula feedings never set it and snake keepers may not weigh.
    prey_weight_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    notes: Optional[str] = None


class FeedingLogCreate(FeedingLogBase):
    """Schema for creating a new feeding log"""
    pass


class FeedingLogUpdate(BaseModel):
    """Schema for updating a feeding log (all fields optional)"""
    fed_at: Optional[datetime] = None
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    quantity: Optional[int] = None
    accepted: Optional[bool] = None
    prey_weight_g: Optional[Decimal] = Field(None, ge=0, le=999999.99)
    notes: Optional[str] = None


class BulkFeedingRequest(BaseModel):
    """Log one feeding event across many inverts at once (Feeding Day).

    Applies the same fed_at / accepted / food_type / notes to every animal in
    invert_ids. `accepted=False` records a group refusal. Ownership is verified
    per id server-side; ids the caller doesn't own are skipped, not fatal.
    """
    invert_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=500)
    fed_at: Optional[datetime] = None  # defaults to now (UTC) server-side
    accepted: bool = True
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    quantity: int = 1
    notes: Optional[str] = None


class BulkFeedingSkip(BaseModel):
    invert_id: uuid.UUID
    reason: str


class BulkFeedingResult(BaseModel):
    created_count: int
    created_ids: List[uuid.UUID]
    skipped: List[BulkFeedingSkip] = []


# --- Herpetoverse animals (Feeding Day) ---

class AnimalBulkFeedingRequest(BaseModel):
    """Log one feeding event across many owned animals at once (HV Feeding Day).

    Same fed_at / accepted / food_type / notes applied to every animal in
    animal_ids. `accepted=False` records a group refusal. Ownership verified
    per id; unowned ids are skipped, not fatal.
    """
    animal_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=500)
    fed_at: Optional[datetime] = None  # defaults to now (UTC) server-side
    accepted: bool = True
    food_type: Optional[str] = None
    food_size: Optional[str] = None
    quantity: int = 1
    notes: Optional[str] = None


class AnimalBulkFeedingSkip(BaseModel):
    animal_id: uuid.UUID
    reason: str


class AnimalBulkFeedingResult(BaseModel):
    created_count: int
    created_ids: List[uuid.UUID]
    skipped: List[AnimalBulkFeedingSkip] = []


class FeedingLogResponse(FeedingLogBase):
    """Schema for feeding log response.

    Polymorphic parent — exactly one of tarantula_id / enclosure_id /
    animal_id is populated. ADR-003 collapsed the per-taxon
    snake/lizard/frog FKs into a single animal_id. All Optional so
    Pydantic serializes any variant without a 500.
    """
    id: uuid.UUID
    tarantula_id: Optional[uuid.UUID] = None  # TV tarantula parent
    enclosure_id: Optional[uuid.UUID] = None  # enclosure-level (feeders)
    animal_id: Optional[uuid.UUID] = None  # HV animal parent (any taxon)
    created_at: datetime

    class Config:
        from_attributes = True
