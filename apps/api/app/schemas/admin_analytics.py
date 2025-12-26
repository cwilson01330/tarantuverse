"""
Admin Analytics Schemas
"""
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import date, datetime


# ============ Overview Endpoint ============

class AdminAnalyticsOverview(BaseModel):
    """Real-time snapshot of all key metrics"""
    # User counts
    total_users: int
    active_users_today: int
    active_users_7d: int
    active_users_30d: int

    # User growth
    new_users_today: int
    new_users_7d: int
    new_users_30d: int
    user_growth_rate: float  # Percentage change vs previous period

    # Revenue/Premium
    total_premium_users: int
    mrr: float  # Monthly Recurring Revenue
    subscription_conversion_rate: float  # Percentage of users on premium

    # Platform activity
    total_tarantulas: int
    total_feedings_today: int
    total_molts_today: int
    total_substrate_changes_today: int

    # Community
    total_forum_threads: int
    total_forum_posts: int
    total_messages_today: int

    # Timestamp
    generated_at: datetime


# ============ User Analytics ============

class UserTimeSeriesPoint(BaseModel):
    """Single data point for user time series"""
    date: date
    new_users: int
    cumulative_users: int
    active_users: int


class UserRetentionCohort(BaseModel):
    """Retention data for a cohort of users"""
    cohort_month: str  # e.g., "2024-01"
    cohort_size: int
    retained_day_1: float
    retained_day_7: float
    retained_day_30: float


class OAuthBreakdown(BaseModel):
    """OAuth provider breakdown"""
    provider: str
    count: int
    percentage: float


class UserAnalyticsResponse(BaseModel):
    """Response for user analytics endpoint"""
    time_series: List[UserTimeSeriesPoint]
    retention_cohorts: List[UserRetentionCohort]
    oauth_breakdown: List[OAuthBreakdown]

    # Summary stats for period
    total_new_users: int
    growth_rate: float
    average_retention_day_30: float


# ============ Revenue Analytics ============

class RevenueTimeSeriesPoint(BaseModel):
    """Single data point for revenue time series"""
    date: date
    new_subscriptions: int
    cancellations: int
    active_subscriptions: int


class SubscriptionBreakdown(BaseModel):
    """Subscription plan breakdown"""
    plan_name: str
    active_count: int
    percentage: float


class SubscriptionSourceBreakdown(BaseModel):
    """Subscription source breakdown"""
    source: str  # 'promo', 'monthly', 'yearly', 'lifetime', 'iap'
    count: int
    percentage: float


class RevenueAnalyticsResponse(BaseModel):
    """Response for revenue analytics endpoint"""
    time_series: List[RevenueTimeSeriesPoint]
    subscription_breakdown: List[SubscriptionBreakdown]
    source_breakdown: List[SubscriptionSourceBreakdown]

    # Key metrics
    mrr: float
    total_premium_users: int
    churn_rate: float  # Cancellations / total over period
    conversion_rate: float  # Premium users / total users


# ============ Activity Analytics ============

class ActivityTimeSeriesPoint(BaseModel):
    """Single data point for activity time series"""
    date: date
    new_tarantulas: int
    feedings: int
    molts: int
    substrate_changes: int


class SpeciesPopularity(BaseModel):
    """Species popularity data"""
    species_name: str
    count: int
    percentage: float


class ActivityAnalyticsResponse(BaseModel):
    """Response for activity analytics endpoint"""
    time_series: List[ActivityTimeSeriesPoint]
    top_species: List[SpeciesPopularity]

    # Summary stats
    total_tarantulas: int
    total_feedings: int
    total_molts: int
    average_collection_size: float


# ============ Community Analytics ============

class CommunityTimeSeriesPoint(BaseModel):
    """Single data point for community time series"""
    date: date
    new_threads: int
    new_posts: int
    new_messages: int
    new_follows: int


class ForumCategoryStats(BaseModel):
    """Forum category statistics"""
    category_name: str
    thread_count: int
    post_count: int


class TopContributor(BaseModel):
    """Top contributor data"""
    user_id: str
    username: str
    display_name: Optional[str]
    post_count: int


class CommunityAnalyticsResponse(BaseModel):
    """Response for community analytics endpoint"""
    time_series: List[CommunityTimeSeriesPoint]
    forum_categories: List[ForumCategoryStats]
    top_contributors: List[TopContributor]

    # Summary stats
    total_threads: int
    total_posts: int
    total_follows: int
    average_posts_per_thread: float
