"""
Enclosure routes for communal and solo tarantula setups
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, date
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

router = APIRouter()


def get_enclosure_with_computed_fields(enclosure: Enclosure, db: Session) -> dict:
    """Add computed fields to enclosure response"""
    # Get inhabitant count
    inhabitant_count = db.query(Tarantula).filter(
        Tarantula.enclosure_id == enclosure.id
    ).count()

    # Get species name if species_id is set
    species_name = None
    if enclosure.species_id:
        species = db.query(Species).filter(Species.id == enclosure.species_id).first()
        if species:
            species_name = species.scientific_name

    # Get days since last feeding
    days_since_last_feeding = None
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.enclosure_id == enclosure.id
    ).order_by(FeedingLog.fed_at.desc()).first()
    if last_feeding:
        delta = datetime.now(timezone.utc) - last_feeding.fed_at.replace(tzinfo=timezone.utc)
        days_since_last_feeding = delta.days

    return {
        **{c.name: getattr(enclosure, c.name) for c in enclosure.__table__.columns},
        "inhabitant_count": inhabitant_count,
        "species_name": species_name,
        "days_since_last_feeding": days_since_last_feeding
    }


# ============== ENCLOSURE CRUD ==============

@router.get("/", response_model=List[EnclosureListResponse])
async def get_enclosures(
    purpose: Optional[str] = Query(
        None,
        description="Filter by enclosure purpose. 'tarantula' (default collection view) or 'feeder' (feeder bins). Omit to return all.",
        pattern="^(tarantula|feeder|all)$",
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
        data = get_enclosure_with_computed_fields(enc, db)
        result.append(EnclosureListResponse(**data))
    return result


@router.post("/", response_model=EnclosureResponse, status_code=status.HTTP_201_CREATED)
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

    # Remove tarantulas from enclosure (don't delete them)
    db.query(Tarantula).filter(
        Tarantula.enclosure_id == enclosure_id
    ).update({"enclosure_id": None})

    db.delete(enclosure)
    db.commit()
    return None


# ============== INHABITANTS ==============

@router.get("/{enclosure_id}/inhabitants", response_model=List[InhabitantInfo])
async def get_inhabitants(
    enclosure_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all tarantulas in an enclosure"""
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    tarantulas = db.query(Tarantula).filter(
        Tarantula.enclosure_id == enclosure_id
    ).all()

    return [InhabitantInfo(
        id=t.id,
        name=t.name,
        scientific_name=t.scientific_name,
        sex=t.sex.value if t.sex else None,
        photo_url=t.photo_url
    ) for t in tarantulas]


@router.post("/{enclosure_id}/inhabitants/{tarantula_id}", status_code=status.HTTP_200_OK)
async def add_inhabitant(
    enclosure_id: UUID,
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a tarantula to an enclosure"""
    # Verify enclosure ownership
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    # Verify tarantula ownership
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    # Add to enclosure
    tarantula.enclosure_id = enclosure_id
    db.commit()

    return {"message": "Tarantula added to enclosure", "tarantula_id": str(tarantula_id)}


@router.delete("/{enclosure_id}/inhabitants/{tarantula_id}", status_code=status.HTTP_200_OK)
async def remove_inhabitant(
    enclosure_id: UUID,
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a tarantula from an enclosure"""
    # Verify enclosure ownership
    enclosure = db.query(Enclosure).filter(
        Enclosure.id == enclosure_id,
        Enclosure.user_id == current_user.id
    ).first()

    if not enclosure:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enclosure not found"
        )

    # Verify tarantula is in this enclosure
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.enclosure_id == enclosure_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found in this enclosure"
        )

    # Remove from enclosure
    tarantula.enclosure_id = None
    db.commit()

    return {"message": "Tarantula removed from enclosure", "tarantula_id": str(tarantula_id)}


# ============== FEEDING LOGS ==============

@router.get("/{enclosure_id}/feedings", response_model=List[FeedingLogResponse])
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
