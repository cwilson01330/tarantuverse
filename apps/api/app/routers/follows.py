"""
API routes for following/followers functionality
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List
import uuid

from app.database import get_db
from app.models.user import User
from app.models.follow import Follow
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/follows", tags=["follows"])


@router.post("/{username}")
async def follow_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Follow a user"""
    # Get the user to follow
    user_to_follow = db.query(User).filter(User.username == username).first()
    if not user_to_follow:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Can't follow yourself
    if user_to_follow.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    
    # Check if already following
    existing_follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.followed_id == user_to_follow.id
    ).first()
    
    if existing_follow:
        raise HTTPException(status_code=400, detail="Already following this user")
    
    # Create follow relationship
    follow = Follow(
        follower_id=current_user.id,
        followed_id=user_to_follow.id
    )
    db.add(follow)
    db.commit()
    
    return {"message": "Successfully followed user", "username": username}


@router.delete("/{username}")
async def unfollow_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Unfollow a user"""
    # Get the user to unfollow
    user_to_unfollow = db.query(User).filter(User.username == username).first()
    if not user_to_unfollow:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find and delete the follow relationship
    follow = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.followed_id == user_to_unfollow.id
    ).first()
    
    if not follow:
        raise HTTPException(status_code=400, detail="Not following this user")
    
    db.delete(follow)
    db.commit()
    
    return {"message": "Successfully unfollowed user", "username": username}


@router.get("/{username}/followers")
async def get_followers(
    username: str,
    db: Session = Depends(get_db)
):
    """Get a user's followers"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get followers
    followers = db.query(User).join(
        Follow, Follow.follower_id == User.id
    ).filter(
        Follow.followed_id == user.id
    ).all()
    
    return [
        {
            "id": str(follower.id),
            "username": follower.username,
            "display_name": follower.display_name,
            "avatar_url": follower.avatar_url,
            "profile_experience_level": follower.profile_experience_level,
            "profile_specialties": follower.profile_specialties,
        }
        for follower in followers
    ]


@router.get("/{username}/following")
async def get_following(
    username: str,
    db: Session = Depends(get_db)
):
    """Get users that a user is following"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get following
    following = db.query(User).join(
        Follow, Follow.followed_id == User.id
    ).filter(
        Follow.follower_id == user.id
    ).all()
    
    return [
        {
            "id": str(followed.id),
            "username": followed.username,
            "display_name": followed.display_name,
            "avatar_url": followed.avatar_url,
            "profile_experience_level": followed.profile_experience_level,
            "profile_specialties": followed.profile_specialties,
        }
        for followed in following
    ]


@router.get("/{username}/stats")
async def get_follow_stats(
    username: str,
    db: Session = Depends(get_db)
):
    """Get follower/following counts for a user"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    followers_count = db.query(func.count(Follow.follower_id)).filter(
        Follow.followed_id == user.id
    ).scalar() or 0
    
    following_count = db.query(func.count(Follow.followed_id)).filter(
        Follow.follower_id == user.id
    ).scalar() or 0
    
    return {
        "followers_count": followers_count,
        "following_count": following_count
    }


@router.get("/{username}/is-following")
async def check_following_status(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if current user is following a specific user"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_following = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.followed_id == user.id
    ).first() is not None
    
    return {"is_following": is_following}
