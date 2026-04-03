"""
Achievement checking and awarding service
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import uuid
from app.models.achievement import AchievementDefinition, UserAchievement
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.tarantula import Tarantula
from app.models.pairing import Pairing, PairingOutcome
from app.models.forum import ForumPost
from app.models.follow import Follow


def get_tarantula_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total number of tarantulas user owns"""
    return db.query(func.count(Tarantula.id)).filter(
        Tarantula.user_id == user_id
    ).scalar() or 0


def get_feeding_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total feeding logs user has created"""
    return db.query(func.count(FeedingLog.id)).join(
        Tarantula, FeedingLog.tarantula_id == Tarantula.id
    ).filter(
        Tarantula.user_id == user_id
    ).scalar() or 0


def get_molt_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total molt logs user has created"""
    return db.query(func.count(MoltLog.id)).join(
        Tarantula, MoltLog.tarantula_id == Tarantula.id
    ).filter(
        Tarantula.user_id == user_id
    ).scalar() or 0


def get_pairing_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total pairings user has created"""
    return db.query(func.count(Pairing.id)).filter(
        Pairing.user_id == user_id
    ).scalar() or 0


def get_successful_pairing_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total successful pairings user has"""
    return db.query(func.count(Pairing.id)).filter(
        and_(
            Pairing.user_id == user_id,
            Pairing.outcome == PairingOutcome.SUCCESSFUL
        )
    ).scalar() or 0


def get_forum_post_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total forum posts user has created"""
    return db.query(func.count(ForumPost.id)).filter(
        ForumPost.user_id == user_id
    ).scalar() or 0


def get_following_count(db: Session, user_id: uuid.UUID) -> int:
    """Get total users this user is following"""
    return db.query(func.count(Follow.id)).filter(
        Follow.follower_id == user_id
    ).scalar() or 0


def get_feeding_streak(db: Session, user_id: uuid.UUID) -> int:
    """
    Calculate current feeding streak: consecutive calendar days with at least one feeding logged
    """
    # Get all feeding logs for user's tarantulas, sorted by date DESC
    feedings = db.query(FeedingLog.fed_at).join(
        Tarantula, FeedingLog.tarantula_id == Tarantula.id
    ).filter(
        Tarantula.user_id == user_id
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
