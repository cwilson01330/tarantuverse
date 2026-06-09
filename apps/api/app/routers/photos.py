from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import logging
import uuid
from datetime import datetime

from app.database import get_db
from app.models.photo import Photo
from app.models.tarantula import Tarantula
from app.models.animal import Animal
from app.models.scorpion import Scorpion
from app.models.invert import Invert
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.storage import storage_service
from app.config import settings
from app.utils.file_validation import validate_image_bytes
from app.services.inverts_dualwrite import invert_id_if_exists  # ADR-005 A2


class PhotoUpdate(BaseModel):
    """Partial-update body for photos.

    Only `caption` is mutable via this endpoint — the file, thumbnails, and
    taken_at are immutable once uploaded. Clients should send the field they
    want to change; unset fields are preserved.
    """

    # Empty string and `null` are both valid — both clear the caption.
    caption: Optional[str] = Field(default=None, max_length=500)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["photos"])


@router.get("/storage-info")
async def get_storage_info():
    """Debug endpoint to check storage configuration."""
    return {
        "using_r2": storage_service.use_r2,
        "bucket_name": storage_service.bucket_name if storage_service.use_r2 else None,
        "public_url_base": storage_service.public_url_base if storage_service.use_r2 else None,
        "r2_account_id_set": bool(settings.R2_ACCOUNT_ID),
        "r2_access_key_set": bool(settings.R2_ACCESS_KEY_ID),
        "r2_secret_key_set": bool(settings.R2_SECRET_ACCESS_KEY),
        "r2_bucket_name": settings.R2_BUCKET_NAME,
        "r2_public_url": settings.R2_PUBLIC_URL
    }


@router.post("/tarantulas/{tarantula_id}/photos")
async def upload_photo(
    tarantula_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a photo for a tarantula."""
    # Verify tarantula exists and belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    # Check photo count limit
    limits = current_user.get_subscription_limits()
    current_photo_count = db.query(Photo).filter(Photo.tarantula_id == tarantula_id).count()

    # -1 means unlimited (premium)
    if limits["max_photos_per_tarantula"] != -1 and current_photo_count >= limits["max_photos_per_tarantula"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": f"You've reached the limit of {limits['max_photos_per_tarantula']} photos per tarantula on the free plan. Upgrade to premium for unlimited photos!",
                "current_count": current_photo_count,
                "limit": limits["max_photos_per_tarantula"],
                "is_premium": limits["is_premium"]
            }
        )

    try:
        # Read file data before any other validation
        file_data = await file.read()

        # Validate by magic bytes (not Content-Type header, which is spoofable)
        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # File size limit: 15 MB
        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        # Upload to storage service (R2 or local)
        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,  # use verified MIME, not client-supplied
        )

        # Create photo record in database
        photo = Photo(
            id=str(uuid.uuid4()),
            tarantula_id=tarantula_id,
            invert_id=invert_id_if_exists(db, tarantula_id),  # ADR-005 A2
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow()
        )

        db.add(photo)

        # If this is the first photo, set it as the tarantula's main photo.
        # Also seed the unified Invert mirror's hero so the consolidated
        # collection grid (which reads Invert.photo_url) shows it. ADR-008.
        if not tarantula.photo_url:
            tarantula.photo_url = photo_url
        if photo.invert_id:
            invert_mirror = db.query(Invert).filter(Invert.id == photo.invert_id).first()
            if invert_mirror and not invert_mirror.photo_url:
                invert_mirror.photo_url = photo_url

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat()
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for tarantula %s", tarantula_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/tarantulas/{tarantula_id}/photos")
async def get_photos(
    tarantula_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all photos for a tarantula."""
    # Verify tarantula exists and belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(status_code=404, detail="Tarantula not found")

    photos = db.query(Photo).filter(
        Photo.tarantula_id == tarantula_id
    ).order_by(Photo.created_at.desc()).all()

    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat()
        }
        for photo in photos
    ]


def _photo_owner_parent(photo: Photo, db: Session, user: User):
    """Return the owned parent row for a photo, or None if user isn't owner.

    Polymorphic between a TV tarantula, an HV animal (ADR-003), and a
    TV scorpion (scp_20260522) — exactly one of (tarantula_id,
    animal_id, scorpion_id) is set. Centralizing this ownership check
    keeps DELETE / set-main / caption-edit free of taxon branching.
    """
    if photo.tarantula_id:
        return db.query(Tarantula).filter(
            Tarantula.id == photo.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
    if photo.animal_id:
        return db.query(Animal).filter(
            Animal.id == photo.animal_id,
            Animal.user_id == user.id,
        ).first()
    if photo.scorpion_id:
        return db.query(Scorpion).filter(
            Scorpion.id == photo.scorpion_id,
            Scorpion.user_id == user.id,
        ).first()
    # Centipede photos — invert-only parent (ADR-005 C2). The widened
    # CHECK in cip_20260527 allows this shape.
    if photo.invert_id:
        return db.query(Invert).filter(
            Invert.id == photo.invert_id,
            Invert.user_id == user.id,
        ).first()
    return None


@router.post("/animals/{animal_id}/photos")
async def upload_animal_photo(
    animal_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for an HV animal (any taxon).

    Herpetoverse is free-tier beta — no photo-count gate yet. When
    subscription limits extend to animals (v1.x), mirror the tarantula
    gate here keyed off `Photo.animal_id == animal_id`.
    """
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()

    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    try:
        file_data = await file.read()

        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,
        )

        photo = Photo(
            id=str(uuid.uuid4()),
            animal_id=animal_id,
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )

        db.add(photo)

        # First photo becomes the animal's main photo (mirrors tarantula path).
        if not animal.photo_url:
            animal.photo_url = photo_url

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for animal %s", animal_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/animals/{animal_id}/photos")
async def get_animal_photos(
    animal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for an HV animal, most recent first."""
    animal = db.query(Animal).filter(
        Animal.id == animal_id,
        Animal.user_id == current_user.id,
    ).first()

    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    photos = (
        db.query(Photo)
        .filter(Photo.animal_id == animal_id)
        .order_by(Photo.created_at.desc())
        .all()
    )

    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
        for photo in photos
    ]


@router.post("/scorpions/{scorpion_id}/photos")
async def upload_scorpion_photo(
    scorpion_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for a scorpion.

    Mirrors the tarantula path: magic-byte validation, 15 MB cap, R2
    upload, thumbnail generation. The tarantula subscription gate is
    intentionally NOT applied to scorpions in v1 — scorpions launch
    without per-taxon limits, matching how Herpetoverse animals do it.
    Add a gate here when subscriptions extend to scorpions.
    """
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()

    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    try:
        file_data = await file.read()

        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,
        )

        photo = Photo(
            id=str(uuid.uuid4()),
            scorpion_id=scorpion_id,
            invert_id=invert_id_if_exists(db, scorpion_id),  # ADR-005 A2
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )

        db.add(photo)

        # First photo becomes the scorpion's main photo (mirrors
        # tarantula path). Also seed the unified Invert mirror's hero so the
        # generic invert detail/collection (which read Invert.photo_url) show
        # it rather than the generic glyph. ADR-008.
        if not scorpion.photo_url:
            scorpion.photo_url = photo_url
        if photo.invert_id:
            invert_mirror = db.query(Invert).filter(Invert.id == photo.invert_id).first()
            if invert_mirror and not invert_mirror.photo_url:
                invert_mirror.photo_url = photo_url

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for scorpion %s", scorpion_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/scorpions/{scorpion_id}/photos")
async def get_scorpion_photos(
    scorpion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for a scorpion, most recent first."""
    scorpion = db.query(Scorpion).filter(
        Scorpion.id == scorpion_id,
        Scorpion.user_id == current_user.id,
    ).first()

    if not scorpion:
        raise HTTPException(status_code=404, detail="Scorpion not found")

    photos = (
        db.query(Photo)
        .filter(Photo.scorpion_id == scorpion_id)
        .order_by(Photo.created_at.desc())
        .all()
    )

    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
        for photo in photos
    ]


@router.post("/centipedes/{centipede_id}/photos")
async def upload_centipede_photo(
    centipede_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for a centipede.

    Mirrors the scorpion path: magic-byte validation, 15 MB cap, R2
    upload, thumbnail generation. The Photo row sets ONLY `invert_id`
    — no `tarantula_id`, `scorpion_id`, or `animal_id` — and relies on
    the CHECK widened in cip_20260527.
    """
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    try:
        file_data = await file.read()

        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,
        )

        photo = Photo(
            id=str(uuid.uuid4()),
            invert_id=centipede_id,
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(photo)

        if not centipede.photo_url:
            centipede.photo_url = photo_url

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for centipede %s", centipede_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/centipedes/{centipede_id}/photos")
async def get_centipede_photos(
    centipede_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for a centipede, most recent first."""
    centipede = db.query(Invert).filter(
        Invert.id == centipede_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "centipede",
    ).first()
    if not centipede:
        raise HTTPException(status_code=404, detail="Centipede not found")

    photos = (
        db.query(Photo)
        .filter(Photo.invert_id == centipede_id)
        .order_by(Photo.created_at.desc())
        .all()
    )

    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
        for photo in photos
    ]


@router.post("/whip-spiders/{whip_spider_id}/photos")
async def upload_whip_spider_photo(
    whip_spider_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for a whip spider. Sets ONLY `invert_id` (ADR-006
    consolidated surface). Same magic-byte validation + 15 MB cap + R2
    upload + thumbnail path as the centipede route."""
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")

    try:
        file_data = await file.read()

        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,
        )

        photo = Photo(
            id=str(uuid.uuid4()),
            invert_id=whip_spider_id,
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(photo)

        if not whip_spider.photo_url:
            whip_spider.photo_url = photo_url

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for whip spider %s", whip_spider_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/whip-spiders/{whip_spider_id}/photos")
async def get_whip_spider_photos(
    whip_spider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for a whip spider, most recent first."""
    whip_spider = db.query(Invert).filter(
        Invert.id == whip_spider_id,
        Invert.user_id == current_user.id,
        Invert.taxon == "whip_spider",
    ).first()
    if not whip_spider:
        raise HTTPException(status_code=404, detail="Whip spider not found")

    photos = (
        db.query(Photo)
        .filter(Photo.invert_id == whip_spider_id)
        .order_by(Photo.created_at.desc())
        .all()
    )

    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
        for photo in photos
    ]


# ---------------------------------------------------------------------------
# Generic invert photo endpoints (ADR-007) — taxon-agnostic.
# ---------------------------------------------------------------------------

@router.post("/inverts/{invert_id}/photos")
async def upload_invert_photo(
    invert_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for any invert the caller owns. Sets only invert_id."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")

    try:
        file_data = await file.read()
        try:
            detected_mime = validate_image_bytes(file_data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        max_size = 15 * 1024 * 1024
        if len(file_data) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit")

        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=detected_mime,
        )
        photo = Photo(
            id=str(uuid.uuid4()),
            invert_id=invert_id,
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(photo)
        if not invert.photo_url:
            invert.photo_url = photo_url
        db.commit()
        db.refresh(photo)
        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo upload failed for invert %s", invert_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/inverts/{invert_id}/photos")
async def get_invert_photos(
    invert_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for any invert the caller owns."""
    invert = db.query(Invert).filter(
        Invert.id == invert_id,
        Invert.user_id == current_user.id,
    ).first()
    if not invert:
        raise HTTPException(status_code=404, detail="Animal not found")
    photos = (
        db.query(Photo)
        .filter(Photo.invert_id == invert_id)
        .order_by(Photo.created_at.desc())
        .all()
    )
    return [
        {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }
        for photo in photos
    ]


@router.delete("/photos/{photo_id}")
async def delete_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a photo (polymorphic — tarantula or animal parent)."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    parent = _photo_owner_parent(photo, db, current_user)
    if parent is None:
        raise HTTPException(status_code=403, detail="Not authorized to delete this photo")

    try:
        # If we're deleting the current hero, promote the next most-recent
        # remaining photo (or clear the hero if none remain). ADR-008 — the
        # generic invert detail/collection read photo_url, so a dangling hero
        # URL pointing at a deleted image would otherwise show a broken image.
        # Captured before the row is removed.
        was_hero = getattr(parent, "photo_url", None) == photo.url
        sibling_filter = (
            Photo.tarantula_id == photo.tarantula_id if photo.tarantula_id
            else Photo.animal_id == photo.animal_id if photo.animal_id
            else Photo.scorpion_id == photo.scorpion_id if photo.scorpion_id
            else Photo.invert_id == photo.invert_id if photo.invert_id
            else None
        )

        # Delete files from storage service (R2 or local)
        await storage_service.delete_photo(photo.url, photo.thumbnail_url)

        # Delete from database
        db.delete(photo)

        if was_hero:
            next_photo = None
            if sibling_filter is not None:
                next_photo = (
                    db.query(Photo)
                    .filter(sibling_filter, Photo.id != photo_id)
                    .order_by(Photo.created_at.desc())
                    .first()
                )
            new_url = next_photo.url if next_photo else None
            parent.photo_url = new_url
            # Keep the unified Invert mirror in lockstep (shared PK), covering
            # tarantula + scorpion whose legacy FK is resolved first. No-op for
            # HV animals (no Invert mirror) and when parent already IS an Invert.
            if not isinstance(parent, Invert):
                invert = db.query(Invert).filter(
                    Invert.id == parent.id,
                    Invert.user_id == current_user.id,
                ).first()
                if invert:
                    invert.photo_url = new_url

        db.commit()

        return {"message": "Photo deleted successfully"}

    except Exception:
        db.rollback()
        logger.exception("Photo delete failed for photo %s", photo_id)
        raise HTTPException(status_code=500, detail="Failed to delete photo. Please try again.")


@router.patch("/photos/{photo_id}")
async def update_photo(
    photo_id: str,
    data: PhotoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a photo's editable metadata (currently: caption only).

    Polymorphic — same endpoint handles tarantula and animal photos.
    Ownership is resolved through the parent via `_photo_owner_parent`.
    """
    photo = db.query(Photo).filter(Photo.id == photo_id).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    parent = _photo_owner_parent(photo, db, current_user)
    if parent is None:
        raise HTTPException(status_code=403, detail="Not authorized to modify this photo")

    # Only apply fields the client explicitly sent — preserves existing values
    # for anything omitted. exclude_unset distinguishes "not sent" from
    # "sent as null" (we allow clearing the caption with null or "").
    updates = data.model_dump(exclude_unset=True)

    try:
        if "caption" in updates:
            raw = updates["caption"]
            # Normalize empty string to None for consistent DB state.
            if raw is None or (isinstance(raw, str) and raw.strip() == ""):
                photo.caption = None
            else:
                photo.caption = raw.strip()

        db.commit()
        db.refresh(photo)

        return {
            "id": photo.id,
            "url": photo.url,
            "thumbnail_url": photo.thumbnail_url,
            "caption": photo.caption,
            "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
            "created_at": photo.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        logger.exception("Photo update failed for photo %s", photo_id)
        raise HTTPException(status_code=500, detail="Failed to update photo. Please try again.")


@router.patch("/photos/{photo_id}/set-main")
async def set_main_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Set a photo as the main photo for its owning parent (tarantula or animal)."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    parent = _photo_owner_parent(photo, db, current_user)
    if parent is None:
        raise HTTPException(status_code=403, detail="Not authorized to modify this photo")

    try:
        # Works for Tarantula and Animal — both expose `photo_url`.
        parent.photo_url = photo.url
        # Mirror onto the unified Invert row too. _photo_owner_parent resolves
        # the legacy parent (tarantula / scorpion) first, so without this the
        # legacy row's hero updates but the Invert mirror's doesn't — and the
        # generic invert detail/collection read Invert.photo_url, leaving the
        # hero as the generic glyph. ADR-008.
        #
        # Key the mirror on parent.id (the Invert shares the legacy row's PK
        # under dual-write) rather than photo.invert_id, so photos uploaded
        # before the A2/backfill — which have a null invert_id — are covered
        # too. Animals (HV) have no Invert mirror, so the lookup returns None
        # and this safely no-ops. Also a no-op when the parent already IS the
        # Invert (centipedes / new taxa).
        if not isinstance(parent, Invert):
            invert = db.query(Invert).filter(
                Invert.id == parent.id,
                Invert.user_id == current_user.id,
            ).first()
            if invert:
                invert.photo_url = photo.url
        db.commit()

        return {
            "message": "Main photo updated successfully",
            "photo_url": photo.url
        }

    except Exception:
        db.rollback()
        logger.exception("Set main photo failed for photo %s", photo_id)
        raise HTTPException(status_code=500, detail="Failed to set main photo. Please try again.")
