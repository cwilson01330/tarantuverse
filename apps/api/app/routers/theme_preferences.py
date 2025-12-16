"""
Theme preferences routes for interface skinning
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User
from app.models.user_theme_preferences import UserThemePreferences
from app.schemas.theme_preferences import (
    ThemePreferencesResponse,
    ThemePreferencesUpdate,
    ThemePreset,
    ThemePresetList,
    ThemePresetResponse,
    ResolvedColors
)
from app.utils.dependencies import get_current_user
from app.utils.theme_presets import (
    THEME_PRESETS,
    get_preset,
    get_all_presets,
    get_free_presets,
    get_premium_presets,
    get_preset_colors,
    is_preset_free,
    DEFAULT_COLORS
)

router = APIRouter(prefix="/theme-preferences", tags=["theme-preferences"])


def resolve_colors(prefs: UserThemePreferences) -> ResolvedColors:
    """Resolve the actual colors to use based on theme type"""
    if prefs.theme_type == 'custom' and prefs.custom_primary:
        return ResolvedColors(
            primary=prefs.custom_primary or DEFAULT_COLORS['primary'],
            secondary=prefs.custom_secondary or DEFAULT_COLORS['secondary'],
            accent=prefs.custom_accent or DEFAULT_COLORS['accent']
        )
    elif prefs.theme_type == 'preset' and prefs.preset_id:
        colors = get_preset_colors(prefs.preset_id)
        if colors:
            return ResolvedColors(**colors)

    # Default colors
    return ResolvedColors(**DEFAULT_COLORS)


def prefs_to_response(prefs: UserThemePreferences) -> ThemePreferencesResponse:
    """Convert UserThemePreferences model to response with resolved colors"""
    return ThemePreferencesResponse(
        id=prefs.id,
        user_id=prefs.user_id,
        color_mode=prefs.color_mode,
        theme_type=prefs.theme_type,
        preset_id=prefs.preset_id,
        custom_primary=prefs.custom_primary,
        custom_secondary=prefs.custom_secondary,
        custom_accent=prefs.custom_accent,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
        resolved_colors=resolve_colors(prefs)
    )


@router.get("/", response_model=ThemePreferencesResponse)
async def get_theme_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's theme preferences (creates default if doesn't exist)"""
    prefs = db.query(UserThemePreferences).filter(
        UserThemePreferences.user_id == current_user.id
    ).first()

    # Create default preferences if they don't exist
    if not prefs:
        prefs = UserThemePreferences(
            user_id=current_user.id,
            color_mode='dark',
            theme_type='default',
            preset_id=None,
            custom_primary=None,
            custom_secondary=None,
            custom_accent=None
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return prefs_to_response(prefs)


@router.put("/", response_model=ThemePreferencesResponse)
async def update_theme_preferences(
    preferences: ThemePreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update theme preferences"""
    prefs = db.query(UserThemePreferences).filter(
        UserThemePreferences.user_id == current_user.id
    ).first()

    # Create if doesn't exist
    if not prefs:
        prefs = UserThemePreferences(user_id=current_user.id)
        db.add(prefs)

    # Get update data
    update_data = preferences.model_dump(exclude_unset=True)

    # Validate preset selection
    if 'preset_id' in update_data and update_data['preset_id']:
        preset = get_preset(update_data['preset_id'])
        if not preset:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown preset: {update_data['preset_id']}"
            )

        # Check if premium preset and user is not premium
        if not preset['is_free'] and not current_user.is_premium:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This preset requires a premium subscription"
            )

    # Validate custom colors require premium
    if 'theme_type' in update_data and update_data['theme_type'] == 'custom':
        if not current_user.is_premium:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Custom colors require a premium subscription"
            )

    # Update fields that were provided
    for field, value in update_data.items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return prefs_to_response(prefs)


@router.get("/presets", response_model=ThemePresetList)
async def list_presets(
    current_user: User = Depends(get_current_user)
):
    """List all available theme presets"""
    all_presets = [ThemePreset(**p) for p in get_all_presets()]
    free = [ThemePreset(**p) for p in get_free_presets()]
    premium = [ThemePreset(**p) for p in get_premium_presets()]

    return ThemePresetList(
        presets=all_presets,
        free_presets=free,
        premium_presets=premium
    )


@router.get("/presets/{preset_id}", response_model=ThemePresetResponse)
async def get_preset_detail(
    preset_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific preset"""
    preset_data = get_preset(preset_id)
    if not preset_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset not found: {preset_id}"
        )

    preset = ThemePreset(**preset_data)

    # Check if user can use this preset
    is_available = preset.is_free or current_user.is_premium

    return ThemePresetResponse(
        preset=preset,
        is_available=is_available
    )


@router.post("/reset", response_model=ThemePreferencesResponse)
async def reset_theme_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reset theme preferences to default"""
    prefs = db.query(UserThemePreferences).filter(
        UserThemePreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = UserThemePreferences(user_id=current_user.id)
        db.add(prefs)

    # Reset to defaults
    prefs.color_mode = 'dark'
    prefs.theme_type = 'default'
    prefs.preset_id = None
    prefs.custom_primary = None
    prefs.custom_secondary = None
    prefs.custom_accent = None

    db.commit()
    db.refresh(prefs)
    return prefs_to_response(prefs)
