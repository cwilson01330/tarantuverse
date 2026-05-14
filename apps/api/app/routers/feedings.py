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
from app.models.animal import Animal
from app.models.feeding_log import FeedingLog
from app.schemas.feeding import FeedingLogCreate, FeedingLogUpdate, FeedingLogResponse
from app.schemas.feeding_reminder import FeedingReminderSummary
from app.utils.dependencies import get_current_user
from app.services.activity_service import create_activity
from app.services.feeding_reminder_service import get_user_feeding_reminders

router = APIRouter()


def _feeding_owner_taxon(feeding: FeedingLog, db: Session, user: User):
    """Return (parent_model, parent_row) if the user owns the parent of
    this feeding log. Returns (None, None) if not authorized.

    Polymorphic parent lookup — ADR-003 collapsed snake/lizard/frog into
    a single animal_id, so feeding_logs are now parented by tarantula,
    animal, or enclosure. Centralized so update/delete don't duplicate
    the branching logic.
    """
    if feeding.tarantula_id:
        row = db.query(Tarantula).filter(
            Tarantula.id == feeding.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
        return (Tarantula, row) if row else (None, None)
    if feeding.animal_id:
        row = db.query(Animal).filter(
            Animal.id == feeding.animal_id,
            Animal.user_id == user.id,
        ).first()
        return (Animal, row) if row else (None, None)
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


@router.get("/animals/{animal_id}/feedings", response_model=List[FeedingLogResponse])
async def get_animal_feeding_logs(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for an HV animal (any taxon), most recent first.

    ADR-003 collapsed the per-taxon snake/lizard feeding routes into this
    single taxon-agnostic endpoint.
    """
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()

    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.animal_id == animal_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/animals/{animal_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_animal_feeding_log(
    animal_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for an HV animal (any taxon).

    Denormalizes `animals.last_fed_at` forward-only so the dashboard
    "X days since fed" badge doesn't rescan history on every render —
    backfilling an old feeding doesn't regress the badge.

    Note: `prey_weight_g` is meaningful mainly for whole-prey feeders
    (snakes); insect-fed taxa leave it null. Recording prey count or
    feeder species would be a feeding_log schema extension, not a
    column repurposing.

    Activity feed emission for HV taxa is deferred until the feed has
    herp icons — tarantula feedings still emit via create_activity.
    """
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()

    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    new_feeding = FeedingLog(animal_id=animal_id, **feeding_data.model_dump())
    db.add(new_feeding)

    # Forward-only denormalization.
    fed_at = new_feeding.fed_at
    if fed_at and (animal.last_fed_at is None or fed_at > animal.last_fed_at):
        animal.last_fed_at = fed_at

    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.get("/feedings/{feeding_id}", response_model=FeedingLogResponse)
async def get_feeding_log(
    feeding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read a single feeding log (polymorphic — tarantula, snake, or lizard).

    Powers edit forms on web + mobile so the form can pre-fill from a
    deep link without first fetching the parent's whole history list.
    Ownership is checked through `_feeding_owner_taxon` — same gate as
    update + delete.
    """
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()
    if not feeding:
        raise HTTPException(status_code=404, detail="Feeding log not found")
    _parent_model, parent_row = _feeding_owner_taxon(feeding, db, current_user)
    if parent_row is None:
        raise HTTPException(status_code=403, detail="Not authorized")
    return feeding


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
