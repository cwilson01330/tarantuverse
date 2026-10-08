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
import re
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.utils.limits import enforce_animal_limit, active_animals_query
from app.models.user import User, HV_FREE_TIER_MAX_ANIMALS
from app.models.animal import Animal, ANIMAL_TAXON_VALUES
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.animal_genotype import AnimalGenotype
from app.models.feeding_log import FeedingLog
from app.models.photo import Photo
from app.models.tarantula import Sex, Source  # shared DB enums
from app.schemas.animal import (
    AnimalCreate,
    AnimalUpdate,
    AnimalResponse,
    AnimalFeedingStatusItem,
)
from app.schemas.feeding import (
    AnimalBulkFeedingRequest,
    AnimalBulkFeedingResult,
    AnimalBulkFeedingSkip,
)
from app.services.feeding_reminder_service import parse_frequency_string
from app.services.snake_feeding_advisory import cgd_applies
from app.utils.dependencies import get_current_user
from app.utils.access import load_animal, policy, require_own_enclosure, scope_collection, strip_owner_only
from app.utils.feeding_pause import resume_if_accepted
from app.schemas.death import MarkDiedRequest
from app.utils.photo_cleanup import collect_for_animal, delete_files
from app.utils.locations import (
    SCOPE_HERPETOVERSE,
    canonical_location,
    list_locations,
    rename_location,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Feeding cadence (HV Feeding Day) — reptiles/amphibians feed on wildly
# different schedules, so the interval is resolved per-animal, degrading to
# None (never flagged overdue) rather than guessing wrong.
# ---------------------------------------------------------------------------

def _calendar_day_diff(later: datetime, earlier: datetime, tz_offset_minutes: Optional[int]) -> int:
    """Calendar-day difference in the keeper's local timezone (flips at local
    midnight, not UTC). Mirrors tarantulas/inverts._calendar_day_diff."""
    if tz_offset_minutes is None:
        return (later - earlier).days
    local_delta = timedelta(minutes=-tz_offset_minutes)
    return ((later + local_delta).date() - (earlier + local_delta).date()).days


def _parse_reptile_interval(s: Optional[str]) -> Optional[int]:
    """Days-between-feedings from a free-text schedule/frequency, upper bound.

    Handles word cadences ("weekly", "daily", "every other day", "twice a
    week", "biweekly", "monthly") BEFORE numeric parsing — critical so
    "1-2 prey per week" is read as a per-week frequency (7d), not "every 2
    days". Returns None when it can't confidently parse, so unknown schedules
    never produce a false "overdue".
    """
    if not s:
        return None
    t = s.strip().lower()
    if not t:
        return None
    if "every other day" in t or "alternate day" in t or "every 2nd day" in t:
        return 2
    if ("twice" in t or "2x" in t or "2 x" in t) and "week" in t:
        return 4  # ~2×/week → overdue by day 4
    if "daily" in t or "every day" in t or "each day" in t:
        return 1
    if ("biweekly" in t or "bi-weekly" in t or "fortnight" in t
            or "every two weeks" in t or "every 2 weeks" in t):
        return 14
    if "weekly" in t or "per week" in t or "a week" in t or "once a week" in t:
        return 7
    if "monthly" in t or "per month" in t or "once a month" in t:
        return 30
    # Numeric ranges like "every 5-7 days" / "every 10 days". The parser now
    # returns None when it can't read a cadence instead of a fake "10", so the
    # digit guard is no longer load-bearing — but it's kept because it's free
    # and documents the intent.
    if re.search(r"\d", t):
        parsed = parse_frequency_string(t)
        return parsed[1] if parsed else None
    return None


def _interval_from_life_stage_feeding(brackets, weight_g) -> Optional[int]:
    """Snake-style weight-bracketed interval: pick the bracket whose
    weight_g_max covers the animal's current weight (None = open-ended adult),
    return its interval_days_max. See ReptileSpecies.life_stage_feeding."""
    if not isinstance(brackets, list) or not brackets:
        return None
    try:
        w = float(weight_g)
    except (TypeError, ValueError):
        return None

    def _key(b):
        m = b.get("weight_g_max") if isinstance(b, dict) else None
        return (m is None, float(m) if m is not None else 0.0)

    for b in sorted(brackets, key=_key):
        if not isinstance(b, dict):
            continue
        m = b.get("weight_g_max")
        if m is None or w <= float(m):
            hi = b.get("interval_days_max")
            if hi is not None:
                return int(hi)
            lo = b.get("interval_days_min")
            return int(lo) if lo is not None else None
    return None


def _animal_feeding_interval(animal: Animal) -> Optional[int]:
    """Resolve the recommended feeding interval (days) for one animal.

    Priority: an explicit keeper-set interval → CGD (geckos on a complete diet,
    refreshed ~every few days → overdue day 4) → weight-bracketed snake
    schedule → the animal's own free-text schedule → the species' per-stage
    frequency → None (unknown).
    Requires herp_species eager-loaded for the CGD + species fallbacks.

    ADR-017 puts the keeper's own number first. It matters more here than on
    the invert side: reptile cadences span a daily-fed juvenile gecko to a
    monthly-fed adult boa, which is why every other branch below is a careful
    inference and why this function returns None rather than guessing when they
    all miss. A number the keeper stated is the only cadence the app can ever
    be certain of.

    NOTE: `feeding_schedule` — the free-text field a keeper can already type —
    currently ranks BELOW the CGD flag and the weight bracket, so a computed
    inference can overrule something the keeper wrote by hand. That predates
    this change and is left alone deliberately; it's a husbandry judgement, not
    a bug to fix in passing.
    """
    if animal.feeding_interval_days:
        return animal.feeding_interval_days

    species = animal.herp_species
    # Gated by cgd_applies: the raw flag put a corn snake on a 4-day gecko
    # cadence because the add form's CGD toggle has no taxon gate. See
    # services.snake_feeding_advisory.cgd_applies. Keep this in lockstep
    # with weight_logs._resolve_interval_window.
    if cgd_applies(animal):
        return 4
    if species is not None and animal.current_weight_g is not None:
        iv = _interval_from_life_stage_feeding(
            getattr(species, "life_stage_feeding", None), animal.current_weight_g
        )
        if iv is not None:
            return iv
    iv = _parse_reptile_interval(animal.feeding_schedule)
    if iv is not None:
        return iv
    if species is not None:
        for freq in (
            species.feeding_frequency_adult,
            species.feeding_frequency_juvenile,
            species.feeding_frequency_hatchling,
        ):
            iv = _parse_reptile_interval(freq)
            if iv is not None:
                return iv
    return None


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
@policy("viewer")
async def get_animals(
    taxon: Optional[str] = Query(
        None, pattern="^(snake|lizard|turtle|tortoise|frog|salamander|other)$",
        description="Filter to a single taxon. Omit for the whole collection.",
    ),
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    status: Optional[str] = Query(
        None,
        pattern="^(active|transferred|deceased)$",
        description=(
            "Lifecycle view, same vocabulary as /inverts/. 'active' (default) "
            "is the living collection; 'transferred' and 'deceased' are the "
            "history views — records kept in full, every log intact."
        ),
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
    access = scope_collection(db, current_user, "herpetoverse", collection)
    query = (
        db.query(Animal)
        .options(selectinload(Animal.herp_species))
        .filter(Animal.user_id == access.owner.id)
    )
    view = status or "active"
    if view == "transferred":
        query = query.filter(Animal.transferred_out_at.isnot(None))
    elif view == "deceased":
        # The "Died" archive (handoff §14.5). Before this param existed the
        # records ADR-015 promises to keep had no way back into any client.
        query = query.filter(Animal.died_at.isnot(None))
    else:
        query = query.filter(
            # Handed-off animals (transferred to another keeper) drop out of
            # the active collection — see htr_20260707.
            Animal.transferred_out_at.is_(None),
            # As do animals that have died (ADR-015). The record is kept in
            # full; it just isn't part of the living collection.
            Animal.died_at.is_(None),
        )
    if taxon:
        query = query.filter(Animal.taxon == taxon)
    return query.order_by(Animal.created_at.desc()).all()


@router.post("/", response_model=AnimalResponse, status_code=status.HTTP_201_CREATED)
@policy("keeper")
async def create_animal(
    animal_data: AnimalCreate,
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new animal for the authenticated user. `taxon` is
    required and immutable once set."""
    # Free-tier cap (HV_FREE_TIER_MAX_ANIMALS). Raises 402 with an
    # upgrade-prompt payload when the free keeper is at the limit; premium
    # (any active subscription) is uncapped.
    # In a shared collection the animal, its cap and its plan are the OWNER's.
    access = scope_collection(db, current_user, "herpetoverse", collection, need="keeper")
    enforce_animal_limit(db, access.owner)
    require_own_enclosure(db, animal_data.enclosure_id, access.owner)

    animal_dict = _coerce_enums(strip_owner_only(access, animal_data.model_dump()))
    # One spelling per place per keeper — see utils/locations. Herpetoverse
    # scope: only this keeper's animals are consulted, never their TV rows.
    animal_dict["location"] = canonical_location(
        db, access.owner.id, animal_dict.get("location"), SCOPE_HERPETOVERSE
    )

    new_animal = Animal(user_id=access.owner.id, **animal_dict)
    db.add(new_animal)
    db.commit()
    db.refresh(new_animal)

    # TODO: bump herp_species.times_kept once that column exists
    # TODO: emit `new_animal` activity feed entry when feed has herp icons

    return new_animal


# NOTE: these static routes MUST stay declared before `/{animal_id}` or the
# dynamic route swallows "feeding-status" / "bulk-feedings" and 422s on UUID
# parsing.

@router.get("/limits")
@policy("viewer")
async def get_animal_limits(
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Free-tier animal cap status for the caller — powers the "X / N" counter
    and proactive upgrade prompt. `limit` is -1 when premium (unlimited).
    Premium is APP-SCOPED — only an HV (or 'both') subscription counts here."""
    access = scope_collection(db, current_user, "herpetoverse", collection)
    is_premium = access.owner.is_premium_for_app("herpetoverse")
    current_count = active_animals_query(db, access.owner.id).count()
    limit = -1 if is_premium else HV_FREE_TIER_MAX_ANIMALS
    return {
        "limit": limit,
        "current_count": current_count,
        "is_premium": is_premium,
        "remaining": None if is_premium else max(0, limit - current_count),
        "at_limit": (not is_premium) and current_count >= limit,
    }


class LocationItem(BaseModel):
    name: str
    count: int


class RenameLocationRequest(BaseModel):
    old: str = Field(..., min_length=1, max_length=120)
    new: str = Field(..., min_length=1, max_length=120)


class RenameLocationResponse(BaseModel):
    moved: int
    # The spelling everything now sits under — the target's EXISTING spelling
    # when the rename merged into a place already on file.
    name: Optional[str] = None


class BulkLocationRequest(BaseModel):
    """Set (or clear, with null) one location across many animals. Mirrors
    /inverts/bulk-location minus colonies, which Herpetoverse doesn't have."""
    location: Optional[str] = Field(None, max_length=120)
    animal_ids: List[UUID] = Field(default_factory=list)


class BulkLocationResponse(BaseModel):
    updated: int
    # The canonical spelling that was stored (None when clearing).
    location: Optional[str] = None


@router.get("/locations", response_model=List[LocationItem])
@policy("viewer")
async def get_locations(
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every location this keeper has on file for Herpetoverse animals, with
    how many living animals sit there. Empty for a keeper who has never set
    one — and the clients hide the whole feature on an empty list, so nothing
    changes for anyone who doesn't use it. Tarantuverse locations are a
    separate list (/inverts/locations)."""
    access = scope_collection(db, current_user, "herpetoverse", collection)
    return [LocationItem(**e) for e in list_locations(db, access.owner.id, SCOPE_HERPETOVERSE)]


@router.post("/locations/rename", response_model=RenameLocationResponse)
@policy("keeper")
async def rename_location_endpoint(
    payload: RenameLocationRequest,
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename one location everywhere it's used. Renaming onto a name that
    already exists MERGES the two groups under the existing spelling — the
    escape hatch when a keeper ends up with "Rack 1" and "Rack #1"."""
    access = scope_collection(db, current_user, "herpetoverse", collection, need="keeper")
    target = canonical_location(db, access.owner.id, payload.new, SCOPE_HERPETOVERSE)
    if target is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Give the location a name.")
    moved = rename_location(db, access.owner.id, payload.old, payload.new, SCOPE_HERPETOVERSE)
    db.commit()
    return RenameLocationResponse(moved=moved, name=target)


@router.post("/bulk-location", response_model=BulkLocationResponse)
@policy("keeper")
async def bulk_set_location(
    payload: BulkLocationRequest,
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply one location to many animals at once. Scoped to the caller's
    own living, untransferred animals; deceased and transferred records keep
    whatever they had, since they no longer live anywhere."""
    if not payload.animal_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose which animals to apply this to.")

    access = scope_collection(db, current_user, "herpetoverse", collection, need="keeper")
    target = canonical_location(db, access.owner.id, payload.location, SCOPE_HERPETOVERSE)

    updated = 0
    for a in active_animals_query(db, access.owner.id).filter(Animal.id.in_(payload.animal_ids)).all():
        a.location = target
        updated += 1

    db.commit()
    return BulkLocationResponse(updated=updated, location=target)


@router.get("/feeding-status", response_model=List[AnimalFeedingStatusItem])
@policy("viewer")
async def list_feeding_status(
    tz_offset_minutes: Optional[int] = Query(None),
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Feeding status for every animal the caller owns — powers HV Feeding Day.

    One grouped query for the last ACCEPTED feeding per animal (no N+1),
    herp_species eager-loaded for the cadence resolver. `is_overdue` is
    species/schedule-aware and NEVER fires for paused animals or animals whose
    cadence can't be determined.
    """
    access = scope_collection(db, current_user, "herpetoverse", collection)
    # The shared "active" definition — which excludes died animals (ADR-015).
    # This inlined filter only excluded transfers, so a reptile marked died
    # kept appearing in Feeding Day, going redder every week.
    animals = (
        active_animals_query(db, access.owner.id)
        .options(selectinload(Animal.herp_species))
        .all()
    )
    if not animals:
        return []

    ids = [a.id for a in animals]
    rows = (
        db.query(FeedingLog.animal_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.animal_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.animal_id)
        .all()
    )
    last_by_id = {row[0]: row[1] for row in rows}

    now = datetime.now(timezone.utc)
    today_local = (
        (now + timedelta(minutes=-(tz_offset_minutes or 0))).date()
        if tz_offset_minutes is not None
        else now.date()
    )

    items: List[AnimalFeedingStatusItem] = []
    for a in animals:
        last = last_by_id.get(a.id)
        days = _calendar_day_diff(now, last, tz_offset_minutes) if last else None
        paused = bool(
            a.feeding_paused_reason
            and (a.feeding_paused_until is None or a.feeding_paused_until >= today_local)
        )
        interval = _animal_feeding_interval(a)
        # Never-fed is NOT overdue (no cadence established yet) — matches
        # /inverts/feeding-status + the digest so the dashboard, Feeding Day,
        # and the notification all agree.
        is_overdue = (
            (not paused)
            and interval is not None
            and last is not None
            and days is not None
            and days >= interval
        )
        # Cadence-aware presentation: a frequent feeder (fed daily or more —
        # interval <= 1 day) uses a fed-today check, not a days-since/overdue
        # badge that would sit red every morning. Everything else keeps the
        # discrete-feeder treatment.
        status_mode = "daily" if (interval is not None and interval <= 1) else "interval"
        fed_today = days == 0

        items.append(
            AnimalFeedingStatusItem(
                id=a.id,
                name=a.name,
                common_name=a.common_name,
                scientific_name=a.scientific_name,
                taxon=a.taxon,
                photo_url=a.photo_url,
                location=a.location,
                last_feeding_date=last,
                days_since_last_feeding=days,
                is_feeding_paused=paused,
                is_overdue=is_overdue,
                interval_days=interval,
                feeds_on_cgd=bool(getattr(a, "feeds_on_cgd", False)),
                status_mode=status_mode,
                fed_today=fed_today,
            )
        )

    # Never-fed first, then longest-since-fed — the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items


@router.post(
    "/bulk-feedings",
    response_model=AnimalBulkFeedingResult,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def bulk_create_animal_feedings(
    payload: AnimalBulkFeedingRequest,
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log one feeding event across many owned animals at once (Feeding Day).

    Same fed_at / accepted / food_type / notes applied to each. Unowned ids are
    skipped (reported), never fatal. On an accepted batch, the denormalized
    `animals.last_fed_at` is bumped so collection cards + status refresh.
    """
    requested = list(dict.fromkeys(payload.animal_ids))
    # Full rows, not just ids — an accepted feeding resumes a paused animal.
    access = scope_collection(db, current_user, "herpetoverse", collection, need="logger")
    owned = (
        db.query(Animal)
        .filter(Animal.id.in_(requested), Animal.user_id == access.owner.id)
        .all()
    )
    owned_by_id = {a.id: a for a in owned}
    owned_ids = set(owned_by_id)
    fed_at = payload.fed_at or datetime.now(timezone.utc)

    created_ids = []
    skipped = []
    resumed_ids = []
    for aid in requested:
        if aid not in owned_ids:
            skipped.append(AnimalBulkFeedingSkip(animal_id=aid, reason="Not found or not yours"))
            continue
        db.add(
            FeedingLog(
                animal_id=aid,
                logged_by_user_id=access.logged_by_user_id,
                fed_at=fed_at,
                food_type=payload.food_type,
                food_size=payload.food_size,
                quantity=payload.quantity,
                accepted=payload.accepted,
                notes=payload.notes,
            )
        )
        created_ids.append(aid)
        # Taking food ends a pause; refusing confirms it. See utils/feeding_pause.
        if resume_if_accepted(owned_by_id[aid], payload.accepted):
            resumed_ids.append(aid)

    if payload.accepted and created_ids:
        db.query(Animal).filter(Animal.id.in_(created_ids)).update(
            {Animal.last_fed_at: fed_at}, synchronize_session=False
        )

    db.commit()
    return AnimalBulkFeedingResult(
        created_count=len(created_ids),
        created_ids=created_ids,
        skipped=skipped,
        resumed_ids=resumed_ids,
    )


@router.get("/{animal_id}", response_model=AnimalResponse)
@policy("viewer")
async def get_animal(
    animal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch one animal by id (owner, or a co-keeper viewer and up)."""
    animal, _access = load_animal(db, current_user, animal_id, "viewer")
    return animal


@router.put("/{animal_id}", response_model=AnimalResponse)
@policy("keeper")
async def update_animal(
    animal_id: UUID,
    animal_data: AnimalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partial update. Only provided fields are written. `taxon` is
    immutable — it's not in the update schema."""
    animal, access = load_animal(db, current_user, animal_id, "keeper")

    update_data = _coerce_enums(strip_owner_only(access, animal_data.model_dump(exclude_unset=True)))
    if "enclosure_id" in update_data:
        require_own_enclosure(db, update_data["enclosure_id"], access.owner)
    if "location" in update_data:
        update_data["location"] = canonical_location(
            db, access.owner.id, update_data["location"], SCOPE_HERPETOVERSE
        )
    for field, value in update_data.items():
        setattr(animal, field, value)

    db.commit()
    db.refresh(animal)
    return animal


class BulkCadenceRequest(BaseModel):
    """ADR-017 Phase 3 — one cadence across many animals.

    `feeding_interval_days = None` clears the override, so a keeper who applied
    a cadence collection-wide has the same reach to undo it.
    """

    feeding_interval_days: Optional[int] = Field(None, ge=1, le=365)
    # Explicit rather than inferred from an empty id list — reaching everything
    # someone owns should be stated, not implied by an omission.
    apply_to_all: bool = False
    animal_ids: Optional[List[UUID]] = None


class BulkCadenceResponse(BaseModel):
    updated: int


@router.post("/bulk-feeding-cadence", response_model=BulkCadenceResponse)
@policy("keeper")
async def bulk_set_feeding_cadence(
    payload: BulkCadenceRequest,
    collection: Optional[UUID] = Query(None, description="Owner's user id for a collection shared with you."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply one feeding cadence to many animals at once.

    Mirrors /inverts/bulk-feeding-cadence. Scoped to the caller's living,
    untransferred animals; deceased and transferred records are excluded
    because they have no cadence and sweeping them up would edit history.
    """
    if not payload.apply_to_all and not payload.animal_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose which animals to apply this to.",
        )

    access = scope_collection(db, current_user, "herpetoverse", collection, need="keeper")
    query = active_animals_query(db, access.owner.id)
    if not payload.apply_to_all:
        query = query.filter(Animal.id.in_(payload.animal_ids or []))

    targets = query.all()
    for a in targets:
        a.feeding_interval_days = payload.feeding_interval_days

    db.commit()
    return BulkCadenceResponse(updated=len(targets))


@router.delete("/{animal_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("owner_only")
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

    _photo_files = collect_for_animal(db, animal_id)
    db.query(ShedLog).filter(ShedLog.animal_id == animal_id).delete()
    db.query(WeightLog).filter(WeightLog.animal_id == animal_id).delete()
    db.query(AnimalGenotype).filter(AnimalGenotype.animal_id == animal_id).delete()
    db.query(Photo).filter(Photo.animal_id == animal_id).delete()
    # QRUploadSession + feeding_logs have ON DELETE CASCADE in their FK
    # definitions, so we skip them.

    db.delete(animal)
    db.commit()
    # Photo FILES don't cascade with the rows (R2) — remove them now the
    # delete is committed. Best-effort; see utils/photo_cleanup.
    await delete_files(db, _photo_files)
    return None


# --- Death (ADR-015) --------------------------------------------------------
#
# Mirrors the TV endpoints. HV animals have no consolidation twin, so there's
# nothing to keep in step.


@router.post("/{animal_id}/died", response_model=AnimalResponse)
@policy("keeper")
async def mark_animal_died(
    animal_id: UUID,
    payload: MarkDiedRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record that an animal died. Keeps the record and every log intact.

    Drops out of the collection list, the free-tier count, feeding status,
    Feeding Day and the daily digest — nothing is deleted.
    """
    animal, _access = load_animal(db, current_user, animal_id, "keeper")

    animal.died_at = payload.died_at or date.today()
    animal.death_cause = payload.death_cause
    animal.death_notes = payload.death_notes

    # A dead animal isn't "off food" — it's gone. A lingering pause would keep
    # a husbandry judgment attached to a record it can no longer describe.
    animal.feeding_paused_reason = None
    animal.feeding_paused_until = None

    db.commit()
    db.refresh(animal)
    return animal


@router.post("/{animal_id}/revive", response_model=AnimalResponse)
@policy("keeper")
async def revive_animal(
    animal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo a mark-as-died.

    Deliberately not blocked when it would push a free-tier keeper back over
    the cap: refusing to let someone correct a mistake because of a billing
    limit would be indefensible.
    """
    animal, _access = load_animal(db, current_user, animal_id, "keeper")

    animal.died_at = None
    animal.death_cause = None
    animal.death_notes = None

    db.commit()
    db.refresh(animal)
    return animal
