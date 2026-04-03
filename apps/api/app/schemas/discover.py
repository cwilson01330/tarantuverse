"""
Schema definitions for discover/trending content
"""
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class TrendingThread(BaseModel):
    id: int
    title: str
    category: str
    reply_count: int
    author_username: str
    created_at: datetime

    class Config:
        from_attributes = True


class ActiveKeeper(BaseModel):
    id: UUID
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    activity_count: int

    class Config:
        from_attributes = True


class PopularSpecies(BaseModel):
    id: UUID
    scientific_name: str
    common_names: Optional[List[str]] = None
    image_url: Optional[str] = None
    times_kept: int
    care_level: Optional[str] = None

    class Config:
        from_attributes = True


class RecentActivity(BaseModel):
    id: int
    user_username: str
    activity_type: str
    data: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformStats(BaseModel):
    total_keepers: int
    total_tarantulas: int
    total_species: int
    total_forum_threads: int


class DiscoverResponse(BaseModel):
    stats: PlatformStats
    trending_threads: List[TrendingThread]
    active_keepers: List[ActiveKeeper]
    popular_species: List[PopularSpecies]
    recent_activity: List[RecentActivity]
