"""
Theme preferences schemas for interface skinning
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
import uuid
import re


class ThemePreferencesBase(BaseModel):
    """Base theme preferences schema"""
    # Theme mode (light/dark/system)
    color_mode: str = Field('dark', pattern=r'^(light|dark|system)$')

    # Theme type ('default', 'preset', 'custom')
    theme_type: str = Field('default', pattern=r'^(default|preset|custom)$')

    # Selected preset ID (when theme_type = 'preset')
    preset_id: Optional[str] = Field(None, max_length=50)

    # Custom colors (when theme_type = 'custom')
    custom_primary: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    custom_secondary: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    custom_accent: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')


class ThemePreferencesUpdate(BaseModel):
    """Schema for updating theme preferences (all fields optional)"""
    color_mode: Optional[str] = Field(None, pattern=r'^(light|dark|system)$')
    theme_type: Optional[str] = Field(None, pattern=r'^(default|preset|custom)$')
    preset_id: Optional[str] = Field(None, max_length=50)
    custom_primary: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    custom_secondary: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    custom_accent: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')


class ResolvedColors(BaseModel):
    """Resolved color values"""
    primary: str
    secondary: str
    accent: str


class ThemePreferencesResponse(ThemePreferencesBase):
    """Schema for theme preferences response"""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Computed: resolved colors based on preset or custom
    resolved_colors: Optional[ResolvedColors] = None

    class Config:
        from_attributes = True


class ThemePreset(BaseModel):
    """Schema for a theme preset"""
    id: str
    name: str
    description: Optional[str] = None
    species: Optional[str] = None
    primary: str
    secondary: str
    accent: str
    is_free: bool
    category: str  # 'default', 'species', 'habitat'


class ThemePresetList(BaseModel):
    """Schema for listing all presets"""
    presets: List[ThemePreset]
    free_presets: List[ThemePreset]
    premium_presets: List[ThemePreset]


class ThemePresetResponse(BaseModel):
    """Response for a single preset"""
    preset: ThemePreset
    is_available: bool  # True if user can use this preset (free or premium user)
