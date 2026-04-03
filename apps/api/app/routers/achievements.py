"""
Achievements/Badges router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.utils.dependencies import get_current_user
from app.models.user import User
from app.schemas.achievement import AchievementResponse, AchievementSummary
from app.services.achievement_service import check_and_award, get_user_achievements

router = APIRouter()


@router.get("/achievements/", response_model=AchievementSummary)
async def list_achievements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all achievements for current user (earned + unearned)

    Returns:
    - total_available: Total number of available achievements
    - total_earned: Number of achievements user has earned
    - achievements: List of all achievements with earned_at timestamps
    - recently_earned: Last 5 earned achievements
    """
    result = get_user_achievements(db, current_user.id)
    return AchievementSummary(**result)


@router.post("/achievements/check", response_model=list)
async def check_achievements(
    category: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Trigger achievement check and return newly earned achievements

    Query params:
    - category: Optional filter by category (collection, feeding, molts, community, breeding)

    Returns:
    - List of newly awarded achievement dicts
    """
    newly_awarded = check_and_award(db, current_user.id, category=category)
    return newly_awarded


@router.get("/users/{username}/achievements", response_model=AchievementSummary)
async def get_user_public_achievements(
    username: str,
    db: Session = Depends(get_db)
):
    """
    Public endpoint: view a user's earned achievements (for profiles)

    Returns only awarded achievements
    """
    from app.models.user import User

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    result = get_user_achievements(db, user.id)
    # For public view, only return earned achievements in the list
    result["achievements"] = [a for a in result["achievements"] if a["earned_at"] is not None]

    return AchievementSummary(**result)
