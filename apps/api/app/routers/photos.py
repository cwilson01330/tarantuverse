from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import uuid
from datetime import datetime

from app.database import get_db
from app.models.photo import Photo
from app.models.tarantula import Tarantula
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.storage import storage_service

router = APIRouter(tags=["photos"])


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
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        # Read file data
        file_data = await file.read()
        
        # Upload to storage service (R2 or local)
        photo_url, thumbnail_url = await storage_service.upload_photo(
            file_data=file_data,
            filename=file.filename or "upload.jpg",
            content_type=file.content_type
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
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload photo: {str(e)}")


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


@router.delete("/photos/{photo_id}")
async def delete_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a photo."""
    # Get photo and verify ownership
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Verify tarantula belongs to user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == photo.tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()
    
    if not tarantula:
        raise HTTPException(status_code=403, detail="Not authorized to delete this photo")
    
    try:
        # Delete files from storage service (R2 or local)
        await storage_service.delete_photo(photo.url, photo.thumbnail_url)
        
        # Delete from database
        db.delete(photo)
        db.commit()
        
        return {"message": "Photo deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete photo: {str(e)}")
