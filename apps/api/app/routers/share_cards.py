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
from app.schemas.share_card import CardLinkItem, ShareCardCreate, ShareCardCreated, SharePhotoItem
from app.services.share_card import (
    CardSubject,
    MoltFacts,
    _LEG_SPAN_TAXA,
    clean_fields,
    clean_frame,
    compose_card,
    read_defaults,
)
from app.utils.dependencies import get_current_user
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


# ── DB access (monkeypatched in tests) ──────────────────────────────────────

def _fmt_size(taxon: str, latest_span_in, length_mm) -> Optional[str]:
    if latest_span_in is not None:
        n = float(latest_span_in)
        return f"{n:.2f}".rstrip("0").rstrip(".") + " in"
    # Only use mm fallback for non-leg-span taxa (e.g., scorpion, centipede).
    # For leg-span taxa without molt leg-span, return None to omit the row.
    if taxon in _LEG_SPAN_TAXA:
        return None
    if length_mm is not None:
        return f"{float(length_mm):g} mm"
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
            latest_size=_fmt_size(inv.taxon, latest_span, inv.current_length_mm),
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


def _photo_parent_column(app: str):
    from app.models.photo import Photo
    return Photo.invert_id if app == "tarantuverse" else Photo.animal_id


def _load_photo_url(db: Session, app: str, animal_id, photo_id) -> Optional[str]:
    """The URL of one of THIS animal's photos, or None. A photo id that
    belongs to another animal is treated exactly like one that doesn't exist."""
    from app.models.photo import Photo

    row = (
        db.query(Photo.url)
        .filter(Photo.id == photo_id, _photo_parent_column(app) == animal_id)
        .first()
    )
    return row[0] if row else None


def _list_photos(db: Session, app: str, animal_id) -> list:
    from app.models.photo import Photo

    return (
        db.query(Photo)
        .filter(_photo_parent_column(app) == animal_id)
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

    # Keeper role or owner (spec §4.1). 404 for anyone else.
    _animal, owner, subject = _load_subject(db, current_user, body.app, body.animal_id, "keeper")
    molt = _load_molt(db, body.animal_id, body.molt_id) if body.kind == "molt" else None
    if body.photo_id is not None:
        chosen = _load_photo_url(db, body.app, body.animal_id, body.photo_id)
        if chosen is None:
            raise HTTPException(status_code=404, detail="Photo not found")
        subject.photo_url = chosen

    token = sign_render_token({
        "app": body.app, "kind": body.kind, "animal_id": str(body.animal_id),
        "molt_id": str(body.molt_id) if body.molt_id else None,
        "fields": fields, "shape": body.shape, "frame": body.frame,
        "photo_id": str(body.photo_id) if body.photo_id else None,
    })
    image_url = f"{settings.CARD_RENDERER_ORIGIN.rstrip('/')}/api/card/{token}"

    card_link = code = None
    if body.link and not body.preview:
        code = secrets.token_urlsafe(16)
        # The frame is frozen with the text: a shared link always shows the
        # card as it looked when it was shared.
        payload = dict(compose_card(body.kind, subject, fields, molt=molt), frame=body.frame)
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
    kind: str = Query(..., pattern="^(molt|profile)$"),
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The animal's photos for the composer's photo picker. Same role rule as
    sharing itself (keeper or owner; 404 for anyone else)."""
    _animal, _owner, subject = _load_subject(db, current_user, app, animal_id, "keeper")
    return [
        SharePhotoItem(id=p.id, url=p.url, thumbnail_url=p.thumbnail_url, is_main=p.url == subject.photo_url)
        for p in _list_photos(db, app, animal_id)
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
    app, animal_id = claims["app"], UUID(claims["animal_id"])
    _animal, _owner, subject = _load_subject_unchecked(db, app, animal_id)
    if claims.get("photo_id"):
        # Deleted since the token was minted: fall back to the main photo.
        chosen = _load_photo_url(db, app, animal_id, UUID(claims["photo_id"]))
        if chosen:
            subject.photo_url = chosen
    molt = _load_molt(db, animal_id, UUID(claims["molt_id"])) if claims.get("molt_id") else None
    card = compose_card(claims["kind"], subject, claims["fields"], molt=molt)
    card["shape"] = claims["shape"]
    # Tokens minted before frames existed have no frame claim.
    card["frame"] = clean_frame(claims.get("frame"))
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
    if link.revoked_at is not None or not _animal_exists(db, link.app, link.animal_id):
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
    _a, _o, subject = _load_subject(db, owner, app, animal_id, "viewer")
    return dict(compose_card("profile", subject, PUBLIC_FIELDS[app]), shape="wide", frame="specimen")
