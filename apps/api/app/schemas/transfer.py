"""Pydantic schemas for animal transfer ("rehome") — BRIEF-animal-transfer-provenance.

Note the asymmetry: the seller-facing create response carries the token + claim
URL; the PUBLIC preview NEVER includes sale_price (private seller ledger).
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class TransferCreate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)
    sale_price: Optional[float] = Field(default=None, ge=0)
    include_photos: bool = True
    expires_in_days: int = Field(default=30, ge=1, le=90)


class TransferCreateResponse(BaseModel):
    token: str
    claim_url: str
    expires_at: datetime


class TransferPreview(BaseModel):
    """Public claim-page payload. No sale_price, ever."""
    status: str
    taxon: str
    name: Optional[str] = None
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    sex: Optional[str] = None
    life_stage: Optional[str] = None
    species_id: Optional[str] = None
    photo_urls: list[str] = []
    breeder_handle: Optional[str] = None
    note: Optional[str] = None
    # Lineage — present only when bred on-platform + linked to an Offspring.
    # The client renders a "Pedigree" block only when dam/sire are non-null
    # (honesty-first — §4c), otherwise a plain provenance block.
    dam_scientific_name: Optional[str] = None
    sire_scientific_name: Optional[str] = None
    sac_laid_date: Optional[str] = None
    molt_count_at_transfer: Optional[int] = None
    last_molt_at_transfer: Optional[str] = None
    expires_at: Optional[datetime] = None


class TransferListItem(BaseModel):
    id: str
    token: str
    status: str
    role: str  # 'sent' | 'received'
    invert_id: Optional[str] = None
    claimed_invert_id: Optional[str] = None
    taxon: Optional[str] = None
    display_name: Optional[str] = None
    counterparty: Optional[str] = None  # buyer (sent) or seller (received) handle
    sale_price: Optional[float] = None  # only populated on 'sent' rows (seller's own)
    note: Optional[str] = None
    created_at: datetime
    claimed_at: Optional[datetime] = None
    expires_at: datetime
