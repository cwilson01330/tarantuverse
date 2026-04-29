"""Pydantic schemas for reptile breeding records.

Three resources, with a deliberate split between Create / Update /
Response for each. Create payloads are strict (paired_date required)
while Update payloads are permissive (every field optional, only
applies what's sent — the standard PATCH-style pattern). Response
payloads echo the DB shape and add a few derived fields the UI needs
without taking another round trip (e.g. the pairing's `taxon`).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ─── Pairings ──────────────────────────────────────────────────────────

PairingTypeStr = Literal["natural", "cohabitation", "assisted", "ai"]
PairingOutcomeStr = Literal[
    "in_progress",
    "successful",
    "unsuccessful",
    "abandoned",
    "unknown",
]
TaxonStr = Literal["snake", "lizard"]


class ReptilePairingCreate(BaseModel):
    """Create a new pairing.

    Caller supplies `taxon` + the two parent IDs; the server fills the
    appropriate FK columns. Mixing taxa in a single pairing is rejected
    by the DB CHECK constraint, but we also short-circuit at the API
    layer for a friendlier error.
    """
    taxon: TaxonStr
    male_id: UUID
    female_id: UUID
    paired_date: date
    separated_date: Optional[date] = None
    pairing_type: PairingTypeStr = "natural"
    outcome: PairingOutcomeStr = "in_progress"
    is_private: bool = True
    notes: Optional[str] = Field(None, max_length=4000)


class ReptilePairingUpdate(BaseModel):
    """Partial update — only fields the caller explicitly sends are applied.

    Parent IDs and taxon are intentionally omitted: changing parents on a
    pairing that already has clutches under it would orphan / lie about
    lineage. If a keeper made a mistake, they should delete + recreate.
    """
    separated_date: Optional[date] = None
    pairing_type: Optional[PairingTypeStr] = None
    outcome: Optional[PairingOutcomeStr] = None
    is_private: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=4000)


class ReptilePairingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    taxon: TaxonStr
    male_id: UUID  # derived: whichever of male_snake_id / male_lizard_id is set
    female_id: UUID
    male_snake_id: Optional[UUID] = None
    male_lizard_id: Optional[UUID] = None
    female_snake_id: Optional[UUID] = None
    female_lizard_id: Optional[UUID] = None
    paired_date: date
    separated_date: Optional[date] = None
    pairing_type: PairingTypeStr
    outcome: PairingOutcomeStr
    is_private: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Derived display fields — saves the UI another round-trip just to
    # name the parents.
    male_display_name: Optional[str] = None
    female_display_name: Optional[str] = None
    clutch_count: int = 0


# ─── Clutches ──────────────────────────────────────────────────────────


class CandleEntry(BaseModel):
    """One candling observation. Loose schema — keepers add fields they
    care about; unknown fields pass through via `extra='allow'`."""
    model_config = ConfigDict(extra="allow")

    date: date
    fertile: Optional[int] = None
    slug: Optional[int] = None
    notes: Optional[str] = None


class ClutchCreate(BaseModel):
    pairing_id: UUID
    laid_date: date
    pulled_date: Optional[date] = None
    expected_hatch_date: Optional[date] = None
    hatch_date: Optional[date] = None

    incubation_temp_min_f: Optional[Decimal] = Field(None, ge=40, le=120)
    incubation_temp_max_f: Optional[Decimal] = Field(None, ge=40, le=120)
    incubation_humidity_min_pct: Optional[int] = Field(None, ge=0, le=100)
    incubation_humidity_max_pct: Optional[int] = Field(None, ge=0, le=100)

    expected_count: Optional[int] = Field(None, ge=0, le=200)
    fertile_count: Optional[int] = Field(None, ge=0, le=200)
    slug_count: Optional[int] = Field(None, ge=0, le=200)
    hatched_count: Optional[int] = Field(None, ge=0, le=200)
    viable_count: Optional[int] = Field(None, ge=0, le=200)

    candle_log: Optional[List[CandleEntry]] = None
    notes: Optional[str] = Field(None, max_length=4000)
    photo_url: Optional[str] = Field(None, max_length=500)


class ClutchUpdate(BaseModel):
    pulled_date: Optional[date] = None
    expected_hatch_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min_f: Optional[Decimal] = Field(None, ge=40, le=120)
    incubation_temp_max_f: Optional[Decimal] = Field(None, ge=40, le=120)
    incubation_humidity_min_pct: Optional[int] = Field(None, ge=0, le=100)
    incubation_humidity_max_pct: Optional[int] = Field(None, ge=0, le=100)
    expected_count: Optional[int] = Field(None, ge=0, le=200)
    fertile_count: Optional[int] = Field(None, ge=0, le=200)
    slug_count: Optional[int] = Field(None, ge=0, le=200)
    hatched_count: Optional[int] = Field(None, ge=0, le=200)
    viable_count: Optional[int] = Field(None, ge=0, le=200)
    candle_log: Optional[List[CandleEntry]] = None
    notes: Optional[str] = Field(None, max_length=4000)
    photo_url: Optional[str] = Field(None, max_length=500)


class ClutchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pairing_id: UUID
    user_id: UUID
    laid_date: date
    pulled_date: Optional[date] = None
    expected_hatch_date: Optional[date] = None
    hatch_date: Optional[date] = None
    incubation_temp_min_f: Optional[Decimal] = None
    incubation_temp_max_f: Optional[Decimal] = None
    incubation_humidity_min_pct: Optional[int] = None
    incubation_humidity_max_pct: Optional[int] = None
    expected_count: Optional[int] = None
    fertile_count: Optional[int] = None
    slug_count: Optional[int] = None
    hatched_count: Optional[int] = None
    viable_count: Optional[int] = None
    candle_log: Optional[List[Any]] = None  # JSONB — raw passthrough
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    offspring_count: int = 0


# ─── Offspring ─────────────────────────────────────────────────────────

OffspringStatusStr = Literal[
    "hatched",
    "kept",
    "available",
    "sold",
    "traded",
    "gifted",
    "deceased",
    "unknown",
]


class GenotypeEntry(BaseModel):
    """One gene's recorded genotype on an offspring without a live FK.

    `gene_key` matches the slug we use throughout the morph calculator
    (e.g. 'pied', 'albino'). `zygosity` mirrors the same vocabulary as
    the animal_genotypes table: 'wild', 'het', 'hom'.
    """
    gene_key: str
    zygosity: Literal["wild", "het", "hom"]


class ReptileOffspringCreate(BaseModel):
    clutch_id: UUID
    snake_id: Optional[UUID] = None
    lizard_id: Optional[UUID] = None
    morph_label: Optional[str] = Field(None, max_length=200)
    recorded_genotype: Optional[List[GenotypeEntry]] = None
    status: OffspringStatusStr = "hatched"
    status_date: Optional[date] = None
    buyer_info: Optional[str] = Field(None, max_length=1000)
    price_sold: Optional[Decimal] = Field(None, ge=0)
    hatch_weight_g: Optional[Decimal] = Field(None, ge=0)
    hatch_length_in: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=4000)
    photo_url: Optional[str] = Field(None, max_length=500)


class ReptileOffspringUpdate(BaseModel):
    snake_id: Optional[UUID] = None
    lizard_id: Optional[UUID] = None
    morph_label: Optional[str] = Field(None, max_length=200)
    recorded_genotype: Optional[List[GenotypeEntry]] = None
    status: Optional[OffspringStatusStr] = None
    status_date: Optional[date] = None
    buyer_info: Optional[str] = Field(None, max_length=1000)
    price_sold: Optional[Decimal] = Field(None, ge=0)
    hatch_weight_g: Optional[Decimal] = Field(None, ge=0)
    hatch_length_in: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=4000)
    photo_url: Optional[str] = Field(None, max_length=500)


class ReptileOffspringResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clutch_id: UUID
    user_id: UUID
    snake_id: Optional[UUID] = None
    lizard_id: Optional[UUID] = None
    morph_label: Optional[str] = None
    recorded_genotype: Optional[List[Any]] = None
    status: OffspringStatusStr
    status_date: Optional[date] = None
    buyer_info: Optional[str] = None
    price_sold: Optional[Decimal] = None
    hatch_weight_g: Optional[Decimal] = None
    hatch_length_in: Optional[Decimal] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─── Predicted morph outcomes ──────────────────────────────────────────
#
# The actual Punnett logic lives in the front-end morph calculator (it
# carries citations, welfare warnings, and lethal-homozygous flags that
# we don't want to maintain in two languages). This endpoint just
# packages the data the calculator needs: each parent's recorded
# genotypes + the set of genes both have on file (the safe overlap to
# predict against).


class ParentGenotypeBundle(BaseModel):
    """Per-parent genotype bundle — identifying info + zygosity per
    recorded gene. Genes the parent doesn't have on file simply don't
    appear; the front-end can show "incomplete genotype" hints based on
    the species' gene catalog."""
    animal_id: UUID
    display_name: str
    genotypes: List[GenotypeEntry]


class ClutchParentGenotypesResponse(BaseModel):
    """Output of /clutches/{id}/parent-genotypes — feeds the morph
    calculator on the front-end with both parents' zygosity data.

    `overlapping_gene_keys` is the set of genes both parents have a
    recorded zygosity for — the safe subset to predict against. Genes
    only one parent has are still surfaced in the parent bundles so the
    UI can prompt the keeper to fill in the missing side.
    """
    pairing_id: UUID
    clutch_id: UUID
    taxon: TaxonStr
    male: ParentGenotypeBundle
    female: ParentGenotypeBundle
    overlapping_gene_keys: List[str]
    note: Optional[str] = None
