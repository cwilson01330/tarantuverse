"""
Colony + colony-event routes (ADR-010).

Population-level tracking for communal/colony keepers. Owner-scoped throughout.
A colony counts as 1 toward the free-tier animal cap (enforced on create via
the shared `enforce_collection_limit`, which counts inverts + colonies).

Events with a `count_delta` mutate the colony's `stage_counts` bucket on write
(same pattern as FeederCareLog -> count). JSONB is reassigned (not mutated in
place) so SQLAlchemy flushes the change.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.colony import Colony, ColonyEvent
from app.models.invert_species import InvertSpecies
from app.models.enclosure import Enclosure
from app.models.feeding_log import FeedingLog
from app.schemas.colony import (
    ColonyCreate,
    ColonyUpdate,
    ColonyEndRequest,
    ColonyResponse,
    ColonyListItem,
    ColonyEventCreate,
    ColonyEventUpdate,
    ColonyEventResponse,
)
from app.utils.dependencies import get_current_user
from app.services.colony_history_service import colony_population_history
from app.utils.limits import enforce_collection_limit
from app.utils.locations import canonical_location
from app.utils.access import access_helper, load_colony, policy, require_can_change, scope_collection
from app.utils.photo_cleanup import collect_for_colony, delete_files

router = APIRouter()


# ---------- helpers ----------

def _species_names(sp: Optional[InvertSpecies]):
    """(display_name, scientific_name). Display prefers a common name."""
    if sp is None:
        return None, None
    display = sp.common_names[0] if sp.common_names else sp.scientific_name
    return display, sp.scientific_name


def _total_count(colony: Colony) -> int:
    """Sum the buckets. Always an int (0 for an empty colony) so the clients
    can type total_count as a number without a null branch."""
    if not colony.stage_counts:
        return 0
    try:
        return sum(int(v) for v in colony.stage_counts.values() if isinstance(v, int))
    except Exception:
        return 0


def _build_response(colony: Colony, db: Session) -> dict:
    sp: Optional[InvertSpecies] = None
    species_missing = False
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == colony.species_id).first()
        if sp is None:
            species_missing = True

    display, scientific = _species_names(sp)
    data = {c.name: getattr(colony, c.name) for c in colony.__table__.columns}
    data["total_count"] = _total_count(colony)
    data["species_display_name"] = display
    data["species_scientific_name"] = scientific
    data["species_missing"] = species_missing
    return data


def _verify_enclosure(db: Session, enclosure_id: Optional[UUID], user: User) -> None:
    if enclosure_id is None:
        return
    enc = (
        db.query(Enclosure)
        .filter(Enclosure.id == enclosure_id, Enclosure.user_id == user.id)
        .first()
    )
    if enc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enclosure not found")


def _verify_species(db: Session, species_id: Optional[UUID]) -> None:
    if species_id is None:
        return
    sp = db.query(InvertSpecies).filter(InvertSpecies.id == species_id).first()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Species not found")


@access_helper
def _event_for(db: Session, event_id: UUID, user: User, need: str):
    """A colony event plus the caller's access through its colony (owner or
    co-keeper). Resolved through the colony, not the event row's own user_id,
    which is always the owner's. 404 for missing and for no access alike."""
    log = db.query(ColonyEvent).filter(ColonyEvent.id == event_id).first()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    _colony, access = load_colony(db, user, log.colony_id, need, not_found="Event not found")
    if need != "viewer":
        require_can_change(access, log)
    return log


CHANGE_WINDOW_DAYS = 30


def _apply_delta(colony: Colony, stage: Optional[str], delta: Optional[int]) -> None:
    """Adjust a bucket by delta (clamped at 0). Reassigns the JSONB dict so
    SQLAlchemy detects the change. Missing stage defaults to 'mixed'."""
    if delta is None:
        return
    bucket = (stage or "mixed").strip() or "mixed"
    counts = dict(colony.stage_counts or {})
    counts[bucket] = max(0, int(counts.get(bucket, 0)) + int(delta))
    colony.stage_counts = counts


def _reverse_delta(colony: Colony, stage: Optional[str], delta: Optional[int]) -> bool:
    """Undo a previously applied event delta on its bucket. Returns True when
    the reversal had to be clamped at 0 (the bucket held less than the delta
    being taken back, e.g. the keeper corrected the count by hand since)."""
    if delta is None or int(delta) == 0:
        return False
    bucket = (stage or "mixed").strip() or "mixed"
    current = int((colony.stage_counts or {}).get(bucket, 0))
    clamped = current - int(delta) < 0
    _apply_delta(colony, stage, -int(delta))
    return clamped


# ---------- colony CRUD ----------

@router.get("/", response_model=List[ColonyListItem])
@policy("viewer")
async def list_colonies(
    include_inactive: bool = Query(False),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        pattern="^(active|ended|past)$",
        description=(
            "Which colonies to list. Default ('active') is the working "
            "collection: ended colonies are excluded, and so are archived ones "
            "unless include_inactive is set. 'ended' = only colonies that have "
            "ended (history view, like inverts' status=deceased). 'past' = "
            "everything that has left the working collection, archived or "
            "ended."
        ),
    ),
    collection: Optional[UUID] = Query(None, description="Owner's user id for a shared collection."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = scope_collection(db, current_user, "tarantuverse", collection)
    q = db.query(Colony).filter(
        Colony.user_id == access.owner.id,
        Colony.transferred_out_at.is_(None),
    )
    view = status_filter or "active"
    if view == "ended":
        q = q.filter(Colony.ended_at.isnot(None))
    elif view == "past":
        q = q.filter(or_(Colony.is_active.is_(False), Colony.ended_at.isnot(None)))
    else:
        # An ended colony never appears in the working collection, archived
        # or not -- same rule that keeps a deceased animal out of /inverts/.
        q = q.filter(Colony.ended_at.is_(None))
        if not include_inactive:
            q = q.filter(Colony.is_active.is_(True))
    colonies = q.order_by(Colony.created_at.desc()).all()

    # Last ACCEPTED feeding per colony, in ONE grouped query rather than one
    # per row. The collection grid shows "Fed 4d ago" on every card and an
    # N+1 here would be a query per colony on a screen that already fans out.
    #
    # Only accepted feedings count, same rule as animals — a refusal isn't a
    # feeding, and treating it as one is how "fed today" ends up on an animal
    # that ate nothing.
    last_fed: dict = {}
    if colonies:
        rows = (
            db.query(FeedingLog.colony_id, func.max(FeedingLog.fed_at))
            .filter(
                FeedingLog.colony_id.in_([c.id for c in colonies]),
                FeedingLog.accepted.is_(True),
            )
            .group_by(FeedingLog.colony_id)
            .all()
        )
        last_fed = {r[0]: r[1] for r in rows}

    # Net headcount change over the last 30 days, also ONE grouped query.
    # A plain sum of logged deltas: it's what the keeper recorded, not a
    # model. None (not 0) when nothing moved the count in the window, so the
    # card can stay quiet instead of claiming "±0" for a colony nobody counted.
    change_30d: dict = {}
    if colonies:
        since = date.today() - timedelta(days=CHANGE_WINDOW_DAYS)
        rows = (
            db.query(ColonyEvent.colony_id, func.sum(ColonyEvent.count_delta))
            .filter(
                ColonyEvent.colony_id.in_([c.id for c in colonies]),
                ColonyEvent.count_delta.isnot(None),
                ColonyEvent.count_delta != 0,
                ColonyEvent.occurred_at >= since,
            )
            .group_by(ColonyEvent.colony_id)
            .all()
        )
        change_30d = {r[0]: int(r[1]) for r in rows if r[1] is not None}

    now = datetime.now(timezone.utc)
    items = []
    for c in colonies:
        data = _build_response(c, db)
        fed_at = last_fed.get(c.id)
        data["last_feeding_date"] = fed_at
        data["change_30d"] = change_30d.get(c.id)
        # Days since only — deliberately NOT an overdue flag. Overdue needs a
        # cadence, and a colony has no life_stage to resolve one from; the
        # stage buckets are a census, not a maturity. Inventing a cadence here
        # is exactly the fabrication the feeding parser fix removed elsewhere.
        data["days_since_last_feeding"] = (
            (now - fed_at).days if fed_at is not None else None
        )
        items.append(ColonyListItem(**data))
    return items


@router.post("/", response_model=ColonyResponse, status_code=status.HTTP_201_CREATED)
@policy("keeper")
async def create_colony(
    payload: ColonyCreate,
    collection: Optional[UUID] = Query(None, description="Owner's user id to add to a shared collection."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    access = scope_collection(db, current_user, "tarantuverse", collection, need="keeper")
    owner = access.owner  # the colony, its cap and its enclosure are the OWNER's
    # A colony counts as 1 animal toward the free-tier cap.
    enforce_collection_limit(db, owner)
    _verify_enclosure(db, payload.enclosure_id, owner)
    _verify_species(db, payload.species_id)

    colony_data = payload.model_dump()
    # One spelling per place per keeper — see utils/locations.
    colony_data["location"] = canonical_location(db, owner.id, colony_data.get("location"))
    colony = Colony(user_id=owner.id, **colony_data)
    db.add(colony)

    # Bump the species "times_kept" counter (parity with invert create).
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == colony.species_id).first()
        if sp is not None:
            sp.times_kept = (sp.times_kept or 0) + 1

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


@router.get("/{colony_id}", response_model=ColonyResponse)
@policy("viewer")
async def get_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony, _access = load_colony(db, current_user, colony_id, "viewer")
    return ColonyResponse(**_build_response(colony, db))


@router.put("/{colony_id}", response_model=ColonyResponse)
@policy("keeper")
async def update_colony(
    colony_id: UUID,
    payload: ColonyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony, access = load_colony(db, current_user, colony_id, "keeper")
    data = payload.model_dump(exclude_unset=True)

    if "enclosure_id" in data:
        _verify_enclosure(db, data["enclosure_id"], access.owner)
    if data.get("species_id"):
        _verify_species(db, data["species_id"])
    if "location" in data:
        data["location"] = canonical_location(db, access.owner.id, data["location"])

    # Unarchiving puts the colony back in the free-tier count, so it has to
    # clear the same cap a brand-new colony does -- otherwise archive -> add ->
    # unarchive walks a free keeper past it. Archiving (true -> false) is never
    # blocked. An ended or handed-off colony doesn't count toward the cap
    # whatever its is_active says, so flipping the flag on one is no change to
    # the count and is not checked. The cap is the OWNER's, not the caller's.
    if (
        data.get("is_active") is True
        and not colony.is_active
        and colony.ended_at is None
        and colony.transferred_out_at is None
    ):
        enforce_collection_limit(db, access.owner)

    for k, v in data.items():
        setattr(colony, k, v)

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


# ---------- end / reopen ----------
#
# The colony counterpart of mark-died / revive (ADR-015). A population doesn't
# die, it ENDS, with a reason. Dedicated endpoints rather than fields on the
# generic update so ended_at can't be flipped by an incidental PUT that echoes
# back an object the client fetched.

@router.post("/{colony_id}/end", response_model=ColonyResponse)
@policy("keeper")
async def end_colony(
    colony_id: UUID,
    payload: ColonyEndRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record that a colony has ended. Keeps the record and every event intact.

    The colony drops out of the collection list and the free-tier count, but
    nothing is deleted and it stays readable under `?status=ended`.
    """
    colony, _access = load_colony(db, current_user, colony_id, "keeper")
    if colony.ended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This colony has already ended.",
        )

    colony.ended_at = payload.ended_at or date.today()
    colony.end_reason = payload.reason
    colony.end_notes = payload.notes

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


@router.post("/{colony_id}/reopen", response_model=ColonyResponse)
@policy("keeper")
async def reopen_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Undo an end. A correction for a mis-tap, so -- like reviving an animal --
    it deliberately does NOT check the free-tier cap: refusing to fix a mistake
    because of a billing limit would be indefensible. Clears the reason and
    notes too; a lingering reason with no date would be an orphan nobody sees.
    """
    colony, _access = load_colony(db, current_user, colony_id, "keeper")
    if colony.ended_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This colony hasn't ended.",
        )

    colony.ended_at = None
    colony.end_reason = None
    colony.end_notes = None

    db.commit()
    db.refresh(colony)
    return ColonyResponse(**_build_response(colony, db))


@router.delete("/{colony_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("owner_only")
async def delete_colony(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Owner-only (PRD T8): deliberately the inline owner filter, not the resolver.
    colony = (
        db.query(Colony)
        .filter(Colony.id == colony_id, Colony.user_id == current_user.id)
        .first()
    )
    if colony is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Colony not found")
    _photo_files = collect_for_colony(db, colony_id)
    db.delete(colony)
    db.commit()
    # Photo FILES don't cascade with the rows (R2) — remove them now the
    # delete is committed. Best-effort; see utils/photo_cleanup.
    await delete_files(db, _photo_files)
    return None


@router.get("/{colony_id}/population-history")
@policy("viewer")
async def population_history(
    colony_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The colony's population over time, rebuilt from its own events.

    Observed history only — no projection. See colony_history_service for why
    a breeding forecast would be dishonest here rather than merely hard.
    """
    colony, _access = load_colony(db, current_user, colony_id, "viewer")
    return colony_population_history(db, colony)


# ---------- events ----------

@router.get("/{colony_id}/events", response_model=List[ColonyEventResponse])
@policy("viewer")
async def list_events(
    colony_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    load_colony(db, current_user, colony_id, "viewer")
    return (
        db.query(ColonyEvent)
        .filter(ColonyEvent.colony_id == colony_id)
        .order_by(ColonyEvent.occurred_at.desc(), ColonyEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post(
    "/{colony_id}/events",
    response_model=ColonyEventResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_event(
    colony_id: UUID,
    payload: ColonyEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    colony, access = load_colony(db, current_user, colony_id, "logger")

    log = ColonyEvent(
        colony_id=colony.id,
        user_id=access.owner.id,  # the collection's owner, whoever logged it
        logged_by_user_id=access.logged_by_user_id,
        **payload.model_dump(exclude_unset=True),
    )
    db.add(log)

    # Apply the population delta to the bucket.
    _apply_delta(colony, log.stage, log.count_delta)

    db.commit()
    db.refresh(log)
    return log


@router.put("/events/{event_id}", response_model=ColonyEventResponse)
@policy("logger")
async def update_event(
    event_id: UUID,
    payload: ColonyEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = _event_for(db, event_id, current_user, "logger")

    colony = db.query(Colony).filter(Colony.id == log.colony_id).first()

    old_stage, old_delta = log.stage, log.count_delta
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(log, k, v)

    # One transaction: take back what the event did, then apply what it now
    # does, so the stored population never drifts from the event history.
    if colony is not None and (
        old_delta != log.count_delta or (old_stage or "mixed") != (log.stage or "mixed")
    ):
        _reverse_delta(colony, old_stage, old_delta)
        _apply_delta(colony, log.stage, log.count_delta)

    db.commit()
    db.refresh(log)
    return log


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("logger")
async def delete_event(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = _event_for(db, event_id, current_user, "logger")

    # Deleting an event takes its population change back out (clamped at 0).
    colony = db.query(Colony).filter(Colony.id == log.colony_id).first()
    if colony is not None:
        _reverse_delta(colony, log.stage, log.count_delta)

    db.delete(log)
    db.commit()
    return None
