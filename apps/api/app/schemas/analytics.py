"""
Schemas for analytics and collection statistics
"""
from typing import List, Optional, Dict, Any
from datetime import date
from pydantic import BaseModel


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
    
    class Config:
        from_attributes = True
