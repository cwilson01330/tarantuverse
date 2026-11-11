"""
Feeding log routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from datetime import date, datetime, timedelta, timezone

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.animal import Animal
from app.models.scorpion import Scorpion
from app.models.invert import Invert
from app.models.feeding_log import FeedingLog
from app.schemas.feeding import (
    FeedingLogCreate,
    FeedingLogUpdate,
    FeedingLogResponse,
    BulkFeedingRequest,
    BulkFeedingResult,
    BulkFeedingSkip,
    ReminderActionRequest,
    ReminderActionResponse,
)
from app.schemas.feeding_reminder import FeedingReminderSummary
from app.utils.dependencies import get_current_user
from app.utils.access import (
    access_helper,
    invert_log_fields,
    load_animal,
    load_colony,
    load_invert,
    load_log_parent,
    policy,
    require_can_change,
    scope_collection,
)
from app.utils.feeding_pause import resume_if_accepted, today_for_offset
from app.utils.rate_limit import limiter, user_or_ip
from app.models.notification_preferences import NotificationPreferences
from app.services.reminder_pushes import animal_title
from app.services.activity_service import create_activity
from app.services.feeding_reminder_service import get_user_feeding_reminders
# ADR-005 Phase A2 — opportunistically populate invert_id on new logs.
from app.services.inverts_dualwrite import invert_id_if_exists
from app.utils.legacy_logs import tarantula_logs
from app.routers.animals import refuse_if_closed
from app.utils.closed_animals import (
    refuse_if_closed_invert,
    refuse_if_closed_legacy,
    skip_reason,
)

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/feedings", response_model=List[FeedingLogResponse])
@policy("owner_only")
async def get_feeding_logs(
    tarantula_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all feeding logs for a tarantula"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Get feeding logs ordered by date (most recent first)
    feedings = db.query(FeedingLog).filter(
        tarantula_logs(FeedingLog, tarantula_id)
    ).order_by(FeedingLog.fed_at.desc()).all()

    return feedings


@router.post("/tarantulas/{tarantula_id}/feedings", response_model=FeedingLogResponse, status_code=status.HTTP_201_CREATED)
@policy("owner_only")
async def create_feeding_log(
    tarantula_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new feeding log"""
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")
    refuse_if_closed_legacy(db, tarantula)  # no new logs on a died / transferred animal

    # Create feeding log. invert_id is set if the corresponding Invert
    # row exists (which it does for any tarantula created post-A2 or
    # once backfill in Phase B runs); kept NULL otherwise so the FK
    # constraint doesn't fail on pre-A2 parents.
    new_feeding = FeedingLog(
        tarantula_id=tarantula_id,
        invert_id=invert_id_if_exists(db, tarantula_id),
        **feeding_data.model_dump()
    )

    # Taking food ends a pause; a refusal confirms it. Applied on the single-
    # feeding path too, not just Feeding Day — otherwise which screen you
    # happened to use would decide whether the pause survived.
    resume_if_accepted(tarantula, feeding_data.accepted, db)

    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    
    # Create activity feed entry
    await create_activity(
        db=db,
        user_id=current_user.id,
        action_type="feeding",
        target_type="tarantula",
        target_id=tarantula_id,
        metadata={
            "tarantula_name": tarantula.name,
            "species_name": tarantula.common_name or tarantula.scientific_name,
            "thumbnail_url": tarantula.photo_url,
            "tarantula_id": str(tarantula.id),
            "food_type": feeding_data.food_type,
            "accepted": feeding_data.accepted,
        }
    )

    return new_feeding


@router.get("/animals/{animal_id}/feedings", response_model=List[FeedingLogResponse])
@policy("viewer")
async def get_animal_feeding_logs(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for an HV animal (any taxon), most recent first.

    ADR-003 collapsed the per-taxon snake/lizard feeding routes into this
    single taxon-agnostic endpoint. Co-keepers: viewer and up.
    """
    load_animal(db, current_user, animal_id, "viewer")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.animal_id == animal_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/animals/{animal_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_animal_feeding_log(
    animal_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for an HV animal (any taxon).

    Denormalizes `animals.last_fed_at` forward-only so the dashboard
    "X days since fed" badge doesn't rescan history on every render —
    backfilling an old feeding doesn't regress the badge.

    Note: `prey_weight_g` is meaningful mainly for whole-prey feeders
    (snakes); insect-fed taxa leave it null. Recording prey count or
    feeder species would be a feeding_log schema extension, not a
    column repurposing.

    Activity feed emission for HV taxa is deferred until the feed has
    herp icons — tarantula feedings still emit via create_activity.
    """
    animal, access = load_animal(db, current_user, animal_id, "logger")
    # A died or transferred animal's record is history: no new logs. Editing
    # or deleting an existing entry stays open (TV parity, tests/test_hv_closed_logs.py).
    refuse_if_closed(animal)

    new_feeding = FeedingLog(
        animal_id=animal_id,
        logged_by_user_id=access.logged_by_user_id,
        **feeding_data.model_dump(),
    )
    # Taking food ends a pause; a refusal confirms it. See utils/feeding_pause.
    resume_if_accepted(animal, feeding_data.accepted)
    db.add(new_feeding)

    # Forward-only denormalization.
    fed_at = new_feeding.fed_at
    if fed_at and (animal.last_fed_at is None or fed_at > animal.last_fed_at):
        animal.last_fed_at = fed_at

    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.post(
    "/animals/{animal_id}/quick-feed",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def quick_feed_animal(
    animal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One-tap "Fed" — log an accepted feeding NOW, reusing the animal's last
    meal (food type/size) so the keeper doesn't re-enter anything. This is the
    low-friction path for frequent feeders (e.g. an insectivorous beardie fed
    daily); precise details can still be edited on the log afterward.
    """
    animal, access = load_animal(db, current_user, animal_id, "logger")
    refuse_if_closed(animal)  # no new logs on a died / transferred animal

    # Remember the last meal (most recent feeding of any outcome).
    last = (
        db.query(FeedingLog)
        .filter(FeedingLog.animal_id == animal_id)
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )

    now = datetime.utcnow()
    new_feeding = FeedingLog(
        animal_id=animal_id,
        fed_at=now,
        accepted=True,
        food_type=last.food_type if last else None,
        food_size=last.food_size if last else None,
        logged_by_user_id=access.logged_by_user_id,
    )
    # Quick-feed is accepted by definition, so it always ends a pause.
    resume_if_accepted(animal, True)
    db.add(new_feeding)

    # last_fed_at may come back tz-aware from the DB while `now` is naive —
    # normalize before comparing to avoid a naive/aware TypeError.
    prev_fed = animal.last_fed_at
    if prev_fed is not None and prev_fed.tzinfo is not None:
        prev_fed = prev_fed.replace(tzinfo=None)
    if prev_fed is None or now > prev_fed:
        animal.last_fed_at = now

    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.get("/scorpions/{scorpion_id}/feedings", response_model=List[FeedingLogResponse])
@policy("owner_only")
async def get_scorpion_feeding_logs(
    scorpion_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for a scorpion, most recent first."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()

    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.scorpion_id == scorpion_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/scorpions/{scorpion_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_scorpion_feeding_log(
    scorpion_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a scorpion.

    Mirrors the tarantula path — single CASCADE parent, no enclosure
    fanout (colonies still log per-scorpion). Activity feed emission
    is deferred until scorpion activity icons land alongside the
    Phase 3 mobile work.
    """
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()

    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")
    refuse_if_closed_legacy(db, scorpion)

    # ADR-005 A2 — also set invert_id when the corresponding row exists.
    new_feeding = FeedingLog(
        scorpion_id=scorpion_id,
        invert_id=invert_id_if_exists(db, scorpion_id),
        **feeding_data.model_dump(),
    )
    # Taking food ends a pause; a refusal confirms it. This path was the only
    # feeding route that never cleared one, so a paused scorpion stayed paused
    # after eating — and stayed exempt from overdue detection, which is the
    # blind spot utils/feeding_pause exists to close.
    resume_if_accepted(scorpion, feeding_data.accepted, db)

    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.get("/centipedes/{centipede_id}/feedings", response_model=List[FeedingLogResponse])
@policy("owner_only")
async def get_centipede_feeding_logs(
    centipede_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for a centipede, most recent first.

    Centipede logs are parented ONLY by `invert_id` — there is no
    `centipede_id` column on `feeding_logs`. The widened CHECK
    constraint in cip_20260527 allows this shape.
    """
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.invert_id == centipede_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/centipedes/{centipede_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_centipede_feeding_log(
    centipede_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a centipede.

    Sets ONLY `invert_id` on the FeedingLog row. The CHECK constraint
    permits this via the "invert-only" branch widened in cip_20260527.
    Activity feed emission is deferred until centipede activity icons
    land alongside the next mobile bundle.
    """
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")
    refuse_if_closed_invert(centipede)

    new_feeding = FeedingLog(
        invert_id=centipede_id,
        **feeding_data.model_dump(),
    )
    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.get("/whip-spiders/{whip_spider_id}/feedings", response_model=List[FeedingLogResponse])
@policy("owner_only")
async def get_whip_spider_feeding_logs(
    whip_spider_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for a whip spider, most recent first.

    Whip spider logs are parented ONLY by `invert_id` (ADR-006 taxon on
    the consolidated surface — no per-taxon FK column).
    """
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")

    return (
        db.query(FeedingLog)
        .filter(FeedingLog.invert_id == whip_spider_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/whip-spiders/{whip_spider_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_whip_spider_feeding_log(
    whip_spider_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a whip spider. Sets ONLY `invert_id`."""
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")
    refuse_if_closed_invert(whip_spider)

    new_feeding = FeedingLog(
        invert_id=whip_spider_id,
        **feeding_data.model_dump(),
    )
    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    return new_feeding


# ---------------------------------------------------------------------------
# Generic invert log endpoints (ADR-007). Taxon-agnostic — they only verify
# the invert belongs to the caller, so ANY taxon on the unified surface works
# with no per-taxon route. The generic frontend uses these for every taxon.
# ---------------------------------------------------------------------------

@router.get("/inverts/{invert_id}/feedings", response_model=List[FeedingLogResponse])
@policy("viewer")
async def get_invert_feeding_logs(
    invert_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feeding logs for an invert the caller can see (owner or co-keeper)."""
    load_invert(db, current_user, invert_id, "viewer")
    return (
        db.query(FeedingLog)
        .filter(FeedingLog.invert_id == invert_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/inverts/{invert_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_invert_feeding_log(
    invert_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for an invert (owner, or a co-keeper logger and up).

    Also sets the tarantula twin FK when there is one, so the entry shows on
    the legacy tarantula screens (utils/access.invert_log_fields).
    """
    invert, access = load_invert(db, current_user, invert_id, "logger")
    refuse_if_closed_invert(invert)  # no new logs on a died / transferred animal
    new_feeding = _create_invert_feeding(db, invert, feeding_data, access)
    db.commit()
    db.refresh(new_feeding)
    return new_feeding


def _create_invert_feeding(
    db: Session,
    invert: Invert,
    data: FeedingLogCreate,
    access,
    reminder_date: Optional[date] = None,
) -> FeedingLog:
    """One invert feeding, the way POST /inverts/{id}/feedings makes it: closed
    animals refused (409), the tarantula twin FK, co-keeper attribution, pause
    cleared by an accepted meal. Adds and flushes; the caller commits.

    `access` is the caller's `utils.access.Access` for this invert (it decides
    `logged_by_user_id`). `reminder_date` marks a log made from a reminder
    button (unique per animal + day, see uq_feeding_logs_reminder).
    """
    refuse_if_closed_invert(invert)  # also here, so no caller can skip it
    new_feeding = FeedingLog(
        **invert_log_fields(db, invert),
        logged_by_user_id=access.logged_by_user_id,
        reminder_date=reminder_date,
        **data.model_dump(),
    )
    # Taking food ends a pause; a refusal confirms it. Applied on the single-
    # feeding path too, not just Feeding Day — otherwise which screen you
    # happened to use would decide whether the pause survived.
    resume_if_accepted(invert, data.accepted, db)
    db.add(new_feeding)
    db.flush()
    return new_feeding


REMINDER_NOTE = "Logged from reminder"
ALREADY_LOGGED = "Already logged from this reminder"


def _reminder_feeding(db: Session, invert_id: uuid.UUID, reminder_date: date) -> Optional[FeedingLog]:
    """The log a reminder for this animal + day already made, if any."""
    return (
        db.query(FeedingLog)
        .filter(FeedingLog.invert_id == invert_id, FeedingLog.reminder_date == reminder_date)
        .first()
    )


def _owner_today(db: Session, owner_id: uuid.UUID) -> date:
    """The collection owner's local today — the digest that sent the reminder
    runs on the owner's clock (notification_preferences.tz_offset_minutes)."""
    tz = (
        db.query(NotificationPreferences.tz_offset_minutes)
        .filter(NotificationPreferences.user_id == owner_id)
        .scalar()
    )
    return today_for_offset(tz)


@router.post(
    "/inverts/{invert_id}/reminder-action",
    response_model=ReminderActionResponse,
)
@limiter.limit("60/hour", key_func=user_or_ip)
@policy("logger")
async def invert_reminder_action(
    request: Request,
    invert_id: uuid.UUID,
    payload: ReminderActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fed / Refused / Tomorrow from a per-animal feeding reminder.

    fed / refused log a feeding through `_create_invert_feeding` (food copied
    from the latest accepted meal, notes "Logged from reminder", fed now). One
    reminder logs one outcome: a later tap — a second phone, or Refused after
    Fed — returns the first log with created=False. The unique partial index
    on (invert_id, reminder_date) settles a race between two phones.

    tomorrow sets `reminder_snoozed_until` to the owner's local today + 1. It is
    not a feeding pause (due status is unchanged) and never creates a log.

    Closed (died / transferred) animals: 409 for every action.
    """
    invert, access = load_invert(db, current_user, invert_id, "logger")
    refuse_if_closed_invert(invert)
    name = animal_title(invert)

    if payload.action == "tomorrow":
        invert.reminder_snoozed_until = _owner_today(db, invert.user_id) + timedelta(days=1)
        db.commit()
        return ReminderActionResponse(
            action="tomorrow", created=False, animal_name=name, message="We'll remind you tomorrow"
        )

    def already(existing_log: Optional[FeedingLog]) -> ReminderActionResponse:
        # Say what was actually recorded, not what this tap asked for.
        accepted_flag = getattr(existing_log, "accepted", None)
        if accepted_flag is True:
            message = f"Already logged: {name} ate"
        elif accepted_flag is False:
            message = f"Already logged: {name} refused"
        else:
            message = ALREADY_LOGGED
        return ReminderActionResponse(
            action=payload.action, created=False, animal_name=name, message=message
        )

    existing = _reminder_feeding(db, invert.id, payload.reminder_date)
    if existing is not None:
        return already(existing)

    last_meal = (
        db.query(FeedingLog.food_type, FeedingLog.food_size)
        .filter(tarantula_logs(FeedingLog, invert.id), FeedingLog.accepted.is_(True))
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )
    accepted = payload.action == "fed"
    data = FeedingLogCreate(
        fed_at=datetime.now(timezone.utc),
        food_type=last_meal[0] if last_meal else None,
        food_size=last_meal[1] if last_meal else None,
        accepted=accepted,
        notes=REMINDER_NOTE,
    )
    savepoint = db.begin_nested()
    try:
        _create_invert_feeding(db, invert, data, access, reminder_date=payload.reminder_date)
        savepoint.commit()
    except IntegrityError:
        # Another tap won between our check and our insert.
        savepoint.rollback()
        existing = _reminder_feeding(db, invert.id, payload.reminder_date)
        if existing is None:
            raise
        return already(existing)
    db.commit()
    return ReminderActionResponse(
        action=payload.action,
        created=True,
        animal_name=name,
        message=f"Logged: {name} ate" if accepted else f"Logged: {name} refused",
    )


@router.get("/colonies/{colony_id}/feedings", response_model=List[FeedingLogResponse])
@policy("viewer")
async def get_colony_feeding_logs(
    colony_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List feedings for a colony the caller can see, newest first."""
    load_colony(db, current_user, colony_id, "viewer")
    return (
        db.query(FeedingLog)
        .filter(FeedingLog.colony_id == colony_id)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )


@router.post(
    "/colonies/{colony_id}/feedings",
    response_model=FeedingLogResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def create_colony_feeding_log(
    colony_id: uuid.UUID,
    feeding_data: FeedingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a feeding for a colony the caller owns. Sets only colony_id.

    ONE LOG PER FEEDING EVENT, not one per animal. A communal is fed as a unit:
    the keeper drops in prey and the group takes it. Splitting that into
    per-animal rows would invent data nobody observed — you don't know which
    spider ate which cricket.

    That also means `accepted` means something slightly different here: for an
    individual it's "did this animal take it", for a colony it's "did the group
    take it". Refusal across a whole communal is a real and meaningful signal
    (often pre-molt or a husbandry problem), which is why the field is kept
    rather than dropped.
    """
    colony, access = load_colony(db, current_user, colony_id, "logger")
    new_feeding = FeedingLog(
        colony_id=colony_id,
        logged_by_user_id=access.logged_by_user_id,
        **feeding_data.model_dump(),
    )
    db.add(new_feeding)
    db.commit()
    db.refresh(new_feeding)
    return new_feeding


@router.post(
    "/inverts/bulk-feedings",
    response_model=BulkFeedingResult,
    status_code=status.HTTP_201_CREATED,
)
@policy("logger")
async def bulk_create_invert_feedings(
    payload: BulkFeedingRequest,
    collection: Optional[uuid.UUID] = Query(None, description="Owner's user id when logging in a shared collection"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log one feeding event across many owned inverts at once (Feeding Day).

    The same fed_at / accepted / food_type / food_size / notes is applied to
    each animal. Ids the caller doesn't own, and died / transferred animals
    (utils/closed_animals), are skipped (reported in `skipped`), never fatal.
    All writes commit together.

    An ACCEPTED feeding also resumes any animal that was paused, reported in
    `resumed_ids` so the client can say so rather than silently changing state.
    A refusal leaves the pause alone: an animal declining food while paused for
    premolt is confirming the pause, not ending it.
    """
    # De-dupe while preserving the caller's order.
    requested = list(dict.fromkeys(payload.invert_ids))
    # Load the rows, not just the ids — an accepted feeding resumes a paused
    # animal, and that needs the ORM objects.
    access = scope_collection(db, current_user, "tarantuverse", collection, need="logger")
    owned = (
        db.query(Invert)
        .filter(Invert.id.in_(requested), Invert.user_id == access.owner.id)
        .all()
    )
    owned_by_id = {inv.id: inv for inv in owned}
    owned_ids = set(owned_by_id)
    fed_at = payload.fed_at or datetime.now(timezone.utc)

    created_ids = []
    skipped = []
    resumed_ids = []
    for iid in requested:
        if iid not in owned_ids:
            skipped.append(BulkFeedingSkip(invert_id=iid, reason="Not found or not yours"))
            continue
        # A died / transferred animal takes no new logs — skipped and
        # reported, never fatal to the rest of the batch (stale tab).
        closed = skip_reason(owned_by_id[iid])
        if closed:
            skipped.append(BulkFeedingSkip(invert_id=iid, reason=closed))
            continue
        db.add(
            FeedingLog(
                **invert_log_fields(db, owned_by_id[iid]),
                logged_by_user_id=access.logged_by_user_id,
                fed_at=fed_at,
                food_type=payload.food_type,
                food_size=payload.food_size,
                quantity=payload.quantity,
                accepted=payload.accepted,
                notes=payload.notes,
            )
        )
        created_ids.append(iid)
        # Taking food ends a pause. A refusal doesn't — see utils/feeding_pause.
        if resume_if_accepted(owned_by_id[iid], payload.accepted, db):
            resumed_ids.append(iid)

    db.commit()
    return BulkFeedingResult(
        created_count=len(created_ids),
        created_ids=created_ids,
        skipped=skipped,
        resumed_ids=resumed_ids,
    )


@access_helper
def _feeding_for(db: Session, user: User, feeding_id: uuid.UUID, need: str):
    """The feeding row plus the caller's access to its parent, or 404.

    Replaces _feeding_owner_taxon for the by-id routes: 404 (not 403) for
    someone else's entry, and colony feedings now resolve too.
    """
    feeding = db.query(FeedingLog).filter(FeedingLog.id == feeding_id).first()
    _parent, access = load_log_parent(db, user, feeding, need, not_found="Feeding log not found")
    return feeding, access


@router.get("/feedings/{feeding_id}", response_model=FeedingLogResponse)
@policy("viewer")
async def get_feeding_log(
    feeding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read a single feeding log (polymorphic — tarantula, snake, or lizard).

    Powers edit forms on web + mobile so the form can pre-fill from a
    deep link without first fetching the parent's whole history list.
    Access goes through utils/access (owner, or a co-keeper viewer and up),
    the same gate as update + delete.
    """
    feeding, _access = _feeding_for(db, current_user, feeding_id, "viewer")
    return feeding


@router.put("/feedings/{feeding_id}", response_model=FeedingLogResponse)
@policy("logger")
async def update_feeding_log(
    feeding_id: uuid.UUID,
    feeding_data: FeedingLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a feeding log (polymorphic — tarantula, snake, or lizard parent)."""
    feeding, access = _feeding_for(db, current_user, feeding_id, "logger")
    require_can_change(access, feeding)

    update_data = feeding_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(feeding, field, value)

    db.commit()
    db.refresh(feeding)

    return feeding


@router.delete("/feedings/{feeding_id}", status_code=status.HTTP_204_NO_CONTENT)
@policy("logger")
async def delete_feeding_log(
    feeding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a feeding log (polymorphic — tarantula, snake, or lizard parent).

    Does NOT recompute denormalized `last_fed_at` on the parent — matches
    the `sheds.py` pattern: the denorm column is a dashboard hint, not
    authoritative. A full recompute would need a history scan.
    """
    feeding, access = _feeding_for(db, current_user, feeding_id, "logger")
    require_can_change(access, feeding)

    db.delete(feeding)
    db.commit()

    return None


@router.get("/feeding-reminders/", response_model=FeedingReminderSummary)
@policy("viewer")
async def get_feeding_reminders(
    collection: Optional[uuid.UUID] = Query(None, description="Owner's user id to read a shared collection"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get feeding reminders for all of the user's tarantulas.

    Calculates recommended feeding intervals based on species data and life stage,
    returns status for each tarantula (overdue, due today, due soon, on track, never fed).
    """
    access = scope_collection(db, current_user, "tarantuverse", collection)
    return get_user_feeding_reminders(access.owner.id, db)
