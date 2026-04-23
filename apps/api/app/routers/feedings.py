"""
Feeding log routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid

from datetime import datetime, timezone

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.snake import Snake
from app.models.lizard import Lizard
from app.models.feeding_log import FeedingLog
from app.schemas.feeding import FeedingLogCreate, FeedingLogUpdate, FeedingLogResponse
from app.schemas.feeding_reminder import FeedingReminderSummary
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity
from app.services.feeding_reminder_service import get_user_feeding_reminders

router = APIRouter()


def _feeding_owner_taxon(feeding: FeedingLog, db: Session, user: User):
    """Return (parent_model, parent_row) if the user owns the parent of this
    feeding log. Returns (None, None) if not authorized.

    Polymorphic parent lookup — feeding_logs can now be parented by
    tarantula, snake, lizard, or enclosure. Centralized so update/delete
    don't duplicate the branching logic.
    """
    if feeding.tarantula_id:
        row = db.query(Tarantula).filter(
            Tarantula.id == feeding.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
        return (Tarantula, row) if row else (None, None)
    if feeding.snake_id:
        row = db.query(Snake).filter(
            Snake.id == feeding.snake_id,
            Snake.user_id == user.id,
        ).first()
        return (Snake, row) if row else (None, None)
    if feeding.lizard_id:
        row = db.query(Lizard).filter(
            Lizard.id == feeding.lizard_id,
            Lizard.user_id == user.id,
        ).first()
        return (Lizard, row) if row else (None, None)
    # enclosure-parented feedings aren't ownership-checked here (feeders);
    # they're handled by their own router.
    return (None, None)


@router.get("/tarantulas/{tarantula_id}/feedings", response_model=List[FeedingLogResponse])
async def get_feeding_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all feeding logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Get feeding logs ordered by date (most recent first)
    feedings = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id
    ).order_by(FeedingLog.fed_at.desc()).all()

    return feedings


@router.post("/tarantulas/{tarantula_id}/feedings", response_model=FeedingLogResponse, status_code=status.HTTP_201_CREATED)
async def create_feeding_log(
    tarantula_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new feeding log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Create feeding log
    new_feeding = FeedingLog(
        tarantula_id=tarantula_id,
        **feeding_data.model_dump()
    )

    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="feeding",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "species_name": tarantula.common_name or tarantula.scientific_name,
            "thumbnail_url": tarantula.photo_url,
            "tarantula_id": str(tarantula.id),
            "food_type": feeding_data.food_type,
            "accepted": feeding_data.accepted,
        }
    )

    return new_feeding


@router.get("/snakes/{snake_id}/feedings", response_model=List[FeedingLogResponse])
async def get_snake_feeding_logs(
    snake_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for a snake, most recent first.

    Parallel to the tarantula list endpoint — kept on separate routes per
    Sprint 3 guidance (REST convention over a unified polymorphic route).
    """
    snake = db.query(Snake).filter(
        Snake.id == snake_id,
        Snake.user_id == current_user.id,
    ).first()

    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.snake_id == snake_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/snakes/{snake_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_snake_feeding_log(
    snake_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a snake.

    Denormalizes `snakes.last_fed_at` forward-only so the dashboard "X days
    since fed" badge doesn't need to rescan history on every render.

    Activity feed emission deferred to Sprint 5 (reptile actions) — see the
    matching TODO in sheds.py.
    """
    snake = db.query(Snake).filter(
        Snake.id == snake_id,
        Snake.user_id == current_user.id,
    ).first()

    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

    new_feeding = FeedingLog(snake_id=snake_id, **feeding_data.model_dump())
    db.add(new_feeding)

    # Forward-only denormalization — backfilling an old feeding shouldn't
    # regress the "last fed X days ago" badge.
    fed_at = new_feeding.fed_at
    if fed_at and (snake.last_fed_at is None or fed_at > snake.last_fed_at):
        snake.last_fed_at = fed_at

    db.commit()
    db.refresh(new_feeding)

    # TODO(sprint-5): emit activity feed "feeding" for snakes once reptile
    # actions ship. Tarantula feedings emit via create_activity above.
    return new_feeding


@router.get("/lizards/{lizard_id}/feedings", response_model=List[FeedingLogResponse])
async def get_lizard_feeding_logs(
    lizard_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for a lizard, most recent first."""
    lizard = db.query(Lizard).filter(
        Lizard.id == lizard_id,
        Lizard.user_id == current_user.id,
    ).first()

    if not lizard:
        raise HTTPException(status_code=404, detail="Lizard not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.lizard_id == lizard_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/lizards/{lizard_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lizard_feeding_log(
    lizard_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a lizard.

    Mirrors the snake path. Denormalizes `lizards.last_fed_at` forward-only
    so dashboards don't have to rescan history on every render. Backfilling
    an older feeding doesn't regress the badge.

    Note: `prey_weight_g` is snake-only in v1 (carried forward from Sprint
    5). Lizard feeds leave it null. If the mobile/web form ever needs to
    record prey count or insect species, that's a feeding_log schema
    extension — not a column repurposing.
    """
    lizard = db.query(Lizard).filter(
        Lizard.id == lizard_id,
        Lizard.user_id == current_user.id,
    ).first()

    if not lizard:
        raise HTTPException(status_code=404, detail="Lizard not found")

    new_feeding = FeedingLog(lizard_id=lizard_id, **feeding_data.model_dump())
    db.add(new_feeding)

    fed_at = new_feeding.fed_at
    if fed_at and (lizard.last_fed_at is None or fed_at > lizard.last_fed_at):
        lizard.last_fed_at = fed_at

    db.commit()
    db.refresh(new_feeding)

    # TODO(post-v1): emit activity feed "feeding" for lizards once reptile
    # actions ship. Tarantula feedings emit via create_activity above.
    return new_feeding


@router.put("/feedings/{feeding_id}", response_model=FeedingLogResponse)
async def update_feeding_log(
    feeding_id: uuid.UUID,
    feeding_data: FeedingLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a feeding log (polymorphic — tarantula, snake, or lizard parent)."""
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()

    if not feeding:
        raise HTTPException(status_code=404, detail="Feeding log not found")

    _parent_model, parent_row = _feeding_owner_taxon(feeding, db, current_user)
    if parent_row is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = feeding_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(feeding, field, value)

    db.commit()
    db.refresh(feeding)

    return feeding


@router.delete("/feedings/{feeding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feeding_log(
    feeding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a feeding log (polymorphic — tarantula, snake, or lizard parent).

    Does NOT recompute denormalized `last_fed_at` on the parent — matches
    the `sheds.py` pattern: the denorm column is a dashboard hint, not
    authoritative. A full recompute would need a history scan.
    """
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()

    if not feeding:
        raise HTTPException(status_code=404, detail="Feeding log not found")

    _parent_model, parent_row = _feeding_owner_taxon(feeding, db, current_user)
    if parent_row is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(feeding)
    db.commit()

    return None


@router.get("/feeding-reminders/", response_model=FeedingReminderSummary)
async def get_feeding_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get feeding reminders for all of the user's tarantulas.

    Calculates recommended feeding intervals based on species data and life stage,
    returns status for each tarantula (overdue, due today, due soon, on track, never fed).
    """
    return get_user_feeding_reminders(current_user.id, db)
