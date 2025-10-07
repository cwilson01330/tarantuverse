from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import uuid
from datetime import datetime
import os
import shutil
from PIL import Image
import io

from app.database import get_db
from app.models.photo import Photo
from app.models.tarantula import Tarantula
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(tags=["photos"])

# Directory for storing uploaded photos
UPLOAD_DIR = "uploads/photos"
THUMBNAIL_DIR = "uploads/thumbnails"

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)


def create_thumbnail(image_path: str, thumbnail_path: str, size=(300, 300)):
    """Create a thumbnail from an image."""
    try:
        with Image.open(image_path) as img:
            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            
            # Create thumbnail
            img.thumbnail(size, Image.Resampling.LANCZOS)
            img.save(thumbnail_path, 'JPEG', quality=85)
            return True
    except Exception as e:
        print(f"Error creating thumbnail: {e}")
        return False


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
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1] if file.filename else '.jpg'
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        thumbnail_filename = f"thumb_{unique_filename}"
        thumbnail_path = os.path.join(THUMBNAIL_DIR, thumbnail_filename)
        
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create thumbnail
        thumbnail_created = create_thumbnail(file_path, thumbnail_path)
        
        # Create photo record
        photo = Photo(
            id=str(uuid.uuid4()),
            tarantula_id=tarantula_id,
            url=f"/uploads/photos/{unique_filename}",
            thumbnail_url=f"/uploads/thumbnails/{thumbnail_filename}" if thumbnail_created else None,
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
        # Clean up files if database operation fails
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)
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
        # Delete files from filesystem
        if photo.url:
            file_path = photo.url.lstrip('/')
            if os.path.exists(file_path):
                os.remove(file_path)
        
        if photo.thumbnail_url:
            thumb_path = photo.thumbnail_url.lstrip('/')
            if os.path.exists(thumb_path):
                os.remove(thumb_path)
        
        # Delete from database
        db.delete(photo)
        db.commit()
        
        return {"message": "Photo deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete photo: {str(e)}")
