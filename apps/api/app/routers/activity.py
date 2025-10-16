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


# ============================================================================
# Activity Feed Endpoints
# ============================================================================

@router.get("/feed", response_model=ActivityFeedList)
async def get_personalized_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post)$"),
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
        ActivityFeed.user_id.in_(following_subquery)
    )
    
    # Filter by action type if specified
    if action_type:
        query = query.filter(ActivityFeed.action_type == action_type)
    
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
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post)$"),
    db: Session = Depends(get_db)
):
    """
    Get global activity feed (all public activity)
    Shows activity from all users
    """
    # Build query for all activities
    query = db.query(
        ActivityFeed,
        User.username,
        User.display_name,
        User.avatar_url
    ).join(
        User, ActivityFeed.user_id == User.id
    )
    
    # Filter by action type if specified
    if action_type:
        query = query.filter(ActivityFeed.action_type == action_type)
    
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
    action_type: Optional[str] = Query(None, regex="^(new_tarantula|molt|feeding|follow|forum_thread|forum_post)$"),
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
    if action_type:
        query = query.filter(ActivityFeed.action_type == action_type)
    
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
