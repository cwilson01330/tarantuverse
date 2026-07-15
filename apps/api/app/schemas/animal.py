"""Animal schemas — unified Herpetoverse taxon record.

Implements ADR-003. Replaces the per-taxon Snake / Lizard / Frog
schemas. `taxon` is set once on create and is immutable thereafter
(it's not in AnimalUpdate) — an animal doesn't change taxon.

The species FK field is `herp_species_id` (table renamed from
reptile_species in anh_20260514). The catalog *route* stays
`/api/v1/reptile-species/` because appalachiantarantulas.com reads it
— only the table + this FK field were renamed.
"""
from pydantic import BaseModel, Field
from typing import Any, Optional
from datetime import date, datetime
from decimal import Decimal
import uuid


class AnimalBase(BaseModel):
    """Fields a keeper can set when creating/updating an animal."""
    name: Optional[str] = Field(None, max_length=100)
    common_name: Optional[str] = Field(None, max_length=100)
    scientific_name: Optional[str] = Field(None, max_length=255)
    sex: Optional[str] = Field(None, pattern="^(male|female|unknown)$")

    # Acquisition
    date_acquired: Optional[date] = None
    hatch_date: Optional[date] = None
    source: Optional[str] = Field(None, pattern="^(bred|bought|wild_caught)$")
    source_breeder: Optional[str] = Field(None, max_length=255)
    price_paid: Optional[Decimal] = None

    # Current state
    current_weight_g: Optional[Decimal] = None
    current_length_in: Optional[Decimal] = None

    # Husbandry reference. brumation_* doubles as aestivation for frogs.
    feeding_schedule: Optional[str] = Field(None, max_length=200)
    brumation_active: bool = False
    brumation_started_at: Optional[date] = None
    feeding_paused_reason: Optional[str] = Field(None, max_length=40)
    feeding_paused_until: Optional[date] = None

    # CGD override — NULL inherits the herp_species.feeds_on_cgd default;
    # true/false explicitly overrides for this animal. Clients resolve
    # the effective value as `override ?? species.feeds_on_cgd`.
    feeds_on_cgd_override: Optional[bool] = None

    # Media
    photo_url: Optional[str] = Field(None, max_length=500)

    # Privacy
    is_public: bool = False
    visibility: Optional[str] = Field(None, pattern="^(private|public)$")

    # Notes
    notes: Optional[str] = None


class AnimalCreate(AnimalBase):
    """Schema for creating a new animal. `taxon` is required and
    immutable — it never appears in AnimalUpdate."""
    # Kept in lockstep with ANIMAL_TAXON_VALUES (models/animal.py) + the
    # animals_taxon_check CHECK + the frontend ANIMAL_TAXA registries (ADR-011).
    taxon: str = Field(..., pattern="^(snake|lizard|turtle|tortoise|frog|salamander|other)$")
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None


class AnimalUpdate(AnimalBase):
    """Schema for updating an animal. Inherits all-optional from
    AnimalBase. `taxon` is intentionally absent — immutable."""
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    # Denormalized timestamps are usually updated by the app from
    # feeding / shed log inserts, but allow admin / bulk-import overrides:
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None


class AnimalFeedingStatusItem(BaseModel):
    """One row of the HV Feeding Day list — an animal's feeding status.

    `interval_days` is the recommended days-between-feedings resolved from the
    animal's schedule / species (CGD day-4, weight-bracketed snake intervals,
    or a parsed frequency); None when we can't determine a cadence, in which
    case the animal is never flagged overdue (honesty over a wrong guess).
    """
    id: uuid.UUID
    name: Optional[str] = None
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    taxon: str
    photo_url: Optional[str] = None
    last_feeding_date: Optional[datetime] = None
    days_since_last_feeding: Optional[int] = None
    is_feeding_paused: bool = False
    is_overdue: bool = False
    interval_days: Optional[int] = None
    feeds_on_cgd: bool = False
    # Cadence-aware presentation. "daily" = a frequent feeder (fed ~daily or
    # more, e.g. an insectivorous beardie) where "days since" is meaningless and
    # a red overdue badge would nag every morning — the UI shows a simple
    # fed-today check instead. "interval" = discrete feeders (snakes, geckos on
    # a multi-day cadence) that keep the days-since / overdue treatment.
    status_mode: str = "interval"  # "daily" | "interval"
    fed_today: bool = False


class AnimalResponse(AnimalBase):
    """Schema for animal response."""
    id: uuid.UUID
    user_id: uuid.UUID
    taxon: str
    herp_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    last_fed_at: Optional[datetime] = None
    last_shed_at: Optional[date] = None
    # Provenance / transfer (htr_20260707, read-only). transferred_out_at is
    # non-null on a handed-off SOURCE record; the others populate a claimed
    # record's provenance block. `provenance` is the frozen snapshot dict.
    transferred_out_at: Optional[datetime] = None
    origin_keeper_name: Optional[str] = None
    bred_by_user_id: Optional[uuid.UUID] = None
    source_transfer_id: Optional[uuid.UUID] = None
    provenance: Optional[Any] = None
    # Resolved CGD flag (override ?? species default ?? false). Populated
    # from the @property on the Animal model. Clients use this to switch
    # the collection card to CGD-aware cadence thresholds and to surface
    # CGD-specific actions ("Refreshed CGD" quick log). Read-only.
    feeds_on_cgd: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
