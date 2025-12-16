"""
Referral system router
Premium subscribers can refer friends and earn free months
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone, timedelta
import random
import string
import os

from app.database import get_db
from app.models.user import User
from app.models.referral_reward import ReferralReward
from app.models.subscription import UserSubscription
from app.utils.dependencies import get_current_user
from app.schemas.referral import (
    ReferralCodeResponse,
    ReferralStatsResponse,
    ReferredUserResponse,
    ReferralRewardResponse,
    ApplyReferralRequest,
    ApplyReferralResponse,
)

router = APIRouter(prefix="/referrals", tags=["referrals"])

# Constants
MAX_REWARD_MONTHS = 6
REFERRALS_PER_REWARD = 5
BASE_URL = os.getenv("FRONTEND_URL", "https://tarantuverse.com")


def generate_referral_code(db: Session) -> str:
    """Generate unique 8-char alphanumeric code"""
    chars = string.ascii_uppercase + string.digits
    while True:
        # Format: ABC12DEF (easy to share/type)
        code = ''.join(random.choices(chars, k=8))
        if not db.query(User).filter(User.referral_code == code).first():
            return code


def check_and_grant_rewards(referrer_id, db: Session):
    """Check if referrer has earned new rewards and grant them"""
    # Count verified referrals
    referral_count = db.query(User).filter(
        User.referred_by_user_id == referrer_id,
        User.is_verified == True
    ).count()

    # Count already granted rewards
    granted_rewards = db.query(ReferralReward).filter(
        ReferralReward.referrer_id == referrer_id
    ).count()

    # Calculate how many rewards should exist
    deserved_rewards = min(referral_count // REFERRALS_PER_REWARD, MAX_REWARD_MONTHS)

    # Grant any missing rewards
    while granted_rewards < deserved_rewards:
        granted_rewards += 1
        grant_free_month(referrer_id, milestone=granted_rewards * REFERRALS_PER_REWARD, db=db)


def grant_free_month(referrer_id, milestone: int, db: Session):
    """Add 1 month to user's subscription"""
    subscription = db.query(UserSubscription).filter(
        UserSubscription.user_id == referrer_id,
        UserSubscription.status == "active"
    ).first()

    if not subscription:
        return  # User no longer subscribed

    # Extend subscription by 1 month (30 days)
    now = datetime.now(timezone.utc)
    if subscription.expires_at:
        start_date = subscription.expires_at
        new_end = subscription.expires_at + timedelta(days=30)
    else:
        # Lifetime subscriber - track reward but no extension needed
        start_date = now
        new_end = now + timedelta(days=30)

    # Create reward record
    reward = ReferralReward(
        referrer_id=referrer_id,
        referral_milestone=milestone,
        free_month_start=start_date,
        free_month_end=new_end
    )
    db.add(reward)

    # Update subscription expiry (only if not lifetime)
    if subscription.expires_at:
        subscription.expires_at = new_end

    db.commit()


@router.get("/code", response_model=ReferralCodeResponse)
async def get_referral_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get or generate the user's referral code (subscribers only)"""
    # Check if user is premium subscriber
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only premium subscribers can access the referral program"
        )

    # Generate code if user doesn't have one
    if not current_user.referral_code:
        current_user.referral_code = generate_referral_code(db)
        db.commit()
        db.refresh(current_user)

    return ReferralCodeResponse(
        referral_code=current_user.referral_code,
        referral_link=f"{BASE_URL}/register?ref={current_user.referral_code}"
    )


@router.get("/stats", response_model=ReferralStatsResponse)
async def get_referral_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get referral statistics for the current user"""
    # Check if user is premium subscriber
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only premium subscribers can access the referral program"
        )

    # Generate code if user doesn't have one
    if not current_user.referral_code:
        current_user.referral_code = generate_referral_code(db)
        db.commit()
        db.refresh(current_user)

    # Count total referrals
    total_referrals = db.query(User).filter(
        User.referred_by_user_id == current_user.id
    ).count()

    # Count verified referrals
    successful_referrals = db.query(User).filter(
        User.referred_by_user_id == current_user.id,
        User.is_verified == True
    ).count()

    # Count rewards earned
    rewards_earned = db.query(ReferralReward).filter(
        ReferralReward.referrer_id == current_user.id
    ).count()

    # Calculate remaining rewards available
    rewards_remaining = MAX_REWARD_MONTHS - rewards_earned

    # Calculate progress toward next reward
    current_progress = successful_referrals % REFERRALS_PER_REWARD
    next_reward_at = REFERRALS_PER_REWARD - current_progress if rewards_remaining > 0 else 0

    return ReferralStatsResponse(
        referral_code=current_user.referral_code,
        referral_link=f"{BASE_URL}/register?ref={current_user.referral_code}",
        total_referrals=total_referrals,
        successful_referrals=successful_referrals,
        rewards_earned=rewards_earned,
        rewards_remaining=rewards_remaining,
        next_reward_at=next_reward_at,
        next_reward_progress=current_progress
    )


@router.get("/list", response_model=List[ReferredUserResponse])
async def list_referrals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all users referred by the current user"""
    # Check if user is premium subscriber
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only premium subscribers can access the referral program"
        )

    referrals = db.query(User).filter(
        User.referred_by_user_id == current_user.id
    ).order_by(User.referred_at.desc()).all()

    return [
        ReferredUserResponse(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            referred_at=user.referred_at,
            is_verified=user.is_verified
        )
        for user in referrals
    ]


@router.get("/rewards", response_model=List[ReferralRewardResponse])
async def list_rewards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all referral rewards earned by the current user"""
    rewards = db.query(ReferralReward).filter(
        ReferralReward.referrer_id == current_user.id
    ).order_by(ReferralReward.created_at.desc()).all()

    return rewards


@router.post("/apply", response_model=ApplyReferralResponse)
async def apply_referral_code(
    request: ApplyReferralRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply a referral code to the current user (during registration)"""
    # Check if user already has a referrer
    if current_user.referred_by_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already been referred by another user"
        )

    # Find the referrer by code
    referrer = db.query(User).filter(
        User.referral_code == request.referral_code.upper()
    ).first()

    if not referrer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid referral code"
        )

    # Prevent self-referral
    if referrer.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot use your own referral code"
        )

    # Check if referrer is a premium subscriber
    if not referrer.is_premium:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This referral code is no longer valid"
        )

    # Apply the referral
    current_user.referred_by_user_id = referrer.id
    current_user.referred_at = datetime.now(timezone.utc)
    db.commit()

    # Check if we should grant rewards (if new user is already verified)
    if current_user.is_verified:
        check_and_grant_rewards(referrer.id, db)

    return ApplyReferralResponse(
        success=True,
        message=f"Successfully referred by {referrer.username}!",
        referrer_username=referrer.username
    )


@router.get("/validate/{code}")
async def validate_referral_code(
    code: str,
    db: Session = Depends(get_db)
):
    """Validate a referral code (public endpoint for registration page)"""
    referrer = db.query(User).filter(
        User.referral_code == code.upper()
    ).first()

    if not referrer:
        return {"valid": False, "message": "Invalid referral code"}

    if not referrer.is_premium:
        return {"valid": False, "message": "This referral code is no longer valid"}

    return {
        "valid": True,
        "referrer_username": referrer.username,
        "referrer_display_name": referrer.display_name or referrer.username
    }
