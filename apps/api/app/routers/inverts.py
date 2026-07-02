"""Invert routes — unified per-animal CRUD (ADR-005 Phase A1).

  GET    /api/v1/inverts/?taxon=…       list current user's inverts
  POST   /api/v1/inverts/                create (taxon required in body)
  GET    /api/v1/inverts/{invert_id}     fetch one
  PUT    /api/v1/inverts/{invert_id}     partial update
  DELETE /api/v1/inverts/{invert_id}     delete (cascades to logs, photos)

Ownership: every query filters by Invert.user_id == current_user.id.
Anonymous / public reads will land on a future /i/{id} public-profile
route, mirroring the existing /t/{id} surface — not in this bundle.

In Phase A1 this router operates on the (currently empty) `inverts`
table. The legacy /tarantulas/ and /scorpions/ routes continue to read
from their own tables; dual-write lands in A2 and the read cutover in
C1.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.user import User
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.scorpion_colony import ScorpionColony
from app.models.tarantula import Sex, Source  # shared DB enums (UPPERCASE)
from app.schemas.invert import (
    InvertCreate,
    InvertFeedingStats,
    InvertFeedingStatusItem,
    InvertGrowthAnalytics,
    InvertResponse,
    InvertUpdate,
)
from app.services.growth_service import compute_growth_fields
from app.services.feeding_reminder_service import parse_frequency_string
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_collection_limit

router = APIRouter()


def _calendar_day_diff(later: datetime, earlier: datetime, tz_offset_minutes: Optional[int]) -> int:
    """Calendar-day difference in the user's local timezone.

    Mirrors tarantulas._calendar_day_diff so "days since last feeding"
    flips at the keeper's local midnight, not UTC midnight. JS
    getTimezoneOffset() is positive west of UTC (EDT=240); negate to shift
    UTC into local time. Falls back to a UTC delta for legacy clients that
    don't pass an offset.
    """
    if tz_offset_minutes is None:
        return (later - earlier).days
    local_delta = timedelta(minutes=-tz_offset_minutes)
    return ((later + local_delta).date() - (earlier + local_delta).date()).days


def _coerce_enums(data: dict) -> dict:
    """Map string sex / source onto the shared DB enums (UPPERCASE
    names in prod). Same pattern as the tarantula + scorpion routers."""
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


def _validate_species(db: Session, species_id: Optional[UUID], taxon: str) -> None:
    """Reject a species_id that doesn't match the row's taxon — would
    otherwise let a keeper link a scorpion to a tarantula care sheet."""
    if species_id is None:
        return
    species = db.query(InvertSpecies).filter(
        InvertSpecies.id == species_id,
    ).first()
    if species is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Species not found",
        )
    if species.taxon != taxon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Species belongs to taxon '{species.taxon}', not '{taxon}'",
        )


def _validate_colony(db: Session, user: User, colony_id: Optional[UUID]) -> None:
    """Hard 404 if the colony_id doesn't belong to this user."""
    if colony_id is None:
        return
    exists = db.query(ScorpionColony.id).filter(
        ScorpionColony.id == colony_id,
        ScorpionColony.user_id == user.id,
    ).first()
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colony not found or not yours",
        )


@router.get("/", response_model=List[InvertResponse])
async def list_inverts(
    taxon: Optional[str] = Query(
        None, pattern="^(tarantula|scorpion|centipede|whip_spider|vinegaroon|true_spider|millipede|mantis|roach|other)$",
        description="Filter to a single taxon. Omit for the whole collection.",
    ),
    colony_id: Optional[UUID] = Query(None),
    transferred: bool = Query(
        False,
        description="When false (default) returns only ACTIVE animals; when true "
        "returns only animals handed off via transfer (the 'Transferred' view).",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's inverts, newest first.

    By default excludes transferred-out animals so the displayed collection +
    count match what the cap enforces (BRIEF §4b). Pass `transferred=true` for
    the separate "Transferred" history view.
    """
    query = db.query(Invert).filter(Invert.user_id == current_user.id)
    if transferred:
        query = query.filter(Invert.transferred_out_at.isnot(None))
    else:
        query = query.filter(Invert.transferred_out_at.is_(None))
    if taxon:
        query = query.filter(Invert.taxon == taxon)
    if colony_id is not None:
        query = query.filter(Invert.colony_id == colony_id)
    # Defense in depth: serialize each invert individually so a single bad row
    # (e.g. an unexpected enum/format value) can't ResponseValidationError and blank
    # the WHOLE collection. Bad rows are skipped + logged rather than 500ing the list.
    items: List[InvertResponse] = []
    for inv in query.order_by(Invert.created_at.desc()).all():
        try:
            items.append(InvertResponse.model_validate(inv))
        except Exception as e:  # noqa: BLE001 — never let one row break the list
            logger.warning("inverts list: skipping invert %s (serialization failed): %s",
                           getattr(inv, "id", "?"), e)
    return items


@router.post(
    "/", response_model=InvertResponse, status_code=status.HTTP_201_CREATED,
)
async def create_invert(
    payload: InvertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new invert. `taxon` is required and immutable."""
    # Cross-taxon collection cap (counts inverts: tarantulas + scorpions + centipedes).
    enforce_collection_limit(db, current_user)
    _validate_species(db, payload.species_id, payload.taxon)
    _validate_colony(db, current_user, payload.colony_id)

    data = _coerce_enums(payload.model_dump())

    # Default visibility to the owner's profile visibility — matches
    # the tarantula + scorpion router behavior so the consolidated
    # surface doesn't surprise keepers.
    if not data.get("visibility"):
        data["visibility"] = (
            "public" if current_user.collection_visibility == "public"
            else "private"
        )

    new_invert = Invert(user_id=current_user.id, **data)
    db.add(new_invert)
    db.commit()
    db.refresh(new_invert)

    if new_invert.species_id:
        species = db.query(InvertSpecies).filter(
            InvertSpecies.id == new_invert.species_id,
        ).first()
        if species:
            species.times_kept = (species.times_kept or 0) + 1
            db.commit()

    return new_invert


# Fallback feeding intervals (days) when species/stage data is missing.
# Slings and juveniles eat more often, so we lean SHORTER when unsure —
# better to flag early than let a small animal go hungry.
_STAGE_DEFAULT_INTERVAL = {"sling": 5, "juvenile": 7, "adult": 10}
_UNKNOWN_INTERVAL = 7  # no species AND no life stage → conservative middle


def _recommended_feeding_interval(
    life_stage: Optional[str], species: Optional[InvertSpecies]
) -> Optional[int]:
    """Days-between-feedings threshold for an animal's species + life stage.

    Uses the species' per-stage feeding frequency when available (upper bound
    of the range = "should have fed by now"). Returns None for detritivores
    (millipedes etc.) — they graze substrate and have no live-prey cadence, so
    they're never marked overdue. Leans SHORTER on missing data (safety-first).
    """
    stage = (life_stage or "").lower().strip() or None

    if species is not None:
        if (species.feeding_mode or "predator") == "detritivore":
            return None  # no overdue concept for grazers

        by_stage = {
            "sling": species.feeding_frequency_sling,
            "juvenile": species.feeding_frequency_juvenile,
            "adult": species.feeding_frequency_adult,
        }
        freq_str = by_stage.get(stage) if stage else None
        if freq_str:
            return parse_frequency_string(freq_str)[1]  # upper bound
        # Stage unknown or that stage's frequency blank → use the SHORTEST
        # defined frequency across stages (safer: flags soonest).
        defined = [parse_frequency_string(v)[1] for v in by_stage.values() if v]
        if defined:
            return min(defined)

    # No species (or no usable frequency) → stage-based default, else unknown.
    if stage in _STAGE_DEFAULT_INTERVAL:
        return _STAGE_DEFAULT_INTERVAL[stage]
    return _UNKNOWN_INTERVAL


@router.get("/feeding-status", response_model=List[InvertFeedingStatusItem])
async def list_feeding_status(
    tz_offset_minutes: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cross-taxon feeding status for every animal the caller owns — powers the
    Feeding Day screen. One grouped query for the last ACCEPTED feeding per
    animal (no N+1).

    is_overdue is species + life-stage aware: an animal is overdue when it's
    never been fed, or days-since-last-feeding has reached its recommended
    interval (from the species' per-stage feeding frequency, shortest-wins when
    stage is unknown). Paused animals and detritivores are never flagged.

    NOTE: this static route MUST stay declared before `/{invert_id}` or the
    dynamic route would swallow "feeding-status" and 422 on UUID parsing.
    """
    inverts = db.query(Invert).filter(Invert.user_id == current_user.id).all()
    if not inverts:
        return []

    ids = [inv.id for inv in inverts]
    rows = (
        db.query(FeedingLog.invert_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.invert_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.invert_id)
        .all()
    )
    last_by_id = {row[0]: row[1] for row in rows}

    # Batch-load the species referenced by this collection (avoid N+1).
    species_ids = {inv.species_id for inv in inverts if inv.species_id}
    species_by_id = {}
    if species_ids:
        species_by_id = {
            sp.id: sp
            for sp in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids)).all()
        }

    now = datetime.now(timezone.utc)
    today_local = (
        (now + timedelta(minutes=-(tz_offset_minutes or 0))).date()
        if tz_offset_minutes is not None
        else now.date()
    )

    items: List[InvertFeedingStatusItem] = []
    for inv in inverts:
        last = last_by_id.get(inv.id)
        days = _calendar_day_diff(now, last, tz_offset_minutes) if last else None
        paused = bool(
            inv.feeding_paused_reason
            and (inv.feeding_paused_until is None or inv.feeding_paused_until >= today_local)
        )
        species = species_by_id.get(inv.species_id) if inv.species_id else None
        interval = _recommended_feeding_interval(inv.life_stage, species)
        is_overdue = (
            (not paused)
            and interval is not None
            and (last is None or (days is not None and days >= interval))
        )
        items.append(
            InvertFeedingStatusItem(
                id=inv.id,
                name=inv.name,
                common_name=inv.common_name,
                scientific_name=inv.scientific_name,
                taxon=inv.taxon,
                photo_url=inv.photo_url,
                life_stage=inv.life_stage,
                last_feeding_date=last,
                days_since_last_feeding=days,
                is_feeding_paused=paused,
                is_overdue=is_overdue,
                interval_days=interval,
            )
        )

    # Never-fed first, then longest-since-fed, so the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items


@router.get("/{invert_id}", response_model=InvertResponse)
async def get_invert(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a single invert the current user owns."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )
    return invert


@router.put("/{invert_id}", response_model=InvertResponse)
async def update_invert(
    invert_id: UUID,
    payload: InvertUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update — only fields in the payload are applied. Taxon
    cannot be changed (intentionally omitted from InvertUpdate)."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )

    data = payload.model_dump(exclude_unset=True)

    if "species_id" in data:
        _validate_species(db, data["species_id"], invert.taxon)
    if "colony_id" in data:
        _validate_colony(db, current_user, data["colony_id"])

    data = _coerce_enums(data)
    for field, value in data.items():
        setattr(invert, field, value)

    db.commit()
    db.refresh(invert)
    return invert


@router.delete("/{invert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invert(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an invert. Cascades to feeding/molt/substrate logs and
    photos via the FK ON DELETE CASCADE clauses set in inv_20260527."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )
    db.delete(invert)
    db.commit()
    return None


@router.get("/{invert_id}/growth", response_model=InvertGrowthAnalytics)
async def get_invert_growth(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Growth analytics for any invert, from its molt history (ADR-008).

    Taxon-agnostic: molt logs are matched on invert_id, which the
    backfill + dual-write keep populated for tarantulas and scorpions
    too, so this works for every taxon. The length measurement is
    whatever the keeper recorded (leg span vs body length — the client
    labels it via the taxon registry).
    """
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )

    molt_logs = (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == invert_id)
        .order_by(MoltLog.molted_at)
        .all()
    )

    return InvertGrowthAnalytics(
        invert_id=invert_id,
        **compute_growth_fields(molt_logs),
    )


@router.get("/{invert_id}/feeding-stats", response_model=InvertFeedingStats)
async def get_invert_feeding_stats(
    invert_id: UUID,
    tz_offset_minutes: Optional[int] = Query(
        None,
        description=(
            "User's local timezone offset in minutes (JS Date.getTimezoneOffset(): "
            "positive west of UTC, EDT=240). When provided, days_since_last_feeding "
            "is computed in calendar days in the user's zone. Optional."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lean feeding summary for any invert — powers the collection list
    feeding badge (days-since + paused), taxon-agnostic.

    `days_since_last_feeding` is measured from the last ACCEPTED feeding;
    refusals are tracked but aren't meals (same rule as the tarantula
    feeding-stats endpoint). Feeding logs are matched on invert_id, which
    dual-write/backfill keep populated for every taxon.
    """
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invert not found",
        )

    # Pause state — a paused animal (premolt / recovering / etc.) shouldn't
    # trigger overdue treatment. Trumps the days-since badge on the client.
    today_local = (
        datetime.now(timezone.utc) + timedelta(minutes=-(tz_offset_minutes or 0))
    ).date() if tz_offset_minutes is not None else datetime.now(timezone.utc).date()
    is_feeding_paused = bool(
        invert.feeding_paused_reason
        and (
            invert.feeding_paused_until is None
            or invert.feeding_paused_until >= today_local
        )
    )

    feeding_logs = (
        db.query(FeedingLog)
        .filter(FeedingLog.invert_id == invert_id)
        .order_by(FeedingLog.fed_at)
        .all()
    )

    total_feedings = len(feeding_logs)
    accepted_logs = [log for log in feeding_logs if log.accepted]
    total_accepted = len(accepted_logs)
    acceptance_rate = (
        round(total_accepted / total_feedings * 100, 1) if total_feedings else 0.0
    )

    if accepted_logs:
        last_feeding_date = accepted_logs[-1].fed_at
        days_since_last_feeding = _calendar_day_diff(
            datetime.now(timezone.utc), last_feeding_date, tz_offset_minutes
        )
    else:
        last_feeding_date = None
        days_since_last_feeding = None

    return InvertFeedingStats(
        invert_id=invert_id,
        total_feedings=total_feedings,
        total_accepted=total_accepted,
        acceptance_rate=acceptance_rate,
        last_feeding_date=last_feeding_date,
        days_since_last_feeding=days_since_last_feeding,
        is_feeding_paused=is_feeding_paused,
        feeding_paused_reason=invert.feeding_paused_reason,
        feeding_paused_until=invert.feeding_paused_until,
    )
