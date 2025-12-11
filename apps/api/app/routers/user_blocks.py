"""
User blocks API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.user_block import UserBlock
from app.schemas.user_block import UserBlockCreate, UserBlockResponse, UserBlockDetailedResponse, UserInfo
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/blocks", tags=["blocks"])


def is_admin(user: User) -> bool:
    """Check if user is admin or superuser"""
    return user.is_admin or user.is_superuser


@router.post("/", response_model=UserBlockResponse, status_code=status.HTTP_201_CREATED)
def block_user(
    block_data: UserBlockCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Block a user - immediately hides their content from your feed"""
    # Check if user exists
    blocked_user = db.query(User).filter(User.id == block_data.blocked_id).first()
    if not blocked_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already blocked
    existing_block = db.query(UserBlock).filter(
        and_(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == block_data.blocked_id
        )
    ).first()

    if existing_block:
        raise HTTPException(status_code=400, detail="User already blocked")

    # Create block
    new_block = UserBlock(
        blocker_id=current_user.id,
        blocked_id=block_data.blocked_id,
        reason=block_data.reason
    )

    db.add(new_block)
    db.commit()
    db.refresh(new_block)

    return new_block


@router.delete("/{blocked_id}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_user(
    blocked_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unblock a previously blocked user"""
    block = db.query(UserBlock).filter(
        and_(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == blocked_id
        )
    ).first()

    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    db.delete(block)
    db.commit()

    return None


@router.get("/", response_model=List[UserBlockResponse])
def get_blocked_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of users you have blocked"""
    blocks = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id
    ).all()

    return blocks


@router.get("/check/{user_id}", response_model=dict)
def check_if_blocked(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if you have blocked a specific user or if they have blocked you"""
    you_blocked_them = db.query(UserBlock).filter(
        and_(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == user_id
        )
    ).first() is not None

    they_blocked_you = db.query(UserBlock).filter(
        and_(
            UserBlock.blocker_id == user_id,
            UserBlock.blocked_id == current_user.id
        )
    ).first() is not None

    return {
        "you_blocked_them": you_blocked_them,
        "they_blocked_you": they_blocked_you,
        "blocked": you_blocked_them or they_blocked_you
    }


# Admin endpoints
@router.get("/admin/user/{user_id}", response_model=dict)
def get_user_blocks_admin(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all blocks for a specific user (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get blocks this user created (users they blocked)
    blocks_by_user = db.query(UserBlock).filter(
        UserBlock.blocker_id == user_id
    ).all()

    # Get blocks against this user (users who blocked them)
    blocks_against_user = db.query(UserBlock).filter(
        UserBlock.blocked_id == user_id
    ).all()

    # Get user info for all involved users
    blocked_user_ids = [block.blocked_id for block in blocks_by_user]
    blocker_user_ids = [block.blocker_id for block in blocks_against_user]
    all_user_ids = list(set(blocked_user_ids + blocker_user_ids + [user_id]))

    users = db.query(User).filter(User.id.in_(all_user_ids)).all()
    user_map = {str(user.id): user for user in users}

    # Format blocks with user details
    blocks_by_user_detailed = []
    for block in blocks_by_user:
        blocked_user = user_map.get(str(block.blocked_id))
        blocks_by_user_detailed.append({
            "id": str(block.id),
            "blocker_id": str(block.blocker_id),
            "blocked_id": str(block.blocked_id),
            "reason": block.reason,
            "created_at": block.created_at.isoformat(),
            "blocked_user": {
                "id": str(blocked_user.id),
                "username": blocked_user.username,
                "email": blocked_user.email,
                "display_name": blocked_user.display_name
            } if blocked_user else None
        })

    blocks_against_user_detailed = []
    for block in blocks_against_user:
        blocker_user = user_map.get(str(block.blocker_id))
        blocks_against_user_detailed.append({
            "id": str(block.id),
            "blocker_id": str(block.blocker_id),
            "blocked_id": str(block.blocked_id),
            "reason": block.reason,
            "created_at": block.created_at.isoformat(),
            "blocker": {
                "id": str(blocker_user.id),
                "username": blocker_user.username,
                "email": blocker_user.email,
                "display_name": blocker_user.display_name
            } if blocker_user else None
        })

    return {
        "user_id": str(user_id),
        "blocks_by_user": blocks_by_user_detailed,
        "blocks_against_user": blocks_against_user_detailed,
        "total_blocked": len(blocks_by_user),
        "total_blocked_by": len(blocks_against_user)
    }


@router.get("/admin/all", response_model=List[UserBlockDetailedResponse])
def get_all_blocks_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all blocks across the platform (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get all blocks with joined user data
    blocks = db.query(UserBlock).all()

    # Get all involved user IDs
    user_ids = set()
    for block in blocks:
        user_ids.add(block.blocker_id)
        user_ids.add(block.blocked_id)

    # Fetch all users
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    user_map = {user.id: user for user in users}

    # Build detailed responses
    detailed_blocks = []
    for block in blocks:
        blocker = user_map.get(block.blocker_id)
        blocked = user_map.get(block.blocked_id)

        detailed_blocks.append({
            "id": block.id,
            "blocker_id": block.blocker_id,
            "blocked_id": block.blocked_id,
            "reason": block.reason,
            "created_at": block.created_at,
            "blocker": UserInfo(
                id=blocker.id,
                username=blocker.username,
                email=blocker.email,
                display_name=blocker.display_name
            ) if blocker else None,
            "blocked_user": UserInfo(
                id=blocked.id,
                username=blocked.username,
                email=blocked.email,
                display_name=blocked.display_name
            ) if blocked else None
        })

    return detailed_blocks


@router.get("/admin/stats", response_model=dict)
def get_block_stats_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get blocking statistics (admin only)"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    total_blocks = db.query(func.count(UserBlock.id)).scalar()

    return {
        "total_blocks": total_blocks
    }
