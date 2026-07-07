"""Schemas for HV feeder keeping (ADR-012)."""
from typing import Any, List, Optional
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Species (catalog) ─────────────────────────────────────────────────────────

class HvFeederSpeciesResponse(BaseModel):
    id: UUID
    scientific_name: str
    common_names: Optional[List[str]] = None
    category: str
    care_level: Optional[str] = None
    temperature_min: Optional[int] = None
    temperature_max: Optional[int] = None
    humidity_min: Optional[int] = None
    humidity_max: Optional[int] = None
    supports_sizes: bool = False
    typical_sizes: Optional[Any] = None
    typical_adult_size_mm: Optional[int] = None
    prey_size_notes: Optional[str] = None
    care_notes: Optional[str] = None
    handling_notes: Optional[str] = None
    image_url: Optional[str] = None
    is_verified: bool = False

    class Config:
        from_attributes = True


# ── Stocks ────────────────────────────────────────────────────────────────────

class HvFeederStockBase(BaseModel):
    name: str = Field(..., max_length=100)
    hv_feeder_species_id: Optional[UUID] = None
    form: str = Field("frozen", pattern="^(live|frozen)$")
    inventory_mode: str = Field("count", pattern="^(count|sized)$")
    count: Optional[int] = Field(None, ge=0)
    sized_counts: Optional[Any] = None  # {"pinky": 20, "hopper": 8, ...}
    storage_location: Optional[str] = Field(None, max_length=120)
    low_threshold: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class HvFeederStockCreate(HvFeederStockBase):
    pass


class HvFeederStockUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    hv_feeder_species_id: Optional[UUID] = None
    form: Optional[str] = Field(None, pattern="^(live|frozen)$")
    inventory_mode: Optional[str] = Field(None, pattern="^(count|sized)$")
    count: Optional[int] = Field(None, ge=0)
    sized_counts: Optional[Any] = None
    storage_location: Optional[str] = Field(None, max_length=120)
    low_threshold: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class HvFeederStockResponse(HvFeederStockBase):
    id: UUID
    user_id: UUID
    last_restocked: Optional[date] = None
    last_used: Optional[date] = None
    last_cleaned: Optional[date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Computed
    total_count: Optional[int] = None
    is_low_stock: bool = False
    species_display_name: Optional[str] = None

    class Config:
        from_attributes = True


class HvFeederStockListItem(HvFeederStockResponse):
    pass


# ── Logs ──────────────────────────────────────────────────────────────────────

class HvFeederLogCreate(BaseModel):
    log_type: str = Field(
        ..., pattern="^(restock|used|cleaned|bred|died|count_correction)$"
    )
    size: Optional[str] = Field(None, max_length=30)  # which size bucket (sized mode)
    count_delta: Optional[int] = None  # signed; +restock, -used
    logged_at: Optional[date] = None
    notes: Optional[str] = None


class HvFeederLogResponse(BaseModel):
    id: UUID
    hv_feeder_stock_id: UUID
    user_id: UUID
    log_type: str
    size: Optional[str] = None
    count_delta: Optional[int] = None
    logged_at: date
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
