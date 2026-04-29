"""Reptile offspring — individual hatchling records under a clutch.

Two access patterns mirror the clutch surface:
  • List under a clutch: GET /clutches/{id}/offspring
  • Direct read/update/delete: GET/PUT/DELETE /reptile-offspring/{id}

If the keeper has registered the hatchling as a real reptile (`snake_id`
or `lizard_id` set), the parent reptile's own genotype rows are the
source of truth. Otherwise `recorded_genotype` JSONB holds whatever was
observed at hatch — useful for sale paperwork even if the hatchling
moves on before getting a full record.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.clutch import Clutch
from app.models.lizard import Lizard
from app.models.reptile_offspring import (
    ReptileOffspring,
    ReptileOffspringStatus,
)
from app.models.snake import Snake
from app.models.user import User
from app.schemas.reptile_breeding import (
    ReptileOffspringCreate,
    ReptileOffspringResponse,
    ReptileOffspringUpdate,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


def _own_clutch_or_404(
    clutch_id: UUID, user_id: UUID, db: Session
) -> Clutch:
    c = (
        db.query(Clutch)
        .filter(Clutch.id == clutch_id, Clutch.user_id == user_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Clutch not found")
    return c


def _own_offspring_or_404(
    offspring_id: UUID, user_id: UUID, db: Session
) -> ReptileOffspring:
    o = (
        db.query(ReptileOffspring)
        .filter(
            ReptileOffspring.id == offspring_id,
            ReptileOffspring.user_id == user_id,
        )
        .first()
    )
    if not o:
        raise HTTPException(status_code=404, detail="Offspring not found")
    return o


def _resolve_link(
    payload, user_id: UUID, db: Session
) -> None:
    """If the payload links to a snake/lizard, validate ownership."""
    if getattr(payload, "snake_id", None):
        s = db.query(Snake).filter(
            Snake.id == payload.snake_id,
            Snake.user_id == user_id,
        ).first()
        if not s:
            raise HTTPException(
                status_code=404,
                detail="Linked snake not found in your collection.",
            )
    if getattr(payload, "lizard_id", None):
        l = db.query(Lizard).filter(
            Lizard.id == payload.lizard_id,
            Lizard.user_id == user_id,
        ).first()
        if not l:
            raise HTTPException(
                status_code=404,
                detail="Linked lizard not found in your collection.",
            )
    if getattr(payload, "snake_id", None) and getattr(payload, "lizard_id", None):
        raise HTTPException(
            status_code=400,
            detail="Offspring can be linked to a snake OR a lizard, not both.",
        )


# ─── Routes — clutch-scoped list + create ──────────────────────────────


@router.get(
    "/clutches/{clutch_id}/offspring",
    response_model=List[ReptileOffspringResponse],
)
async def list_offspring_for_clutch(
    clutch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _own_clutch_or_404(clutch_id, current_user.id, db)
    items = (
        db.query(ReptileOffspring)
        .filter(ReptileOffspring.clutch_id == clutch_id)
        .order_by(ReptileOffspring.created_at.asc())
        .all()
    )
    return items


@router.post(
    "/reptile-offspring",
    response_model=ReptileOffspringResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_offspring(
    payload: ReptileOffspringCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _own_clutch_or_404(payload.clutch_id, current_user.id, db)
    _resolve_link(payload, current_user.id, db)

    data = payload.model_dump()
    # Serialize GenotypeEntry list to plain dicts for JSONB storage.
    if data.get("recorded_genotype"):
        data["recorded_genotype"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.recorded_genotype or []
        ]
    if "status" in data:
        data["status"] = ReptileOffspringStatus(data["status"])

    offspring = ReptileOffspring(
        user_id=current_user.id,
        **data,
    )
    db.add(offspring)
    db.commit()
    db.refresh(offspring)
    return offspring


# ─── Routes — direct CRUD ──────────────────────────────────────────────


@router.get(
    "/reptile-offspring/{offspring_id}",
    response_model=ReptileOffspringResponse,
)
async def get_offspring(
    offspring_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _own_offspring_or_404(offspring_id, current_user.id, db)


@router.put(
    "/reptile-offspring/{offspring_id}",
    response_model=ReptileOffspringResponse,
)
async def update_offspring(
    offspring_id: UUID,
    payload: ReptileOffspringUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = _own_offspring_or_404(offspring_id, current_user.id, db)
    _resolve_link(payload, current_user.id, db)

    update = payload.model_dump(exclude_unset=True)
    if "recorded_genotype" in update and update["recorded_genotype"] is not None:
        update["recorded_genotype"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.recorded_genotype or []
        ]
    if "status" in update and update["status"] is not None:
        update["status"] = ReptileOffspringStatus(update["status"])

    for k, v in update.items():
        setattr(o, k, v)
    db.commit()
    db.refresh(o)
    return o


@router.delete(
    "/reptile-offspring/{offspring_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_offspring(
    offspring_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = _own_offspring_or_404(offspring_id, current_user.id, db)
    db.delete(o)
    db.commit()
