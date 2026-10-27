"""
Schemas for analytics and collection statistics
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, Field


class SpeciesCount(BaseModel):
    """Count of tarantulas per species"""
    species_name: str
    count: int


class ActivityItem(BaseModel):
    """Recent activity item"""
    type: str  # "feeding", "molt", or "substrate_change"
    date: date
    tarantula_id: str
    tarantula_name: str
    description: str


class LongestGap(BaseModel):
    """The animal that has gone longest without an accepted feeding right now.

    Only animals Feeding Day would flag count: fed at least once, not paused,
    and with a cadence (detritivores have none). `usual_interval_days` is that
    cadence, so the client can say "usually eats every 7".
    """
    tarantula_id: str
    name: str
    sex: Optional[str] = None  # "male" | "female" | "unknown"
    days: int
    usual_interval_days: Optional[int] = None


class LastMolt(BaseModel):
    """The newest molt across the active collection."""
    tarantula_id: str
    name: str
    sex: Optional[str] = None
    date: date  # the keeper's local calendar day (tz_offset_minutes), else UTC
    molted_at: Optional[datetime] = None  # the instant, timezone-aware UTC
    molt_number: int  # this animal's molts up to and including this one
    avg_interval_days: Optional[int] = None  # None with fewer than 2 molts


class MoltRow(BaseModel):
    """One animal's molt tally. Animals with no molts are included (count 0)."""
    tarantula_id: str
    name: str
    sex: Optional[str] = None
    count: int
    last_date: Optional[date] = None  # keeper's local day (tz_offset_minutes), else UTC
    last_molted_at: Optional[datetime] = None  # the instant, timezone-aware UTC


class CollectionAnalytics(BaseModel):
    """Comprehensive collection analytics"""
    # Collection overview
    total_tarantulas: int
    unique_species: int
    sex_distribution: Dict[str, int]  # {"male": 5, "female": 8, "unknown": 2}
    species_counts: List[SpeciesCount]
    total_value: float
    average_age_months: float

    # Activity statistics
    total_feedings: int
    total_molts: int
    total_substrate_changes: int
    average_days_between_feedings: float

    # Notable items
    most_active_molter: Optional[Dict[str, Any]] = None  # {"tarantula_id": "...", "name": "...", "molt_count": 5}
    newest_acquisition: Optional[Dict[str, Any]] = None  # {"tarantula_id": "...", "name": "...", "date": "2025-10-01"}
    oldest_acquisition: Optional[Dict[str, Any]] = None  # {"tarantula_id": "...", "name": "...", "date": "2020-05-15"}

    # Recent activity
    recent_activity: List[ActivityItem]

    # "Right now" (analytics redesign). Always sent by the server; the defaults
    # keep older callers valid and let clients ship before the API does.
    # Due/overdue use the Feeding Day rule (services/feeding_status).
    feeding_due_today: int = 0  # due today or overdue
    feeding_overdue: int = 0  # strict subset: past their cadence
    longest_gap: Optional[LongestGap] = None
    # The due animal that has waited longest (Due tile caption); None when none due.
    first_due: Optional[LongestGap] = None
    last_molt: Optional[LastMolt] = None
    priced_count: int = 0  # animals with a price_paid on file
    molts_per_animal: List[MoltRow] = Field(default_factory=list)  # top 10; /analytics/molts has all
    # Aliases kept beside the originals for one release.
    total_animals: int = 0  # = total_tarantulas
    average_months_in_collection: float = 0.0  # = average_age_months

    class Config:
        from_attributes = True


class MoltHeatmapEntry(BaseModel):
    """Monthly molt heatmap entry"""
    month: str  # "2026-01", "2026-02", etc.
    count: int


class CollectionGrowthEntry(BaseModel):
    """Monthly collection growth entry"""
    month: str
    count: int


class SpeciesDistEntry(BaseModel):
    """Species distribution entry"""
    species_name: str
    count: int


class FeedingCostUpdate(BaseModel):
    """Keeper's cost per feeding. null = go back to the default."""
    cost_per_feeding: Optional[float] = Field(default=None, ge=0, le=1000)


class FeedingCostResponse(BaseModel):
    cost_per_feeding: float
    is_default: bool


class AdvancedAnalyticsResponse(BaseModel):
    """Premium advanced analytics response"""
    # Collection value
    collection_value_total: float
    collection_value_average: float
    most_expensive_name: Optional[str] = None
    most_expensive_price: Optional[float] = None

    # Temporal data
    molt_heatmap: List[MoltHeatmapEntry]
    collection_growth: List[CollectionGrowthEntry]

    # Distributions
    species_distribution: List[SpeciesDistEntry]
    sex_distribution: Dict[str, int]  # {"male": 5, "female": 10, "unknown": 3}
    enclosure_type_distribution: Dict[str, int]  # {"terrestrial": 8, "arboreal": 5, ...}
    # Every taxon (2026-10-07). Defaults keep older callers valid.
    taxon_distribution: Dict[str, int] = {}  # {"tarantula": 12, "mantis": 3, ...}
    unique_species: int = 0  # species_distribution is capped at 10; this isn't
    total_animals: int = 0  # current collection, every taxon

    # Activity totals
    total_feedings_logged: int
    total_molts_logged: int
    estimated_monthly_feeding_cost: float
    # The per-feeding figure behind that estimate (2026-10-22): the keeper's
    # own when set, else the 0.50 default. Defaults keep older callers valid.
    cost_per_feeding: float = 0.50
    cost_per_feeding_is_default: bool = True
    # What the keeper recorded spending this month in expense tracking (the
    # owner's own Tarantuverse expenses, server UTC month), in their own
    # currency. `feeders_*` is the feeders category only.
    spent_this_month: float = 0.0
    feeders_spent_this_month: float = 0.0

    class Config:
        from_attributes = True
