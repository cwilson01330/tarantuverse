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
from app.models.photo import Photo
from app.models.user import User
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
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


@router.get("/upload-sessions/{token}")
async def get_upload_session_info(token: str, db: Session = Depends(get_db)):
    """
    Public endpoint — the phone browser calls this on load to get tarantula
    info to display on the upload page.
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

    t = session.tarantula
    return {
        "valid": True,
        "tarantula_name": _tarantula_display_name(t),
        "common_name": t.common_name,
        "scientific_name": t.scientific_name,
        "photo_url": t.photo_url,
        "expires_at": session.expires_at.isoformat(),
        "uploads_so_far": session.used_count,
    }


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

        photo = Photo(
            id=str(uuid.uuid4()),
            tarantula_id=str(session.tarantula_id),
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(photo)

        # Set as main photo if none exists
        tarantula = session.tarantula
        if not tarantula.photo_url:
            tarantula.photo_url = photo_url

        session.used_count = (session.used_count or 0) + 1
        # Auto-deactivate on the last allowed upload so the token becomes dead.
        if session.used_count >= MAX_UPLOADS_PER_SESSION:
            session.is_active = False
        db.commit()
        db.refresh(photo)

        return {
            "success": True,
            "photo_id": str(photo.id),
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "tarantula_name": _tarantula_display_name(tarantula),
            "uploads_this_session": session.used_count,
            "uploads_remaining": max(0, MAX_UPLOADS_PER_SESSION - session.used_count),
        }

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

    # Most recent feeding
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == t_uuid
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
