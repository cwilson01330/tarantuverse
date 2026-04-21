"""Snake routes — Herpetoverse v1 CRUD

Pulled forward from Sprint 3 per the build plan. Skinny v1:

  - Full CRUD (list, create, detail, update, delete)
  - No subscription limits — Herpetoverse is free during beta (per locked decisions)
  - No activity feed integration — no `new_snake` action type registered yet
  - No growth / premolt / public profile endpoints — future sprints
  - No species.times_kept bump — reptile_species ref counts land in a later sprint

Pattern-matched against `tarantulas.py` but intentionally leaner. Enum casting
for sex/source reuses the shared DB enum types (see Snake model note).

Ownership model: every query filters by `Snake.user_id == current_user.id`.
Anonymous / public reads go through `/t/{id}` (qr router) once reptile-aware.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.snake import Snake
from app.models.shed_log import ShedLog
from app.models.animal_genotype import AnimalGenotype
from app.models.photo import Photo
from app.models.tarantula import Sex, Source  # shared DB enums
from app.schemas.snake import SnakeCreate, SnakeUpdate, SnakeResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source values to the shared SQLAlchemy enum members.

    The DB enum types were created with uppercase member names (MALE, BRED, ...)
    but the API accepts lowercase values. Passing the Python enum member makes
    SQLAlchemy store the name rather than the value string, which matches the
    tarantulas table.
    """
    if data.get("sex"):
        try:
            data["sex"] = Sex(data["sex"])
        except ValueError:
            pass
    if data.get("source"):
        try:
            data["source"] = Source(data["source"])
        except ValueError:
            pass
    return data


@router.get("/", response_model=List[SnakeResponse])
async def get_snakes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all snakes owned by the authenticated user, newest first."""
    return (
        db.query(Snake)
        .filter(Snake.user_id == current_user.id)
        .order_by(Snake.created_at.desc())
        .all()
    )


@router.post("/", response_model=SnakeResponse, status_code=status.HTTP_201_CREATED)
async def create_snake(
    snake_data: SnakeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new snake for the authenticated user.

    Snake-specific field notes vs. tarantula create:
      - `hatch_date` and `source_breeder` are first-class (morph provenance matters)
      - `feeding_schedule` is a free-text phrase, not a strict interval
      - No urticating_hairs / substrate_depth / misting — not applicable
    """
    snake_dict = _coerce_enums(snake_data.model_dump())

    new_snake = Snake(user_id=current_user.id, **snake_dict)
    db.add(new_snake)
    db.commit()
    db.refresh(new_snake)

    # TODO(sprint-4): bump reptile_species.times_kept once that column exists
    # TODO(sprint-5): emit `new_snake` activity feed entry (feed needs reptile icons first)

    return new_snake


@router.get("/{snake_id}", response_model=SnakeResponse)
async def get_snake(
    snake_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one snake by id. Owner-only."""
    snake = (
        db.query(Snake)
        .filter(Snake.id == snake_id, Snake.user_id == current_user.id)
        .first()
    )
    if not snake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snake not found"
        )
    return snake


@router.put("/{snake_id}", response_model=SnakeResponse)
async def update_snake(
    snake_id: UUID,
    snake_data: SnakeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update. Only provided fields are written."""
    snake = (
        db.query(Snake)
        .filter(Snake.id == snake_id, Snake.user_id == current_user.id)
        .first()
    )
    if not snake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snake not found"
        )

    update_data = _coerce_enums(snake_data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(snake, field, value)

    db.commit()
    db.refresh(snake)
    return snake


@router.delete("/{snake_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_snake(
    snake_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard-delete a snake and its dependent rows.

    We manually clear children instead of relying on ON DELETE CASCADE because
    the polymorphic photos + qr_upload_sessions constraints were added via
    later migrations and the runtime DB may not have those cascades backfilled
    on every environment. The tarantula router follows this same belt-and-
    suspenders pattern (see tarantulas.py delete_tarantula).
    """
    snake = (
        db.query(Snake)
        .filter(Snake.id == snake_id, Snake.user_id == current_user.id)
        .first()
    )
    if not snake:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Snake not found"
        )

    db.query(ShedLog).filter(ShedLog.snake_id == snake_id).delete()
    db.query(AnimalGenotype).filter(AnimalGenotype.snake_id == snake_id).delete()
    db.query(Photo).filter(Photo.snake_id == snake_id).delete()
    # QRUploadSession has ON DELETE CASCADE in its FK definition, so we skip it.

    db.delete(snake)
    db.commit()
    return None
