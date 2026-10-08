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
from app.routers.animals import refuse_if_closed
from app.utils.dependencies import get_current_user
from app.utils.access import access_helper, load_animal, load_invert, load_log_parent, policy, require_can_change

router = APIRouter()


@access_helper
def _event_for(event_id: uuid.UUID, db: Session, user: User, need: str):
    """An event plus the caller's access to its parent animal (owner or
    co-keeper). 404 for missing and for no access alike — the old helper
    answered 403 for someone else's event, confirming it existed."""
    event = db.query(AnimalEvent).filter(AnimalEvent.id == event_id).first()
    parent, access = load_log_parent(db, user, event, need, not_found="Event not found")
    return event, access, parent


def _refuse_if_closed_hv(event: AnimalEvent, parent) -> None:
    """A Herpetoverse animal that died or was transferred is history: its
    event log is frozen like the rest of the record (routers/animals.py::
    refuse_if_closed). TV inverts are not covered here — this rule is HV's.

    Invert events follow the TV invert log routes (feedings / molts /
    substrate changes / care logs / photos), which don't refuse a died or
    transferred invert server-side; the TV clients hide "add" on a died
    invert. Pinned by tests/test_hv_closed_logs.py — change both together."""
    if event.animal_id:
        refuse_if_closed(parent)


def _ordered(query):
    """Newest first, then by insertion. The secondary sort matters because
    occurred_at is a DATE — several events on one day would otherwise come back
    in arbitrary order and appear to shuffle between page loads."""
    return query.order_by(
        AnimalEvent.occurred_at.desc(), AnimalEvent.created_at.desc()
    )


# --- Tarantuverse ----------------------------------------------------------


@router.get("/inverts/{invert_id}/events", response_model=List[AnimalEventResponse])
@policy("viewer")
async def list_invert_events(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    load_invert(db, current_user, invert_id, "viewer")
    return _ordered(
        db.query(AnimalEvent).filter(AnimalEvent.invert_id == invert_id)
    ).all()


@router.post(
    "/inverts/{invert_id}/events",
    response_model=AnimalEventResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
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
    _invert, access = load_invert(db, current_user, invert_id, "logger")
    event = AnimalEvent(
        invert_id=invert_id,
        user_id=access.owner.id,  # the collection's owner, whoever logged it
        logged_by_user_id=access.logged_by_user_id,
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
@policy("viewer")
async def list_animal_events(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    load_animal(db, current_user, animal_id, "viewer")
    return _ordered(
        db.query(AnimalEvent).filter(AnimalEvent.animal_id == animal_id)
    ).all()


@router.post(
    "/animals/{animal_id}/events",
    response_model=AnimalEventResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_animal_event(
    animal_id: uuid.UUID,
    payload: AnimalEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record something that happened to this animal. See the TV twin for why
    a `death` event doesn't touch the animal's lifecycle.

    409 for a died or transferred animal — its record is history."""
    animal, access = load_animal(db, current_user, animal_id, "logger")
    refuse_if_closed(animal)
    event = AnimalEvent(
        animal_id=animal_id,
        user_id=access.owner.id,
        logged_by_user_id=access.logged_by_user_id,
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
@policy("logger")
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
    event, access, parent = _event_for(event_id, db, current_user, "logger")
    require_can_change(access, event)
    _refuse_if_closed_hv(event, parent)

    # exclude_unset so a PATCH-style body can't null fields it never mentioned.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/animal-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("logger")
async def delete_animal_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event, access, parent = _event_for(event_id, db, current_user, "logger")
    require_can_change(access, event)
    _refuse_if_closed_hv(event, parent)

    db.delete(event)
    db.commit()
    return None
