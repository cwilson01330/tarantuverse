"""Shed log routes — Herpetoverse v1

Parallel to the molt_logs router — snakes shed, tarantulas molt. The
biology is different enough that we keep two separate routers (see
PRD-herpetoverse-v1.md §5.3), but the CRUD shape is the same:

  GET  /snakes/{snake_id}/sheds
  POST /snakes/{snake_id}/sheds
  PUT  /sheds/{shed_id}
  DELETE /sheds/{shed_id}

Ownership is enforced by walking `shed.snake.user_id == current_user.id`
on every write. Reads do the same via a join filter.

Side-effects on POST:
  - Denormalize `snakes.last_shed_at` to the new shed date so dashboards
    don't need to scan the full shed history for the "last shed X days
    ago" badge.
"""
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.snake import Snake
from app.models.shed_log import ShedLog
from app.schemas.shed_log import ShedLogCreate, ShedLogUpdate, ShedLogResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _get_owned_snake(db: Session, snake_id: uuid.UUID, user: User) -> Snake:
    snake = (
        db.query(Snake)
        .filter(Snake.id == snake_id, Snake.user_id == user.id)
        .first()
    )
    if not snake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snake not found"
        )
    return snake


def _get_owned_shed(db: Session, shed_id: uuid.UUID, user: User) -> ShedLog:
    """Fetch a shed log and verify the owning snake belongs to the caller.

    Raises 404 for missing shed, 403 for not-your-shed (matches molts router).
    """
    shed = db.query(ShedLog).filter(ShedLog.id == shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shed log not found"
        )
    owner_snake = (
        db.query(Snake)
        .filter(Snake.id == shed.snake_id, Snake.user_id == user.id)
        .first()
    )
    if not owner_snake:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )
    return shed


@router.get("/snakes/{snake_id}/sheds", response_model=List[ShedLogResponse])
async def list_sheds(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List shed logs for a snake, most recent first."""
    _get_owned_snake(db, snake_id, current_user)
    return (
        db.query(ShedLog)
        .filter(ShedLog.snake_id == snake_id)
        .order_by(ShedLog.shed_at.desc())
        .all()
    )


@router.post(
    "/snakes/{snake_id}/sheds",
    response_model=ShedLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_shed(
    snake_id: uuid.UUID,
    shed_data: ShedLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a shed for a snake.

    Denormalizes `snakes.last_shed_at` so the dashboard "X days since shed"
    badge doesn't need to re-scan the shed history.
    """
    snake = _get_owned_snake(db, snake_id, current_user)

    new_shed = ShedLog(snake_id=snake_id, **shed_data.model_dump())
    db.add(new_shed)

    # Denormalize last_shed_at — only move it forward, never backward
    # (so backfilling an old shed doesn't regress the dashboard badge).
    shed_date = new_shed.shed_at.date() if new_shed.shed_at else None
    if shed_date and (snake.last_shed_at is None or shed_date > snake.last_shed_at):
        snake.last_shed_at = shed_date

    db.commit()
    db.refresh(new_shed)

    # TODO(sprint-5): emit activity feed "new_shed" once reptile actions ship
    return new_shed


@router.put("/sheds/{shed_id}", response_model=ShedLogResponse)
async def update_shed(
    shed_id: uuid.UUID,
    shed_data: ShedLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partial update of a shed log. Ownership checked via owning snake."""
    shed = _get_owned_shed(db, shed_id, current_user)

    update_data = shed_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shed, field, value)

    db.commit()
    db.refresh(shed)
    return shed


@router.delete("/sheds/{shed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shed(
    shed_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a shed log. Does NOT recompute last_shed_at — that would need
    a full history scan; acceptable since last_shed_at is a hint, not
    authoritative. Future Sprint 5 analytics can recompute if needed.
    """
    shed = _get_owned_shed(db, shed_id, current_user)
    db.delete(shed)
    db.commit()
    return None
