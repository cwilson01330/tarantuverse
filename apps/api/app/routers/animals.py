"""Animal routes — unified Herpetoverse CRUD (ADR-003).

Replaces the per-taxon snakes / lizards / frogs routers. One endpoint
surface, filtered by `taxon`:

  GET    /api/v1/animals/?taxon=snake   list (optional taxon filter)
  POST   /api/v1/animals/               create (taxon required in body)
  GET    /api/v1/animals/{id}           fetch one
  PUT    /api/v1/animals/{id}           partial update
  DELETE /api/v1/animals/{id}           delete + cascade

Ownership model: every query filters by
`Animal.user_id == current_user.id`. Anonymous / public reads go
through `/t/{id}` (qr router).
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.user import User
from app.models.animal import Animal, ANIMAL_TAXON_VALUES
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.animal_genotype import AnimalGenotype
from app.models.photo import Photo
from app.models.tarantula import Sex, Source  # shared DB enums
from app.schemas.animal import AnimalCreate, AnimalUpdate, AnimalResponse
from app.utils.dependencies import get_current_user

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source values onto their SQLAlchemy enum members.

    - sex / source: shared DB enums, UPPERCASE names (Sex/Source default
      serialization writes .name).
    - taxon: plain VARCHAR now (ADR-011) — the lowercase string is stored
      as-is; validated against ANIMAL_TAXON_VALUES at the schema layer.
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


@router.get("/", response_model=List[AnimalResponse])
async def get_animals(
    taxon: Optional[str] = Query(
        None, pattern="^(snake|lizard|turtle|tortoise|frog|salamander|other)$",
        description="Filter to a single taxon. Omit for the whole collection.",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's animals, newest first.

    Optional `?taxon=` filter lets the per-taxon collection screens
    (which used to hit /snakes, /lizards, /frogs) scope their query.
    """
    # Eager-load herp_species so the AnimalResponse.feeds_on_cgd
    # resolution (override ?? species default) doesn't fire one extra
    # SELECT per row in this list.
    query = (
        db.query(Animal)
        .options(selectinload(Animal.herp_species))
        .filter(Animal.user_id == current_user.id)
    )
    if taxon:
        query = query.filter(Animal.taxon == taxon)
    return query.order_by(Animal.created_at.desc()).all()


@router.post("/", response_model=AnimalResponse, status_code=status.HTTP_201_CREATED)
async def create_animal(
    animal_data: AnimalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new animal for the authenticated user. `taxon` is
    required and immutable once set."""
    animal_dict = _coerce_enums(animal_data.model_dump())

    new_animal = Animal(user_id=current_user.id, **animal_dict)
    db.add(new_animal)
    db.commit()
    db.refresh(new_animal)

    # TODO: bump herp_species.times_kept once that column exists
    # TODO: emit `new_animal` activity feed entry when feed has herp icons

    return new_animal


@router.get("/{animal_id}", response_model=AnimalResponse)
async def get_animal(
    animal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one animal by id. Owner-only."""
    animal = (
        db.query(Animal)
        .options(selectinload(Animal.herp_species))
        .filter(Animal.id == animal_id, Animal.user_id == current_user.id)
        .first()
    )
    if not animal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Animal not found"
        )
    return animal


@router.put("/{animal_id}", response_model=AnimalResponse)
async def update_animal(
    animal_id: UUID,
    animal_data: AnimalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update. Only provided fields are written. `taxon` is
    immutable — it's not in the update schema."""
    animal = (
        db.query(Animal)
        .options(selectinload(Animal.herp_species))
        .filter(Animal.id == animal_id, Animal.user_id == current_user.id)
        .first()
    )
    if not animal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Animal not found"
        )

    update_data = _coerce_enums(animal_data.model_dump(exclude_unset=True))
    for field, value in update_data.items():
        setattr(animal, field, value)

    db.commit()
    db.refresh(animal)
    return animal


@router.delete("/{animal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_animal(
    animal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard-delete an animal and its dependent rows.

    Manual cascade of the polymorphic children — same belt-and-
    suspenders pattern the per-taxon routers used. (The FKs do have
    ON DELETE CASCADE, but not every environment may have them
    backfilled, and explicit deletes keep the intent obvious.)
    """
    animal = (
        db.query(Animal)
        .options(selectinload(Animal.herp_species))
        .filter(Animal.id == animal_id, Animal.user_id == current_user.id)
        .first()
    )
    if not animal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Animal not found"
        )

    db.query(ShedLog).filter(ShedLog.animal_id == animal_id).delete()
    db.query(WeightLog).filter(WeightLog.animal_id == animal_id).delete()
    db.query(AnimalGenotype).filter(AnimalGenotype.animal_id == animal_id).delete()
    db.query(Photo).filter(Photo.animal_id == animal_id).delete()
    # QRUploadSession + feeding_logs have ON DELETE CASCADE in their FK
    # definitions, so we skip them.

    db.delete(animal)
    db.commit()
    return None
