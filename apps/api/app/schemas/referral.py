"""
Referral schemas
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class ReferralCodeResponse(BaseModel):
    """Response with user's referral code and link"""
    referral_code: str
    referral_link: str

    class Config:
        from_attributes = True


class ReferralStatsResponse(BaseModel):
    """Response with referral statistics"""
    referral_code: str
    referral_link: str
    total_referrals: int
    successful_referrals: int  # Verified accounts
    rewards_earned: int  # Number of free months earned
    rewards_remaining: int  # Months left to earn (max 6)
    next_reward_at: int  # Referrals needed for next reward
    next_reward_progress: int  # Current progress towards next reward (0-4)

    class Config:
        from_attributes = True


class ReferredUserResponse(BaseModel):
    """Response for a referred user"""
    id: UUID
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    referred_at: datetime
    is_verified: bool

    class Config:
        from_attributes = True


class ReferralRewardResponse(BaseModel):
    """Response for a referral reward"""
    id: UUID
    referral_milestone: int
    free_month_start: datetime
    free_month_end: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class ApplyReferralRequest(BaseModel):
    """Request to apply a referral code"""
    referral_code: str


class ApplyReferralResponse(BaseModel):
    """Response after applying a referral code"""
    success: bool
    message: str
    referrer_username: Optional[str] = None
