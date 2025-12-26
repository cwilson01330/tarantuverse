"""
Admin Analytics Router

Provides comprehensive analytics endpoints for admin dashboard:
- Overview: Real-time snapshot of all key metrics
- Users: User growth, retention, OAuth breakdown
- Revenue: Subscriptions, MRR, churn
- Activity: Platform usage (tarantulas, feedings, molts)
- Community: Forum activity, messaging, follows
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, and_, case, text
from datetime import datetime, timedelta, timezone, date
from typing import Literal

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.substrate_change import SubstrateChange
from app.models.species import Species
from app.models.subscription import UserSubscription, SubscriptionPlan
from app.models.activity_feed import ActivityFeed
from app.models.forum import ForumCategory, ForumThread, ForumPost
from app.models.direct_message import DirectMessage
from app.models.follow import Follow
from app.utils.dependencies import get_current_admin
from app.schemas.admin_analytics import (
    AdminAnalyticsOverview,
    UserAnalyticsResponse,
    UserTimeSeriesPoint,
    UserRetentionCohort,
    OAuthBreakdown,
    RevenueAnalyticsResponse,
    RevenueTimeSeriesPoint,
    SubscriptionBreakdown,
    SubscriptionSourceBreakdown,
    ActivityAnalyticsResponse,
    ActivityTimeSeriesPoint,
    SpeciesPopularity,
    CommunityAnalyticsResponse,
    CommunityTimeSeriesPoint,
    ForumCategoryStats,
    TopContributor,
)

router = APIRouter(
    prefix="/admin/analytics",
    tags=["admin-analytics"],
    dependencies=[Depends(get_current_admin)]
)

PeriodType = Literal["7d", "30d", "90d", "1y"]


def get_period_dates(period: PeriodType) -> tuple[datetime, datetime]:
    """Convert period string to start and end dates"""
    now = datetime.now(timezone.utc)
    end_date = now

    if period == "7d":
        start_date = now - timedelta(days=7)
    elif period == "30d":
        start_date = now - timedelta(days=30)
    elif period == "90d":
        start_date = now - timedelta(days=90)
    else:  # 1y
        start_date = now - timedelta(days=365)

    return start_date, end_date


def get_previous_period_dates(period: PeriodType) -> tuple[datetime, datetime]:
    """Get the previous period for comparison"""
    start_date, end_date = get_period_dates(period)
    period_length = end_date - start_date
    return start_date - period_length, start_date


@router.get("/overview", response_model=AdminAnalyticsOverview)
async def get_analytics_overview(
    db: Session = Depends(get_db)
):
    """
    Get real-time overview of all key platform metrics
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # User counts
    total_users = db.query(func.count(User.id)).scalar() or 0

    # Active users (users with activity feed entries)
    active_users_today = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
        ActivityFeed.created_at >= today_start
    ).scalar() or 0

    active_users_7d = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
        ActivityFeed.created_at >= seven_days_ago
    ).scalar() or 0

    active_users_30d = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
        ActivityFeed.created_at >= thirty_days_ago
    ).scalar() or 0

    # New users
    new_users_today = db.query(func.count(User.id)).filter(
        User.created_at >= today_start
    ).scalar() or 0

    new_users_7d = db.query(func.count(User.id)).filter(
        User.created_at >= seven_days_ago
    ).scalar() or 0

    new_users_30d = db.query(func.count(User.id)).filter(
        User.created_at >= thirty_days_ago
    ).scalar() or 0

    # Previous 30 days for growth rate
    sixty_days_ago = now - timedelta(days=60)
    new_users_prev_30d = db.query(func.count(User.id)).filter(
        and_(
            User.created_at >= sixty_days_ago,
            User.created_at < thirty_days_ago
        )
    ).scalar() or 0

    user_growth_rate = 0.0
    if new_users_prev_30d > 0:
        user_growth_rate = ((new_users_30d - new_users_prev_30d) / new_users_prev_30d) * 100

    # Premium users
    total_premium_users = db.query(func.count(UserSubscription.id)).filter(
        UserSubscription.status == "active"
    ).scalar() or 0

    # MRR calculation (count active monthly subscriptions * price)
    mrr_result = db.query(func.sum(SubscriptionPlan.price_monthly)).join(
        UserSubscription, UserSubscription.plan_id == SubscriptionPlan.id
    ).filter(
        UserSubscription.status == "active",
        UserSubscription.auto_renew == True
    ).scalar() or 0.0
    mrr = float(mrr_result)

    # Conversion rate
    subscription_conversion_rate = 0.0
    if total_users > 0:
        subscription_conversion_rate = (total_premium_users / total_users) * 100

    # Platform activity
    total_tarantulas = db.query(func.count(Tarantula.id)).scalar() or 0

    total_feedings_today = db.query(func.count(FeedingLog.id)).filter(
        FeedingLog.fed_at >= today_start
    ).scalar() or 0

    total_molts_today = db.query(func.count(MoltLog.id)).filter(
        MoltLog.molted_at >= today_start
    ).scalar() or 0

    total_substrate_changes_today = db.query(func.count(SubstrateChange.id)).filter(
        SubstrateChange.changed_at >= today_start.date()
    ).scalar() or 0

    # Community
    total_forum_threads = db.query(func.count(ForumThread.id)).scalar() or 0
    total_forum_posts = db.query(func.count(ForumPost.id)).scalar() or 0

    total_messages_today = db.query(func.count(DirectMessage.id)).filter(
        DirectMessage.created_at >= today_start
    ).scalar() or 0

    return AdminAnalyticsOverview(
        total_users=total_users,
        active_users_today=active_users_today,
        active_users_7d=active_users_7d,
        active_users_30d=active_users_30d,
        new_users_today=new_users_today,
        new_users_7d=new_users_7d,
        new_users_30d=new_users_30d,
        user_growth_rate=round(user_growth_rate, 1),
        total_premium_users=total_premium_users,
        mrr=round(mrr, 2),
        subscription_conversion_rate=round(subscription_conversion_rate, 1),
        total_tarantulas=total_tarantulas,
        total_feedings_today=total_feedings_today,
        total_molts_today=total_molts_today,
        total_substrate_changes_today=total_substrate_changes_today,
        total_forum_threads=total_forum_threads,
        total_forum_posts=total_forum_posts,
        total_messages_today=total_messages_today,
        generated_at=now
    )


@router.get("/users", response_model=UserAnalyticsResponse)
async def get_user_analytics(
    period: PeriodType = Query(default="30d"),
    db: Session = Depends(get_db)
):
    """
    Get user growth, retention, and OAuth breakdown analytics
    """
    start_date, end_date = get_period_dates(period)
    prev_start, prev_end = get_previous_period_dates(period)

    # Time series: Daily new users and cumulative count
    daily_users = db.query(
        func.date_trunc('day', User.created_at).label('date'),
        func.count(User.id).label('count')
    ).filter(
        User.created_at >= start_date,
        User.created_at < end_date
    ).group_by(
        func.date_trunc('day', User.created_at)
    ).order_by('date').all()

    # Build time series with cumulative count
    time_series = []
    base_count = db.query(func.count(User.id)).filter(
        User.created_at < start_date
    ).scalar() or 0
    cumulative = base_count

    # Get active users per day
    active_by_day = dict(db.query(
        func.date_trunc('day', ActivityFeed.created_at).label('date'),
        func.count(distinct(ActivityFeed.user_id)).label('count')
    ).filter(
        ActivityFeed.created_at >= start_date,
        ActivityFeed.created_at < end_date
    ).group_by(
        func.date_trunc('day', ActivityFeed.created_at)
    ).all())

    for row in daily_users:
        cumulative += row.count
        active = active_by_day.get(row.date, 0)
        time_series.append(UserTimeSeriesPoint(
            date=row.date.date(),
            new_users=row.count,
            cumulative_users=cumulative,
            active_users=active
        ))

    # OAuth breakdown
    oauth_counts = db.query(
        func.coalesce(User.oauth_provider, 'email').label('provider'),
        func.count(User.id).label('count')
    ).group_by(
        func.coalesce(User.oauth_provider, 'email')
    ).all()

    total_for_oauth = sum(r.count for r in oauth_counts)
    oauth_breakdown = [
        OAuthBreakdown(
            provider=r.provider,
            count=r.count,
            percentage=round((r.count / total_for_oauth * 100) if total_for_oauth > 0 else 0, 1)
        )
        for r in oauth_counts
    ]

    # Retention cohorts (simplified - last 3 months)
    retention_cohorts = []
    for months_ago in range(3):
        cohort_start = (end_date.replace(day=1) - timedelta(days=months_ago * 30)).replace(day=1)
        cohort_end = (cohort_start + timedelta(days=32)).replace(day=1)

        cohort_users = db.query(User.id).filter(
            User.created_at >= cohort_start,
            User.created_at < cohort_end
        ).all()
        cohort_size = len(cohort_users)

        if cohort_size > 0:
            cohort_ids = [u.id for u in cohort_users]

            # Day 1 retention
            retained_d1 = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
                ActivityFeed.user_id.in_(cohort_ids),
                ActivityFeed.created_at >= cohort_start + timedelta(days=1),
                ActivityFeed.created_at < cohort_start + timedelta(days=2)
            ).scalar() or 0

            # Day 7 retention
            retained_d7 = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
                ActivityFeed.user_id.in_(cohort_ids),
                ActivityFeed.created_at >= cohort_start + timedelta(days=7),
                ActivityFeed.created_at < cohort_start + timedelta(days=8)
            ).scalar() or 0

            # Day 30 retention
            retained_d30 = db.query(func.count(distinct(ActivityFeed.user_id))).filter(
                ActivityFeed.user_id.in_(cohort_ids),
                ActivityFeed.created_at >= cohort_start + timedelta(days=30),
                ActivityFeed.created_at < cohort_start + timedelta(days=31)
            ).scalar() or 0

            retention_cohorts.append(UserRetentionCohort(
                cohort_month=cohort_start.strftime("%Y-%m"),
                cohort_size=cohort_size,
                retained_day_1=round((retained_d1 / cohort_size * 100), 1),
                retained_day_7=round((retained_d7 / cohort_size * 100), 1),
                retained_day_30=round((retained_d30 / cohort_size * 100), 1)
            ))

    # Summary stats
    total_new_users = db.query(func.count(User.id)).filter(
        User.created_at >= start_date,
        User.created_at < end_date
    ).scalar() or 0

    prev_new_users = db.query(func.count(User.id)).filter(
        User.created_at >= prev_start,
        User.created_at < prev_end
    ).scalar() or 0

    growth_rate = 0.0
    if prev_new_users > 0:
        growth_rate = ((total_new_users - prev_new_users) / prev_new_users) * 100

    avg_retention = 0.0
    if retention_cohorts:
        avg_retention = sum(c.retained_day_30 for c in retention_cohorts) / len(retention_cohorts)

    return UserAnalyticsResponse(
        time_series=time_series,
        retention_cohorts=retention_cohorts,
        oauth_breakdown=oauth_breakdown,
        total_new_users=total_new_users,
        growth_rate=round(growth_rate, 1),
        average_retention_day_30=round(avg_retention, 1)
    )


@router.get("/revenue", response_model=RevenueAnalyticsResponse)
async def get_revenue_analytics(
    period: PeriodType = Query(default="30d"),
    db: Session = Depends(get_db)
):
    """
    Get subscription and revenue analytics
    """
    start_date, end_date = get_period_dates(period)

    # Time series: Daily subscriptions
    daily_subs = db.query(
        func.date_trunc('day', UserSubscription.started_at).label('date'),
        func.count(UserSubscription.id).label('count')
    ).filter(
        UserSubscription.started_at >= start_date,
        UserSubscription.started_at < end_date
    ).group_by(
        func.date_trunc('day', UserSubscription.started_at)
    ).order_by('date').all()

    daily_cancellations = dict(db.query(
        func.date_trunc('day', UserSubscription.cancelled_at).label('date'),
        func.count(UserSubscription.id).label('count')
    ).filter(
        UserSubscription.cancelled_at >= start_date,
        UserSubscription.cancelled_at < end_date
    ).group_by(
        func.date_trunc('day', UserSubscription.cancelled_at)
    ).all())

    time_series = []
    active_count = db.query(func.count(UserSubscription.id)).filter(
        UserSubscription.status == "active",
        UserSubscription.started_at < start_date
    ).scalar() or 0

    for row in daily_subs:
        cancels = daily_cancellations.get(row.date, 0)
        active_count += row.count - cancels
        time_series.append(RevenueTimeSeriesPoint(
            date=row.date.date(),
            new_subscriptions=row.count,
            cancellations=cancels,
            active_subscriptions=max(0, active_count)
        ))

    # Subscription breakdown by plan
    plan_counts = db.query(
        SubscriptionPlan.name.label('plan_name'),
        func.count(UserSubscription.id).label('count')
    ).join(
        UserSubscription, UserSubscription.plan_id == SubscriptionPlan.id
    ).filter(
        UserSubscription.status == "active"
    ).group_by(
        SubscriptionPlan.name
    ).all()

    total_active = sum(r.count for r in plan_counts)
    subscription_breakdown = [
        SubscriptionBreakdown(
            plan_name=r.plan_name,
            active_count=r.count,
            percentage=round((r.count / total_active * 100) if total_active > 0 else 0, 1)
        )
        for r in plan_counts
    ]

    # Source breakdown
    source_counts = db.query(
        func.coalesce(UserSubscription.subscription_source, 'unknown').label('source'),
        func.count(UserSubscription.id).label('count')
    ).filter(
        UserSubscription.status == "active"
    ).group_by(
        func.coalesce(UserSubscription.subscription_source, 'unknown')
    ).all()

    source_breakdown = [
        SubscriptionSourceBreakdown(
            source=r.source,
            count=r.count,
            percentage=round((r.count / total_active * 100) if total_active > 0 else 0, 1)
        )
        for r in source_counts
    ]

    # MRR
    mrr_result = db.query(func.sum(SubscriptionPlan.price_monthly)).join(
        UserSubscription, UserSubscription.plan_id == SubscriptionPlan.id
    ).filter(
        UserSubscription.status == "active",
        UserSubscription.auto_renew == True
    ).scalar() or 0.0

    # Churn rate
    total_cancellations = db.query(func.count(UserSubscription.id)).filter(
        UserSubscription.cancelled_at >= start_date,
        UserSubscription.cancelled_at < end_date
    ).scalar() or 0

    churn_rate = 0.0
    if total_active > 0:
        churn_rate = (total_cancellations / total_active) * 100

    # Conversion rate
    total_users = db.query(func.count(User.id)).scalar() or 0
    conversion_rate = 0.0
    if total_users > 0:
        conversion_rate = (total_active / total_users) * 100

    return RevenueAnalyticsResponse(
        time_series=time_series,
        subscription_breakdown=subscription_breakdown,
        source_breakdown=source_breakdown,
        mrr=round(float(mrr_result), 2),
        total_premium_users=total_active,
        churn_rate=round(churn_rate, 1),
        conversion_rate=round(conversion_rate, 1)
    )


@router.get("/activity", response_model=ActivityAnalyticsResponse)
async def get_activity_analytics(
    period: PeriodType = Query(default="30d"),
    db: Session = Depends(get_db)
):
    """
    Get platform activity analytics (tarantulas, feedings, molts)
    """
    start_date, end_date = get_period_dates(period)

    # Time series for tarantulas
    daily_tarantulas = dict(db.query(
        func.date_trunc('day', Tarantula.created_at).label('date'),
        func.count(Tarantula.id).label('count')
    ).filter(
        Tarantula.created_at >= start_date,
        Tarantula.created_at < end_date
    ).group_by(
        func.date_trunc('day', Tarantula.created_at)
    ).all())

    # Time series for feedings
    daily_feedings = dict(db.query(
        func.date_trunc('day', FeedingLog.fed_at).label('date'),
        func.count(FeedingLog.id).label('count')
    ).filter(
        FeedingLog.fed_at >= start_date,
        FeedingLog.fed_at < end_date
    ).group_by(
        func.date_trunc('day', FeedingLog.fed_at)
    ).all())

    # Time series for molts
    daily_molts = dict(db.query(
        func.date_trunc('day', MoltLog.molted_at).label('date'),
        func.count(MoltLog.id).label('count')
    ).filter(
        MoltLog.molted_at >= start_date,
        MoltLog.molted_at < end_date
    ).group_by(
        func.date_trunc('day', MoltLog.molted_at)
    ).all())

    # Time series for substrate changes
    daily_substrate = dict(db.query(
        func.date_trunc('day', SubstrateChange.changed_at).label('date'),
        func.count(SubstrateChange.id).label('count')
    ).filter(
        SubstrateChange.changed_at >= start_date.date(),
        SubstrateChange.changed_at < end_date.date()
    ).group_by(
        func.date_trunc('day', SubstrateChange.changed_at)
    ).all())

    # Combine into time series
    all_dates = set(daily_tarantulas.keys()) | set(daily_feedings.keys()) | set(daily_molts.keys())
    time_series = []
    for d in sorted(all_dates):
        time_series.append(ActivityTimeSeriesPoint(
            date=d.date() if hasattr(d, 'date') else d,
            new_tarantulas=daily_tarantulas.get(d, 0),
            feedings=daily_feedings.get(d, 0),
            molts=daily_molts.get(d, 0),
            substrate_changes=daily_substrate.get(d, 0)
        ))

    # Top species
    species_counts = db.query(
        Species.scientific_name.label('species_name'),
        func.count(Tarantula.id).label('count')
    ).join(
        Tarantula, Tarantula.species_id == Species.id
    ).group_by(
        Species.scientific_name
    ).order_by(
        func.count(Tarantula.id).desc()
    ).limit(10).all()

    total_with_species = sum(r.count for r in species_counts)
    top_species = [
        SpeciesPopularity(
            species_name=r.species_name,
            count=r.count,
            percentage=round((r.count / total_with_species * 100) if total_with_species > 0 else 0, 1)
        )
        for r in species_counts
    ]

    # Summary stats
    total_tarantulas = db.query(func.count(Tarantula.id)).scalar() or 0
    total_feedings = db.query(func.count(FeedingLog.id)).filter(
        FeedingLog.fed_at >= start_date,
        FeedingLog.fed_at < end_date
    ).scalar() or 0
    total_molts = db.query(func.count(MoltLog.id)).filter(
        MoltLog.molted_at >= start_date,
        MoltLog.molted_at < end_date
    ).scalar() or 0

    user_count = db.query(func.count(User.id)).scalar() or 1
    average_collection_size = total_tarantulas / user_count

    return ActivityAnalyticsResponse(
        time_series=time_series,
        top_species=top_species,
        total_tarantulas=total_tarantulas,
        total_feedings=total_feedings,
        total_molts=total_molts,
        average_collection_size=round(average_collection_size, 1)
    )


@router.get("/community", response_model=CommunityAnalyticsResponse)
async def get_community_analytics(
    period: PeriodType = Query(default="30d"),
    db: Session = Depends(get_db)
):
    """
    Get community engagement analytics (forums, messages, follows)
    """
    start_date, end_date = get_period_dates(period)

    # Time series for threads
    daily_threads = dict(db.query(
        func.date_trunc('day', ForumThread.created_at).label('date'),
        func.count(ForumThread.id).label('count')
    ).filter(
        ForumThread.created_at >= start_date,
        ForumThread.created_at < end_date
    ).group_by(
        func.date_trunc('day', ForumThread.created_at)
    ).all())

    # Time series for posts
    daily_posts = dict(db.query(
        func.date_trunc('day', ForumPost.created_at).label('date'),
        func.count(ForumPost.id).label('count')
    ).filter(
        ForumPost.created_at >= start_date,
        ForumPost.created_at < end_date
    ).group_by(
        func.date_trunc('day', ForumPost.created_at)
    ).all())

    # Time series for messages
    daily_messages = dict(db.query(
        func.date_trunc('day', DirectMessage.created_at).label('date'),
        func.count(DirectMessage.id).label('count')
    ).filter(
        DirectMessage.created_at >= start_date,
        DirectMessage.created_at < end_date
    ).group_by(
        func.date_trunc('day', DirectMessage.created_at)
    ).all())

    # Time series for follows
    daily_follows = dict(db.query(
        func.date_trunc('day', Follow.created_at).label('date'),
        func.count(Follow.follower_id).label('count')
    ).filter(
        Follow.created_at >= start_date,
        Follow.created_at < end_date
    ).group_by(
        func.date_trunc('day', Follow.created_at)
    ).all())

    # Combine into time series
    all_dates = set(daily_threads.keys()) | set(daily_posts.keys()) | set(daily_messages.keys()) | set(daily_follows.keys())
    time_series = []
    for d in sorted(all_dates):
        time_series.append(CommunityTimeSeriesPoint(
            date=d.date() if hasattr(d, 'date') else d,
            new_threads=daily_threads.get(d, 0),
            new_posts=daily_posts.get(d, 0),
            new_messages=daily_messages.get(d, 0),
            new_follows=daily_follows.get(d, 0)
        ))

    # Forum category stats
    category_stats = db.query(
        ForumCategory.name.label('category_name'),
        func.count(distinct(ForumThread.id)).label('thread_count'),
        func.count(ForumPost.id).label('post_count')
    ).outerjoin(
        ForumThread, ForumThread.category_id == ForumCategory.id
    ).outerjoin(
        ForumPost, ForumPost.thread_id == ForumThread.id
    ).group_by(
        ForumCategory.name
    ).order_by(
        func.count(ForumPost.id).desc()
    ).all()

    forum_categories = [
        ForumCategoryStats(
            category_name=r.category_name,
            thread_count=r.thread_count or 0,
            post_count=r.post_count or 0
        )
        for r in category_stats
    ]

    # Top contributors
    top_posters = db.query(
        User.id.label('user_id'),
        User.username,
        User.display_name,
        func.count(ForumPost.id).label('post_count')
    ).join(
        ForumPost, ForumPost.author_id == User.id
    ).filter(
        ForumPost.created_at >= start_date,
        ForumPost.created_at < end_date
    ).group_by(
        User.id, User.username, User.display_name
    ).order_by(
        func.count(ForumPost.id).desc()
    ).limit(10).all()

    top_contributors = [
        TopContributor(
            user_id=str(r.user_id),
            username=r.username,
            display_name=r.display_name,
            post_count=r.post_count
        )
        for r in top_posters
    ]

    # Summary stats
    total_threads = db.query(func.count(ForumThread.id)).scalar() or 0
    total_posts = db.query(func.count(ForumPost.id)).scalar() or 0
    total_follows = db.query(func.count(Follow.follower_id)).scalar() or 0

    avg_posts_per_thread = 0.0
    if total_threads > 0:
        avg_posts_per_thread = total_posts / total_threads

    return CommunityAnalyticsResponse(
        time_series=time_series,
        forum_categories=forum_categories,
        top_contributors=top_contributors,
        total_threads=total_threads,
        total_posts=total_posts,
        total_follows=total_follows,
        average_posts_per_thread=round(avg_posts_per_thread, 1)
    )
