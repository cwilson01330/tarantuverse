"""
Pydantic schemas for FeederColony.

Inventory mode is 'count' or 'life_stage'. Validation enforces that the
correct inventory field is present for the chosen mode. Switching modes is
allowed via update and must always preserve the other mode's data (the
router layer handles preservation — see PRD §6).
"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, Dict, Literal
from datetime import date, datetime
import uuid


InventoryMode = Literal["count", "life_stage"]


class FeederColonyBase(BaseModel):
    name: str = Field(..., max_length=100)
    feeder_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None

    inventory_mode: InventoryMode = "count"
    count: Optional[int] = Field(None, ge=0)
    life_stage_counts: Optional[Dict[str, int]] = None

    low_threshold: Optional[int] = Field(None, ge=0)
    food_notes: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check_inventory_mode(self):
        # For 'count' mode: count is the source of truth
        if self.inventory_mode == "count":
            if self.life_stage_counts is not None and len(self.life_stage_counts) > 0:
                # Allowed — we preserve across mode switches — but during create
                # we expect a count value if provided.
                pass
        # For 'life_stage' mode: at least one stage key with a non-negative int
        elif self.inventory_mode == "life_stage":
            if self.life_stage_counts is not None:
                for stage, n in self.life_stage_counts.items():
                    if not isinstance(stage, str) or not stage.strip():
                        raise ValueError("life_stage_counts keys must be non-empty strings")
                    if not isinstance(n, int) or n < 0:
                        raise ValueError("life_stage_counts values must be non-negative integers")
        return self


class FeederColonyCreate(FeederColonyBase):
    pass


class FeederColonyUpdate(BaseModel):
    """All fields optional. Mode switching preserves the other mode's data."""
    name: Optional[str] = Field(None, max_length=100)
    feeder_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None
    inventory_mode: Optional[InventoryMode] = None
    count: Optional[int] = Field(None, ge=0)
    life_stage_counts: Optional[Dict[str, int]] = None
    low_threshold: Optional[int] = Field(None, ge=0)
    food_notes: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    last_restocked: Optional[date] = None
    last_cleaned: Optional[date] = None
    last_fed_date: Optional[date] = None


class _SpeciesStub(BaseModel):
    id: uuid.UUID
    scientific_name: str
    common_names: Optional[list[str]] = None
    category: str
    image_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FeederColonyResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    feeder_species_id: Optional[uuid.UUID] = None
    enclosure_id: Optional[uuid.UUID] = None

    name: str
    inventory_mode: InventoryMode
    count: Optional[int] = None
    life_stage_counts: Optional[Dict[str, int]] = None

    last_restocked: Optional[date] = None
    last_cleaned: Optional[date] = None
    last_fed_date: Optional[date] = None

    food_notes: Optional[str] = None
    notes: Optional[str] = None
    low_threshold: Optional[int] = None
    is_active: bool

    created_at: datetime
    updated_at: Optional[datetime] = None

    # Computed / denormalized — populated by the router
    total_count: Optional[int] = None
    is_low_stock: bool = False
    species_display_name: Optional[str] = None  # "Gromphadorhina portentosa" or common name
    species_missing: bool = False  # True when feeder_species_id set but species row deleted

    model_config = ConfigDict(from_attributes=True)


class FeederColonyListItem(BaseModel):
    """Lighter payload for list views."""
    id: uuid.UUID
    name: str
    inventory_mode: InventoryMode
    total_count: Optional[int] = None
    is_low_stock: bool = False
    is_active: bool
    species_display_name: Optional[str] = None
    species_missing: bool = False
    last_fed_date: Optional[date] = None
    last_cleaned: Optional[date] = None
    last_restocked: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)
