"""
Admin-only endpoints for reading and updating system settings.

Also exposes a public endpoint for maintenance-mode status so the
frontend can show a banner without requiring authentication.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.utils.dependencies import get_current_admin
from app.services import settings_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SettingUpdate(BaseModel):
    key: str
    value: Any


class BulkSettingUpdate(BaseModel):
    settings: Dict[str, Any]


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------

@router.get("/system/status")
async def get_system_status(db: Session = Depends(get_db)):
    """
    Public endpoint — returns maintenance mode status and any active
    cross-platform announcements the frontend needs to render.
    Used by frontends to display maintenance + announcement banners.
    """
    return {
        "maintenance_mode": settings_service.is_maintenance_mode(db),
        "maintenance_message": settings_service.get_maintenance_message(db),
        "registration_enabled": settings_service.is_feature_enabled(db, "registration"),
        "announcements": {
            "herpetoverse_banner": {
                "enabled": settings_service.get(
                    db, "announcements.herpetoverse_banner_enabled", False
                ),
                "message": settings_service.get(
                    db,
                    "announcements.herpetoverse_banner_message",
                    "",
                ),
                "url": settings_service.get(
                    db,
                    "announcements.herpetoverse_banner_url",
                    "https://www.herpetoverse.com",
                ),
            }
        },
    }


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/settings")
async def get_all_settings(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Return all system settings grouped by category.
    Admin only.
    """
    return settings_service.get_all(db)


@router.get("/admin/settings/{category}")
async def get_settings_by_category(
    category: str,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Return settings for a specific category.
    Admin only.
    """
    settings = settings_service.get_by_category(db, category)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No settings found for category: {category}",
        )
    return settings


@router.put("/admin/settings")
async def update_setting(
    body: SettingUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Update a single system setting by key.
    Admin only.
    """
    try:
        result = settings_service.update(
            db, body.key, body.value, admin_id=current_user.id
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.put("/admin/settings/bulk")
async def bulk_update_settings(
    body: BulkSettingUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Update multiple settings at once.
    Admin only.
    """
    try:
        results = settings_service.bulk_update(
            db, body.settings, admin_id=current_user.id
        )
        return {"updated": results}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
