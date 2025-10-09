"""
Pydantic schemas for activity feed endpoints
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


class ActivityFeedItemResponse(BaseModel):
    id: int
    user_id: UUID
    username: str  # From joined user data
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    action_type: str  # 'new_tarantula', 'molt', 'feeding', 'follow', 'forum_thread', 'forum_post'
    target_type: Optional[str] = None  # 'tarantula', 'user', 'thread', 'post'
    target_id: Optional[int] = None
    activity_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityFeedList(BaseModel):
    activities: List[ActivityFeedItemResponse]
    total: int
    page: int
    limit: int
    has_more: bool
