"""
QR Identity System

Two distinct concerns handled here:

1. Upload Sessions  — owner creates a short-lived token, phone browser uses it to
                      upload photos without being logged in.

2. Public Profiles  — permanent public URL for any tarantula (/api/v1/t/{id}).
                      Returns context-appropriate data:
                        • owner (auth token provided) → full detail + quick-log access
                        • other logged-in keeper      → public profile (if collection public)
                        • unauthenticated             → read-only care card
"""

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.qr_upload_session import QRUploadSession
from app.models.tarantula import Tarantula
from app.models.snake import Snake
from app.models.lizard import Lizard
from app.models.photo import Photo
from app.models.user import User
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.shed_log import ShedLog
from app.models.species import Species
from app.utils.dependencies import get_current_user
from app.utils.file_validation import validate_image_bytes
from app.services.storage import storage_service
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["qr"])

SESSION_TTL_MINUTES = 20  # upload session lifetime
MAX_UPLOADS_PER_SESSION = 10  # hard cap on photo uploads per QR session token
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MiB per photo (matches typical phone output)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _tarantula_display_name(t: Tarantula) -> str:
    parts = []
    if t.name:
        parts.append(t.name)
    label = t.common_name or t.scientific_name
    if label:
        parts.append(f"({label})" if t.name else label)
    return " ".join(parts) or "Unknown"


def _snake_display_name(s: Snake) -> str:
    """Parallel helper for snakes — uses common_name or scientific_name fallback."""
    parts = []
    if s.name:
        parts.append(s.name)
    label = s.common_name or s.scientific_name
    if label:
        parts.append(f"({label})" if s.name else label)
    return " ".join(parts) or "Unknown"


def _lizard_display_name(l: Lizard) -> str:
    """Parallel helper for lizards — same shape as snake/tarantula."""
    parts = []
    if l.name:
        parts.append(l.name)
    label = l.common_name or l.scientific_name
    if label:
        parts.append(f"({label})" if l.name else label)
    return " ".join(parts) or "Unknown"


def _session_parent(session: QRUploadSession) -> tuple[str, object | None]:
    """Return (taxon, parent_row) for a session.

    Returns ('tarantula' | 'snake' | 'lizard', row) — callers that need
    the canonical parent shouldn't have to re-query. `row` may be None
    only if the parent was hard-deleted after session creation (shouldn't
    happen — all FKs are CASCADE — but defensive).
    """
    if session.tarantula_id:
        return ("tarantula", session.tarantula)
    if session.snake_id:
        return ("snake", session.snake)
    if session.lizard_id:
        return ("lizard", session.lizard)
    return ("unknown", None)


def _optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Try to resolve a bearer token to a user but never raise — used for public endpoints."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        from app.utils.auth import decode_access_token
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id).first()
    except Exception:
        return None


# ─── Upload Session endpoints ──────────────────────────────────────────────────

@router.post("/tarantulas/{tarantula_id}/upload-session")
async def create_upload_session(
    tarantula_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived QR upload session for a tarantula.
    Returns a token and the full URL to encode in the QR code.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id,
    ).first()
    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Deactivate any existing sessions for this tarantula
    db.query(QRUploadSession).filter(
        QRUploadSession.tarantula_id == tarantula_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        tarantula_id=tarantula_id,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    web_base = getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")
    upload_url = f"{web_base}/upload/{token}"

    return {
        "token": token,
        "upload_url": upload_url,
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": SESSION_TTL_MINUTES,
        "tarantula_name": _tarantula_display_name(tarantula),
    }


@router.post("/snakes/{snake_id}/upload-session")
async def create_snake_upload_session(
    snake_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived QR upload session for a snake — mirror of the
    tarantula endpoint. Phone browser uses the returned token to upload
    photos without being logged in.
    """
    snake = db.query(Snake).filter(
        Snake.id == snake_id,
        Snake.user_id == current_user.id,
    ).first()
    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

    # Deactivate any existing sessions for this snake
    db.query(QRUploadSession).filter(
        QRUploadSession.snake_id == snake_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        snake_id=snake_id,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    web_base = getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")
    upload_url = f"{web_base}/upload/{token}"

    return {
        "token": token,
        "upload_url": upload_url,
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": SESSION_TTL_MINUTES,
        "taxon": "snake",
        "snake_name": _snake_display_name(snake),
    }


@router.post("/lizards/{lizard_id}/upload-session")
async def create_lizard_upload_session(
    lizard_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived QR upload session for a lizard — mirror of the
    tarantula/snake endpoints. Phone browser uses the returned token to
    upload photos without being logged in.
    """
    lizard = db.query(Lizard).filter(
        Lizard.id == lizard_id,
        Lizard.user_id == current_user.id,
    ).first()
    if not lizard:
        raise HTTPException(status_code=404, detail="Lizard not found")

    db.query(QRUploadSession).filter(
        QRUploadSession.lizard_id == lizard_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        lizard_id=lizard_id,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    web_base = getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")
    upload_url = f"{web_base}/upload/{token}"

    return {
        "token": token,
        "upload_url": upload_url,
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": SESSION_TTL_MINUTES,
        "taxon": "lizard",
        "lizard_name": _lizard_display_name(lizard),
    }


@router.get("/upload-sessions/{token}")
async def get_upload_session_info(token: str, db: Session = Depends(get_db)):
    """
    Public endpoint — the phone browser calls this on load to get animal
    info to display on the upload page. Returns taxon-aware payload so
    the upload page can render either tarantula or snake context.
    """
    session = db.query(QRUploadSession).filter(
        QRUploadSession.token == token,
        QRUploadSession.is_active == True,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")

    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        session.is_active = False
        db.commit()
        raise HTTPException(status_code=410, detail="Upload session has expired")

    taxon, parent = _session_parent(session)
    if parent is None:
        # CASCADE delete should have killed the session too; defensive branch.
        raise HTTPException(status_code=404, detail="Upload session parent no longer exists")

    if taxon == "tarantula":
        display_name = _tarantula_display_name(parent)
    elif taxon == "snake":
        display_name = _snake_display_name(parent)
    else:
        display_name = _lizard_display_name(parent)

    payload = {
        "valid": True,
        "taxon": taxon,
        "display_name": display_name,
        "common_name": parent.common_name,
        "scientific_name": parent.scientific_name,
        "photo_url": parent.photo_url,
        "expires_at": session.expires_at.isoformat(),
        "uploads_so_far": session.used_count,
    }
    # Back-compat for existing clients that read `tarantula_name`.
    if taxon == "tarantula":
        payload["tarantula_name"] = display_name
    return payload


@router.post("/upload-sessions/{token}/photo")
async def upload_photo_via_token(
    token: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Public endpoint — phone browser POSTs photo here. No auth required;
    the token is the credential.
    """
    session = db.query(QRUploadSession).filter(
        QRUploadSession.token == token,
        QRUploadSession.is_active == True,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")

    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        session.is_active = False
        db.commit()
        raise HTTPException(status_code=410, detail="Upload session has expired")

    # Enforce per-session upload cap — a leaked/brute-forced token must not
    # permit unlimited uploads.
    if (session.used_count or 0) >= MAX_UPLOADS_PER_SESSION:
        session.is_active = False
        db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"Upload limit reached for this session ({MAX_UPLOADS_PER_SESSION} photos).",
        )

    # Cheap preflight on Content-Type — magic-byte check is the authoritative one.
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    file_data = await file.read()

    # Enforce size cap to prevent storage abuse via a leaked token.
    if len(file_data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
        )

    # Validate by magic bytes — do not trust the client-supplied Content-Type.
    try:
        validate_image_bytes(file_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=file.content_type,
        )

        # Taxon-aware photo insert — Photo has a CHECK constraint enforcing
        # exactly-one-parent, so we pick the correct FK column based on
        # which parent the session was created for.
        taxon, parent = _session_parent(session)
        if parent is None:
            raise HTTPException(status_code=410, detail="Upload session parent no longer exists")

        photo_kwargs = {
            "id": str(uuid.uuid4()),
            "url": photo_url,
            "thumbnail_url": thumbnail_url,
            "caption": caption,
            "taken_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        }
        if taxon == "tarantula":
            photo_kwargs["tarantula_id"] = str(session.tarantula_id)
        elif taxon == "snake":
            photo_kwargs["snake_id"] = str(session.snake_id)
        else:
            photo_kwargs["lizard_id"] = str(session.lizard_id)

        photo = Photo(**photo_kwargs)
        db.add(photo)

        # Set as main photo if none exists (Tarantula, Snake, and Lizard all expose photo_url).
        if not parent.photo_url:
            parent.photo_url = photo_url

        if taxon == "tarantula":
            display_name = _tarantula_display_name(parent)
        elif taxon == "snake":
            display_name = _snake_display_name(parent)
        else:
            display_name = _lizard_display_name(parent)

        session.used_count = (session.used_count or 0) + 1
        # Auto-deactivate on the last allowed upload so the token becomes dead.
        if session.used_count >= MAX_UPLOADS_PER_SESSION:
            session.is_active = False
        db.commit()
        db.refresh(photo)

        resp = {
            "success": True,
            "photo_id": str(photo.id),
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "taxon": taxon,
            "display_name": display_name,
            "uploads_this_session": session.used_count,
            "uploads_remaining": max(0, MAX_UPLOADS_PER_SESSION - session.used_count),
        }
        # Back-compat field for existing clients.
        if taxon == "tarantula":
            resp["tarantula_name"] = display_name
        return resp

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("QR upload failed for session %s", session.id)
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")


# ─── Public Tarantula Profile (/t/{id}) ───────────────────────────────────────

@router.get("/t/{tarantula_id}")
async def get_public_tarantula_profile(
    tarantula_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """
    Permanent public profile for a tarantula — the QR code destination.

    Access levels:
      • owner (auth matches)         → full detail including private logs
      • other keeper / unauthenticated → public info only (respects collection_visibility)
    """
    try:
        t_uuid = uuid.UUID(tarantula_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tarantula ID")

    tarantula = db.query(Tarantula).filter(Tarantula.id == t_uuid).first()
    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    is_owner = current_user and str(current_user.id) == str(tarantula.user_id)

    # Non-owners can only see public collections
    owner = db.query(User).filter(User.id == tarantula.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"

    if not is_owner and not collection_public:
        raise HTTPException(
            status_code=403,
            detail="This collection is private",
        )

    # Species care sheet info
    species_data = None
    if tarantula.species_id:
        sp = db.query(Species).filter(Species.id == tarantula.species_id).first()
        if sp:
            species_data = {
                "id": str(sp.id),
                "scientific_name": sp.scientific_name,
                "common_names": sp.common_names or [],
                "care_level": sp.care_level,
                "temperament": sp.temperament,
                "type": sp.type,
                "temperature_min": float(sp.temperature_min) if sp.temperature_min else None,
                "temperature_max": float(sp.temperature_max) if sp.temperature_max else None,
                "humidity_min": float(sp.humidity_min) if sp.humidity_min else None,
                "humidity_max": float(sp.humidity_max) if sp.humidity_max else None,
                "urticating_hairs": sp.urticating_hairs,
                "medically_significant_venom": sp.medically_significant_venom,
                "image_url": sp.image_url,
            }

    # Most recent ACCEPTED feeding — refused offers shouldn't reset the
    # "last fed" indicator on the public profile (same Brooke-on-EST
    # bug class fixed in tarantulas.py + enclosures.py 2026-04-24).
    # Surfacing a refusal as "fed today" misleads viewers about whether
    # the spider is actually being fed on schedule.
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == t_uuid,
        FeedingLog.accepted.is_(True),
    ).order_by(FeedingLog.fed_at.desc()).first()

    # Most recent molt
    last_molt = db.query(MoltLog).filter(
        MoltLog.tarantula_id == t_uuid
    ).order_by(MoltLog.molted_at.desc()).first()

    # Photos (max 10 for public view)
    photos = db.query(Photo).filter(
        Photo.tarantula_id == t_uuid
    ).order_by(Photo.created_at.desc()).limit(10).all()

    # Lineage — parents via Pairing / Offspring
    lineage = _get_lineage(tarantula_id, db)

    # Build response
    base = {
        "id": str(tarantula.id),
        "name": tarantula.name,
        "common_name": tarantula.common_name,
        "scientific_name": tarantula.scientific_name,
        "display_name": _tarantula_display_name(tarantula),
        "sex": tarantula.sex.value if tarantula.sex else None,
        "photo_url": tarantula.photo_url,
        "is_owner": is_owner,
        "owner_username": owner.username if owner else None,
        "species": species_data,
        "photos": [
            {
                "id": str(p.id),
                "url": p.url,
                "thumbnail_url": p.thumbnail_url,
                "caption": p.caption,
                "taken_at": p.taken_at.isoformat() if p.taken_at else None,
            }
            for p in photos
        ],
        "lineage": lineage,
        "last_feeding": {
            "date": last_feeding.fed_at.isoformat(),
            "food_type": last_feeding.food_type,
            "food_size": last_feeding.food_size,
            "accepted": last_feeding.accepted,
        } if last_feeding else None,
        "last_molt": {
            "date": last_molt.molted_at.isoformat(),
            "leg_span_after": float(last_molt.leg_span_after) if last_molt and last_molt.leg_span_after else None,
            "weight_after": float(last_molt.weight_after) if last_molt and last_molt.weight_after else None,
        } if last_molt else None,
    }

    # Owner gets extra fields
    if is_owner:
        base["husbandry"] = {
            "enclosure_type": tarantula.enclosure_type.value if tarantula.enclosure_type else None,
            "enclosure_size": tarantula.enclosure_size,
            "substrate_type": tarantula.substrate_type,
            "substrate_depth": tarantula.substrate_depth,
            "last_substrate_change": tarantula.last_substrate_change.isoformat() if tarantula.last_substrate_change else None,
            "target_temp_min": float(tarantula.target_temp_min) if tarantula.target_temp_min else None,
            "target_temp_max": float(tarantula.target_temp_max) if tarantula.target_temp_max else None,
            "target_humidity_min": float(tarantula.target_humidity_min) if tarantula.target_humidity_min else None,
            "target_humidity_max": float(tarantula.target_humidity_max) if tarantula.target_humidity_max else None,
            "water_dish": tarantula.water_dish,
            "misting_schedule": tarantula.misting_schedule,
        }
        base["date_acquired"] = tarantula.date_acquired.isoformat() if tarantula.date_acquired else None
        base["source"] = tarantula.source.value if tarantula.source else None
        base["notes"] = tarantula.notes

    return base


# ─── Public Snake Profile (/s/{id}) ───────────────────────────────────────────

@router.get("/s/{snake_id}")
async def get_public_snake_profile(
    snake_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Permanent public profile for a snake — the snake QR destination.

    Parallels `/t/{tarantula_id}`. Returns:
      • owner (auth matches)           → full detail (husbandry, acquisition, notes)
      • other keeper / unauthenticated → public-safe card (respects collection_visibility)

    Snake biology shapes the payload — no molts/leg span, yes sheds/weight/length.
    """
    try:
        s_uuid = uuid.UUID(snake_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid snake ID")

    snake = db.query(Snake).filter(Snake.id == s_uuid).first()
    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

    is_owner = current_user and str(current_user.id) == str(snake.user_id)

    owner = db.query(User).filter(User.id == snake.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"

    if not is_owner and not collection_public:
        raise HTTPException(status_code=403, detail="This collection is private")

    # Reptile species care card — separate table from tarantula Species per ADR-002.
    species_data = None
    if snake.reptile_species_id:
        try:
            from app.models.reptile_species import ReptileSpecies
            rsp = db.query(ReptileSpecies).filter(
                ReptileSpecies.id == snake.reptile_species_id
            ).first()
            if rsp:
                species_data = {
                    "id": str(rsp.id),
                    "scientific_name": rsp.scientific_name,
                    "common_names": getattr(rsp, "common_names", None) or [],
                    "care_level": getattr(rsp, "care_level", None),
                    "temperament": getattr(rsp, "temperament", None),
                    "adult_size": getattr(rsp, "adult_size", None),
                    "temperature_min": float(rsp.temperature_min) if getattr(rsp, "temperature_min", None) else None,
                    "temperature_max": float(rsp.temperature_max) if getattr(rsp, "temperature_max", None) else None,
                    "humidity_min": float(rsp.humidity_min) if getattr(rsp, "humidity_min", None) else None,
                    "humidity_max": float(rsp.humidity_max) if getattr(rsp, "humidity_max", None) else None,
                    "image_url": getattr(rsp, "image_url", None),
                }
        except Exception:
            # ReptileSpecies schema is still evolving — missing columns shouldn't 500 the profile page.
            species_data = None

    # Most recent ACCEPTED feeding — refusals shouldn't reset the
    # "last fed" indicator on the public profile. Same Brooke-on-EST
    # bug class fixed in tarantulas.py + enclosures.py + the tarantula
    # public profile above (2026-04-24).
    last_feeding = (
        db.query(FeedingLog)
        .filter(
            FeedingLog.snake_id == s_uuid,
            FeedingLog.accepted.is_(True),
        )
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )

    # Most recent shed (snake analog of tarantula molt)
    last_shed = (
        db.query(ShedLog)
        .filter(ShedLog.snake_id == s_uuid)
        .order_by(ShedLog.shed_at.desc())
        .first()
    )

    photos = (
        db.query(Photo)
        .filter(Photo.snake_id == s_uuid)
        .order_by(Photo.created_at.desc())
        .limit(10)
        .all()
    )

    base = {
        "id": str(snake.id),
        "taxon": "snake",
        "name": snake.name,
        "common_name": snake.common_name,
        "scientific_name": snake.scientific_name,
        "display_name": _snake_display_name(snake),
        "sex": snake.sex.value if snake.sex else None,
        "photo_url": snake.photo_url,
        "is_owner": is_owner,
        "owner_username": owner.username if owner else None,
        "species": species_data,
        "current_weight_g": float(snake.current_weight_g) if snake.current_weight_g else None,
        "current_length_in": float(snake.current_length_in) if snake.current_length_in else None,
        "photos": [
            {
                "id": str(p.id),
                "url": p.url,
                "thumbnail_url": p.thumbnail_url,
                "caption": p.caption,
                "taken_at": p.taken_at.isoformat() if p.taken_at else None,
            }
            for p in photos
        ],
        "last_feeding": {
            "date": last_feeding.fed_at.isoformat(),
            "food_type": last_feeding.food_type,
            "food_size": last_feeding.food_size,
            "accepted": last_feeding.accepted,
        } if last_feeding else None,
        "last_shed": {
            "date": last_shed.shed_at.isoformat() if last_shed.shed_at else None,
            "is_complete_shed": last_shed.is_complete_shed,
            "has_retained_shed": last_shed.has_retained_shed,
        } if last_shed else None,
    }

    if is_owner:
        base["husbandry"] = {
            "feeding_schedule": snake.feeding_schedule,
            "last_fed_at": snake.last_fed_at.isoformat() if snake.last_fed_at else None,
            "last_shed_at": snake.last_shed_at.isoformat() if snake.last_shed_at else None,
            "brumation_active": snake.brumation_active,
            "brumation_started_at": snake.brumation_started_at.isoformat() if snake.brumation_started_at else None,
        }
        base["date_acquired"] = snake.date_acquired.isoformat() if snake.date_acquired else None
        base["hatch_date"] = snake.hatch_date.isoformat() if snake.hatch_date else None
        base["source"] = snake.source.value if snake.source else None
        base["source_breeder"] = snake.source_breeder
        base["notes"] = snake.notes

    return base


# ─── Public Lizard Profile (/l/{id}) ──────────────────────────────────────────

@router.get("/l/{lizard_id}")
async def get_public_lizard_profile(
    lizard_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Permanent public profile for a lizard — the lizard QR destination.

    Parallels `/s/{snake_id}`. Biology is close enough to snakes that the
    payload shape mirrors the snake one — sheds, weight, length — though
    some lizard species (geckos, bearded dragons) shed less dramatically
    than snakes. If a linked species sheet exists, it surfaces care
    parameters so a visitor with no context can still read the card.
    """
    try:
        l_uuid = uuid.UUID(lizard_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lizard ID")

    lizard = db.query(Lizard).filter(Lizard.id == l_uuid).first()
    if not lizard:
        raise HTTPException(status_code=404, detail="Lizard not found")

    is_owner = current_user and str(current_user.id) == str(lizard.user_id)

    owner = db.query(User).filter(User.id == lizard.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"

    if not is_owner and not collection_public:
        raise HTTPException(status_code=403, detail="This collection is private")

    species_data = None
    if lizard.reptile_species_id:
        try:
            from app.models.reptile_species import ReptileSpecies
            rsp = db.query(ReptileSpecies).filter(
                ReptileSpecies.id == lizard.reptile_species_id
            ).first()
            if rsp:
                species_data = {
                    "id": str(rsp.id),
                    "scientific_name": rsp.scientific_name,
                    "common_names": getattr(rsp, "common_names", None) or [],
                    "care_level": getattr(rsp, "care_level", None),
                    "temperament": getattr(rsp, "temperament", None),
                    "adult_size": getattr(rsp, "adult_size", None),
                    "temperature_min": float(rsp.temperature_min) if getattr(rsp, "temperature_min", None) else None,
                    "temperature_max": float(rsp.temperature_max) if getattr(rsp, "temperature_max", None) else None,
                    "humidity_min": float(rsp.humidity_min) if getattr(rsp, "humidity_min", None) else None,
                    "humidity_max": float(rsp.humidity_max) if getattr(rsp, "humidity_max", None) else None,
                    "image_url": getattr(rsp, "image_url", None),
                }
        except Exception:
            species_data = None

    # Most recent ACCEPTED feeding — see tarantula + snake versions
    # above. Refusals are tracked separately and shouldn't masquerade
    # as a fed event on the public profile.
    last_feeding = (
        db.query(FeedingLog)
        .filter(
            FeedingLog.lizard_id == l_uuid,
            FeedingLog.accepted.is_(True),
        )
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )

    last_shed = (
        db.query(ShedLog)
        .filter(ShedLog.lizard_id == l_uuid)
        .order_by(ShedLog.shed_at.desc())
        .first()
    )

    photos = (
        db.query(Photo)
        .filter(Photo.lizard_id == l_uuid)
        .order_by(Photo.created_at.desc())
        .limit(10)
        .all()
    )

    base = {
        "id": str(lizard.id),
        "taxon": "lizard",
        "name": lizard.name,
        "common_name": lizard.common_name,
        "scientific_name": lizard.scientific_name,
        "display_name": _lizard_display_name(lizard),
        "sex": lizard.sex.value if lizard.sex else None,
        "photo_url": lizard.photo_url,
        "is_owner": is_owner,
        "owner_username": owner.username if owner else None,
        "species": species_data,
        "current_weight_g": float(lizard.current_weight_g) if lizard.current_weight_g else None,
        "current_length_in": float(lizard.current_length_in) if lizard.current_length_in else None,
        "photos": [
            {
                "id": str(p.id),
                "url": p.url,
                "thumbnail_url": p.thumbnail_url,
                "caption": p.caption,
                "taken_at": p.taken_at.isoformat() if p.taken_at else None,
            }
            for p in photos
        ],
        "last_feeding": {
            "date": last_feeding.fed_at.isoformat(),
            "food_type": last_feeding.food_type,
            "food_size": last_feeding.food_size,
            "accepted": last_feeding.accepted,
        } if last_feeding else None,
        "last_shed": {
            "date": last_shed.shed_at.isoformat() if last_shed.shed_at else None,
            "is_complete_shed": last_shed.is_complete_shed,
            "has_retained_shed": last_shed.has_retained_shed,
        } if last_shed else None,
    }

    if is_owner:
        base["husbandry"] = {
            "feeding_schedule": lizard.feeding_schedule,
            "last_fed_at": lizard.last_fed_at.isoformat() if lizard.last_fed_at else None,
            "last_shed_at": lizard.last_shed_at.isoformat() if lizard.last_shed_at else None,
            "brumation_active": lizard.brumation_active,
            "brumation_started_at": lizard.brumation_started_at.isoformat() if lizard.brumation_started_at else None,
        }
        base["date_acquired"] = lizard.date_acquired.isoformat() if lizard.date_acquired else None
        base["hatch_date"] = lizard.hatch_date.isoformat() if lizard.hatch_date else None
        base["source"] = lizard.source.value if lizard.source else None
        base["source_breeder"] = lizard.source_breeder
        base["notes"] = lizard.notes

    return base


def _get_lineage(tarantula_id: str, db: Session) -> dict:
    """Return parent info if this tarantula was produced from a tracked pairing."""
    try:
        from app.models.offspring import Offspring
        from app.models.pairing import Pairing

        offspring_record = db.query(Offspring).filter(
            Offspring.tarantula_id == tarantula_id
        ).first()

        if not offspring_record or not offspring_record.egg_sac_id:
            return {}

        from app.models.egg_sac import EggSac
        egg_sac = db.query(EggSac).filter(EggSac.id == offspring_record.egg_sac_id).first()
        if not egg_sac or not egg_sac.pairing_id:
            return {}

        pairing = db.query(Pairing).filter(Pairing.id == egg_sac.pairing_id).first()
        if not pairing:
            return {}

        def _parent_summary(t: Tarantula):
            if not t:
                return None
            return {
                "id": str(t.id),
                "display_name": _tarantula_display_name(t),
                "scientific_name": t.scientific_name,
                "sex": t.sex.value if t.sex else None,
                "photo_url": t.photo_url,
            }

        return {
            "pairing_date": pairing.paired_date.isoformat() if pairing.paired_date else None,
            "father": _parent_summary(pairing.male),
            "mother": _parent_summary(pairing.female),
        }

    except Exception:
        return {}
