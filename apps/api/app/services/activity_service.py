"""
Activity tracking service - helper functions for logging user actions
"""
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from uuid import UUID

from app.models.activity_feed import ActivityFeed


async def create_activity(
    db: Session,
    user_id: UUID,
    action_type: str,
    target_type: Optional[str] = None,
    target_id: Optional[UUID | int] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> ActivityFeed:
    """
    Create an activity feed entry

    Args:
        db: Database session
        user_id: ID of user performing the action
        action_type: Type of action ('new_tarantula', 'molt', 'feeding', 'follow', 'forum_thread', 'forum_post')
        target_type: Type of target object ('tarantula', 'user', 'thread', 'post')
        target_id: ID of target object (UUID or int, will be converted to string)
        metadata: Additional data about the activity (names, titles, etc.)

    Returns:
        Created ActivityFeed object
    """
    # Convert target_id to string to support both UUID and integer types
    target_id_str = str(target_id) if target_id is not None else None

    activity = ActivityFeed(
        user_id=user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id_str,
        activity_metadata=metadata or {}
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity
