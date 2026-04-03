"""
Discover/trending content routes
"""
from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, and_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.species import Species
from app.models.forum import ForumThread, ForumCategory, ForumPost
from app.models.activity_feed import ActivityFeed
from app.schemas.discover import (
    DiscoverResponse,
    TrendingThread,
    ActiveKeeper,
    PopularSpecies,
    RecentActivity,
    PlatformStats,
)

router = APIRouter(tags=["discover"])


@router.get("/discover/", response_model=DiscoverResponse)
async def get_discover_feed(db: Session = Depends(get_db)):
    """
    Get the discover feed with trending content, active keepers, and popular species.
    This is a public endpoint (no authentication required).
    """

    # ============================================================
    # 1. TRENDING THREADS (Top 5 by reply count in last 7 days)
    # ============================================================
    seven_days_ago = datetime.utcnow() - timedelta(days=7)

    trending_threads_data = (
        db.query(
            ForumThread.id,
            ForumThread.title,
            ForumCategory.name.label("category"),
            func.count(ForumPost.id).label("reply_count"),
            User.username.label("author_username"),
            ForumThread.created_at,
        )
        .join(ForumCategory, ForumThread.category_id == ForumCategory.id)
        .join(User, ForumThread.author_id == User.id)
        .outerjoin(ForumPost, ForumThread.id == ForumPost.thread_id)
        .filter(ForumThread.created_at >= seven_days_ago)
        .group_by(
            ForumThread.id,
            ForumThread.title,
            ForumCategory.name,
            User.username,
            ForumThread.created_at,
        )
        .order_by(desc(func.count(ForumPost.id)))
        .limit(5)
        .all()
    )

    trending_threads = [
        TrendingThread(
            id=thread[0],
            title=thread[1],
            category=thread[2],
            reply_count=thread[3],
            author_username=thread[4],
            created_at=thread[5],
        )
        for thread in trending_threads_data
    ]

    # ============================================================
    # 2. ACTIVE KEEPERS (5 most active in last 30 days)
    # ============================================================
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    active_keepers_data = (
        db.query(
            User.id,
            User.username,
            User.display_name,
            User.avatar_url,
            func.count(ActivityFeed.id).label("activity_count"),
        )
        .join(ActivityFeed, User.id == ActivityFeed.user_id)
        .filter(
            and_(
                ActivityFeed.created_at >= thirty_days_ago,
                User.is_active == True,
            )
        )
        .group_by(User.id, User.username, User.display_name, User.avatar_url)
        .order_by(desc(func.count(ActivityFeed.id)))
        .limit(5)
        .all()
    )

    active_keepers = [
        ActiveKeeper(
            id=keeper[0],
            username=keeper[1],
            display_name=keeper[2],
            avatar_url=keeper[3],
            activity_count=keeper[4],
        )
        for keeper in active_keepers_data
    ]

    # ============================================================
    # 3. POPULAR SPECIES (Top 5 by times_kept)
    # ============================================================
    popular_species_data = (
        db.query(Species)
        .filter(Species.is_verified == True)
        .order_by(desc(Species.times_kept))
        .limit(5)
        .all()
    )

    popular_species = [
        PopularSpecies(
            id=species.id,
            scientific_name=species.scientific_name,
            common_names=species.common_names,
            image_url=species.image_url,
            times_kept=species.times_kept,
            care_level=species.care_level.value if species.care_level else None,
        )
        for species in popular_species_data
    ]

    # ============================================================
    # 4. RECENT ACTIVITY (Latest 10 items)
    # ============================================================
    recent_activity_data = (
        db.query(
            ActivityFeed.id,
            User.username.label("user_username"),
            ActivityFeed.action_type,
            ActivityFeed.activity_metadata,
            ActivityFeed.created_at,
        )
        .join(User, ActivityFeed.user_id == User.id)
        .order_by(desc(ActivityFeed.created_at))
        .limit(10)
        .all()
    )

    recent_activity = [
        RecentActivity(
            id=activity[0],
            user_username=activity[1],
            activity_type=activity[2],
            data=activity[3],
            created_at=activity[4],
        )
        for activity in recent_activity_data
    ]

    # ============================================================
    # 5. PLATFORM STATS
    # ============================================================
    total_keepers = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    total_tarantulas = db.query(func.count(Tarantula.id)).scalar() or 0
    total_species = db.query(func.count(Species.id)).filter(Species.is_verified == True).scalar() or 0
    total_forum_threads = db.query(func.count(ForumThread.id)).scalar() or 0

    stats = PlatformStats(
        total_keepers=total_keepers,
        total_tarantulas=total_tarantulas,
        total_species=total_species,
        total_forum_threads=total_forum_threads,
    )

    # ============================================================
    # 6. BUILD RESPONSE
    # ============================================================
    return DiscoverResponse(
        stats=stats,
        trending_threads=trending_threads,
        active_keepers=active_keepers,
        popular_species=popular_species,
        recent_activity=recent_activity,
    )
