"""
Announcements router - admin-managed banners for sales, coupons, updates, etc.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime, timezone
from typing import List

from app.database import get_db
from app.models.announcement import Announcement
from app.models.user import User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementUpdate,
    AnnouncementResponse,
)
from app.utils.dependencies import get_current_admin

router = APIRouter()


@router.get("/active", response_model=AnnouncementResponse | None)
async def get_active_announcement(
    db: Session = Depends(get_db),
):
    """
    Get the highest-priority active announcement (public, no auth required).
    Returns null if no active announcements.
    """
    now = datetime.now(timezone.utc)

    announcement = (
        db.query(Announcement)
        .filter(
            Announcement.is_active == True,
            or_(Announcement.starts_at == None, Announcement.starts_at <= now),
            or_(Announcement.expires_at == None, Announcement.expires_at > now),
        )
        .order_by(Announcement.priority.desc(), Announcement.created_at.desc())
        .first()
    )

    return announcement


@router.get("/", response_model=List[AnnouncementResponse])
async def list_announcements(
    skip: int = 0,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all announcements (admin only)"""
    announcements = (
        db.query(Announcement)
        .order_by(Announcement.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return announcements


@router.post("/", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Create a new announcement (admin only)"""
    valid_types = ["info", "sale", "update", "coupon"]
    if data.banner_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"banner_type must be one of: {', '.join(valid_types)}",
        )

    announcement = Announcement(
        **data.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: str,
    data: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Update an announcement (admin only)"""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    update_data = data.model_dump(exclude_unset=True)
    if "banner_type" in update_data:
        valid_types = ["info", "sale", "update", "coupon"]
        if update_data["banner_type"] not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"banner_type must be one of: {', '.join(valid_types)}",
            )

    for key, value in update_data.items():
        setattr(announcement, key, value)

    db.commit()
    db.refresh(announcement)
    return announcement


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Delete an announcement (admin only)"""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    db.delete(announcement)
    db.commit()
    return {"message": "Announcement deleted"}
