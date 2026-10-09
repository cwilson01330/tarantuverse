"""Scorpion routes — per-animal CRUD.

Mirrors `tarantulas.py` shape. The Phase 1 surface is intentionally a
straight CRUD; analytics / breeding endpoints land in later phases.

  GET    /api/v1/scorpions/                  list user's scorpions
  POST   /api/v1/scorpions/                  create
  GET    /api/v1/scorpions/{scorpion_id}     fetch one
  PUT    /api/v1/scorpions/{scorpion_id}     partial update
  DELETE /api/v1/scorpions/{scorpion_id}     delete (cascades to logs)
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.scorpion import Scorpion
from app.models.scorpion_colony import ScorpionColony
from app.models.scorpion_species import ScorpionSpecies
from app.models.tarantula import Sex, Source  # shared DB enums (UPPERCASE)
from app.schemas.scorpion import (
    ScorpionCreate, ScorpionResponse, ScorpionUpdate,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit
# ADR-005 Phase A2 dual-write into `inverts`.
from app.services.inverts_dualwrite import (
    mirror_scorpion_create,
    mirror_scorpion_delete,
    mirror_scorpion_update,
)
from app.utils.access import policy, require_own_enclosure
from app.utils.photo_cleanup import collect_for_animal, delete_files
from app.utils.animal_visibility import mark_explicit, visibility_changed, visibility_chosen_at_create

router = APIRouter()


def _coerce_enums(data: dict) -> dict:
    """Map string sex/source onto the shared DB enums. SQLAlchemy stores
    the enum's NAME (UPPERCASE), so we need the Python enum member."""
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


def _validate_colony(
    db: Session, user: User, colony_id: Optional[UUID],
) -> None:
    """Reject colony_ids that don't belong to the current user.
    SET-NULL on delete protects from a stale pointer, but here we want
    a hard 404 so the keeper notices they're attaching a scorpion to
    something they can't see."""
    if colony_id is None:
        return
    colony = db.query(ScorpionColony).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == user.id,
    ).first()
    if not colony:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found or not yours",
        )


def _validate_species(
    db: Session, species_id: Optional[UUID],
) -> None:
    """Species catalog is public — only check it exists if provided."""
    if species_id is None:
        return
    exists = db.query(ScorpionSpecies.id).filter(
        ScorpionSpecies.id == species_id,
    ).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion species not found",
        )


@router.get("/", response_model=List[ScorpionResponse])
@policy("owner_only")
async def list_scorpions(
    colony_id: Optional[UUID] = Query(
        None, description="Filter to members of one colony.",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's scorpions, newest first.

    Reads from the unified `inverts` table (taxon='scorpion') so scorpions
    created through the generic invert flow — which write ONLY to `inverts` —
    are visible (they previously vanished because this endpoint read just the
    legacy `scorpions` table). To lose nothing during the migration we UNION in
    any legacy-only scorpions not yet mirrored into `inverts`. Both row types
    serialize to ScorpionResponse (Invert is a field superset; the response's
    pattern-free enum overrides accept the uppercase casing inverts stores).
    """
    from app.models.invert import Invert
    from app.utils.limits import active_inverts_query

    # ACTIVE scorpions only: deceased and transferred-out animals are excluded,
    # exactly like `GET /inverts/` (default view) and `/tarantulas/`. This used
    # to filter transferred only, so a scorpion marked died stayed in the
    # collection grid, its chip count and the cap notice.
    invert_q = active_inverts_query(db, current_user.id).filter(
        Invert.taxon == "scorpion",
    )
    if colony_id is not None:
        invert_q = invert_q.filter(Invert.colony_id == colony_id)
    invert_rows = invert_q.all()
    invert_ids = {r.id for r in invert_rows}

    # Legacy stragglers: scorpions still only in the legacy table (a dual-write /
    # backfill gap). Served from the legacy row so they never disappear.
    archived_ids = db.query(Invert.id).filter(
        Invert.user_id == current_user.id,
        or_(
            Invert.transferred_out_at.isnot(None),
            Invert.died_at.isnot(None),
        ),
    )
    legacy_q = db.query(Scorpion).filter(
        Scorpion.user_id == current_user.id,
        Scorpion.id.notin_(archived_ids),
        Scorpion.died_at.is_(None),
    )
    if colony_id is not None:
        legacy_q = legacy_q.filter(Scorpion.colony_id == colony_id)
    legacy_only = [s for s in legacy_q.all() if s.id not in invert_ids]

    combined = invert_rows + legacy_only
    combined.sort(key=lambda r: r.created_at, reverse=True)
    return combined


@router.post(
    "/", response_model=ScorpionResponse, status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_scorpion(
    scorpion_data: ScorpionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new scorpion for the authenticated user."""
    # Cross-taxon collection cap (counts inverts: tarantulas + scorpions + centipedes).
    enforce_collection_limit(db, current_user)
    _validate_species(db, scorpion_data.species_id)
    _validate_colony(db, current_user, scorpion_data.colony_id)
    require_own_enclosure(db, scorpion_data.enclosure_id, current_user)

    payload = _coerce_enums(scorpion_data.model_dump())

    chose_visibility = visibility_chosen_at_create(payload.get("visibility"))
    # Default visibility to the owner's profile visibility, matching
    # the tarantula router.
    if not payload.get("visibility"):
        payload["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_scorpion = Scorpion(user_id=current_user.id, **payload)
    db.add(new_scorpion)
    # ADR-005 A2 mirror — flush so the new id is materialized, then
    # insert the matching `inverts` row in the same transaction.
    db.flush()
    mirror = mirror_scorpion_create(db, new_scorpion)
    if chose_visibility:
        mark_explicit(mirror)
    db.commit()
    db.refresh(new_scorpion)

    # Bump times_kept on the species catalog row when linked.
    if new_scorpion.species_id:
        species = db.query(ScorpionSpecies).filter(
            ScorpionSpecies.id == new_scorpion.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_scorpion


@router.get("/{scorpion_id}", response_model=ScorpionResponse)
@policy("owner_only")
async def get_scorpion(
    scorpion_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a single scorpion the current user owns."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )
    return scorpion


@router.put("/{scorpion_id}", response_model=ScorpionResponse)
@policy("owner_only")
async def update_scorpion(
    scorpion_id: UUID,
    scorpion_data: ScorpionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields present in the payload are applied."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )

    update_data = scorpion_data.model_dump(exclude_unset=True)
    if "enclosure_id" in update_data:
        require_own_enclosure(db, update_data["enclosure_id"], current_user)

    if "species_id" in update_data:
        _validate_species(db, update_data["species_id"])
    if "colony_id" in update_data:
        _validate_colony(db, current_user, update_data["colony_id"])

    update_data = _coerce_enums(update_data)
    chose_visibility = visibility_changed(scorpion, update_data)
    for field, value in update_data.items():
        setattr(scorpion, field, value)

    # ADR-005 A2 mirror — keep the unified `inverts` row in sync. The
    # "keeper chose this visibility" flag lives on the mirror only.
    mirror = mirror_scorpion_update(db, scorpion)
    if chose_visibility:
        mark_explicit(mirror)
    db.commit()
    db.refresh(scorpion)
    return scorpion


@router.delete(
    "/{scorpion_id}", status_code=status.HTTP_204_NO_CONTENT,
)
@policy("owner_only")
async def delete_scorpion(
    scorpion_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a scorpion. Cascades to feeding/molt/substrate logs and
    photos via the FK ON DELETE CASCADE clauses set in scp_20260522."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scorpion not found",
        )
    _photo_files = collect_for_animal(db, scorpion_id)
    db.delete(scorpion)
    # ADR-005 A2 mirror — drop the unified row too.
    mirror_scorpion_delete(db, scorpion_id)
    db.commit()
    # Photo FILES don't cascade with the rows (R2) — remove them now the
    # delete is committed. Best-effort; see utils/photo_cleanup.
    await delete_files(db, _photo_files)
    return None
