"""
Activity Feed API endpoints for tracking user actions
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_
from typing import List, Optional

from app.database import get_db
from app.models.user import User
from app.models.activity_feed import ActivityFeed
from app.models.follow import Follow
from app.schemas.activity import ActivityFeedItemResponse, ActivityFeedList
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])

# Forum activity is TWO action types. A client that wants "just forum posts"
# therefore can't express it with a single equality filter, and the mobile
# Forums chip was compensating by filtering the already-loaded page in JS —
# which meant a keeper whose forum activity happened to fall on page 2 saw an
# empty feed that read as "no forum activity exists". Absence of loaded data
# presented as absence of data is the exact failure this codebase keeps trying
# to design out, so the grouping belongs on the server where it can see every
# page.
ACTION_TYPE_GROUPS: dict[str, list[str]] = {
    "forums": ["forum_thread", "forum_post"],
}


def _apply_action_type(query, action_type: Optional[str]):
    """Filter by a single action type, or by a named group of them."""
    if not action_type:
        return query
    group = ACTION_TYPE_GROUPS.get(action_type)
    if group:
        return query.filter(ActivityFeed.action_type.in_(group))
    return query.filter(ActivityFeed.action_type == action_type)


# ============================================================================
# Activity Feed Endpoints
# ============================================================================

@router.get("/feed", response_model=ActivityFeedList)
async def get_personalized_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post|forums)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get personalized activity feed (following users only)
    Shows activity from users you follow
    """
    # Get list of users the current user follows
    following_subquery = db.query(Follow.followed_id).filter(
        Follow.follower_id == current_user.id
    ).subquery()
    
    # Build query for activities from followed users
    query = db.query(
        ActivityFeed,
        User.username,
        User.display_name,
        User.avatar_url
    ).join(
        User, ActivityFeed.user_id == User.id
    ).filter(
        ActivityFeed.user_id.in_(following_subquery),
        # Same visibility rule as the global feed. Following is NOT approval:
        # follows are one-sided and require no consent from the followed
        # keeper, so "someone followed me" cannot be treated as permission to
        # read a private collection's activity. Without this, going private
        # would hide you from strangers while leaving you fully visible to
        # anyone who had already followed you — the opposite of what the
        # setting promises.
        User.collection_visibility == "public",
    )

    # Filter by action type if specified
    query = _apply_action_type(query, action_type)
    
    # Order by most recent
    query = query.order_by(desc(ActivityFeed.created_at))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()
    
    # Transform results
    activities = []
    for activity, username, display_name, avatar_url in results:
        activities.append({
            "id": activity.id,
            "user_id": activity.user_id,
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "action_type": activity.action_type,
            "target_type": activity.target_type,
            "target_id": activity.target_id,
            "activity_metadata": activity.activity_metadata,
            "created_at": activity.created_at
        })
    
    return {
        "activities": activities,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total
    }


@router.get("/global", response_model=ActivityFeedList)
async def get_global_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post|forums)$"),
    db: Session = Depends(get_db)
):
    """
    Get global activity feed — PUBLIC ACCOUNTS ONLY.

    This endpoint is unauthenticated. It previously joined `users` purely to
    decorate rows with a username and avatar, and returned activity for EVERY
    account regardless of `collection_visibility` — so an anonymous caller
    could read the animal names, species, photo URLs and feeding outcomes of
    keepers whose collections were set to private. Account-default-private
    protected the keeper/profile endpoints; it never reached this one.

    Visibility is enforced HERE, at read time, deliberately. Filtering only at
    write time would freeze the decision at the moment the activity row was
    created, so a keeper who later switched to private would leave everything
    they had already logged permanently exposed. Checking on read means the
    setting is retroactive, which is what a privacy control has to be to mean
    anything.
    """
    # Build query for all activities
    query = db.query(
        ActivityFeed,
        User.username,
        User.display_name,
        User.avatar_url
    ).join(
        User, ActivityFeed.user_id == User.id
    ).filter(
        User.collection_visibility == "public"
    )

    # Filter by action type if specified
    query = _apply_action_type(query, action_type)
    
    # Order by most recent
    query = query.order_by(desc(ActivityFeed.created_at))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()
    
    # Transform results
    activities = []
    for activity, username, display_name, avatar_url in results:
        activities.append({
            "id": activity.id,
            "user_id": activity.user_id,
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "action_type": activity.action_type,
            "target_type": activity.target_type,
            "target_id": activity.target_id,
            "activity_metadata": activity.activity_metadata,
            "created_at": activity.created_at
        })
    
    return {
        "activities": activities,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total
    }


@router.get("/user/{username}", response_model=ActivityFeedList)
async def get_user_activity(
    username: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post|forums)$"),
    db: Session = Depends(get_db)
):
    """
    Get activity for a specific user
    Shows all activity for one user
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {
            "activities": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "has_more": False
        }
    
    # Build query for user's activities
    query = db.query(
        ActivityFeed,
        User.username,
        User.display_name,
        User.avatar_url
    ).join(
        User, ActivityFeed.user_id == User.id
    ).filter(
        ActivityFeed.user_id == user.id
    )
    
    # Filter by action type if specified
    query = _apply_action_type(query, action_type)
    
    # Order by most recent
    query = query.order_by(desc(ActivityFeed.created_at))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()
    
    # Transform results
    activities = []
    for activity, username, display_name, avatar_url in results:
        activities.append({
            "id": activity.id,
            "user_id": activity.user_id,
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "action_type": activity.action_type,
            "target_type": activity.target_type,
            "target_id": activity.target_id,
            "activity_metadata": activity.activity_metadata,
            "created_at": activity.created_at
        })
    
    return {
        "activities": activities,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (offset + limit) < total
    }
