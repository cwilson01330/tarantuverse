"""Per-animal event routes (ADR-015 D5).

One router serving both products, because the concept is identical and the only
difference is which column holds the parent:

    GET/POST   /api/v1/inverts/{invert_id}/events     (Tarantuverse)
    GET/POST   /api/v1/animals/{animal_id}/events     (Herpetoverse)
    PUT/DELETE /api/v1/animal-events/{event_id}       (either)

The edit/delete routes are parent-agnostic and resolve ownership through
whichever parent the row carries — same pattern as /molts/{id}.
"""
from datetime import date
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.animal_event import AnimalEvent
from app.models.invert import Invert
from app.models.user import User
from app.schemas.animal_event import (
    AnimalEventCreate,
    AnimalEventResponse,
    AnimalEventUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


def _owned_invert(db: Session, invert_id: uuid.UUID, user: User) -> Invert:
    row = db.query(Invert).filter(
        Invert.id == invert_id, Invert.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Animal not found")
    return row


def _owned_animal(db: Session, animal_id: uuid.UUID, user: User) -> Animal:
    row = db.query(Animal).filter(
        Animal.id == animal_id, Animal.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Animal not found")
    return row


def _event_owner(event: AnimalEvent, db: Session, user: User):
    """Resolve the owned parent, or None. Centralised so edit/delete don't each
    reimplement the polymorphism."""
    if event.invert_id:
        return db.query(Invert).filter(
            Invert.id == event.invert_id, Invert.user_id == user.id
        ).first()
    if event.animal_id:
        return db.query(Animal).filter(
            Animal.id == event.animal_id, Animal.user_id == user.id
        ).first()
    return None


def _ordered(query):
    """Newest first, then by insertion. The secondary sort matters because
    occurred_at is a DATE — several events on one day would otherwise come back
    in arbitrary order and appear to shuffle between page loads."""
    return query.order_by(
        AnimalEvent.occurred_at.desc(), AnimalEvent.created_at.desc()
    )


# --- Tarantuverse ----------------------------------------------------------


@router.get("/inverts/{invert_id}/events", response_model=List[AnimalEventResponse])
async def list_invert_events(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_invert(db, invert_id, current_user)
    return _ordered(
        db.query(AnimalEvent).filter(AnimalEvent.invert_id == invert_id)
    ).all()


@router.post(
    "/inverts/{invert_id}/events",
    response_model=AnimalEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invert_event(
    invert_id: uuid.UUID,
    payload: AnimalEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record something that happened to this animal.

    Note what this deliberately does NOT do: an event of type `death` does not
    set `died_at`. The animal's lifecycle is changed by the mark-as-died
    endpoint and nowhere else, so liveness has exactly one source of truth.
    Inferring it from a log would mean a single edited row could bring a dead
    animal back into the collection.
    """
    _owned_invert(db, invert_id, current_user)
    event = AnimalEvent(
        invert_id=invert_id,
        user_id=current_user.id,
        occurred_at=payload.occurred_at or date.today(),
        event_type=payload.event_type,
        severity=payload.severity,
        notes=payload.notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# --- Herpetoverse ----------------------------------------------------------


@router.get("/animals/{animal_id}/events", response_model=List[AnimalEventResponse])
async def list_animal_events(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_animal(db, animal_id, current_user)
    return _ordered(
        db.query(AnimalEvent).filter(AnimalEvent.animal_id == animal_id)
    ).all()


@router.post(
    "/animals/{animal_id}/events",
    response_model=AnimalEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_animal_event(
    animal_id: uuid.UUID,
    payload: AnimalEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record something that happened to this animal. See the TV twin for why
    a `death` event doesn't touch the animal's lifecycle."""
    _owned_animal(db, animal_id, current_user)
    event = AnimalEvent(
        animal_id=animal_id,
        user_id=current_user.id,
        occurred_at=payload.occurred_at or date.today(),
        event_type=payload.event_type,
        severity=payload.severity,
        notes=payload.notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# --- Shared edit / delete --------------------------------------------------


@router.put("/animal-events/{event_id}", response_model=AnimalEventResponse)
async def update_animal_event(
    event_id: uuid.UUID,
    payload: AnimalEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Correct an event.

    Events get revised more than most logs — an "injury" turns out to have been
    a mismolt, a severity is downgraded once the animal recovers. Making these
    read-only would push keepers into deleting and re-adding, which loses the
    original date.
    """
    event = db.query(AnimalEvent).filter(AnimalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if _event_owner(event, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    # exclude_unset so a PATCH-style body can't null fields it never mentioned.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/animal-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_animal_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = db.query(AnimalEvent).filter(AnimalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if _event_owner(event, db, current_user) is None:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(event)
    db.commit()
    return None
