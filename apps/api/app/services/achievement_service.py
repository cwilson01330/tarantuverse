"""
Achievement checking and awarding service

CROSS-TAXON BY CONSTRUCTION
---------------------------
Every count here used to run through `tarantulas`, which meant a keeper whose
collection was mantises, jumpers or isopods earned nothing — not one badge —
no matter how diligently they logged. That wasn't a cosmetic gap: the first
premium subscriber had 21 animals, 22 feedings and 28 molts recorded and zero
achievements, because only 2 of the 21 were tarantulas and none of the feeding
logs carried the legacy `tarantula_id`.

The rule now: count the UNIFIED surface. Animals come from `inverts` (every
taxon lives there, ADR-005); logs are matched on whichever parent they carry.

WHY `or_` AND NOT A JOIN
------------------------
Dual-write means a tarantula's feeding log can carry BOTH `tarantula_id` and
`invert_id` — those two ids are the same value, since the tables share primary
keys. Joining against both tables would count that log twice and hand out
`dedicated_feeder_50` at 25 real feedings. Filtering one `FeedingLog` row
against a set of owned parent ids counts it exactly once however many parent
columns happen to be populated.

The legacy `tarantula_id` arm is still needed: logs written before the ADR-005
backfill, or by a legacy code path, may carry only that column.
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_, select
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import uuid
from app.models.achievement import AchievementDefinition, UserAchievement
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.tarantula import Tarantula
from app.models.invert import Invert
from app.models.colony import Colony
from app.models.pairing import Pairing, PairingOutcome
from app.models.forum import ForumPost
from app.models.follow import Follow


def _owned_log_filter(model, user_id: uuid.UUID):
    """
    Rows of a polymorphic log table belonging to this user, via ANY parent.

    Covers colonies as well as individuals: an isopod or roach keeper logs
    against a colony, and a keeper who never opens an individual record is
    exactly the keeper this service used to ignore.
    """
    return or_(
        model.invert_id.in_(
            select(Invert.id).where(Invert.user_id == user_id)
        ),
        model.tarantula_id.in_(
            select(Tarantula.id).where(Tarantula.user_id == user_id)
        ),
        model.colony_id.in_(
            select(Colony.id).where(Colony.user_id == user_id)
        ),
    )


def get_tarantula_count(db: Session, user_id: uuid.UUID) -> int:
    """
    Total animals the user keeps, across every taxon.

    Deceased animals still count. Achievements record what you have kept, not
    what is currently alive — the free-tier cap is the thing that excludes the
    dead (ADR-015), and borrowing that rule here would quietly revoke progress
    from a keeper who just lost an animal. Transferred-out animals are excluded
    because that record now belongs to the buyer.

    Name kept as-is: `first_tarantula` and friends are seeded achievement keys
    and several callers import this symbol.
    """
    return db.query(func.count(Invert.id)).filter(
        Invert.user_id == user_id,
        Invert.transferred_out_at.is_(None),
    ).scalar() or 0


def get_feeding_count(db: Session, user_id: uuid.UUID) -> int:
    """Total feeding logs the user has recorded, on any animal or colony."""
    return db.query(func.count(FeedingLog.id)).filter(
        _owned_log_filter(FeedingLog, user_id)
    ).scalar() or 0


def get_molt_count(db: Session, user_id: uuid.UUID) -> int:
    """Total molt logs the user has recorded, on any animal or colony."""
    return db.query(func.count(MoltLog.id)).filter(
        _owned_log_filter(MoltLog, user_id)
    ).scalar() or 0


def get_pairing_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total pairings user has created"""
    return db.query(func.count(Pairing.id)).filter(
        Pairing.user_id == user_id
    ).scalar() or 0


def get_successful_pairing_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total successful pairings user has"""
    # Cast the enum column to text before comparing so SQLAlchemy's enum type
    # processor never touches the value — avoids "SUCCESSFUL" vs "successful" mismatch.
    from sqlalchemy import cast, String as SAString
    return db.query(func.count(Pairing.id)).filter(
        Pairing.user_id == user_id,
        cast(Pairing.outcome, SAString) == "successful"
    ).scalar() or 0


def get_forum_post_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total forum posts user has created"""
    return db.query(func.count(ForumPost.id)).filter(
        ForumPost.author_id == user_id  # column is author_id, not user_id
    ).scalar() or 0


def get_following_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total users this user is following"""
    # Follow uses a composite PK (follower_id + followed_id) — no id column
    return db.query(func.count(Follow.follower_id)).filter(
        Follow.follower_id == user_id
    ).scalar() or 0


def get_feeding_streak(db: Session, user_id: uuid.UUID) -> int:
    """
    Calculate current feeding streak: consecutive calendar days with at least one feeding logged
    """
    # Every animal and colony, not just tarantulas — a streak is about the
    # keeper's habit, and feeding a mantis on Tuesday is feeding on Tuesday.
    feedings = db.query(FeedingLog.fed_at).filter(
        _owned_log_filter(FeedingLog, user_id)
    ).order_by(FeedingLog.fed_at.desc()).all()

    if not feedings:
        return 0

    # Convert to dates and deduplicate
    feeding_dates = sorted(set([f[0].date() for f in feedings]), reverse=True)

    if not feeding_dates:
        return 0

    # Check streak starting from most recent
    streak = 0
    current_date = datetime.now(timezone.utc).date()

    for feeding_date in feeding_dates:
        # If this date is before our current check point, streak is broken
        if feeding_date < (current_date - timedelta(days=streak)):
            break
        # If there's a gap (not consecutive), streak is broken
        if streak > 0 and feeding_date != (current_date - timedelta(days=streak)):
            break
        streak += 1

    return streak


def check_and_award(
    db: Session,
    user_id: uuid.UUID,
    category: Optional[str] = None
) -> List[Dict]:
    """
    Check all active achievements (or filtered by category) and award any newly earned ones.
    Returns list of newly awarded achievement dicts.
    """
    newly_awarded = []

    # Get active achievements, optionally filtered by category
    query = db.query(AchievementDefinition).filter(AchievementDefinition.is_active == True)
    if category:
        query = query.filter(AchievementDefinition.category == category)
    achievements = query.all()

    # Get already earned achievements
    earned_ids = set([ua.achievement_id for ua in db.query(UserAchievement).filter(
        UserAchievement.user_id == user_id
    ).all()])

    # Check each achievement
    for achievement in achievements:
        # Skip if already earned
        if achievement.id in earned_ids:
            continue

        is_earned = False

        # Collection achievements
        if achievement.key == "first_tarantula":
            is_earned = get_tarantula_count(db, user_id) >= 1

        elif achievement.key == "collector_5":
            is_earned = get_tarantula_count(db, user_id) >= 5

        elif achievement.key == "collector_10":
            is_earned = get_tarantula_count(db, user_id) >= 10

        elif achievement.key == "collector_25":
            is_earned = get_tarantula_count(db, user_id) >= 25

        elif achievement.key == "collector_50":
            is_earned = get_tarantula_count(db, user_id) >= 50

        # Feeding achievements
        elif achievement.key == "first_feeding":
            is_earned = get_feeding_count(db, user_id) >= 1

        elif achievement.key == "dedicated_feeder_50":
            is_earned = get_feeding_count(db, user_id) >= 50

        elif achievement.key == "dedicated_feeder_100":
            is_earned = get_feeding_count(db, user_id) >= 100

        elif achievement.key == "feeding_streak_7":
            is_earned = get_feeding_streak(db, user_id) >= 7

        elif achievement.key == "feeding_streak_30":
            is_earned = get_feeding_streak(db, user_id) >= 30

        # Molt achievements
        elif achievement.key == "first_molt":
            is_earned = get_molt_count(db, user_id) >= 1

        elif achievement.key == "molt_watcher_10":
            is_earned = get_molt_count(db, user_id) >= 10

        elif achievement.key == "molt_watcher_25":
            is_earned = get_molt_count(db, user_id) >= 25

        # Community achievements
        elif achievement.key == "first_post":
            is_earned = get_forum_post_count(db, user_id) >= 1

        elif achievement.key == "contributor_10":
            is_earned = get_forum_post_count(db, user_id) >= 10

        elif achievement.key == "social_butterfly":
            is_earned = get_following_count(db, user_id) >= 10

        # Breeding achievements
        elif achievement.key == "first_pairing":
            is_earned = get_pairing_count(db, user_id) >= 1

        elif achievement.key == "breeder":
            is_earned = get_successful_pairing_count(db, user_id) >= 1

        # Award if earned
        if is_earned:
            user_achievement = UserAchievement(
                user_id=user_id,
                achievement_id=achievement.id,
                earned_at=datetime.now(timezone.utc)
            )
            db.add(user_achievement)
            newly_awarded.append({
                "id": achievement.id,
                "key": achievement.key,
                "name": achievement.name,
                "description": achievement.description,
                "icon": achievement.icon,
                "category": achievement.category,
                "tier": achievement.tier,
                "earned_at": user_achievement.earned_at
            })

    # Commit all new achievements at once
    if newly_awarded:
        db.commit()

    return newly_awarded


def get_user_achievements(db: Session, user_id: uuid.UUID) -> Dict:
    """
    Get all achievements for a user (earned + unearned), with recently earned summary
    """
    # Get all active achievements
    all_achievements = db.query(AchievementDefinition).filter(
        AchievementDefinition.is_active == True
    ).order_by(AchievementDefinition.tier, AchievementDefinition.name).all()

    # Get earned achievements with timestamps
    earned_achievements = db.query(UserAchievement, AchievementDefinition).join(
        AchievementDefinition, UserAchievement.achievement_id == AchievementDefinition.id
    ).filter(
        UserAchievement.user_id == user_id
    ).all()

    earned_dict = {ach.id: ua.earned_at for ua, ach in earned_achievements}

    # Build achievement list
    achievements = []
    for achievement in all_achievements:
        earned_at = earned_dict.get(achievement.id)
        achievements.append({
            "id": achievement.id,
            "key": achievement.key,
            "name": achievement.name,
            "description": achievement.description,
            "icon": achievement.icon,
            "category": achievement.category,
            "tier": achievement.tier,
            "requirement_count": achievement.requirement_count,
            "earned_at": earned_at
        })

    # Get recently earned (last 5)
    recently_earned = sorted(
        [a for a in achievements if a["earned_at"] is not None],
        key=lambda x: x["earned_at"],
        reverse=True
    )[:5]

    total_available = len(achievements)
    total_earned = sum(1 for a in achievements if a["earned_at"] is not None)

    return {
        "total_available": total_available,
        "total_earned": total_earned,
        "achievements": achievements,
        "recently_earned": recently_earned
    }
