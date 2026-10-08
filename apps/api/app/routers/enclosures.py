"""
Enclosure routes for communal and solo setups.

Inhabitants are read from `inverts` (every taxon) plus population colonies
(`colonies.enclosure_id`). They used to be read from the legacy `tarantulas`
table only, so a scorpion, mantis or colony put in an enclosure was never
listed or counted (audit-2 animals M12). Legacy tarantula rows are still
consulted, but only for the (should-be-empty) set that has no `inverts` twin.
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.enclosure import Enclosure
from app.models.tarantula import Tarantula
from app.models.species import Species
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.substrate_change import SubstrateChange
from app.schemas.enclosure import (
    EnclosureCreate,
    EnclosureUpdate,
    EnclosureResponse,
    EnclosureListResponse,
    InhabitantInfo
)
from app.schemas.feeding import FeedingLogCreate, FeedingLogResponse
from app.schemas.molt import MoltLogCreate, MoltLogResponse
from app.schemas.substrate_change import SubstrateChangeCreate, SubstrateChangeResponse
from app.utils.dependencies import get_current_user
from app.utils.access import policy

router = APIRouter()


def _sex_value(sex) -> Optional[str]:
    if sex is None:
        return None
    return getattr(sex, "value", sex)


def _enclosure_animals(db: Session, enclosure: Enclosure) -> list:
    """Living, kept animals of ANY taxon in this enclosure.

    Read from `inverts`. Died and handed-off animals are left out: they are no
    longer in the enclosure in any useful sense. A legacy tarantula row with no
    `inverts` twin (pre-backfill; should not exist any more) is still included
    so nothing silently disappears.
    """
    from app.models.invert import Invert

    animals = (
        db.query(Invert)
        .filter(
            Invert.enclosure_id == enclosure.id,
            Invert.user_id == enclosure.user_id,
            Invert.died_at.is_(None),
            Invert.transferred_out_at.is_(None),
        )
        .order_by(Invert.created_at.asc())
        .all()
    )
    legacy = (
        db.query(Tarantula)
        .filter(
            Tarantula.enclosure_id == enclosure.id,
            Tarantula.user_id == enclosure.user_id,
            Tarantula.died_at.is_(None),
        )
        .all()
    )
    if legacy:
        legacy_ids = [t.id for t in legacy]
        twins = {
            row[0]
            for row in db.query(Invert.id).filter(Invert.id.in_(legacy_ids)).all()
        }
        animals.extend(t for t in legacy if t.id not in twins)
    return animals


def _enclosure_colonies(db: Session, enclosure: Enclosure) -> list:
    """Open population colonies in this enclosure (not archived, ended or handed off)."""
    from app.models.colony import Colony

    return (
        db.query(Colony)
        .filter(
            Colony.enclosure_id == enclosure.id,
            Colony.user_id == enclosure.user_id,
            Colony.is_active.is_(True),
            Colony.ended_at.is_(None),
            Colony.transferred_out_at.is_(None),
        )
        .order_by(Colony.created_at.asc())
        .all()
    )


def _colony_total(colony) -> int:
    counts = colony.stage_counts or {}
    try:
        return sum(int(v) for v in counts.values() if isinstance(v, int))
    except Exception:
        return 0


def get_enclosure_with_computed_fields(
    enclosure: Enclosure,
    db: Session,
    tz_offset_minutes: Optional[int] = None,
) -> dict:
    """Add computed fields to enclosure response.

    `tz_offset_minutes` controls how `days_since_last_feeding` is computed:
    when supplied (in JS getTimezoneOffset() form — positive for zones
    west of UTC), it does a calendar-day diff in the user's local
    timezone instead of a UTC time-delta floor. Without that, an evening
    feeding reads as "0 days ago" the next morning — see Brooke-on-EST
    bug from 2026-04-24.
    """
    # Inhabitant count: tracked entries in the enclosure — every taxon, plus
    # each colony as one entry (its headcount is on the colony itself).
    inhabitant_count = len(_enclosure_animals(db, enclosure)) + len(_enclosure_colonies(db, enclosure))

    # Get species name if species_id is set
    species_name = None
    if enclosure.species_id:
        species = db.query(Species).filter(Species.id == enclosure.species_id).first()
        if species:
            species_name = species.scientific_name

    # Get days since last feeding
    # "Days since last feeding" reflects the last ACCEPTED feeding, not
    # the last attempt. A refusal is meaningful data (premolt signal) but
    # the spider wasn't actually fed — the badge would otherwise read
    # "fed today" right after a refusal, which keepers find misleading.
    # See the matching fix in tarantulas.py::get_feeding_stats.
    days_since_last_feeding = None
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.enclosure_id == enclosure.id,
        FeedingLog.accepted.is_(True),
    ).order_by(FeedingLog.fed_at.desc()).first()
    if last_feeding:
        now_utc = datetime.now(timezone.utc)
        # `.replace(tzinfo=...)` is preserved — older rows in this table
        # were inserted as naive UTC and need the explicit tag for the
        # subtraction to work.
        fed_utc = last_feeding.fed_at.replace(tzinfo=timezone.utc)
        if tz_offset_minutes is not None:
            local_shift = timedelta(minutes=-tz_offset_minutes)
            days_since_last_feeding = (
                (now_utc + local_shift).date() - (fed_utc + local_shift).date()
            ).days
        else:
            days_since_last_feeding = (now_utc - fed_utc).days

    return {
        **{c.name: getattr(enclosure, c.name) for c in enclosure.__table__.columns},
        "inhabitant_count": inhabitant_count,
        "species_name": species_name,
        "days_since_last_feeding": days_since_last_feeding
    }


# ============== ENCLOSURE CRUD ==============

@router.get("/", response_model=List[EnclosureListResponse])
@policy("owner_only")
async def get_enclosures(
    purpose: Optional[str] = Query(
        None,
        description="Filter by enclosure purpose. 'tarantula' (default collection view) or 'feeder' (feeder bins). Omit to return all.",
        pattern="^(tarantula|feeder|all)$",
    ),
    tz_offset_minutes: Optional[int] = Query(
        None,
        description=(
            "User's local timezone offset in minutes (JS getTimezoneOffset "
            "form: positive west of UTC; EDT=240). When provided, "
            "days_since_last_feeding is a calendar-day diff in that zone "
            "instead of a UTC delta. Optional for backwards compat."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all enclosures for authenticated user.

    The `purpose` query param filters by the lightweight container tag
    (Enclosure.purpose). This is separate from the FeederColony subsystem
    and only excludes feeder-bin-tagged enclosures from the tarantula view.
    Legacy rows with NULL purpose are treated as 'tarantula'.
    """
    query = db.query(Enclosure).filter(Enclosure.user_id == current_user.id)

    if purpose == "tarantula":
        # NULL purpose == legacy enclosure, default to tarantula view
        query = query.filter(
            (Enclosure.purpose == "tarantula") | (Enclosure.purpose.is_(None))
        )
    elif purpose == "feeder":
        query = query.filter(Enclosure.purpose == "feeder")
    # purpose == "all" or None → no additional filter

    enclosures = query.order_by(Enclosure.created_at.desc()).all()

    result = []
    for enc in enclosures:
        data = get_enclosure_with_computed_fields(enc, db, tz_offset_minutes)
        result.append(EnclosureListResponse(**data))
    return result


@router.post("/", response_model=EnclosureResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_enclosure(
    enclosure_data: EnclosureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new enclosure"""
    new_enclosure = Enclosure(
        user_id=current_user.id,
        **enclosure_data.model_dump()
    )

    db.add(new_enclosure)
    db.commit()
    db.refresh(new_enclosure)

    return EnclosureResponse(**get_enclosure_with_computed_fields(new_enclosure, db))


@router.get("/{enclosure_id}", response_model=EnclosureResponse)
@policy("owner_only")
async def get_enclosure(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single enclosure by ID"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    return EnclosureResponse(**get_enclosure_with_computed_fields(enclosure, db))


@router.put("/{enclosure_id}", response_model=EnclosureResponse)
@policy("owner_only")
async def update_enclosure(
    enclosure_id: UUID,
    enclosure_data: EnclosureUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    update_data = enclosure_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(enclosure, field, value)

    db.commit()
    db.refresh(enclosure)

    return EnclosureResponse(**get_enclosure_with_computed_fields(enclosure, db))


@router.delete("/{enclosure_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("owner_only")
async def delete_enclosure(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an enclosure (removes tarantulas from enclosure, deletes logs)"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    # Take every animal and colony out of the enclosure (don't delete them).
    # The FKs are ON DELETE SET NULL as well; this keeps the session's objects
    # in step and doesn't rely on it.
    from app.models.colony import Colony
    from app.models.invert import Invert
    from app.models.scorpion import Scorpion

    for model in (Tarantula, Invert, Scorpion, Colony):
        db.query(model).filter(
            model.enclosure_id == enclosure_id
        ).update({"enclosure_id": None}, synchronize_session=False)

    db.delete(enclosure)
    db.commit()
    return None


# ============== INHABITANTS ==============

@router.get("/{enclosure_id}/inhabitants", response_model=List[InhabitantInfo])
@policy("owner_only")
async def get_inhabitants(
    enclosure_id: UUID,
    include_colonies: bool = Query(
        False,
        description=(
            "Also list population colonies (kind='colony'). Off by default: "
            "app builds that predate it open every row as an animal, and a "
            "colony id would land on a not-found screen."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Everything tracked in an enclosure: animals of every taxon, then
    (with include_colonies) colonies.

    Older clients read only id/name/scientific_name/sex/photo_url; `kind`,
    `taxon` and `count` are additive.
    """
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    out = [
        InhabitantInfo(
            id=a.id,
            name=a.name,
            scientific_name=a.scientific_name,
            sex=_sex_value(a.sex),
            photo_url=a.photo_url,
            kind="animal",
            # Legacy tarantula rows carry no taxon column.
            taxon=getattr(a, "taxon", None) or "tarantula",
        )
        for a in _enclosure_animals(db, enclosure)
    ]

    colonies = _enclosure_colonies(db, enclosure) if include_colonies else []
    if colonies:
        from app.models.invert_species import InvertSpecies

        species_ids = {c.species_id for c in colonies if c.species_id}
        names = {}
        if species_ids:
            names = {
                sid: sci
                for sid, sci in db.query(InvertSpecies.id, InvertSpecies.scientific_name)
                .filter(InvertSpecies.id.in_(species_ids))
                .all()
            }
        out.extend(
            InhabitantInfo(
                id=c.id,
                name=c.name,
                scientific_name=names.get(c.species_id),
                sex=None,
                photo_url=c.photo_url,
                kind="colony",
                taxon=c.taxon,
                count=_colony_total(c),
            )
            for c in colonies
        )
    return out


def _owned_enclosure(db: Session, enclosure_id: UUID, user: User) -> Enclosure:
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == user.id
    ).first()
    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )
    return enclosure


def _set_inhabitant_enclosure(
    db: Session, user: User, member_id: UUID, enclosure_id: Optional[UUID],
    must_be_in: Optional[UUID] = None,
) -> str:
    """Point one animal (any taxon) or colony at `enclosure_id` (None = take it
    out). Returns "animal" or "colony". 404 when the id isn't the user's, or
    (for removal) isn't in `must_be_in`.

    The path param is still called tarantula_id for older clients; any
    invert id or colony id is accepted. Inverts are mirrored back to their
    legacy row (tarantula/scorpion) so the two surfaces agree.
    """
    from app.models.colony import Colony
    from app.models.invert import Invert
    from app.services.inverts_dualwrite import (
        mirror_invert_update_to_legacy,
        mirror_tarantula_update,
    )

    invert = db.query(Invert).filter(Invert.id == member_id, Invert.user_id == user.id).first()
    if invert is not None:
        if must_be_in is not None and invert.enclosure_id != must_be_in:
            raise HTTPException(status_code=404, detail="Animal not found in this enclosure")
        if enclosure_id is not None and (invert.died_at is not None or invert.transferred_out_at is not None):
            raise HTTPException(status_code=409, detail="This animal is no longer in your collection")
        invert.enclosure_id = enclosure_id
        mirror_invert_update_to_legacy(db, invert)
        return "animal"

    # A legacy tarantula with no inverts twin (pre-backfill).
    tarantula = db.query(Tarantula).filter(Tarantula.id == member_id, Tarantula.user_id == user.id).first()
    if tarantula is not None:
        if must_be_in is not None and tarantula.enclosure_id != must_be_in:
            raise HTTPException(status_code=404, detail="Animal not found in this enclosure")
        tarantula.enclosure_id = enclosure_id
        mirror_tarantula_update(db, tarantula)
        return "animal"

    colony = db.query(Colony).filter(Colony.id == member_id, Colony.user_id == user.id).first()
    if colony is not None:
        if must_be_in is not None and colony.enclosure_id != must_be_in:
            raise HTTPException(status_code=404, detail="Colony not found in this enclosure")
        colony.enclosure_id = enclosure_id
        return "colony"

    raise HTTPException(status_code=404, detail="Animal not found")


@router.post("/{enclosure_id}/inhabitants/{tarantula_id}", status_code=status.HTTP_200_OK)
@policy("owner_only")
async def add_inhabitant(
    enclosure_id: UUID,
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Put an animal (any taxon) or a colony in this enclosure. Moves it out
    of whatever enclosure it was in."""
    _owned_enclosure(db, enclosure_id, current_user)
    kind = _set_inhabitant_enclosure(db, current_user, tarantula_id, enclosure_id)
    db.commit()

    # `tarantula_id` key kept for older clients.
    return {"message": "Added to enclosure", "tarantula_id": str(tarantula_id), "kind": kind}


@router.delete("/{enclosure_id}/inhabitants/{tarantula_id}", status_code=status.HTTP_200_OK)
@policy("owner_only")
async def remove_inhabitant(
    enclosure_id: UUID,
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Take an animal (any taxon) or a colony out of this enclosure. Nothing
    is deleted."""
    _owned_enclosure(db, enclosure_id, current_user)
    kind = _set_inhabitant_enclosure(db, current_user, tarantula_id, None, must_be_in=enclosure_id)
    db.commit()

    return {"message": "Removed from enclosure", "tarantula_id": str(tarantula_id), "kind": kind}


# ============== FEEDING LOGS ==============

@router.get("/{enclosure_id}/feedings", response_model=List[FeedingLogResponse])
@policy("owner_only")
async def get_enclosure_feedings(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all feeding logs for an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    feedings = db.query(FeedingLog).filter(
        FeedingLog.enclosure_id == enclosure_id
    ).order_by(FeedingLog.fed_at.desc()).all()

    return feedings


@router.post("/{enclosure_id}/feedings", response_model=FeedingLogResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_enclosure_feeding(
    enclosure_id: UUID,
    feeding_data: FeedingLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a feeding log for an enclosure (group feeding)"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    new_feeding = FeedingLog(
        enclosure_id=enclosure_id,
        **feeding_data.model_dump()
    )

    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)

    return new_feeding


# ============== MOLT LOGS ==============

@router.get("/{enclosure_id}/molts", response_model=List[MoltLogResponse])
@policy("owner_only")
async def get_enclosure_molts(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all molt logs for an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    molts = db.query(MoltLog).filter(
        MoltLog.enclosure_id == enclosure_id
    ).order_by(MoltLog.molted_at.desc()).all()

    return molts


@router.post("/{enclosure_id}/molts", response_model=MoltLogResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_enclosure_molt(
    enclosure_id: UUID,
    molt_data: MoltLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a molt log for an enclosure (for unidentified molts in communals)"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    new_molt = MoltLog(
        enclosure_id=enclosure_id,
        **molt_data.model_dump()
    )

    db.add(new_molt)
    db.commit()
    db.refresh(new_molt)

    return new_molt


# ============== SUBSTRATE CHANGES ==============

@router.get("/{enclosure_id}/substrate-changes", response_model=List[SubstrateChangeResponse])
@policy("owner_only")
async def get_enclosure_substrate_changes(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all substrate changes for an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    changes = db.query(SubstrateChange).filter(
        SubstrateChange.enclosure_id == enclosure_id
    ).order_by(SubstrateChange.changed_at.desc()).all()

    return changes


@router.post("/{enclosure_id}/substrate-changes", response_model=SubstrateChangeResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_enclosure_substrate_change(
    enclosure_id: UUID,
    change_data: SubstrateChangeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a substrate change log for an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    new_change = SubstrateChange(
        enclosure_id=enclosure_id,
        **change_data.model_dump()
    )

    db.add(new_change)
    db.commit()
    db.refresh(new_change)

    # Update enclosure's substrate fields
    if change_data.substrate_type:
        enclosure.substrate_type = change_data.substrate_type
    if change_data.substrate_depth:
        enclosure.substrate_depth = change_data.substrate_depth
    enclosure.last_substrate_change = change_data.changed_at

    db.commit()
    db.refresh(new_change)

    return new_change


# ─── Communal Incident Endpoints ─────────────────────────────────────────────

from app.models.communal_incident import CommunalIncident
from datetime import date as date_type
from pydantic import BaseModel
from typing import Optional as Opt


class IncidentCreate(BaseModel):
    incident_type: str
    severity: Opt[str] = None
    occurred_at: date_type
    tarantula_id: Opt[UUID] = None
    description: Opt[str] = None
    outcome: Opt[str] = None


class IncidentResponse(BaseModel):
    id: UUID
    enclosure_id: UUID
    incident_type: str
    severity: Opt[str]
    occurred_at: date_type
    tarantula_id: Opt[UUID]
    description: Opt[str]
    outcome: Opt[str]
    created_at: datetime

    # Resolved display name of the involved individual (if linked)
    tarantula_name: Opt[str] = None

    class Config:
        from_attributes = True


@router.get("/{enclosure_id}/incidents", response_model=List[IncidentResponse])
@policy("owner_only")
async def get_incidents(
    enclosure_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id,
    ).first()
    if not enclosure:
        raise HTTPException(status_code=404, detail="Enclosure not found")

    incidents = (
        db.query(CommunalIncident)
        .filter(CommunalIncident.enclosure_id == enclosure_id)
        .order_by(CommunalIncident.occurred_at.desc())
        .all()
    )

    results = []
    for inc in incidents:
        row = IncidentResponse(
            id=inc.id,
            enclosure_id=inc.enclosure_id,
            incident_type=inc.incident_type,
            severity=inc.severity,
            occurred_at=inc.occurred_at,
            tarantula_id=inc.tarantula_id,
            description=inc.description,
            outcome=inc.outcome,
            created_at=inc.created_at,
            tarantula_name=inc.tarantula.name if inc.tarantula else None,
        )
        results.append(row)
    return results


@router.post("/{enclosure_id}/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_incident(
    enclosure_id: UUID,
    data: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id,
    ).first()
    if not enclosure:
        raise HTTPException(status_code=404, detail="Enclosure not found")

    incident = CommunalIncident(
        enclosure_id=enclosure_id,
        user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    return IncidentResponse(
        id=incident.id,
        enclosure_id=incident.enclosure_id,
        incident_type=incident.incident_type,
        severity=incident.severity,
        occurred_at=incident.occurred_at,
        tarantula_id=incident.tarantula_id,
        description=incident.description,
        outcome=incident.outcome,
        created_at=incident.created_at,
        tarantula_name=incident.tarantula.name if incident.tarantula else None,
    )


@router.delete("/{enclosure_id}/incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("owner_only")
async def delete_incident(
    enclosure_id: UUID,
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.query(CommunalIncident).join(Enclosure).filter(
        CommunalIncident.id == incident_id,
        CommunalIncident.enclosure_id == enclosure_id,
        Enclosure.user_id == current_user.id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    db.delete(incident)
    db.commit()
