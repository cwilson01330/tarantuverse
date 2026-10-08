"""Share cards and card links (spec: docs/superpowers/specs/2026-09-29-share-cards-design.md).

Nothing here writes to any visibility setting — sharing never changes the
app (spec §6). The only rows written are a card link (when asked for) and the
sharer's remembered field choices.
"""
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.card_link import CardLink
from app.models.user import User
from app.schemas.share_card import KIND_PATTERN, CardLinkItem, ShareCardCreate, ShareCardCreated, SharePhotoItem
from app.services.share_card import (
    CardSubject,
    MoltFacts,
    ShedFacts,
    WeightFacts,
    clean_fields,
    clean_frame,
    compose_card,
    read_defaults,
    size_text,
)
from app.utils.dependencies import get_current_user
from app.utils.units import UNITS
from app.utils.share_token import sign_render_token, verify_render_token

router = APIRouter()

CARD_LINK_ORIGINS = {
    "tarantuverse": "https://www.tarantuverse.com",
    "herpetoverse": "https://herpetoverse.com",
}

# Public-card fields for link previews of ALREADY-public animals (spec §4.1).
PUBLIC_FIELDS = {
    "tarantuverse": ["photo", "name", "species", "sex", "in_care", "molts", "size"],
    "herpetoverse": ["photo", "name", "species", "sex", "in_care", "weight", "sheds"],
}
# ...and of already-public colonies: exactly what /col/{id} already shows
# anyone (population and per-stage counts; never the acquisition date).
PUBLIC_COLONY_FIELDS = ["photo", "name", "species", "population", "stages"]

COLONY_CLOSED = "This colony has ended, been handed off or been archived, so it can't be shared."


# ── DB access (monkeypatched in tests) ──────────────────────────────────────

def _fmt_size(taxon: str, latest_span_in, length_mm, units: Optional[str] = None) -> Optional[str]:
    """The size row, in `units` (imperial when unset). Molt span first; the
    mm body-length fallback only for non-leg-span taxa (e.g. scorpion,
    centipede) — a leg-span taxon with no molt span omits the row."""
    return size_text(taxon, latest_span_in, length_mm, units)


def _user_units(*users) -> Optional[str]:
    """The first explicit measurement_units among `users` (None = never
    chosen; the card then prints imperial, which is what storage is)."""
    for u in users:
        v = getattr(u, "measurement_units", None)
        if v in UNITS:
            return v
    return None


def _load_subject(db: Session, user, app: str, animal_id: UUID, need: str):
    """(animal_row, owner_user, CardSubject). Raises 404 when the caller lacks
    `need` in the owner's collection — same rule as every other route."""
    if app == "tarantuverse":
        from app.models.molt_log import MoltLog
        from app.utils.access import load_invert

        inv, access = load_invert(db, user, animal_id, need, not_found="Animal not found")
        molts = (
            db.query(MoltLog)
            .filter(MoltLog.invert_id == inv.id)
            .order_by(MoltLog.molted_at.desc())
            .all()
        )
        latest_span = next((m.leg_span_after for m in molts if m.leg_span_after is not None), None)
        subj = CardSubject(
            app=app, taxon=inv.taxon, name=inv.name, scientific_name=inv.scientific_name,
            common_name=inv.common_name, sex=inv.sex, date_acquired=inv.date_acquired,
            photo_url=inv.photo_url, molt_count=len(molts),
            # Raw stored values; compose_card formats them in the card
            # author's units.
            latest_span_in=float(latest_span) if latest_span is not None else None,
            length_mm=float(inv.current_length_mm) if inv.current_length_mm is not None else None,
        )
        return inv, access.owner, subj

    from app.models.shed_log import ShedLog
    from app.utils.access import load_animal

    ani, access = load_animal(db, user, animal_id, need, not_found="Animal not found")
    sheds = db.query(ShedLog).filter(ShedLog.animal_id == ani.id).count()
    subj = CardSubject(
        app=app, taxon=ani.taxon, name=ani.name, scientific_name=ani.scientific_name,
        common_name=ani.common_name, sex=ani.sex, date_acquired=ani.date_acquired,
        photo_url=ani.photo_url, weight_g=ani.current_weight_g, length_in=ani.current_length_in,
        shed_count=sheds,
    )
    return ani, access.owner, subj


def _load_molt(db: Session, animal_id: UUID, molt_id: UUID) -> MoltFacts:
    from app.models.molt_log import MoltLog

    molt = db.query(MoltLog).filter(MoltLog.id == molt_id, MoltLog.invert_id == animal_id).first()
    if molt is None:
        raise HTTPException(status_code=404, detail="Molt not found")
    # Count molts where molted_at < this molt's time, OR same time but id <= this molt's id
    # (tie-break by id to ensure unique numbering).
    number = (
        db.query(MoltLog)
        .filter(
            MoltLog.invert_id == animal_id,
            or_(
                MoltLog.molted_at < molt.molted_at,
                and_(MoltLog.molted_at == molt.molted_at, MoltLog.id <= molt.id),
            ),
        )
        .count()
    )
    return MoltFacts(
        number=number,
        molted_on=molt.molted_at.date(),
        span_before=float(molt.leg_span_before) if molt.leg_span_before is not None else None,
        span_after=float(molt.leg_span_after) if molt.leg_span_after is not None else None,
    )


def _colony_subject(db: Session, col) -> CardSubject:
    """A colony as a card subject. Reads only what a card can show: never its
    location, notes, sitter note, source or enclosure."""
    sci = common = None
    if col.species_id:
        from app.models.invert_species import InvertSpecies
        sp = db.query(InvertSpecies).filter(InvertSpecies.id == col.species_id).first()
        if sp is not None:
            sci = sp.scientific_name
            common = sp.common_names[0] if sp.common_names else None
    return CardSubject(
        app="tarantuverse", taxon=col.taxon, name=col.name, scientific_name=sci, common_name=common,
        sex=None, date_acquired=col.date_acquired, photo_url=col.photo_url,
        founded_date=col.founded_date, stage_counts=dict(col.stage_counts or {}),
        count_is_estimated=bool(col.count_is_estimated),
    )


def _colony_closed(col) -> bool:
    """Ended, handed off or archived. An archived colony is "hidden from your
    collection" in the UI, so a link preview or card link that kept showing
    its headcount would break that promise (audit-2 M3)."""
    return (
        col.ended_at is not None
        or col.transferred_out_at is not None
        or col.is_active is False
    )


def _load_colony_subject(db: Session, user, colony_id: UUID, need: str):
    """(colony_row, owner_user, CardSubject). 404 when the caller has no
    access to the colony's collection — the colony routes' own rule."""
    from app.utils.access import load_colony

    col, access = load_colony(db, user, colony_id, need, not_found="Colony not found")
    return col, access.owner, _colony_subject(db, col)


def _load_colony_subject_unchecked(db: Session, colony_id: UUID):
    """Token-authorised read (the role check happened when the token was
    issued)."""
    from app.models.colony import Colony

    col = db.query(Colony).filter(Colony.id == colony_id).first()
    if col is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return col, None, _colony_subject(db, col)


def _colony_live(db: Session, colony_id) -> bool:
    """A colony card link stays up only while the colony exists and is still
    running — ended or handed off reads as 'no longer shared'."""
    from app.models.colony import Colony

    col = db.query(Colony).filter(Colony.id == colony_id).first()
    return col is not None and not _colony_closed(col)


def _load_shed(db: Session, animal_id: UUID, shed_id: UUID) -> ShedFacts:
    """One of THIS animal's sheds; another animal's shed id is a 404."""
    from app.models.shed_log import ShedLog

    shed = db.query(ShedLog).filter(ShedLog.id == shed_id, ShedLog.animal_id == animal_id).first()
    if shed is None:
        raise HTTPException(status_code=404, detail="Shed not found")
    # Strictly earlier sheds, tie-broken by id like molt numbering, so two
    # sheds logged at the same moment still get distinct numbers.
    earlier = or_(ShedLog.shed_at < shed.shed_at, and_(ShedLog.shed_at == shed.shed_at, ShedLog.id < shed.id))
    before = db.query(ShedLog).filter(ShedLog.animal_id == animal_id, earlier).count()
    prev = (
        db.query(ShedLog.shed_at)
        .filter(ShedLog.animal_id == animal_id, earlier)
        .order_by(ShedLog.shed_at.desc(), ShedLog.id.desc())
        .first()
    )
    return ShedFacts(
        number=before + 1,
        shed_on=shed.shed_at.date(),
        is_complete=shed.is_complete_shed,
        has_retained=bool(shed.has_retained_shed),
        previous_on=prev[0].date() if prev and prev[0] is not None else None,
    )


def _load_weight(db: Session, animal_id: UUID, weight_log_id: UUID) -> WeightFacts:
    """One of THIS animal's weigh-ins, and the one before it."""
    from app.models.weight_log import WeightLog

    row = db.query(WeightLog).filter(WeightLog.id == weight_log_id, WeightLog.animal_id == animal_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Weigh-in not found")
    earlier = or_(WeightLog.weighed_at < row.weighed_at, and_(WeightLog.weighed_at == row.weighed_at, WeightLog.id < row.id))
    prev = (
        db.query(WeightLog.weight_g)
        .filter(WeightLog.animal_id == animal_id, earlier)
        .order_by(WeightLog.weighed_at.desc(), WeightLog.id.desc())
        .first()
    )
    return WeightFacts(
        weight_g=float(row.weight_g),
        weighed_on=row.weighed_at.date(),
        previous_g=float(prev[0]) if prev and prev[0] is not None else None,
    )


def _event_facts(db: Session, kind: str, animal_id: UUID, molt_id=None, shed_id=None, weight_log_id=None) -> dict:
    """The per-event facts compose_card needs for this kind, as kwargs."""
    if kind == "molt":
        return {"molt": _load_molt(db, animal_id, molt_id)}
    if kind == "shed":
        return {"shed": _load_shed(db, animal_id, shed_id)}
    if kind == "weight":
        return {"weight": _load_weight(db, animal_id, weight_log_id)}
    return {}


def _focus_claim(focus) -> Optional[dict]:
    """Rounded so equivalent framings share a cache key and tokens stay short."""
    if focus is None:
        return None
    return {"x": round(focus.x, 4), "y": round(focus.y, 4), "zoom": round(focus.zoom, 3)}


def _clean_focus(raw) -> Optional[dict]:
    """A focus read back from a token or snapshot, re-validated."""
    from pydantic import ValidationError
    from app.schemas.share_card import PhotoFocus

    if not isinstance(raw, dict):
        return None
    try:
        return _focus_claim(PhotoFocus(**raw))
    except (ValidationError, TypeError):
        return None


def _photo_parent_column(app: str, kind: Optional[str] = None):
    from app.models.photo import Photo
    if kind == "colony":
        return Photo.colony_id
    return Photo.invert_id if app == "tarantuverse" else Photo.animal_id


def _load_photo_url(db: Session, app: str, animal_id, photo_id, kind: Optional[str] = None) -> Optional[str]:
    """The URL of one of THIS animal's (or colony's) photos, or None. A photo
    id that belongs to anything else is treated exactly like one that doesn't
    exist."""
    from app.models.photo import Photo

    row = (
        db.query(Photo.url)
        .filter(Photo.id == photo_id, _photo_parent_column(app, kind) == animal_id)
        .first()
    )
    return row[0] if row else None


def _list_photos(db: Session, app: str, animal_id, kind: Optional[str] = None) -> list:
    from app.models.photo import Photo

    return (
        db.query(Photo)
        .filter(_photo_parent_column(app, kind) == animal_id)
        .order_by(Photo.created_at.desc())
        .limit(60)
        .all()
    )


def _animal_exists(db: Session, app: str, animal_id) -> bool:
    if app == "tarantuverse":
        from app.models.invert import Invert
        return db.query(Invert.id).filter(Invert.id == animal_id).first() is not None
    from app.models.animal import Animal
    return db.query(Animal.id).filter(Animal.id == animal_id).first() is not None


def _find_link(db: Session, code: str) -> Optional[CardLink]:
    return db.query(CardLink).filter(CardLink.code == code).first()


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/share-cards/", response_model=ShareCardCreated, status_code=status.HTTP_201_CREATED)
async def create_share_card(
    body: ShareCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        fields = clean_fields(body.app, body.kind, body.fields)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if body.kind == "molt" and body.molt_id is None:
        raise HTTPException(status_code=422, detail="A molt card needs molt_id")
    if body.kind == "shed" and body.shed_id is None:
        raise HTTPException(status_code=422, detail="A shed card needs shed_id")
    if body.kind == "weight" and body.weight_log_id is None:
        raise HTTPException(status_code=422, detail="A weigh-in card needs weight_log_id")

    # Keeper role or owner (spec §4.1). 404 for anyone else.
    if body.kind == "colony":
        colony, owner, subject = _load_colony_subject(db, current_user, body.animal_id, "keeper")
        # An ended or handed-off colony can't get a NEW card (its existing
        # links read as no longer shared, see get_card_link).
        if _colony_closed(colony):
            raise HTTPException(status_code=409, detail=COLONY_CLOSED)
    else:
        _animal, owner, subject = _load_subject(db, current_user, body.app, body.animal_id, "keeper")
    # Lengths print in the card author's units: the sharer's own setting,
    # else the owner's (a co-keeper who never chose), else imperial. Carried
    # in the token and frozen into a link's snapshot like the text itself.
    units = _user_units(current_user, owner)
    # Event ids are only read for their own kind, and only ever looked up
    # under THIS animal (another animal's id is a 404).
    event = _event_facts(db, body.kind, body.animal_id, body.molt_id, body.shed_id, body.weight_log_id)
    if body.photo_id is not None:
        chosen = _load_photo_url(db, body.app, body.animal_id, body.photo_id, kind=body.kind)
        if chosen is None:
            raise HTTPException(status_code=404, detail="Photo not found")
        subject.photo_url = chosen

    claims = {
        "app": body.app, "kind": body.kind, "animal_id": str(body.animal_id),
        "molt_id": str(body.molt_id) if body.molt_id and body.kind == "molt" else None,
        "fields": fields, "shape": body.shape, "frame": body.frame,
        "photo_id": str(body.photo_id) if body.photo_id else None,
        "focus": _focus_claim(body.focus),
    }
    if body.kind == "shed":
        claims["shed_id"] = str(body.shed_id)
    if body.kind == "weight":
        claims["weight_log_id"] = str(body.weight_log_id)
    if units:
        claims["units"] = units
    token = sign_render_token(claims)
    image_url = f"{settings.CARD_RENDERER_ORIGIN.rstrip('/')}/api/card/{token}"

    card_link = code = None
    if body.link and not body.preview:
        code = secrets.token_urlsafe(16)
        # The frame is frozen with the text: a shared link always shows the
        # card as it looked when it was shared.
        # (A colony link is told apart from an animal one by kind == "colony":
        # card_links.animal_id then holds the colony id.)
        payload = dict(compose_card(body.kind, subject, fields, units=units, **event), frame=body.frame,
                       photo_focus=_focus_claim(body.focus))
        db.add(CardLink(
            id=uuid.uuid4(), code=code, app=body.app, animal_id=body.animal_id, kind=body.kind,
            payload=payload, created_by=current_user.id, owner_id=owner.id,
        ))
        card_link = f"{CARD_LINK_ORIGINS[body.app]}/c/{code}"

    if not body.preview:
        defaults = dict(current_user.share_defaults or {})
        defaults[f"{body.app}:{body.kind}"] = {"fields": fields, "frame": body.frame}
        current_user.share_defaults = defaults
    db.commit()
    return ShareCardCreated(image_url=image_url, card_link=card_link, code=code, fields=fields, frame=body.frame)


@router.get("/share-cards/defaults")
async def get_share_defaults(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    kind: str = Query(..., pattern=KIND_PATTERN),
    current_user: User = Depends(get_current_user),
):
    saved_fields, frame = read_defaults((current_user.share_defaults or {}).get(f"{app}:{kind}"))
    try:
        return {"fields": clean_fields(app, kind, saved_fields), "frame": frame}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/share-cards/photos", response_model=List[SharePhotoItem])
async def list_share_photos(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    animal_id: UUID = Query(...),
    # "colony" lists a colony's photos (animal_id is then the colony id). Any
    # other kind, or none (older clients), lists the animal's.
    kind: Optional[str] = Query(None, pattern=KIND_PATTERN),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The animal's photos for the composer's photo picker. Same role rule as
    sharing itself (keeper or owner; 404 for anyone else)."""
    if kind == "colony":
        if app != "tarantuverse":
            raise HTTPException(status_code=404, detail="Colony not found")
        _col, _owner, subject = _load_colony_subject(db, current_user, animal_id, "keeper")
        rows = _list_photos(db, app, animal_id, kind="colony")
    else:
        _animal, _owner, subject = _load_subject(db, current_user, app, animal_id, "keeper")
        rows = _list_photos(db, app, animal_id)
    return [
        SharePhotoItem(id=p.id, url=p.url, thumbnail_url=p.thumbnail_url, is_main=p.url == subject.photo_url)
        for p in rows
    ]


@router.get("/share-cards/{token}/data")
async def share_card_data(token: str, response: Response, db: Session = Depends(get_db)):
    """Called by the renderer. The token is the only credential.
    Cache-Control: no-store prevents CDN caching after revocation."""
    response.headers["Cache-Control"] = "no-store"
    claims = verify_render_token(token)
    if not claims:
        raise HTTPException(status_code=404, detail="Card not found")
    # No login here: the token proved the sharer's right when it was issued.
    app, animal_id, kind = claims["app"], UUID(claims["animal_id"]), claims["kind"]
    if kind == "colony":
        _col, owner, subject = _load_colony_subject_unchecked(db, animal_id)
    else:
        _animal, owner, subject = _load_subject_unchecked(db, app, animal_id)
    # The author's units ride in the token; a token minted before units
    # existed (or by a keeper who never chose) falls back to the owner's.
    units = claims.get("units") if claims.get("units") in UNITS else _user_units(owner)
    if claims.get("photo_id"):
        # Deleted since the token was minted: fall back to the main photo.
        chosen = _load_photo_url(db, app, animal_id, UUID(claims["photo_id"]), kind=kind)
        if chosen:
            subject.photo_url = chosen
    def claim_id(k: str) -> Optional[UUID]:
        return UUID(claims[k]) if claims.get(k) else None

    # A deleted molt/shed/weigh-in makes its token a 404 (no stale card).
    event = _event_facts(db, kind, animal_id, claim_id("molt_id"), claim_id("shed_id"), claim_id("weight_log_id"))
    card = compose_card(kind, subject, claims["fields"], units=units, **event)
    card["shape"] = claims["shape"]
    # Tokens minted before frames existed have no frame claim.
    card["frame"] = clean_frame(claims.get("frame"))
    card["photo_focus"] = _clean_focus(claims.get("focus"))
    return card


def _load_subject_unchecked(db: Session, app: str, animal_id: UUID):
    """Token-authorised read: the role check happened when the token was
    issued. Reuses _load_subject with the owner as the actor so there is one
    query path to keep correct."""
    if app == "tarantuverse":
        from app.models.invert import Invert
        row = db.query(Invert).filter(Invert.id == animal_id).first()
    else:
        from app.models.animal import Animal
        row = db.query(Animal).filter(Animal.id == animal_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found")
    owner = db.query(User).filter(User.id == row.user_id).first()
    return _load_subject(db, owner, app, animal_id, "viewer")


@router.get("/card-links/{code}")
async def get_card_link(code: str, response: Response, db: Session = Depends(get_db)):
    """Cache-Control: no-store prevents CDN caching after revocation."""
    response.headers["Cache-Control"] = "no-store"
    link = _find_link(db, code)
    if link is None:
        raise HTTPException(status_code=404, detail="Card not found")
    # A colony link (kind "colony": animal_id holds the colony id) also goes
    # once the colony has ended, been handed off or been archived.
    alive = _colony_live(db, link.animal_id) if link.kind == "colony" else _animal_exists(db, link.app, link.animal_id)
    if link.revoked_at is not None or not alive:
        raise HTTPException(status_code=410, detail="This card is no longer shared")
    # Links shared before frames existed have no frame in their snapshot.
    return dict(link.payload, shape="wide", frame=clean_frame((link.payload or {}).get("frame")))


@router.get("/card-links/", response_model=List[CardLinkItem])
async def list_card_links(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(CardLink)
        .filter((CardLink.created_by == current_user.id) | (CardLink.owner_id == current_user.id))
        .order_by(CardLink.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        CardLinkItem(
            code=r.code, app=r.app, kind=r.kind, name=(r.payload or {}).get("name"),
            url=f"{CARD_LINK_ORIGINS[r.app]}/c/{r.code}", created_at=r.created_at, revoked_at=r.revoked_at,
        )
        for r in rows
    ]


@router.delete("/card-links/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_card_link(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    link = _find_link(db, code)
    if link is None or current_user.id not in (link.created_by, link.owner_id):
        raise HTTPException(status_code=404, detail="Card not found")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/public-card/tarantuverse/colonies/{colony_id}")
async def public_colony_card(colony_id: UUID, db: Session = Depends(get_db)):
    """Link-preview payload for a colony that is ALREADY public under the
    /col/{id} rule: owner's collection public AND the colony's own visibility
    'public' AND not ended or handed off. Changes nothing; 404 otherwise."""
    from app.models.colony import Colony

    col = db.query(Colony).filter(Colony.id == colony_id).first()
    if col is None or _colony_closed(col) or getattr(col, "visibility", None) != "public":
        raise HTTPException(status_code=404, detail="Not found")
    owner = db.query(User).filter(User.id == col.user_id).first()
    if owner is None or owner.collection_visibility != "public":
        raise HTTPException(status_code=404, detail="Not found")
    subject = _colony_subject(db, col)
    return dict(compose_card("colony", subject, PUBLIC_COLONY_FIELDS), shape="wide", frame="specimen")


@router.get("/public-card/{app}/{animal_id}")
async def public_card(app: str, animal_id: UUID, db: Session = Depends(get_db)):
    """Link-preview payload for an animal that is ALREADY public under the
    existing rule (owner's collection public; not died, not transferred).
    Changes nothing; 404 otherwise."""
    if app not in PUBLIC_FIELDS:
        raise HTTPException(status_code=404, detail="Not found")
    if app == "tarantuverse":
        from app.models.invert import Invert as Model
    else:
        from app.models.animal import Animal as Model
    row = db.query(Model).filter(Model.id == animal_id).first()
    if row is None or row.died_at is not None or row.transferred_out_at is not None:
        raise HTTPException(status_code=404, detail="Not found")
    owner = db.query(User).filter(User.id == row.user_id).first()
    if owner is None or owner.collection_visibility != "public":
        raise HTTPException(status_code=404, detail="Not found")
    # TV animals carry a per-animal choice that wins over a public collection,
    # matching /t and /i. (HV has no per-animal toggle yet, so its stored
    # default isn't treated as a choice.)
    if app == "tarantuverse" and getattr(row, "visibility", None) == "private":
        raise HTTPException(status_code=404, detail="Not found")
    _a, _o, subject = _load_subject(db, owner, app, animal_id, "viewer")
    # A link preview speaks for the owner, so it prints in the owner's units.
    return dict(
        compose_card("profile", subject, PUBLIC_FIELDS[app], units=_user_units(owner)),
        shape="wide", frame="specimen",
    )
