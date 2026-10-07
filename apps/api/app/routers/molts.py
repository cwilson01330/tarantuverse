"""
Molt log routes
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.scorpion import Scorpion
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.schemas.molt import MoltLogCreate, MoltLogUpdate, MoltLogResponse
from app.utils.dependencies import get_current_user
from app.utils.access import (
    invert_log_fields,
    load_animal,
    load_colony,
    load_invert,
    load_log_parent,
    policy,
    require_can_change,
)
from app.services.activity_service import create_activity
from app.services.inverts_dualwrite import invert_id_if_exists  # ADR-005 A2
from app.utils.legacy_logs import tarantula_logs
from app.utils.instar import adjust_instar_for_molt

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/molts", response_model=List[MoltLogResponse])
@policy("owner_only")
async def get_molt_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all molt logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    molt_logs = db.query(MoltLog).filter(
        tarantula_logs(MoltLog, tarantula_id)
    ).order_by(MoltLog.molted_at.desc()).all()

    return molt_logs


@router.post("/tarantulas/{tarantula_id}/molts", response_model=MoltLogResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_molt_log(
    tarantula_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new molt log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    new_molt = MoltLog(
        tarantula_id=tarantula_id,
        invert_id=invert_id_if_exists(db, tarantula_id),  # ADR-005 A2
        **molt_data.model_dump()
    )

    db.add(new_molt)
    db.flush()
    adjust_instar_for_molt(db, new_molt, +1)
    db.commit()
    db.refresh(new_molt)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="molt",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "species_name": tarantula.common_name or tarantula.scientific_name,
            "thumbnail_url": tarantula.photo_url,
            "tarantula_id": str(tarantula.id),
            "molt_id": str(new_molt.id),
            "leg_span_after": str(molt_data.leg_span_after) if getattr(molt_data, 'leg_span_after', None) else None,
        }
    )

    return new_molt


@router.get("/scorpions/{scorpion_id}/molts", response_model=List[MoltLogResponse])
@policy("owner_only")
async def get_scorpion_molt_logs(
    scorpion_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molt logs for a scorpion, most recent first.

    Molting is the headline event for scorpions (along with feeding).
    The instar tracking lives on `scorpions.current_instar`; the molt
    log itself just records the date and any measurements the keeper
    captured."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    return (
        db.query(MoltLog)
        .filter(MoltLog.scorpion_id == scorpion_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/scorpions/{scorpion_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_scorpion_molt_log(
    scorpion_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a molt for a scorpion."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    new_molt = MoltLog(
        scorpion_id=scorpion_id,
        invert_id=invert_id_if_exists(db, scorpion_id),  # ADR-005 A2
        **molt_data.model_dump(),
    )
    db.add(new_molt)
    db.flush()
    adjust_instar_for_molt(db, new_molt, +1)
    db.commit()
    db.refresh(new_molt)
    return new_molt


@router.get("/centipedes/{centipede_id}/molts", response_model=List[MoltLogResponse])
@policy("owner_only")
async def get_centipede_molt_logs(
    centipede_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molt logs for a centipede, most recent first.

    Centipedes molt — anamorphic species (e.g. Geophilomorpha) add
    segments on each molt; epimorphic species (e.g. most Scolopendra)
    keep their adult segment count from birth. The keeper may want to
    track instar progression alongside; that lives on the Invert row,
    not here.
    """
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    return (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == centipede_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/centipedes/{centipede_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_centipede_molt_log(
    centipede_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a molt for a centipede. Sets only `invert_id`."""
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    new_molt = MoltLog(
        invert_id=centipede_id,
        **molt_data.model_dump(),
    )
    db.add(new_molt)
    db.flush()
    adjust_instar_for_molt(db, new_molt, +1)
    db.commit()
    db.refresh(new_molt)
    return new_molt


@router.get("/whip-spiders/{whip_spider_id}/molts", response_model=List[MoltLogResponse])
@policy("owner_only")
async def get_whip_spider_molt_logs(
    whip_spider_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molt logs for a whip spider, most recent first. Leg span
    pre/post molt can be tracked via the shared molt schema's leg_span
    fields."""
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")

    return (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == whip_spider_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/whip-spiders/{whip_spider_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_whip_spider_molt_log(
    whip_spider_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a molt for a whip spider. Sets only `invert_id`."""
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")

    new_molt = MoltLog(
        invert_id=whip_spider_id,
        **molt_data.model_dump(),
    )
    db.add(new_molt)
    db.flush()
    adjust_instar_for_molt(db, new_molt, +1)
    db.commit()
    db.refresh(new_molt)
    return new_molt


# ---------------------------------------------------------------------------
# Generic invert molt endpoints (ADR-007) — taxon-agnostic.
# ---------------------------------------------------------------------------

@router.get("/inverts/{invert_id}/molts", response_model=List[MoltLogResponse])
@policy("viewer")
async def get_invert_molt_logs(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molt logs for any invert the caller owns."""
    invert, access = load_invert(db, current_user, invert_id, "viewer", not_found="Animal not found")
    return (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == invert_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/inverts/{invert_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_invert_molt_log(
    invert_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a molt for any invert the caller owns. Sets only invert_id."""
    invert, access = load_invert(db, current_user, invert_id, "logger", not_found="Animal not found")
    new_molt = MoltLog(**invert_log_fields(db, invert), logged_by_user_id=access.logged_by_user_id, **molt_data.model_dump())
    db.add(new_molt)
    db.flush()
    adjust_instar_for_molt(db, new_molt, +1)
    db.commit()
    db.refresh(new_molt)
    return new_molt


@router.get("/molts/{molt_id}", response_model=MoltLogResponse)
@policy("viewer")
async def get_molt_log(
    molt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read a single molt log (polymorphic — tarantula or scorpion parent).

    Powers edit forms — without it the edit screen would have to scan
    the parent's whole molt history to find the row by id."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    _parent, access = load_log_parent(db, current_user, molt, "viewer", not_found="Molt log not found")
    return molt


@router.put("/molts/{molt_id}", response_model=MoltLogResponse)
@policy("logger")
async def update_molt_log(
    molt_id: uuid.UUID,
    molt_data: MoltLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a molt log (polymorphic — tarantula or scorpion parent)."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    _parent, access = load_log_parent(db, current_user, molt, "logger", not_found="Molt log not found")
    require_can_change(access, molt)

    update_data = molt_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(molt, field, value)

    db.commit()
    db.refresh(molt)
    return molt


@router.delete("/molts/{molt_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("logger")
async def delete_molt_log(
    molt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a molt log (polymorphic — tarantula or scorpion parent)."""
    molt = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
    _parent, access = load_log_parent(db, current_user, molt, "logger", not_found="Molt log not found")
    require_can_change(access, molt)

    adjust_instar_for_molt(db, molt, -1)
    db.delete(molt)
    db.commit()
    return None


# --- Colony molts (cml_20260730) -------------------------------------------
#
# Finding a shed skin is frequently the ONLY observation a communal keeper
# gets: the animals are hidden, can't be handled without dismantling the
# enclosure, and a molt in the web is the one piece of evidence that surfaces
# by itself. It's also how sexing happens in a communal — you sex the molt, not
# the spider. So these matter more here than for a solitary animal, not less.
#
# Measurements stay available but are expected to be null: you generally can't
# say which of eleven animals shed it, let alone what it weighed before.


@router.get("/colonies/{colony_id}/molts", response_model=List[MoltLogResponse])
@policy("viewer")
async def get_colony_molt_logs(
    colony_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List molts found in a colony the caller owns, newest first."""
    colony, access = load_colony(db, current_user, colony_id, "viewer", not_found="Colony not found")

    return (
        db.query(MoltLog)
        .filter(MoltLog.colony_id == colony_id)
        .order_by(MoltLog.molted_at.desc())
        .all()
    )


@router.post(
    "/colonies/{colony_id}/molts",
    response_model=MoltLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_colony_molt_log(
    colony_id: uuid.UUID,
    molt_data: MoltLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a molt found in a colony. Sets only colony_id.

    `is_unidentified` is forced True: a colony molt is unattributed by
    definition. Storing False would assert the keeper knows which animal shed
    it, which the enclosure makes impossible — and that claim would then flow
    into any later analysis as though it were observed.
    """
    colony, access = load_colony(db, current_user, colony_id, "logger", not_found="Colony not found")

    payload = molt_data.model_dump()
    payload["is_unidentified"] = True
    new_molt = MoltLog(colony_id=colony_id, logged_by_user_id=access.logged_by_user_id, **payload)
    db.add(new_molt)
    db.commit()
    db.refresh(new_molt)
    return new_molt
