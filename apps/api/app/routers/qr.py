"""
QR Identity System

Two distinct concerns handled here:

1. Upload Sessions  — owner creates a short-lived token, phone browser uses it to
                      upload photos without being logged in.

2. Public Profiles  — permanent public URL for any tarantula (/api/v1/t/{id})
                      or HV animal (/api/v1/a/{id}). Returns context-appropriate
                      data:
                        • owner (auth token provided) → full detail + quick-log access
                        • other logged-in keeper      → public profile (if collection public)
                        • unauthenticated             → read-only care card

ADR-003: the per-taxon snake/lizard tables collapsed into `animals`, so
the snake/lizard upload-session endpoints and the `/s/{id}` + `/l/{id}`
public-profile routes collapse into `/animals/{id}/upload-session` and
`/a/{id}` respectively.
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
from app.models.animal import Animal
from app.models.scorpion import Scorpion
from app.models.invert import Invert
from app.models.colony import Colony
from app.models.invert_species import InvertSpecies
from app.models.photo import Photo
from app.models.user import User
from app.models.follow import Follow
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.shed_log import ShedLog
from app.models.species import Species
from app.utils.dependencies import get_current_user
from app.utils.file_validation import validate_image_bytes
from app.utils.hero_photo import sync_hero_photo
from app.services.storage import storage_service
from app.services.inverts_dualwrite import invert_id_if_exists  # ADR-005 A2
from app.config import settings
from app.utils.access import policy
from app.utils.legacy_logs import tarantula_logs

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


def _animal_display_name(a: Animal) -> str:
    """Display-name helper for HV animals — name + common/scientific
    fallback, same shape as the tarantula helper."""
    parts = []
    if a.name:
        parts.append(a.name)
    label = a.common_name or a.scientific_name
    if label:
        parts.append(f"({label})" if a.name else label)
    return " ".join(parts) or "Unknown"


def _scorpion_display_name(s: Scorpion) -> str:
    """Display-name helper for scorpions — same shape as tarantula /
    animal so the upload page renders identically across taxa."""
    parts = []
    if s.name:
        parts.append(s.name)
    label = s.common_name or s.scientific_name
    if label:
        parts.append(f"({label})" if s.name else label)
    return " ".join(parts) or "Unknown"


def _invert_display_name(i: Invert) -> str:
    """Display-name helper for inverts (currently used for centipedes
    — they have no legacy table and the QR session resolves to the
    Invert row directly)."""
    parts = []
    if i.name:
        parts.append(i.name)
    label = i.common_name or i.scientific_name
    if label:
        parts.append(f"({label})" if i.name else label)
    return " ".join(parts) or "Unknown"


def _session_parent(session: QRUploadSession) -> tuple[str, object | None]:
    """Return (kind, parent_row) for a session.

    `kind` is 'tarantula', 'animal', 'scorpion', 'invert', or 'colony'. `row`
    may be None only if the parent was hard-deleted after session
    creation (shouldn't happen — FKs are CASCADE — but defensive).

    For centipede sessions, only `invert_id` is set — the relationship
    on QRUploadSession exposes that row as `session.invert`.
    """
    if session.tarantula_id:
        return ("tarantula", session.tarantula)
    if session.animal_id:
        return ("animal", session.animal)
    if session.scorpion_id:
        return ("scorpion", session.scorpion)
    if session.invert_id:
        # Centipede sessions land here. Other taxa that launch on the
        # consolidated surface in the future will share this branch.
        return ("invert", session.invert)
    if session.colony_id:
        return ("colony", session.colony)
    return ("unknown", None)


def _session_taxon_str(kind: str, parent) -> str:
    """The `taxon` value the upload page renders context from.

    For tarantula / scorpion parents it's the literal kind; for an
    animal parent it's the animal's own taxon
    ('snake' / 'lizard' / 'frog'); for an invert parent it's
    `parent.taxon` (currently 'centipede')."""
    if kind == "tarantula":
        return "tarantula"
    if kind == "scorpion":
        return "scorpion"
    if kind == "animal" and parent is not None:
        return parent.taxon.value if hasattr(parent.taxon, "value") else str(parent.taxon)
    if kind in ("invert", "colony") and parent is not None:
        return parent.taxon if isinstance(parent.taxon, str) else str(parent.taxon)
    return "unknown"


def _display_name_for(kind: str, parent) -> str:
    """One-stop dispatcher so the photo-upload flow doesn't have to
    branch on `kind` repeatedly. Returns 'Unknown' if parent is None."""
    if parent is None:
        return "Unknown"
    if kind == "tarantula":
        return _tarantula_display_name(parent)
    if kind == "scorpion":
        return _scorpion_display_name(parent)
    if kind == "animal":
        return _animal_display_name(parent)
    if kind == "invert":
        return _invert_display_name(parent)
    if kind == "colony":
        return parent.name or "Unknown"
    return "Unknown"


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
@policy("owner_only")
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
        invert_id=invert_id_if_exists(db, tarantula_id),  # ADR-005 A2
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


@router.post("/animals/{animal_id}/upload-session")
@policy("owner_only")
async def create_animal_upload_session(
    animal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived QR upload session for an HV animal (any taxon).
    ADR-003 collapsed the per-taxon snake/lizard endpoints into this one.
    Phone browser uses the returned token to upload photos without being
    logged in.
    """
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    # Deactivate any existing sessions for this animal
    db.query(QRUploadSession).filter(
        QRUploadSession.animal_id == animal_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        animal_id=animal_id,
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
        "taxon": animal.taxon.value if hasattr(animal.taxon, "value") else str(animal.taxon),
        "animal_name": _animal_display_name(animal),
    }


@router.post("/inverts/{invert_id}/upload-session")
@policy("owner_only")
async def create_invert_upload_session(
    invert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a short-lived QR upload session for ANY taxon.

    This is the taxon-agnostic replacement for the per-taxon siblings below
    (`/tarantulas/`, `/scorpions/`, `/centipedes/`). Those were added one at a
    time as taxa shipped, which meant every new taxon either got a copy of this
    function or silently had no QR at all — the latter is what happened to the
    six taxa added after centipede.

    Matching on the unified `inverts` table (ADR-005) covers every taxon
    including tarantula, so the QR feature stops being a per-taxon privilege.
    The legacy routes stay for older app builds still calling them.
    """
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")

    # A newly-generated QR supersedes the old one, same as every sibling route.
    db.query(QRUploadSession).filter(
        QRUploadSession.invert_id == invert_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        invert_id=invert_id,
        # Tarantulas keep their legacy FK populated too — the upload handler
        # and public profile routes still resolve through it for older rows.
        tarantula_id=invert_id if invert.taxon == "tarantula" else None,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    web_base = getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")

    return {
        "token": token,
        "upload_url": f"{web_base}/upload/{token}",
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": SESSION_TTL_MINUTES,
        "taxon": invert.taxon,
        "animal_name": invert.name or invert.common_name or invert.scientific_name,
    }


@router.post("/colonies/{colony_id}/upload-session")
@policy("owner_only")
async def create_colony_upload_session(
    colony_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a short-lived QR upload session for a population colony.

    Same access rule as `/inverts/{id}/upload-session`: the owner only. A
    co-keeper or a stranger gets the same 404 an unknown id does. Photos that
    arrive through the token are never capped (colony photos are uncapped by
    design).
    """
    colony = db.query(Colony).filter(
        Colony.id == colony_id,
        Colony.user_id == current_user.id,
    ).first()
    if not colony:
        raise HTTPException(status_code=404, detail="Colony not found")

    # A newly-generated QR supersedes the old one, same as every sibling route.
    db.query(QRUploadSession).filter(
        QRUploadSession.colony_id == colony_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        colony_id=colony_id,
        user_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    web_base = getattr(settings, "FRONTEND_URL", "https://tarantuverse.com")

    return {
        "token": token,
        "upload_url": f"{web_base}/upload/{token}",
        "expires_at": expires_at.isoformat(),
        "expires_in_minutes": SESSION_TTL_MINUTES,
        "taxon": colony.taxon,
        "kind": "colony",
        "animal_name": colony.name,
    }


@router.post("/scorpions/{scorpion_id}/upload-session")
@policy("owner_only")
async def create_scorpion_upload_session(
    scorpion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a short-lived QR upload session for a scorpion.

    Phone browser uses the returned token to upload photos without
    being logged in — mirrors the tarantula + animal sibling routes."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()
    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    # Deactivate any existing active session for this scorpion so a
    # newly-generated QR supersedes the old one — same UX as tarantulas.
    db.query(QRUploadSession).filter(
        QRUploadSession.scorpion_id == scorpion_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        scorpion_id=scorpion_id,
        invert_id=invert_id_if_exists(db, scorpion_id),  # ADR-005 A2
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
        "taxon": "scorpion",
        "scorpion_name": _scorpion_display_name(scorpion),
    }


@router.post("/centipedes/{centipede_id}/upload-session")
@policy("owner_only")
async def create_centipede_upload_session(
    centipede_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a short-lived QR upload session for a centipede.

    Centipedes have no legacy per-taxon table — the QR session
    references them only through `invert_id`. The upload page then
    receives `taxon: 'centipede'` from the session-info endpoint and
    renders the centipede-specific context (segment count, leg pairs,
    venom callout).
    """
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    # Deactivate any existing active session for this centipede so a
    # newly-generated QR supersedes the old one — same UX as the other
    # taxa.
    db.query(QRUploadSession).filter(
        QRUploadSession.invert_id == centipede_id,
        QRUploadSession.user_id == current_user.id,
        QRUploadSession.is_active == True,
    ).update({"is_active": False})

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

    session = QRUploadSession(
        token=token,
        invert_id=centipede_id,
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
        "taxon": "centipede",
        "centipede_name": _invert_display_name(centipede),
    }


@router.get("/upload-sessions/{token}")
@policy("public")
async def get_upload_session_info(token: str, db: Session = Depends(get_db)):
    """
    Public endpoint — the phone browser calls this on load to get the
    parent's info to display on the upload page. Returns a taxon-aware
    payload so the upload page can render tarantula or animal context.
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

    kind, parent = _session_parent(session)
    if parent is None:
        # CASCADE delete should have killed the session too; defensive branch.
        raise HTTPException(status_code=404, detail="Upload session parent no longer exists")

    display_name = _display_name_for(kind, parent)

    if kind == "colony":
        # A colony has no name columns of its own; the species carries them.
        sp = parent.species
        common_name = sp.common_names[0] if sp is not None and sp.common_names else None
        scientific_name = sp.scientific_name if sp is not None else None
    else:
        common_name = parent.common_name
        scientific_name = parent.scientific_name

    payload = {
        "valid": True,
        "taxon": _session_taxon_str(kind, parent),
        "display_name": display_name,
        "common_name": common_name,
        "scientific_name": scientific_name,
        "photo_url": parent.photo_url,
        "expires_at": session.expires_at.isoformat(),
        "uploads_so_far": session.used_count,
    }
    # Back-compat for existing clients that read `tarantula_name`.
    if kind == "tarantula":
        payload["tarantula_name"] = display_name
    elif kind == "scorpion":
        payload["scorpion_name"] = display_name
    elif kind == "invert" and parent is not None:
        # Centipede sessions land here. Use the parent's actual taxon
        # to key the back-compat name field (future-proofs against
        # additional taxa launched on the consolidated surface).
        taxon_key = parent.taxon if isinstance(parent.taxon, str) else str(parent.taxon)
        payload[f"{taxon_key}_name"] = display_name
    elif kind == "colony":
        payload["kind"] = "colony"
    return payload


@router.post("/upload-sessions/{token}/photo")
@policy("public")
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

    # Free-plan photo limit for Tarantuverse animals. A QR upload used to be a
    # way round it. Herpetoverse animals ('animal' sessions) and colonies
    # aren't capped (by design) — they fall outside the tuple below.
    qr_kind, _ = _session_parent(session)
    if qr_kind in ("tarantula", "scorpion", "invert") and session.user is not None:
        from app.utils.limits import enforce_photo_cap
        enforce_photo_cap(
            db, session.user,
            session.invert_id or session.tarantula_id or session.scorpion_id,
        )

    file_data = await file.read()

    # Enforce size cap to prevent storage abuse via a leaked token.
    if len(file_data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB.",
        )

    # Validate by magic bytes — do not trust the client-supplied Content-Type.
    try:
        detected_mime = validate_image_bytes(file_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            # The detected type, never the client's claim (the storage layer
            # re-derives it from the bytes anyway).
            content_type=detected_mime,
        )

        # Photo has a CHECK constraint enforcing exactly-one-parent
        # (tarantula_id, animal_id, or scorpion_id — see scp_20260522).
        # Pick the right FK column based on session kind.
        kind, parent = _session_parent(session)
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
        # ADR-005 A2 — also populate invert_id for tarantula/scorpion
        # parents so the new unified photos view sees this row.
        # Centipede sessions land on the `invert` branch — only
        # invert_id is set (CHECK widened in cip_20260527).
        if kind == "tarantula":
            photo_kwargs["tarantula_id"] = str(session.tarantula_id)
            photo_kwargs["invert_id"] = invert_id_if_exists(db, session.tarantula_id)
        elif kind == "scorpion":
            photo_kwargs["scorpion_id"] = str(session.scorpion_id)
            photo_kwargs["invert_id"] = invert_id_if_exists(db, session.scorpion_id)
        elif kind == "invert":
            photo_kwargs["invert_id"] = str(session.invert_id)
        elif kind == "colony":
            # Colony photos carry colony_id only (photos_must_have_exactly_one_parent).
            photo_kwargs["colony_id"] = str(session.colony_id)
        else:
            photo_kwargs["animal_id"] = str(session.animal_id)

        photo = Photo(**photo_kwargs)
        db.add(photo)

        # Set as main photo if none exists. Tarantula, Animal, and Scorpion all
        # expose `photo_url`. Goes through sync_hero_photo so a QR upload
        # reaches BOTH rows of the dual-write pair — a bare assignment here
        # would update whichever row the session resolved and leave the other
        # stale, which is the bug fixed in photos.py.
        if not parent.photo_url:
            sync_hero_photo(db, parent, photo_url)

        display_name = _display_name_for(kind, parent)

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
            "taxon": _session_taxon_str(kind, parent),
            "display_name": display_name,
            "uploads_this_session": session.used_count,
            "uploads_remaining": max(0, MAX_UPLOADS_PER_SESSION - session.used_count),
        }
        # Back-compat fields for existing clients keyed by parent kind.
        if kind == "tarantula":
            resp["tarantula_name"] = display_name
        elif kind == "scorpion":
            resp["scorpion_name"] = display_name
        elif kind == "invert" and parent is not None:
            taxon_key = parent.taxon if isinstance(parent.taxon, str) else str(parent.taxon)
            resp[f"{taxon_key}_name"] = display_name
        elif kind == "colony":
            resp["kind"] = "colony"
        return resp

    except HTTPException:
        raise
    except ValueError:
        db.rollback()
        raise HTTPException(status_code=400, detail="That file isn't a readable image. Try another photo.")
    except Exception:
        db.rollback()
        logger.exception("QR upload failed for session %s", session.id)
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")


# ─── Public Tarantula Profile (/t/{id}) ───────────────────────────────────────

@router.get("/t/{tarantula_id}")
@policy("public")
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
    # "last fed" indicator on the public profile.
    last_feeding = db.query(FeedingLog).filter(
        tarantula_logs(FeedingLog, t_uuid),
        FeedingLog.accepted.is_(True),
    ).order_by(FeedingLog.fed_at.desc()).first()

    # Most recent molt
    last_molt = db.query(MoltLog).filter(
        tarantula_logs(MoltLog, t_uuid)
    ).order_by(MoltLog.molted_at.desc()).first()

    # Photos (max 10 for public view)
    photos = db.query(Photo).filter(
        tarantula_logs(Photo, t_uuid)
    ).order_by(Photo.created_at.desc()).limit(10).all()

    # Lineage — parents via Pairing / Offspring
    lineage = _get_lineage(tarantula_id, db)

    # Provenance — the immutable transfer snapshot on the unified Invert mirror
    # (Invert.id == Tarantula.id). Public-safe: the snapshot never holds
    # sale_price. None for animals that were never transferred in.
    invert_mirror = db.query(Invert).filter(Invert.id == t_uuid).first()
    provenance = invert_mirror.provenance if invert_mirror else None

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
        # Lets a logged-in, non-owner viewer follow the keeper inline. False
        # for anonymous viewers and for the owner themselves.
        "is_following": (
            db.query(Follow).filter(
                Follow.follower_id == current_user.id,
                Follow.followed_id == owner.id,
            ).first() is not None
        ) if (current_user and owner and not is_owner) else False,
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
        "provenance": provenance,
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


# ─── Public Invert Profile (/i/{id}) ─────────────────────────────────────────

@router.get("/i/{invert_id}")
@policy("public")
async def get_public_invert_profile(
    invert_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Permanent public profile for any invert — the QR destination.

    WHY THIS EXISTS
    ---------------
    `/t/{id}` reads the legacy `tarantulas` table, so it 404s for a mantis,
    jumper or isopod. Mobile's QRSheet has been generating enclosure labels
    for every taxon and pointing them all at `/t/{id}` — meaning a keeper
    could print a label, stick it on a mantis tub, scan it, and get an error.
    This is the honest destination for those codes.

    Mirrors the `/t/{id}` shape so the two public pages can stay recognisably
    the same thing, with `taxon` added and the species block sourced from
    `invert_species` (which carries the per-taxon safety fields a tarantula
    care sheet has no column for).

    Access levels match `/t/{id}`: the owner sees husbandry and notes;
    everyone else sees the public card, and only when the collection is
    public.
    """
    try:
        i_uuid = uuid.UUID(invert_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid animal ID")

    invert = db.query(Invert).filter(Invert.id == i_uuid).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")

    is_owner = current_user and str(current_user.id) == str(invert.user_id)

    owner = db.query(User).filter(User.id == invert.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"
    if not is_owner and not collection_public:
        raise HTTPException(status_code=403, detail="This collection is private")

    species_data = None
    if invert.species_id:
        sp = db.query(InvertSpecies).filter(
            InvertSpecies.id == invert.species_id
        ).first()
        if sp:
            species_data = {
                "id": str(sp.id),
                "taxon": sp.taxon,
                "scientific_name": sp.scientific_name,
                "common_names": sp.common_names or [],
                "care_level": sp.care_level,
                "temperament": sp.temperament,
                "type": sp.type,
                "temperature_min": float(sp.temperature_min) if sp.temperature_min else None,
                "temperature_max": float(sp.temperature_max) if sp.temperature_max else None,
                "humidity_min": float(sp.humidity_min) if sp.humidity_min else None,
                "humidity_max": float(sp.humidity_max) if sp.humidity_max else None,
                # The safety fields that actually apply across eleven taxa.
                # `urticating_hairs` is a tarantula fact; a millipede's hazard
                # is a chemical secretion and has its own column.
                "venom_severity": sp.venom_severity,
                "defensive_secretion": sp.defensive_secretion,
                "can_fly": sp.can_fly,
                "can_climb_smooth": sp.can_climb_smooth,
                "image_url": sp.image_url,
            }

    # Logs match on invert_id — taxon-agnostic by construction. Refused offers
    # don't reset "last fed", same rule as the tarantula profile.
    last_feeding = db.query(FeedingLog).filter(
        FeedingLog.invert_id == i_uuid,
        FeedingLog.accepted.is_(True),
    ).order_by(FeedingLog.fed_at.desc()).first()

    last_molt = db.query(MoltLog).filter(
        MoltLog.invert_id == i_uuid
    ).order_by(MoltLog.molted_at.desc()).first()

    photos = db.query(Photo).filter(
        Photo.invert_id == i_uuid
    ).order_by(Photo.created_at.desc()).limit(10).all()

    display_name = (
        invert.name or invert.common_name or invert.scientific_name or "Unnamed"
    )

    base = {
        "id": str(invert.id),
        "taxon": invert.taxon,
        "name": invert.name,
        "common_name": invert.common_name,
        "scientific_name": invert.scientific_name,
        "display_name": display_name,
        "sex": invert.sex.value if invert.sex else None,
        "photo_url": invert.photo_url,
        "is_owner": bool(is_owner),
        "owner_username": owner.username if owner else None,
        "is_following": (
            db.query(Follow).filter(
                Follow.follower_id == current_user.id,
                Follow.followed_id == owner.id,
            ).first() is not None
        ) if (current_user and owner and not is_owner) else False,
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
        # The transfer snapshot never holds sale_price, so it's public-safe.
        "provenance": invert.provenance,
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

    if is_owner:
        base["husbandry"] = {
            "enclosure_type": invert.enclosure_type,
            "enclosure_size": invert.enclosure_size,
            "substrate_type": invert.substrate_type,
            "substrate_depth": invert.substrate_depth,
            "last_substrate_change": invert.last_substrate_change.isoformat() if invert.last_substrate_change else None,
            "target_temp_min": float(invert.target_temp_min) if invert.target_temp_min else None,
            "target_temp_max": float(invert.target_temp_max) if invert.target_temp_max else None,
            "target_humidity_min": float(invert.target_humidity_min) if invert.target_humidity_min else None,
            "target_humidity_max": float(invert.target_humidity_max) if invert.target_humidity_max else None,
            "water_dish": invert.water_dish,
            "misting_schedule": invert.misting_schedule,
        }
        base["date_acquired"] = invert.date_acquired.isoformat() if invert.date_acquired else None
        base["source"] = invert.source.value if invert.source else None
        base["notes"] = invert.notes

    return base


# ─── Public Colony Profile (/col/{id}) ───────────────────────────────────────

@router.get("/col/{colony_id}")
@policy("public")
async def get_public_colony_profile(
    colony_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Permanent public profile for a population colony — its QR destination.

    The visibility rule is `/i/{id}`'s, line for line: the owner sees the
    husbandry block and notes; everyone else gets the public card, and only
    when the owner's collection is public (403 otherwise). Nothing `/i` keeps
    private is added here. The colony-only fields are the population (total
    and per-stage headcounts, which are what a colony IS the way an animal has
    a sex and a last-fed date).

    Deliberately NOT exposed: location, sitter_note, price, enclosure link and
    event history; source, acquisition date, husbandry and notes are
    owner-only exactly as on `/i`.

    Two deliberate tightenings over `/i`: the colony's own `visibility` must be
    'public' too (the keeper chose it per colony), and a colony that has been
    transferred out is a 404 to everyone but its owner, matching the link-preview rule
    (`/public-card`) that a handed-off animal stops being public.
    """
    from app.routers.colonies import _total_count

    try:
        c_uuid = uuid.UUID(colony_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid colony ID")

    colony = db.query(Colony).filter(Colony.id == c_uuid).first()
    if not colony:
        raise HTTPException(status_code=404, detail="Colony not found")

    is_owner = current_user and str(current_user.id) == str(colony.user_id)

    owner = db.query(User).filter(User.id == colony.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"
    if not is_owner and not collection_public:
        raise HTTPException(status_code=403, detail="This collection is private")
    # Colonies carry their OWN private/public choice (the add-colony form asks
    # for it, default private). Unlike an invert's, it is a promise the keeper
    # made explicitly, so a public collection does not override it.
    if not is_owner and colony.visibility != "public":
        raise HTTPException(status_code=403, detail="This colony is private")
    if not is_owner and colony.transferred_out_at is not None:
        raise HTTPException(status_code=404, detail="Colony not found")

    species_data = None
    common_name = None
    scientific_name = None
    if colony.species_id:
        sp = db.query(InvertSpecies).filter(
            InvertSpecies.id == colony.species_id
        ).first()
        if sp:
            common_name = sp.common_names[0] if sp.common_names else None
            scientific_name = sp.scientific_name
            species_data = {
                "id": str(sp.id),
                "taxon": sp.taxon,
                "scientific_name": sp.scientific_name,
                "common_names": sp.common_names or [],
                "care_level": sp.care_level,
                "temperament": sp.temperament,
                "type": sp.type,
                "temperature_min": float(sp.temperature_min) if sp.temperature_min else None,
                "temperature_max": float(sp.temperature_max) if sp.temperature_max else None,
                "humidity_min": float(sp.humidity_min) if sp.humidity_min else None,
                "humidity_max": float(sp.humidity_max) if sp.humidity_max else None,
                "venom_severity": sp.venom_severity,
                "defensive_secretion": sp.defensive_secretion,
                "can_fly": sp.can_fly,
                "can_climb_smooth": sp.can_climb_smooth,
                "image_url": sp.image_url,
            }

    photos = db.query(Photo).filter(
        Photo.colony_id == c_uuid
    ).order_by(Photo.created_at.desc()).limit(10).all()

    stage_counts = {
        k: v for k, v in (colony.stage_counts or {}).items()
        if isinstance(v, int) and not isinstance(v, bool)
    }

    base = {
        "id": str(colony.id),
        "kind": "colony",
        "taxon": colony.taxon,
        "name": colony.name,
        "common_name": common_name,
        "scientific_name": scientific_name,
        "display_name": colony.name,
        "photo_url": colony.photo_url,
        "is_owner": bool(is_owner),
        "owner_username": owner.username if owner else None,
        "is_following": (
            db.query(Follow).filter(
                Follow.follower_id == current_user.id,
                Follow.followed_id == owner.id,
            ).first() is not None
        ) if (current_user and owner and not is_owner) else False,
        "species": species_data,
        "population": {
            "total": _total_count(colony),
            "stage_counts": stage_counts,
            "is_estimated": bool(colony.count_is_estimated),
        },
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
    }

    if is_owner:
        base["husbandry"] = {
            "enclosure_type": colony.enclosure_type,
            "enclosure_size": colony.enclosure_size,
            "substrate_type": colony.substrate_type,
            "substrate_depth": colony.substrate_depth,
            "last_substrate_change": colony.last_substrate_change.isoformat() if colony.last_substrate_change else None,
            "target_temp_min": float(colony.target_temp_min) if colony.target_temp_min else None,
            "target_temp_max": float(colony.target_temp_max) if colony.target_temp_max else None,
            "target_humidity_min": float(colony.target_humidity_min) if colony.target_humidity_min else None,
            "target_humidity_max": float(colony.target_humidity_max) if colony.target_humidity_max else None,
            "water_dish": colony.water_dish,
        }
        base["date_acquired"] = colony.date_acquired.isoformat() if colony.date_acquired else None
        base["source"] = colony.source
        base["notes"] = colony.notes

    return base


# ─── Public Animal Profile (/a/{id}) ──────────────────────────────────────────

@router.get("/a/{animal_id}")
@policy("public")
async def get_public_animal_profile(
    animal_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(_optional_user),
):
    """Permanent public profile for an HV animal — the animal QR
    destination. ADR-003 collapsed the `/s/{id}` (snake) and `/l/{id}`
    (lizard) routes into this one taxon-agnostic endpoint.

    Returns:
      • owner (auth matches)           → full detail (husbandry, acquisition, notes)
      • other keeper / unauthenticated → public-safe card (respects collection_visibility)

    Herp biology shapes the payload — sheds/weight/length, no molts.
    """
    try:
        a_uuid = uuid.UUID(animal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid animal ID")

    animal = db.query(Animal).filter(Animal.id == a_uuid).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    is_owner = current_user and str(current_user.id) == str(animal.user_id)

    owner = db.query(User).filter(User.id == animal.user_id).first()
    collection_public = owner and owner.collection_visibility == "public"

    if not is_owner and not collection_public:
        raise HTTPException(status_code=403, detail="This collection is private")

    # Herp species care card — herp_species table (renamed from
    # reptile_species in anh_20260514).
    species_data = None
    if animal.herp_species_id:
        try:
            from app.models.reptile_species import ReptileSpecies
            rsp = db.query(ReptileSpecies).filter(
                ReptileSpecies.id == animal.herp_species_id
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
            # Species schema is still evolving — missing columns shouldn't 500 the profile.
            species_data = None

    # Most recent ACCEPTED feeding — refusals shouldn't reset the
    # "last fed" indicator on the public profile.
    last_feeding = (
        db.query(FeedingLog)
        .filter(
            FeedingLog.animal_id == a_uuid,
            FeedingLog.accepted.is_(True),
        )
        .order_by(FeedingLog.fed_at.desc())
        .first()
    )

    last_shed = (
        db.query(ShedLog)
        .filter(ShedLog.animal_id == a_uuid)
        .order_by(ShedLog.shed_at.desc())
        .first()
    )

    photos = (
        db.query(Photo)
        .filter(Photo.animal_id == a_uuid)
        .order_by(Photo.created_at.desc())
        .limit(10)
        .all()
    )

    base = {
        "id": str(animal.id),
        "taxon": animal.taxon.value if hasattr(animal.taxon, "value") else str(animal.taxon),
        "name": animal.name,
        "common_name": animal.common_name,
        "scientific_name": animal.scientific_name,
        "display_name": _animal_display_name(animal),
        "sex": animal.sex.value if animal.sex else None,
        "photo_url": animal.photo_url,
        "is_owner": is_owner,
        "owner_username": owner.username if owner else None,
        "species": species_data,
        "current_weight_g": float(animal.current_weight_g) if animal.current_weight_g else None,
        "current_length_in": float(animal.current_length_in) if animal.current_length_in else None,
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
            "feeding_schedule": animal.feeding_schedule,
            "last_fed_at": animal.last_fed_at.isoformat() if animal.last_fed_at else None,
            "last_shed_at": animal.last_shed_at.isoformat() if animal.last_shed_at else None,
            "brumation_active": animal.brumation_active,
            "brumation_started_at": animal.brumation_started_at.isoformat() if animal.brumation_started_at else None,
        }
        base["date_acquired"] = animal.date_acquired.isoformat() if animal.date_acquired else None
        base["hatch_date"] = animal.hatch_date.isoformat() if animal.hatch_date else None
        base["source"] = animal.source.value if animal.source else None
        base["source_breeder"] = animal.source_breeder
        base["notes"] = animal.notes

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
