"""Pydantic schemas for animal transfer ("rehome") — BRIEF-animal-transfer-provenance.

Note the asymmetry: the seller-facing create response carries the token + claim
URL; the PUBLIC preview NEVER includes sale_price (private seller ledger).
"""
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, StrictInt, field_validator, model_validator


class TransferCreate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)
    sale_price: Optional[float] = Field(default=None, ge=0)
    include_photos: bool = True
    expires_in_days: int = Field(default=30, ge=1, le=90)


class ColonyTransferCreate(TransferCreate):
    """Hand over a whole colony ('full') or some of it ('partial').

    Shape only here; whether the colony actually holds these numbers is checked
    against its stage_counts by the route (and again at claim, because the
    counts can change between the link being made and being claimed).
    """
    mode: str = Field(..., pattern="^(full|partial)$")
    counts: Optional[Dict[str, StrictInt]] = None

    @field_validator("counts")
    @classmethod
    def _positive_counts(cls, v):
        if v is None:
            return v
        for stage, n in v.items():
            if not isinstance(stage, str) or not stage.strip():
                raise ValueError("Each stage needs a name.")
            # bool is an int subclass — True must not mean "1 adult".
            if isinstance(n, bool) or not isinstance(n, int) or n <= 0:
                raise ValueError("Each count must be a whole number above zero.")
        return v

    @model_validator(mode="after")
    def _counts_match_mode(self):
        if self.mode == "partial" and not self.counts:
            raise ValueError("Say how many of each stage you're handing over.")
        if self.mode == "full" and self.counts:
            raise ValueError("A whole-colony transfer takes every animal; leave the counts out.")
        if self.mode == "full":
            self.counts = None
        return self


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

    # What is being handed over: 'invert' | 'animal' | 'colony'. Optional so
    # older clients that never read it are unaffected.
    kind: Optional[str] = None
    # Colony transfers only. 'full' | 'partial'.
    colony_mode: Optional[str] = None
    # Per-stage counts being handed over: the requested counts for a partial
    # transfer, the colony's whole breakdown for a full one.
    transfer_counts: Optional[Dict[str, int]] = None
    transfer_total: Optional[int] = None
    # The colony's current headcount, for "25 of ~360". Never its location,
    # notes or price.
    colony_total: Optional[int] = None
    count_is_estimated: Optional[bool] = None


class TransferListItem(BaseModel):
    id: str
    token: str
    status: str
    role: str  # 'sent' | 'received'
    invert_id: Optional[str] = None
    claimed_invert_id: Optional[str] = None
    # HV (animals) polymorphic source — mutually exclusive with invert_id.
    animal_id: Optional[str] = None
    claimed_animal_id: Optional[str] = None
    # Colony source (ctr_20261008) — mutually exclusive with the two above.
    colony_id: Optional[str] = None
    claimed_colony_id: Optional[str] = None
    # 'invert' | 'animal' | 'colony', plus a ready-to-show label such as
    # "Whole colony" or "25 of the colony".
    kind: Optional[str] = None
    colony_mode: Optional[str] = None
    transfer_counts: Optional[Dict[str, int]] = None
    transfer_total: Optional[int] = None
    label: Optional[str] = None
    taxon: Optional[str] = None
    display_name: Optional[str] = None
    counterparty: Optional[str] = None  # buyer (sent) or seller (received) handle
    sale_price: Optional[float] = None  # only populated on 'sent' rows (seller's own)
    note: Optional[str] = None
    created_at: datetime
    claimed_at: Optional[datetime] = None
    expires_at: datetime
