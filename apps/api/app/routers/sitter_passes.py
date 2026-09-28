"""
Sitter passes — PRD-shared-keeping, Phase 1 (rung 1: read-only link + care cards).

Two routers, deliberately separate:

  keeper_router  /api/v1/sitter-passes/*   — a logged-in keeper managing passes
  sitter_router  /api/v1/sitter/*          — the sitter, authenticated ONLY by a
                                             pass session (never a user token)

The sitter router is an allowlist. In Phase 1 it can do exactly two things:
trade a link for a read session, and read the feeding list. There is no
endpoint through which a pass can write, so a leaked link can at worst show
someone a feeding list for at most 30 days (T1, T6).
"""
# NOTE: no `from __future__ import annotations` here. slowapi's @limiter.limit
# wraps the endpoint, and FastAPI then can't resolve string annotations
# against this module — PassCreate etc. would be "not defined" at startup.
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.animal import Animal
from app.models.colony import Colony
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.sitter_pass import PASS_MAX_DAYS, KeeperPass, KeeperPassAnimal, SitterGuide
from app.models.user import User
from app.schemas.sitter_pass import (
    ExchangeRequest,
    PassCreate,
    PassCreated,
    PassSummary,
    PassUpdate,
    SitterGuideBody,
    SitterNoteUpdate,
)
from app.services import sitter_card as sc
from app.utils.dependencies import get_current_user
from app.utils.limits import active_animals_query, active_colonies_query, active_inverts_query
from app.utils.rate_limit import limiter
from app.utils.sitter_pass import (
    UNAVAILABLE,
    create_pass_session,
    get_current_pass,
    hash_pass_token,
    new_pass_token,
    owner_is_active,
    pass_is_live,
)

keeper_router = APIRouter()
sitter_router = APIRouter()

FREE_ACTIVE_PASS_LIMIT = 2          # decided 2026-09-28
MAX_START_AHEAD = timedelta(days=90)
FEEDING_LOOKBACK = timedelta(days=365)
KINDS_BY_APP = {"tarantuverse": {"invert", "colony"}, "herpetoverse": {"animal"}}


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _status(p: KeeperPass, now: datetime) -> str:
    if p.revoked_at is not None:
        return "revoked"
    if p.locked_at is not None:
        return "locked"
    if now >= p.expires_at:
        return "expired"
    if now < p.starts_at:
        return "scheduled"
    return "active"


def _summary(p: KeeperPass, now: Optional[datetime] = None) -> PassSummary:
    now = now or _now()
    return PassSummary(
        id=p.id, app=p.app, label=p.label, token_prefix=p.token_prefix,
        status=_status(p, now), starts_at=p.starts_at, expires_at=p.expires_at,
        revoked_at=p.revoked_at, animal_count=len(p.animals), open_count=p.open_count or 0,
        last_used_at=p.last_used_at, created_at=p.created_at,
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


def build_pass_payload(db: Session, p: KeeperPass, tz_offset_minutes: Optional[int]) -> dict:
    from app.routers.animals import _animal_feeding_interval
    from app.routers.inverts import (
        INTERVAL_SOURCE_KEEPER,
        INTERVAL_SOURCE_SPECIES,
        _recommended_feeding_interval_with_source,
    )

    now = _now()
    owner = db.query(User).filter(User.id == p.owner_user_id).first()
    keeper = _keeper_name(owner)
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
            cards.append(sc.compose_invert_card(
                inv, sp, facts=facts, premolt_likely=_premolt_likely(db, inv),
                keeper_name=keeper, now=now, tz_offset_minutes=tz_offset_minutes,
            ))
        elif r.colony_id and r.colony_id in colonies:
            col = colonies[r.colony_id]
            cards.append(sc.compose_colony_card(
                col, species.get(col.species_id) if col.species_id else None, keeper_name=keeper,
            ))
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
            cards.append(sc.compose_animal_card(
                a, sp, facts=facts, enclosure=a.enclosure, feeds_on_cgd=feeds_cgd,
                keeper_name=keeper, now=now, tz_offset_minutes=tz_offset_minutes,
            ))

    guide = (
        db.query(SitterGuide)
        .filter(SitterGuide.owner_user_id == p.owner_user_id, SitterGuide.app == p.app)
        .first()
    )
    return {
        "app": p.app,
        "keeper_name": keeper,
        "label": p.label,
        "starts_at": p.starts_at.isoformat(),
        "expires_at": p.expires_at.isoformat(),
        "can_log": False,  # Phase 2
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
    return [_summary(p, now) for p in open_passes + past]


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
    premium = _enforce_free_limit(db, current_user, body.app, now)
    rows = _resolve_animals(db, current_user, body.app, body.animals)

    raw, token_hash, prefix = new_pass_token()
    p = KeeperPass(
        owner_user_id=current_user.id, app=body.app, token_hash=token_hash, token_prefix=prefix,
        label=(body.label or "").strip() or None, starts_at=starts_at, expires_at=expires_at,
        created_under_premium=premium,
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
    db.commit()
    db.refresh(p)
    return _summary(p, now)


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
    return _summary(p)


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
        or p.locked_at is not None
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
    p: KeeperPass = Depends(get_current_pass),
    db: Session = Depends(get_db),
):
    p = db.query(KeeperPass).options(selectinload(KeeperPass.animals)).filter(KeeperPass.id == p.id).one()
    return build_pass_payload(db, p, tz_offset_minutes)
