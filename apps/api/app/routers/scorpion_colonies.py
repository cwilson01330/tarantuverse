"""Scorpion colony routes.

Colonies are a grouping layer over scorpions for communal setups. Logs
stay per-scorpion (see ScorpionColony docstring); colonies just give
the UI somewhere to anchor a "bulk feeding" action that fans out to
each member.

  GET    /api/v1/scorpion-colonies/                 list user's colonies
  POST   /api/v1/scorpion-colonies/                 create
  GET    /api/v1/scorpion-colonies/{colony_id}      detail (with members)
  PUT    /api/v1/scorpion-colonies/{colony_id}      partial update
  DELETE /api/v1/scorpion-colonies/{colony_id}      delete (SET NULL on members)
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.scorpion import Scorpion
from app.models.scorpion_colony import ScorpionColony
from app.schemas.scorpion_colony import (
    ScorpionColonyCreate,
    ScorpionColonyDetailResponse,
    ScorpionColonyResponse,
    ScorpionColonyUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


def _attach_member_count(db: Session, colony: ScorpionColony) -> ScorpionColony:
    """Set member_count on a single colony row in place. Cheaper than
    eager-loading the full members relationship when the caller only
    needs the count."""
    count = (
        db.query(func.count(Scorpion.id))
        .filter(Scorpion.colony_id == colony.id)
        .scalar()
    )
    colony.member_count = count or 0  # type: ignore[attr-defined]
    return colony


@router.get("/", response_model=List[ScorpionColonyResponse])
async def list_colonies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's colonies, newest first. Each
    response carries `member_count` so the index card UI can render
    "Pandinus group · 5 members" without a second fetch."""
    colonies = (
        db.query(ScorpionColony)
        .filter(ScorpionColony.user_id == current_user.id)
        .order_by(ScorpionColony.created_at.desc())
        .all()
    )

    # Bulk-compute member counts in one extra query instead of N+1.
    if colonies:
        counts = dict(
            db.query(Scorpion.colony_id, func.count(Scorpion.id))
            .filter(Scorpion.colony_id.in_([c.id for c in colonies]))
            .group_by(Scorpion.colony_id)
            .all()
        )
        for colony in colonies:
            colony.member_count = counts.get(colony.id, 0)  # type: ignore[attr-defined]

    return colonies


@router.post(
    "/", response_model=ScorpionColonyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_colony(
    payload: ScorpionColonyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new colony. Members are added by updating individual
    scorpions' `colony_id`, not via this endpoint — the colony itself
    starts empty."""
    new_colony = ScorpionColony(
        user_id=current_user.id, **payload.model_dump(),
    )
    db.add(new_colony)
    db.commit()
    db.refresh(new_colony)
    new_colony.member_count = 0  # type: ignore[attr-defined]
    return new_colony


@router.get(
    "/{colony_id}", response_model=ScorpionColonyDetailResponse,
)
async def get_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detail view — includes the projected member list."""
    colony = (
        db.query(ScorpionColony)
        .options(selectinload(ScorpionColony.members))
        .filter(
            ScorpionColony.id == colony_id,
            ScorpionColony.user_id == current_user.id,
        )
        .first()
    )
    if not colony:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found",
        )
    colony.member_count = len(colony.members)  # type: ignore[attr-defined]
    return colony


@router.put("/{colony_id}", response_model=ScorpionColonyResponse)
async def update_colony(
    colony_id: UUID,
    payload: ScorpionColonyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update."""
    colony = db.query(ScorpionColony).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == current_user.id,
    ).first()
    if not colony:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(colony, field, value)

    db.commit()
    db.refresh(colony)
    return _attach_member_count(db, colony)


@router.delete(
    "/{colony_id}", status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete the colony. Members aren't deleted — their `colony_id`
    is set NULL by the FK clause from scp_20260522. This preserves
    individual scorpion histories when a keeper breaks up a colony."""
    colony = db.query(ScorpionColony).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == current_user.id,
    ).first()
    if not colony:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found",
        )
    db.delete(colony)
    db.commit()
    return None
