"""
Offspring schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal
import uuid
from app.models.offspring import OffspringStatus


class OffspringBase(BaseModel):
    """Base offspring schema"""
    egg_sac_id: uuid.UUID
    # The "kept" link — this offspring became a tracked animal in the
    # collection. Two fields for one relationship, because of ADR-005:
    #
    #   invert_id     the one to use. Works for every taxon.
    #   tarantula_id  legacy. Kept accepted so existing clients don't break,
    #                 and still written for tarantulas (shared primary key) so
    #                 the legacy breeding hub keeps resolving them.
    #
    # `invert_id` used to exist on the RESPONSE only, which meant a jumping
    # spider sling could not be linked to its record at all: passing its id as
    # tarantula_id 404'd, because a non-tarantula has no row in that table.
    # That was the single break in the non-tarantula breeding chain.
    invert_id: Optional[uuid.UUID] = None
    tarantula_id: Optional[uuid.UUID] = None
    status: OffspringStatus = OffspringStatus.UNKNOWN
    status_date: Optional[date] = None
    buyer_info: Optional[str] = None
    price_sold: Optional[Decimal] = Field(None, ge=0, le=99999999.99)
    notes: Optional[str] = None


class OffspringCreate(OffspringBase):
    """Schema for creating a new offspring record"""
    pass


class OffspringUpdate(BaseModel):
    """Schema for updating an offspring record (all fields optional)"""
    egg_sac_id: Optional[uuid.UUID] = None
    invert_id: Optional[uuid.UUID] = None
    tarantula_id: Optional[uuid.UUID] = None
    status: Optional[OffspringStatus] = None
    status_date: Optional[date] = None
    buyer_info: Optional[str] = None
    price_sold: Optional[Decimal] = None
    notes: Optional[str] = None


class OffspringBulkCreate(BaseModel):
    """Create N offspring at once from one egg sac (the high-volume add).

    No kept-link field on purpose: N identical rows can't each point at a
    different animal, and pointing them all at one would be false. Link them
    individually afterwards.
    """
    egg_sac_id: uuid.UUID
    count: int = Field(..., ge=1, le=1000)
    status: OffspringStatus = OffspringStatus.UNKNOWN
    status_date: Optional[date] = None
    price_sold: Optional[Decimal] = Field(None, ge=0, le=99999999.99)
    buyer_info: Optional[str] = None
    notes: Optional[str] = None


class OffspringBulkUpdate(BaseModel):
    """Apply shared field changes to many offspring at once (e.g. mark sold).

    Only fields that are set are applied; ids must all belong to the caller.
    """
    ids: List[uuid.UUID] = Field(..., min_length=1, max_length=1000)
    status: Optional[OffspringStatus] = None
    status_date: Optional[date] = None
    price_sold: Optional[Decimal] = Field(None, ge=0, le=99999999.99)
    buyer_info: Optional[str] = None
    notes: Optional[str] = None


class OffspringBulkResult(BaseModel):
    """Summary returned by the bulk endpoints."""
    affected: int


class OffspringResponse(OffspringBase):
    """Schema for offspring response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: date
    # ADR-010 — generic "kept" link on the inverts surface (equals
    # tarantula_id for tarantula offspring).
    invert_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True
