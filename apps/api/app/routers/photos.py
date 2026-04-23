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
from app.models.snake import Snake
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.storage import storage_service
from app.config import settings
from app.utils.file_validation import validate_image_bytes


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
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
        
        db.add(photo)
        
        # If this is the first photo, set it as the tarantula's main photo
        if not tarantula.photo_url:
            tarantula.photo_url = photo_url
        
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

    Photos are polymorphic (tarantula_id OR snake_id). Centralizing this
    ownership check keeps DELETE / set-main free of taxon branching.
    """
    if photo.tarantula_id:
        return db.query(Tarantula).filter(
            Tarantula.id == photo.tarantula_id,
            Tarantula.user_id == user.id,
        ).first()
    if photo.snake_id:
        return db.query(Snake).filter(
            Snake.id == photo.snake_id,
            Snake.user_id == user.id,
        ).first()
    return None


@router.post("/snakes/{snake_id}/photos")
async def upload_snake_photo(
    snake_id: str,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a photo for a snake.

    Herpetoverse v1 is free-tier beta — no photo-count gate yet. When
    subscription limits extend to snakes (v1.x), mirror the tarantula
    gate here and key it off `Photo.snake_id == snake_id`.
    """
    snake = db.query(Snake).filter(
        Snake.id == snake_id,
        Snake.user_id == current_user.id,
    ).first()

    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

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
            snake_id=snake_id,
            url=photo_url,
            thumbnail_url=thumbnail_url,
            caption=caption,
            taken_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )

        db.add(photo)

        # First photo becomes the snake's main photo (mirrors tarantula path).
        if not snake.photo_url:
            snake.photo_url = photo_url

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
        logger.exception("Photo upload failed for snake %s", snake_id)
        raise HTTPException(status_code=500, detail="Failed to upload photo. Please try again.")


@router.get("/snakes/{snake_id}/photos")
async def get_snake_photos(
    snake_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List photos for a snake, most recent first."""
    snake = db.query(Snake).filter(
        Snake.id == snake_id,
        Snake.user_id == current_user.id,
    ).first()

    if not snake:
        raise HTTPException(status_code=404, detail="Snake not found")

    photos = (
        db.query(Photo)
        .filter(Photo.snake_id == snake_id)
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
    """Delete a photo (polymorphic — tarantula or snake parent)."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    parent = _photo_owner_parent(photo, db, current_user)
    if parent is None:
        raise HTTPException(status_code=403, detail="Not authorized to delete this photo")
    
    try:
        # Delete files from storage service (R2 or local)
        await storage_service.delete_photo(photo.url, photo.thumbnail_url)
        
        # Delete from database
        db.delete(photo)
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

    Polymorphic — same endpoint handles tarantula and snake photos. Ownership
    is resolved through the parent animal via `_photo_owner_parent`.
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
    """Set a photo as the main photo for its owning animal (tarantula or snake)."""
    photo = db.query(Photo).filter(Photo.id == photo_id).first()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    parent = _photo_owner_parent(photo, db, current_user)
    if parent is None:
        raise HTTPException(status_code=403, detail="Not authorized to modify this photo")

    try:
        # Works for both Tarantula and Snake — both expose `photo_url`.
        parent.photo_url = photo.url
        db.commit()

        return {
            "message": "Main photo updated successfully",
            "photo_url": photo.url
        }
        
    except Exception:
        db.rollback()
        logger.exception("Set main photo failed for photo %s", photo_id)
        raise HTTPException(status_code=500, detail="Failed to set main photo. Please try again.")
