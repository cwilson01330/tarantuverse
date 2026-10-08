"""
Sitter passes — PRD-shared-keeping.
  Phase 1 (rung 1): read-only link + care cards (free).
  Phase 2 (rung 2): the same link can log feedings back, behind a PIN (premium).

Two routers, deliberately separate:

  keeper_router  /api/v1/sitter-passes/*   — a logged-in keeper managing passes
  sitter_router  /api/v1/sitter/*          — the sitter, authenticated ONLY by a
                                             pass session (never a user token)

The sitter router is an allowlist, and this is the whole of it:
  POST   /exchange            link → read session
  GET    /pass                the feeding list
  POST   /unlock              PIN → write session (only if the keeper turned logging on)
  POST   /feedings            log a feeding or refusal (write session)
  DELETE /feedings/{id}       undo the sitter's OWN entry, within 60 minutes

A leaked link alone can still only read (T1): every write needs a session
unlocked with the PIN, which the keeper shares separately, and 5 wrong PINs
lock the pass and tell the keeper (T4). Sitters only ADD; they can't edit or
delete anything they didn't create, and not even that after an hour (T8).
"""
# NOTE: no `from __future__ import annotations` here. slowapi's @limiter.limit
# wraps the endpoint, and FastAPI then can't resolve string annotations
# against this module — PassCreate etc. would be "not defined" at startup.
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from uuid import UUID

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.animal import Animal
from app.models.colony import Colony
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.notification import Notification
from app.models.sitter_pass import PASS_MAX_DAYS, KeeperPass, KeeperPassAnimal, SitterGuide
from app.models.user import User
from app.schemas.sitter_pass import (
    ExchangeRequest,
    PassCreate,
    PassCreated,
    PassSummary,
    PassUnlock,
    PassUpdate,
    PinUnlockRequest,
    SitterFeedingCreate,
    SitterGuideBody,
    SitterNoteUpdate,
)
from app.services import sitter_card as sc
from app.utils.dependencies import get_current_user
from app.utils.feeding_pause import is_feeding_paused
from app.utils.limits import active_animals_query, active_colonies_query, active_inverts_query
from app.utils.rate_limit import limiter
from app.utils.sitter_pass import (
    LOGGING_PAUSED,
    MAX_PIN_FAILURES,
    PIN_NEEDED,
    UNAVAILABLE,
    WeakPinError,
    create_pass_session,
    get_current_pass,
    get_current_pass_with_claims,
    get_logging_pass,
    hash_pass_token,
    hash_pin,
    new_pass_token,
    owner_is_active,
    pass_is_live,
    session_can_log,
    verify_pin,
)

logger = logging.getLogger(__name__)

keeper_router = APIRouter()
sitter_router = APIRouter()

FREE_ACTIVE_PASS_LIMIT = 2          # decided 2026-09-28
MAX_START_AHEAD = timedelta(days=90)
FEEDING_LOOKBACK = timedelta(days=365)
KINDS_BY_APP = {"tarantuverse": {"invert", "colony"}, "herpetoverse": {"animal"}}

# Rung 2 limits (PRD-shared-keeping).
UNDO_WINDOW = timedelta(minutes=60)
PASS_WRITES_PER_HOUR = 60            # well above any real feeding round
DOUBLE_TAP_WINDOW = timedelta(seconds=60)
SITTER_LOG_LOOKBACK = timedelta(days=2)   # what the sitter sees of their own entries
NOTIFY_COALESCE = timedelta(hours=2)      # at most one "sitter is logging" push per round


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _status(p: KeeperPass, now: datetime) -> str:
    if p.revoked_at is not None:
        return "revoked"
    if now >= p.expires_at:
        return "expired"
    if p.locked_at is not None:
        return "locked"
    if now < p.starts_at:
        return "scheduled"
    return "active"


def _summary(p: KeeperPass, now: Optional[datetime] = None, log_count: int = 0) -> PassSummary:
    now = now or _now()
    return PassSummary(
        id=p.id, app=p.app, label=p.label, token_prefix=p.token_prefix,
        status=_status(p, now), starts_at=p.starts_at, expires_at=p.expires_at,
        revoked_at=p.revoked_at, animal_count=len(p.animals), open_count=p.open_count or 0,
        last_used_at=p.last_used_at, created_at=p.created_at,
        can_log=bool(p.can_log), has_pin=bool(p.pin_hash), log_count=log_count,
    )


def _log_counts(db: Session, pass_ids: List[UUID]) -> Dict[UUID, int]:
    if not pass_ids:
        return {}
    rows = (
        db.query(FeedingLog.logged_via_pass_id, func.count(FeedingLog.id))
        .filter(FeedingLog.logged_via_pass_id.in_(pass_ids))
        .group_by(FeedingLog.logged_via_pass_id)
        .all()
    )
    return {pid: n for pid, n in rows}


async def _pin_hash_or_422(pin: Optional[str]) -> str:
    # bcrypt is ~250 ms of CPU on purpose. Run it off the event loop so one
    # keeper saving a PIN doesn't stall every other request on the worker.
    try:
        return await run_in_threadpool(hash_pin, pin or "")
    except WeakPinError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


def _require_logging_premium(user: User, app: str) -> None:
    """Turning logging ON is the premium action (`can_use_sitter_logging`).

    Checked when logging is ENABLED, never when a sitter writes: the welfare
    rule (T12) says a pass set up under premium keeps logging until it
    expires, even if the subscription lapses mid-trip. A lapse must never
    strand a sitter halfway through someone's feeding round.
    """
    if user.is_premium_for_app(app):
        return
    raise HTTPException(
        status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "message": "Letting a sitter log feedings back is a premium feature. "
                       "The feeding list itself stays free.",
            "is_premium": False,
            "source": "shared_keeping",
        },
    )


def _owned_pass(db: Session, pass_id: UUID, user: User) -> KeeperPass:
    p = (
        db.query(KeeperPass)
        .options(selectinload(KeeperPass.animals))
        .filter(KeeperPass.id == pass_id, KeeperPass.owner_user_id == user.id)
        .first()
    )
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pass not found")
    return p


def _keeper_name(user: Optional[User]) -> str:
    # Display name only — never fall back to the username. A forwarded link
    # would otherwise hand a stranger the keeper's platform identity (and so
    # their public profile and location) together with the dates they're away.
    if user is None:
        return "Your keeper"
    return (user.display_name or "").strip() or "Your keeper"


def _validate_window(starts_at: datetime, expires_at: datetime, now: datetime) -> None:
    if expires_at <= now:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The end date has to be in the future.")
    if expires_at <= starts_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The end has to be after the start.")
    if expires_at > starts_at + timedelta(days=PASS_MAX_DAYS):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"A pass can last at most {PASS_MAX_DAYS} days. Make a new one for a longer trip.",
        )
    if starts_at > now + MAX_START_AHEAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The start can be at most 90 days away.")


def _resolve_animals(db: Session, user: User, app: str, refs) -> List[KeeperPassAnimal]:
    """Every ref must be the caller's own ACTIVE animal, of a kind this app owns.

    Same 404 for "not yours" and "doesn't exist" — never confirm that someone
    else's animal id is real.
    """
    allowed = KINDS_BY_APP[app]
    ids: Dict[str, set] = {"invert": set(), "colony": set(), "animal": set()}
    for r in refs:
        if r.kind not in allowed:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                f"A {app} pass can't include a {r.kind}.")
        ids[r.kind].add(r.id)

    found = {
        "invert": {i.id for i in active_inverts_query(db, user.id).filter(Invert.id.in_(ids["invert"]))} if ids["invert"] else set(),
        "colony": {c.id for c in active_colonies_query(db, user.id).filter(Colony.id.in_(ids["colony"]))} if ids["colony"] else set(),
        "animal": {a.id for a in active_animals_query(db, user.id).filter(Animal.id.in_(ids["animal"]))} if ids["animal"] else set(),
    }
    for kind, wanted in ids.items():
        if wanted - found[kind]:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "One of those animals wasn't found.")

    rows, seen = [], set()
    for order, r in enumerate(refs):
        if (r.kind, r.id) in seen:
            continue
        seen.add((r.kind, r.id))
        rows.append(KeeperPassAnimal(**{f"{r.kind}_id": r.id}, sort_order=order))
    return rows


def _enforce_free_limit(db: Session, user: User, app: str, now: datetime) -> bool:
    """Returns whether the keeper is premium. Free keepers get 2 open passes."""
    premium = bool(user.is_premium_for_app(app))
    if premium:
        return True
    # Lock the keeper's row so two simultaneous creates can't both read
    # "1 open" and both insert — the lock is held until the create commits.
    db.query(User).filter(User.id == user.id).with_for_update().first()
    open_count = (
        db.query(KeeperPass)
        .filter(
            KeeperPass.owner_user_id == user.id,
            KeeperPass.app == app,
            KeeperPass.revoked_at.is_(None),
            KeeperPass.expires_at > now,
        )
        .count()
    )
    if open_count >= FREE_ACTIVE_PASS_LIMIT:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": (
                    f"The free plan allows {FREE_ACTIVE_PASS_LIMIT} sitter links at a time. "
                    "End one, or go premium for as many as you need."
                ),
                "current_count": open_count,
                "limit": FREE_ACTIVE_PASS_LIMIT,
                "is_premium": False,
                "source": "shared_keeping",
            },
        )
    return False


def _created(p: KeeperPass, raw: str) -> PassCreated:
    return PassCreated(**_summary(p).model_dump(), token=raw, share_path=f"/sit#{raw}")


# ── payload (shared by the sitter page and the keeper's preview) ─────────────

def _feedings_by_parent(db: Session, column, ids: List[UUID], now: datetime) -> Dict[UUID, list]:
    out: Dict[UUID, list] = {}
    if not ids:
        return out
    rows = (
        db.query(FeedingLog)
        .filter(column.in_(ids), FeedingLog.fed_at >= now - FEEDING_LOOKBACK)
        .order_by(FeedingLog.fed_at.desc())
        .all()
    )
    for f in rows:
        out.setdefault(getattr(f, column.key), []).append(f)
    return out


def _last_accepted(feedings: list) -> Optional[datetime]:
    for f in feedings:  # already newest-first
        if f.accepted:
            return f.fed_at
    return None


def _premolt_likely(db: Session, inv: Invert) -> bool:
    if inv.taxon != "tarantula":
        return False
    # Savepoint: on Postgres a failed query aborts the whole transaction, so a
    # swallowed error here would otherwise make every later query in the
    # payload builder fail — turning "no premolt signal" into a 500.
    savepoint = db.begin_nested()
    try:
        from app.services.premolt_service import predict_premolt
        likely = bool(predict_premolt(db, inv.id).get("is_premolt_likely"))
        savepoint.commit()
        return likely
    except Exception:
        # A prediction failure must never break the feeding list. No signal
        # is the honest fallback — the card simply won't claim premolt.
        savepoint.rollback()
        return False


def _prefill(feedings: list) -> Optional[dict]:
    """The animal's usual meal, from its last ACCEPTED feeding, so the sitter
    taps "Fed" rather than typing prey names they may not know."""
    for f in feedings:  # newest-first
        if f.accepted and (f.food_type or f.food_size):
            return {"food_type": f.food_type, "food_size": f.food_size}
    return None


def _sitter_entry(f: FeedingLog, now: datetime) -> dict:
    created = _aware(f.created_at) if f.created_at else None
    undo_until = created + UNDO_WINDOW if created else None
    return {
        "id": str(f.id),
        "accepted": bool(f.accepted),
        "food_type": f.food_type,
        "food_size": f.food_size,
        "quantity": f.quantity,
        # Keyed "comment", not "notes": it's the sitter's own words on their
        # own entry, and the privacy snapshot tests forbid any `notes` key in
        # a pass payload so the animal's private notes can never slip in.
        "comment": f.notes,
        "fed_at": _aware(f.fed_at).isoformat() if f.fed_at else None,
        "can_undo": bool(undo_until and now < undo_until),
        "undo_until": undo_until.isoformat() if undo_until else None,
    }


def _logging_fields(p: KeeperPass, card: dict, feedings: list, now: datetime) -> dict:
    """Per-card rung-2 fields. Only THIS pass's own entries are listed, so a
    sitter never sees who else (the keeper, another sitter) logged what."""
    loggable = bool(p.can_log) and card.get("kind") in ("invert", "animal")
    mine = [
        f for f in feedings
        if f.logged_via_pass_id == p.id and f.fed_at and _aware(f.fed_at) >= now - SITTER_LOG_LOOKBACK
    ]
    return {
        "loggable": loggable,
        "prefill": _prefill(feedings) if loggable else None,
        "sitter_logs": [_sitter_entry(f, now) for f in mine],
    }


def _logging_state(p: KeeperPass, logging_unlocked: bool) -> dict:
    """What the sitter page needs to decide between PIN box, buttons, or
    "logging paused". A lockout pauses logging; it never hides the list."""
    return {
        "can_log": bool(p.can_log),
        "logging_unlocked": bool(logging_unlocked and p.can_log and p.locked_at is None),
        "logging_locked": bool(p.can_log and p.locked_at is not None),
    }


def build_pass_payload(
    db: Session,
    p: KeeperPass,
    tz_offset_minutes: Optional[int],
    logging_unlocked: bool = False,
) -> dict:
    from app.routers.animals import _animal_feeding_interval
    from app.routers.inverts import (
        INTERVAL_SOURCE_KEEPER,
        INTERVAL_SOURCE_SPECIES,
        _recommended_feeding_interval_with_source,
    )

    now = _now()
    owner = db.query(User).filter(User.id == p.owner_user_id).first()
    keeper = _keeper_name(owner)
    # Temperatures on the card follow the keeper's display units (storage is °F).
    keeper_units = getattr(owner, "measurement_units", None)
    refs = sorted(p.animals, key=lambda r: r.sort_order)

    # Re-check ownership and activity at READ time, not just at creation: an
    # animal transferred or deceased since the pass was made drops off the list.
    inv_ids = [r.invert_id for r in refs if r.invert_id]
    col_ids = [r.colony_id for r in refs if r.colony_id]
    ani_ids = [r.animal_id for r in refs if r.animal_id]
    inverts = {i.id: i for i in active_inverts_query(db, p.owner_user_id).filter(Invert.id.in_(inv_ids))} if inv_ids else {}
    colonies = {c.id: c for c in active_colonies_query(db, p.owner_user_id).filter(Colony.id.in_(col_ids))} if col_ids else {}
    animals = (
        {a.id: a for a in active_animals_query(db, p.owner_user_id)
         .options(selectinload(Animal.herp_species), selectinload(Animal.enclosure))
         .filter(Animal.id.in_(ani_ids))}
        if ani_ids else {}
    )

    species_ids = {x.species_id for x in list(inverts.values()) + list(colonies.values()) if x.species_id}
    species = (
        {s.id: s for s in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids))}
        if species_ids else {}
    )
    inv_feedings = _feedings_by_parent(db, FeedingLog.invert_id, list(inverts), now)
    ani_feedings = _feedings_by_parent(db, FeedingLog.animal_id, list(animals), now)

    cards = []
    for r in refs:
        if r.invert_id and r.invert_id in inverts:
            inv = inverts[r.invert_id]
            sp = species.get(inv.species_id) if inv.species_id else None
            feeds = inv_feedings.get(inv.id, [])
            interval, source = _recommended_feeding_interval_with_source(
                inv.life_stage, sp, inv.feeding_interval_days
            )
            # Only a keeper-set or care-sheet cadence is stated. The resolver's
            # stage/generic defaults are guesses; a sitter isn't told to feed
            # on a guess (card rule 1) — the card asks instead.
            if source == INTERVAL_SOURCE_KEEPER:
                src = sc.KEEPER
            elif source == INTERVAL_SOURCE_SPECIES:
                src = sc.SPECIES
            else:
                interval, src = None, None
            facts = sc.FeedingFacts(
                last_fed_at=_last_accepted(feeds),
                usual_meal=sc.summarise_meals(feeds),
                interval_days=interval,
                interval_source=src,
            )
            card = sc.compose_invert_card(
                inv, sp, facts=facts, premolt_likely=_premolt_likely(db, inv),
                keeper_name=keeper, now=now, tz_offset_minutes=tz_offset_minutes,
                units=keeper_units,
            )
            card.update(_logging_fields(p, card, feeds, now))
            cards.append(card)
        elif r.colony_id and r.colony_id in colonies:
            col = colonies[r.colony_id]
            card = sc.compose_colony_card(
                col, species.get(col.species_id) if col.species_id else None, keeper_name=keeper,
                units=keeper_units,
            )
            card.update(_logging_fields(p, card, [], now))
            cards.append(card)
        elif r.animal_id and r.animal_id in animals:
            a = animals[r.animal_id]
            feeds = ani_feedings.get(a.id, [])
            sp = a.herp_species
            cgd_override = getattr(a, "feeds_on_cgd_override", None)
            feeds_cgd = bool(cgd_override if cgd_override is not None else getattr(sp, "feeds_on_cgd", False))
            facts = sc.FeedingFacts(
                last_fed_at=_last_accepted(feeds),
                usual_meal=sc.summarise_meals(feeds),
                interval_days=_animal_feeding_interval(a),
                interval_source=sc.KEEPER if a.feeding_interval_days else sc.SPECIES,
                schedule_text=(a.feeding_schedule or "").strip() or None,
            )
            card = sc.compose_animal_card(
                a, sp, facts=facts, enclosure=a.enclosure, feeds_on_cgd=feeds_cgd,
                keeper_name=keeper, now=now, tz_offset_minutes=tz_offset_minutes,
                units=keeper_units,
            )
            card.update(_logging_fields(p, card, feeds, now))
            cards.append(card)

    guide = (
        db.query(SitterGuide)
        .filter(SitterGuide.owner_user_id == p.owner_user_id, SitterGuide.app == p.app)
        .first()
    )
    state = _logging_state(p, logging_unlocked)
    return {
        "app": p.app,
        "keeper_name": keeper,
        "label": p.label,
        "starts_at": p.starts_at.isoformat(),
        "expires_at": p.expires_at.isoformat(),
        "can_log": state["can_log"],
        # Whether THIS session was unlocked with the current PIN. The page
        # uses it to show Fed/Refused buttons vs. the PIN prompt.
        "logging_unlocked": state["logging_unlocked"],
        # 5 wrong PINs: logging is paused until the keeper unlocks it. The
        # list itself keeps working (see utils/sitter_pass.pass_is_live).
        "logging_locked": state["logging_locked"],
        "routine": sc.compose_routine(guide, cards),
        "cards": cards,
    }


# ── keeper endpoints ──────────────────────────────────────────────────────────
# Static paths are declared before /{pass_id} so they aren't parsed as UUIDs.

@keeper_router.get("/candidates")
async def list_candidates(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Animals the keeper can put on a pass, with their sitter notes."""
    out = []
    if app == "tarantuverse":
        for i in active_inverts_query(db, current_user.id).order_by(Invert.name).all():
            out.append({"kind": "invert", "id": str(i.id), "name": i.name, "common_name": i.common_name,
                        "scientific_name": i.scientific_name, "taxon": i.taxon, "photo_url": i.photo_url,
                        "sitter_note": i.sitter_note})
        for c in active_colonies_query(db, current_user.id).order_by(Colony.name).all():
            out.append({"kind": "colony", "id": str(c.id), "name": c.name, "common_name": None,
                        "scientific_name": None, "taxon": c.taxon, "photo_url": c.photo_url,
                        "sitter_note": c.sitter_note})
    else:
        for a in active_animals_query(db, current_user.id).order_by(Animal.name).all():
            out.append({"kind": "animal", "id": str(a.id), "name": a.name, "common_name": a.common_name,
                        "scientific_name": a.scientific_name, "taxon": a.taxon, "photo_url": a.photo_url,
                        "sitter_note": a.sitter_note})
    return out


@keeper_router.put("/notes")
async def update_sitter_note(
    body: SitterNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = {"invert": Invert, "colony": Colony, "animal": Animal}[body.kind]
    obj = db.query(model).filter(model.id == body.id, model.user_id == current_user.id).first()
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Animal not found")
    obj.sitter_note = (body.sitter_note or "").strip() or None
    db.commit()
    return {"kind": body.kind, "id": str(obj.id), "sitter_note": obj.sitter_note}


@keeper_router.get("/guide")
async def get_guide(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = db.query(SitterGuide).filter(SitterGuide.owner_user_id == current_user.id, SitterGuide.app == app).first()
    return {
        "app": app,
        "routine_steps": list(g.routine_steps or []) if g else [],
        "emergency_text": g.emergency_text if g else None,
        "contact_line": g.contact_line if g else None,
        "vet_contact": g.vet_contact if g else None,
        "default_emergency": sc.DEFAULT_EMERGENCY,
    }


@keeper_router.put("/guide")
async def put_guide(
    body: SitterGuideBody,
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = db.query(SitterGuide).filter(SitterGuide.owner_user_id == current_user.id, SitterGuide.app == app).first()
    if g is None:
        g = SitterGuide(owner_user_id=current_user.id, app=app)
        db.add(g)
    g.routine_steps = body.routine_steps
    g.emergency_text = body.emergency_text
    g.contact_line = (body.contact_line or "").strip() or None
    g.vet_contact = (body.vet_contact or "").strip() or None
    db.commit()
    return await get_guide(app=app, current_user=current_user, db=db)


@keeper_router.get("/", response_model=List[PassSummary])
async def list_passes(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    base = (
        db.query(KeeperPass)
        .options(selectinload(KeeperPass.animals))
        .filter(KeeperPass.owner_user_id == current_user.id, KeeperPass.app == app)
    )
    # EVERY open pass, uncapped: a live link the keeper can't see is a live
    # link they can't revoke. Only the history of ended ones is trimmed.
    open_passes = (
        base.filter(KeeperPass.revoked_at.is_(None), KeeperPass.expires_at > now)
        .order_by(KeeperPass.created_at.desc())
        .all()
    )
    past = (
        base.filter(or_(KeeperPass.revoked_at.isnot(None), KeeperPass.expires_at <= now))
        .order_by(KeeperPass.created_at.desc())
        .limit(20)
        .all()
    )
    passes = open_passes + past
    counts = _log_counts(db, [p.id for p in passes])
    return [_summary(p, now, counts.get(p.id, 0)) for p in passes]


@keeper_router.post("/", response_model=PassCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def create_pass(
    request: Request,
    body: PassCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    starts_at = max(_aware(body.starts_at), now) if body.starts_at else now
    expires_at = _aware(body.expires_at)
    _validate_window(starts_at, expires_at, now)
    pin_hash = None
    if body.can_log:
        _require_logging_premium(current_user, body.app)
        pin_hash = await _pin_hash_or_422(body.pin)
    premium = _enforce_free_limit(db, current_user, body.app, now)
    rows = _resolve_animals(db, current_user, body.app, body.animals)

    raw, token_hash, prefix = new_pass_token()
    p = KeeperPass(
        owner_user_id=current_user.id, app=body.app, token_hash=token_hash, token_prefix=prefix,
        label=(body.label or "").strip() or None, starts_at=starts_at, expires_at=expires_at,
        created_under_premium=premium, can_log=bool(body.can_log), pin_hash=pin_hash,
    )
    p.animals = rows
    db.add(p)
    db.commit()
    db.refresh(p)
    return _created(p, raw)


@keeper_router.get("/{pass_id}/preview")
async def preview_pass(
    pass_id: UUID,
    tz_offset_minutes: Optional[int] = Query(None, ge=-900, le=900),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exactly what the sitter will see — same builder, keeper's auth."""
    return build_pass_payload(db, _owned_pass(db, pass_id, current_user), tz_offset_minutes)


@keeper_router.patch("/{pass_id}", response_model=PassSummary)
async def update_pass(
    pass_id: UUID,
    body: PassUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _owned_pass(db, pass_id, current_user)
    now = _now()
    if p.revoked_at is not None or now >= p.expires_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This pass has ended. Make a new one instead.")
    if body.label is not None:
        p.label = body.label.strip() or None
    if body.expires_at is not None:
        new_exp = _aware(body.expires_at)
        _validate_window(p.starts_at, new_exp, now)
        p.expires_at = new_exp
    if body.animals is not None:
        # Validate first, then clear and FLUSH before inserting. SQLAlchemy's
        # unit of work runs inserts before orphan deletes, so assigning the new
        # list directly would insert (pass, animal) for any animal kept on the
        # pass while its old row still exists — a unique-constraint failure on
        # every edit that keeps at least one animal.
        new_rows = _resolve_animals(db, current_user, p.app, body.animals)
        p.animals = []
        db.flush()
        p.animals = new_rows

    # ── rung 2: logging + PIN ──
    # Order matters: work out the final (can_log, pin_hash) pair, THEN assign,
    # so the DB CHECK "logging requires a PIN" can never see a half-state.
    can_log, pin_hash = bool(p.can_log), p.pin_hash
    if body.pin is not None and body.pin.strip():
        pin_hash = await _pin_hash_or_422(body.pin)  # changing the PIN: always allowed
    if body.can_log is True and not p.can_log:
        _require_logging_premium(current_user, p.app)
        if not pin_hash:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "Set a PIN to let the sitter log feedings.")
        can_log = True
    elif body.can_log is False:
        # Off means off: drop the PIN too, which also ends every unlocked
        # session (their binding no longer matches anything).
        can_log, pin_hash = False, None
    if not can_log and body.can_log is not False and body.pin:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Turn on logging to set a PIN.")
    p.can_log, p.pin_hash = can_log, pin_hash
    if body.pin or body.can_log is not None:
        p.pin_failures = 0

    db.commit()
    db.refresh(p)
    return _summary(p, now, _log_counts(db, [p.id]).get(p.id, 0))


@keeper_router.post("/{pass_id}/rotate", response_model=PassCreated)
@limiter.limit("20/hour")
async def rotate_pass(
    request: Request,
    pass_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """New link, same pass. The old link stops working immediately (its hash
    no longer exists), and so does every session opened from it: sessions are
    bound to the token hash that minted them (utils/sitter_pass `th` claim)."""
    p = _owned_pass(db, pass_id, current_user)
    if p.revoked_at is not None or _now() >= p.expires_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This pass has ended. Make a new one instead.")
    raw, token_hash, prefix = new_pass_token()
    p.token_hash, p.token_prefix = token_hash, prefix
    db.commit()
    db.refresh(p)
    return _created(p, raw)


@keeper_router.post("/{pass_id}/revoke", response_model=PassSummary)
async def revoke_pass(
    pass_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _owned_pass(db, pass_id, current_user)
    if p.revoked_at is None:
        p.revoked_at = _now()
        db.commit()
        db.refresh(p)
    return _summary(p, log_count=_log_counts(db, [p.id]).get(p.id, 0))


@keeper_router.post("/{pass_id}/unlock", response_model=PassSummary)
async def unlock_pass(
    pass_id: UUID,
    body: Optional[PassUnlock] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear a PIN lockout. Optionally set a new PIN at the same time.

    The keeper decides whether the lockout was their sitter fumbling the PIN
    (unlock) or someone who shouldn't have the link (revoke, or rotate for a
    new link). The UI puts both side by side; this endpoint only unlocks.
    """
    p = _owned_pass(db, pass_id, current_user)
    if p.revoked_at is not None or _now() >= p.expires_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This pass has ended. Make a new one instead.")
    if body is not None and body.pin:
        if not p.can_log:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Turn on logging to set a PIN.")
        p.pin_hash = await _pin_hash_or_422(body.pin)
    p.locked_at = None
    p.pin_failures = 0
    db.commit()
    db.refresh(p)
    return _summary(p, log_count=_log_counts(db, [p.id]).get(p.id, 0))


@keeper_router.get("/{pass_id}/activity")
async def pass_activity(
    pass_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everything logged through this pass, newest first (T10)."""
    p = _owned_pass(db, pass_id, current_user)
    logs = (
        db.query(FeedingLog)
        .filter(FeedingLog.logged_via_pass_id == p.id)
        .order_by(FeedingLog.created_at.desc())
        .limit(200)
        .all()
    )
    inv_ids = {f.invert_id for f in logs if f.invert_id}
    ani_ids = {f.animal_id for f in logs if f.animal_id}
    # Scoped to the keeper's own rows: names come only from animals they own.
    names: Dict[UUID, str] = {}
    if inv_ids:
        for i in db.query(Invert).filter(Invert.id.in_(inv_ids), Invert.user_id == current_user.id):
            names[i.id] = i.name or i.common_name or i.scientific_name or "Unnamed"
    if ani_ids:
        for a in db.query(Animal).filter(Animal.id.in_(ani_ids), Animal.user_id == current_user.id):
            names[a.id] = a.name or a.common_name or a.scientific_name or "Unnamed"
    who = (p.label or "").strip() or "Your sitter"
    out = []
    for f in logs:
        aid = f.invert_id or f.animal_id
        out.append({
            "id": str(f.id),
            "kind": "invert" if f.invert_id else "animal",
            "animal_id": str(aid) if aid else None,
            "animal_name": names.get(aid, "An animal no longer in your collection"),
            "accepted": bool(f.accepted),
            "food_type": f.food_type,
            "food_size": f.food_size,
            "quantity": f.quantity,
            "notes": f.notes,
            "fed_at": f.fed_at.isoformat() if f.fed_at else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "sitter_name": who,
        })
    return out


# ── sitter endpoints ──────────────────────────────────────────────────────────

@sitter_router.post("/exchange")
@limiter.limit("20/minute")
async def exchange(request: Request, body: ExchangeRequest, db: Session = Depends(get_db)):
    """Trade the link's token (sent in the POST body, from the URL fragment)
    for a short-lived read session. One message for every failure mode."""
    p = db.query(KeeperPass).filter(KeeperPass.token_hash == hash_pass_token(body.token)).first()
    now = _now()
    if (
        p is None
        or p.revoked_at is not None
        or now >= p.expires_at
        or not owner_is_active(p)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=UNAVAILABLE)
    if now < p.starts_at:
        # The holder of a valid link may learn when it opens — nothing more.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"status": "scheduled", "starts_at": p.starts_at.isoformat()},
        )
    session, exp = create_pass_session(p)
    p.open_count = (p.open_count or 0) + 1
    p.last_used_at = now
    db.commit()
    return {"session": session, "session_expires_at": exp.isoformat()}


@sitter_router.get("/pass")
@limiter.limit("60/minute")
async def read_pass(
    request: Request,
    tz_offset_minutes: Optional[int] = Query(None, ge=-900, le=900),
    pc: tuple = Depends(get_current_pass_with_claims),
    db: Session = Depends(get_db),
):
    p, claims = pc
    unlocked = session_can_log(p, claims)
    p = db.query(KeeperPass).options(selectinload(KeeperPass.animals)).filter(KeeperPass.id == p.id).one()
    return build_pass_payload(db, p, tz_offset_minutes, logging_unlocked=unlocked)


# ── sitter writes (rung 2) ────────────────────────────────────────────────────

@sitter_router.post("/unlock")
@limiter.limit("10/minute")
async def unlock_logging(
    request: Request,
    body: PinUnlockRequest,
    p: KeeperPass = Depends(get_current_pass),
    db: Session = Depends(get_db),
):
    """Trade the PIN for a write-capable session.

    RACE SAFETY (security review 2026-09-28, H1). The dependency above has
    already loaded this pass into the session, and a plain re-query would hand
    back that same in-memory object — with the failure count read BEFORE the
    lock. N parallel wrong guesses would then all read k and all write k+1.
    `populate_existing()` forces the locked SELECT's values onto the object, so
    each guess sees the previous one's increment and the 5th really locks.

    Failures are NOT reset by a correct PIN (review L1): otherwise someone
    holding a leaked link gets 4 fresh guesses every time the real sitter
    unlocks in a new tab. Only the keeper resets the count — by unlocking,
    changing the PIN, or toggling logging.
    """
    if not p.can_log:
        raise HTTPException(status.HTTP_409_CONFLICT, "This feeding list is read-only.")
    locked = (
        db.query(KeeperPass)
        .populate_existing()
        .filter(KeeperPass.id == p.id)
        .with_for_update()
        .one()
    )
    if not pass_is_live(locked):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    if not locked.can_log or not locked.pin_hash:
        raise HTTPException(status.HTTP_409_CONFLICT, "This feeding list is read-only.")
    if locked.locked_at is not None:
        # Checked BEFORE verifying: once paused, even the right PIN can't mint
        # a write session (the pass stays paused until the keeper says so).
        raise HTTPException(status.HTTP_423_LOCKED, detail=LOGGING_PAUSED)

    ok = await run_in_threadpool(verify_pin, body.pin, locked.pin_hash)
    if ok:
        session, exp = create_pass_session(locked, logging=True)
        db.commit()  # releases the row lock
        return {"session": session, "session_expires_at": exp.isoformat()}

    locked.pin_failures = (locked.pin_failures or 0) + 1
    if locked.pin_failures >= MAX_PIN_FAILURES:
        locked.locked_at = _now()
        db.commit()
        _notify_locked(db, locked)
        raise HTTPException(status.HTTP_423_LOCKED, detail=LOGGING_PAUSED)
    db.commit()
    left = MAX_PIN_FAILURES - locked.pin_failures
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        detail={"message": "That PIN didn't match.", "attempts_left": left},
    )


def _on_pass(db: Session, p: KeeperPass, kind: str, animal_id: UUID):
    """The animal must be on THIS pass and still the owner's active animal.
    Same 404 for every miss — never confirm another keeper's ids exist."""
    col = KeeperPassAnimal.invert_id if kind == "invert" else KeeperPassAnimal.animal_id
    on_pass = (
        db.query(KeeperPassAnimal)
        .filter(KeeperPassAnimal.pass_id == p.id, col == animal_id)
        .first()
    )
    if on_pass is None:
        return None
    if kind == "invert":
        return active_inverts_query(db, p.owner_user_id).filter(Invert.id == animal_id).first()
    return active_animals_query(db, p.owner_user_id).filter(Animal.id == animal_id).first()


def _entry_response(f: FeedingLog, kind: str, animal_id: UUID) -> dict:
    return {**_sitter_entry(f, _now()), "kind": kind, "animal_id": str(animal_id)}


@sitter_router.post("/feedings", status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def sitter_log_feeding(
    request: Request,
    body: SitterFeedingCreate,
    p: KeeperPass = Depends(get_logging_pass),
    db: Session = Depends(get_db),
):
    """Log a feeding or a refusal. Counts toward cadence, stats and premolt
    exactly like the keeper's own entry, and is attributed to the pass.

    One thing it deliberately does NOT do that the keeper's own entry does:
    end a feeding pause. A pause is the keeper's judgment (premolt, post-
    rehouse…), the card tells the sitter not to feed, and a sitter's tap can be
    a mis-tap that "undo" couldn't cleanly reverse. If a paused animal is
    logged as fed, the keeper is told instead (security review 2026-09-28, M2).
    """
    now = _now()
    # Serialise writes per pass so the hourly cap and double-tap guard can't
    # be raced past by parallel requests — and re-read the pass under that
    # lock (populate_existing: the dependency's copy may be stale), so a
    # revoke, lockout or "logging off" that lands mid-request still wins.
    fresh = (
        db.query(KeeperPass)
        .populate_existing()
        .filter(KeeperPass.id == p.id)
        .with_for_update()
        .one()
    )
    if not pass_is_live(fresh):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=UNAVAILABLE)
    if fresh.locked_at is not None:
        raise HTTPException(status.HTTP_423_LOCKED, detail=LOGGING_PAUSED)
    if not fresh.can_log or not fresh.pin_hash:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=PIN_NEEDED)

    recent = (
        db.query(FeedingLog)
        .filter(FeedingLog.logged_via_pass_id == p.id, FeedingLog.created_at >= now - timedelta(hours=1))
        .count()
    )
    if recent >= PASS_WRITES_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "That's a lot of entries in an hour. Try again a bit later.")

    target = _on_pass(db, p, body.kind, body.id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That animal isn't on this feeding list.")

    parent_col = FeedingLog.invert_id if body.kind == "invert" else FeedingLog.animal_id
    dup = (
        db.query(FeedingLog)
        .filter(
            FeedingLog.logged_via_pass_id == p.id,
            parent_col == body.id,
            FeedingLog.accepted == body.accepted,
            FeedingLog.created_at >= now - DOUBLE_TAP_WINDOW,
        )
        .first()
    )
    if dup is not None:
        # A double tap, or a retry after a flaky connection: hand back the
        # entry that already exists instead of logging the meal twice.
        return _entry_response(dup, body.kind, body.id)

    fields = dict(
        fed_at=now,
        accepted=body.accepted,
        food_type=body.food_type,
        food_size=body.food_size,
        quantity=body.quantity or 1,
        notes=body.notes,
        logged_via_pass_id=p.id,
    )
    if body.kind == "invert":
        log = FeedingLog(invert_id=target.id, **fields)
        # A tarantula still has its legacy twin row, and its detail screens
        # read feedings by tarantula_id (ADR-005, read cutover pending). Set
        # both, exactly as the keeper's own tarantula path does, or a sitter's
        # entry would be invisible on the tarantula's own page.
        if target.taxon == "tarantula":
            from app.models.tarantula import Tarantula

            twin = db.query(Tarantula).filter(
                Tarantula.id == target.id, Tarantula.user_id == p.owner_user_id
            ).first()
            if twin is not None:
                log.tarantula_id = twin.id
    else:
        log = FeedingLog(animal_id=target.id, **fields)
        if body.accepted and (target.last_fed_at is None or _aware(target.last_fed_at) < now):
            target.last_fed_at = now

    paused = is_feeding_paused(
        getattr(target, "feeding_paused_reason", None),
        getattr(target, "feeding_paused_until", None),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    if body.accepted and paused:
        _notify_fed_while_paused(db, p, target)
    else:
        _notify_sitter_log(db, p, target, body.accepted)
    return _entry_response(log, body.kind, target.id)


@sitter_router.delete("/feedings/{feeding_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def sitter_undo_feeding(
    request: Request,
    feeding_id: UUID,
    p: KeeperPass = Depends(get_logging_pass),
    db: Session = Depends(get_db),
):
    """Undo the sitter's OWN entry, within an hour. Anything else — the
    keeper's entries, another pass's, or an older one — isn't theirs to touch."""
    f = (
        db.query(FeedingLog)
        .filter(FeedingLog.id == feeding_id, FeedingLog.logged_via_pass_id == p.id)
        .first()
    )
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found.")
    created = _aware(f.created_at) if f.created_at else None
    if created is None or _now() >= created + UNDO_WINDOW:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "It's been over an hour, so only the keeper can change this entry now.",
        )
    animal_id, removed_at = f.animal_id, f.fed_at
    db.delete(f)
    db.flush()
    if animal_id is not None:
        # HV keeps a denormalised last_fed_at, and the sitter's entry moved it
        # forward. Put it back to the newest remaining feeding so "days since
        # fed" doesn't keep claiming a meal that was undone.
        a = db.query(Animal).filter(Animal.id == animal_id).first()
        if a is not None and a.last_fed_at is not None and removed_at is not None \
                and _aware(a.last_fed_at) <= _aware(removed_at):
            latest = (
                db.query(func.max(FeedingLog.fed_at))
                .filter(FeedingLog.animal_id == animal_id, FeedingLog.accepted.is_(True))
                .scalar()
            )
            a.last_fed_at = latest
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── keeper notifications ──────────────────────────────────────────────────────

def _notify_sitter_log(db: Session, p: KeeperPass, target, accepted: bool) -> None:
    """One heads-up per feeding round, not one per animal: a 20-animal round
    would otherwise be 20 pushes. The activity list has every entry."""
    try:
        from app.services.notification_service import create_notification

        since = _now() - NOTIFY_COALESCE
        already = (
            db.query(Notification.id)
            .filter(
                Notification.user_id == p.owner_user_id,
                Notification.type == "sitter_log",
                Notification.created_at >= since,
                Notification.data["pass_id"].astext == str(p.id),
            )
            .first()
        )
        if already is not None:
            return
        who = (p.label or "").strip() or "Your sitter"
        name = getattr(target, "name", None) or "an animal"
        outcome = "fed" if accepted else "refused food"
        create_notification(
            db,
            user_id=p.owner_user_id,
            type="sitter_log",
            title=f"{who} is logging feedings",
            body=f"{name} {outcome}. The whole round is in Sitter links.",
            deeplink="/sitter",
            data={"pass_id": str(p.id)},
            push_category="sitter_activity_enabled",
        )
    except Exception:  # a notification must never fail the sitter's write
        logger.exception("sitter_log notification failed")
        db.rollback()


def _notify_fed_while_paused(db: Session, p: KeeperPass, target) -> None:
    """A paused animal was logged as fed. Always sent (not coalesced, not
    gated by the sitter-activity preference): it's a welfare signal — maybe a
    mis-tap, maybe live prey in with a molting spider."""
    try:
        from app.services.notification_service import create_notification

        who = (p.label or "").strip() or "Your sitter"
        name = getattr(target, "name", None) or "an animal"
        reason = (getattr(target, "feeding_paused_reason", None) or "").strip()
        create_notification(
            db,
            user_id=p.owner_user_id,
            type="sitter_log",
            title=f"{who} logged {name} as fed while paused",
            body=(f"{name} is paused{f' ({reason})' if reason else ''} and the pause is still on. "
                  "Check on them when you can — if it was premolt, any live prey should come out."),
            deeplink="/sitter",
            data={"pass_id": str(p.id), "paused_feed": True},
        )
    except Exception:
        logger.exception("sitter fed-while-paused notification failed")
        db.rollback()


def _notify_locked(db: Session, p: KeeperPass) -> None:
    """Always sent, regardless of the sitter-activity preference: a lockout
    can mean the link is in the wrong hands, and the keeper must know."""
    try:
        from app.services.notification_service import create_notification

        label = (p.label or "").strip()
        which = f"the link for {label}" if label else "one of your sitter links"
        create_notification(
            db,
            user_id=p.owner_user_id,
            type="sitter_pass_locked",
            title="Logging paused on a sitter link",
            body=(f"Someone entered the wrong PIN {MAX_PIN_FAILURES} times on {which}, so logging is paused "
                  "(the feeding list still works). Unlock it, or end the link and send a new one "
                  "if you're not sure who it was."),
            deeplink="/sitter",
            data={"pass_id": str(p.id)},
        )
    except Exception:
        logger.exception("sitter_pass_locked notification failed")
        db.rollback()
