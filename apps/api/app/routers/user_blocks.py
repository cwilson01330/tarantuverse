"""
User blocks API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.user_block import UserBlock
from app.schemas.user_block import UserBlockCreate, UserBlockResponse
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/blocks", tags=["blocks"])


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
