"""
Promo Code schemas
"""
from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
from uuid import UUID


class PromoCodeBase(BaseModel):
    code: str = Field(..., min_length=4, max_length=50)
    code_type: str = Field(..., description="lifetime, 1year, 6month, or custom")
    custom_duration_days: Optional[int] = None
    usage_limit: Optional[int] = Field(None, description="NULL for unlimited")
    is_active: bool = True
    expires_at: Optional[datetime] = None

    @validator('code_type')
    def validate_code_type(cls, v):
        valid_types = ['lifetime', '1year', '6month', 'custom']
        if v not in valid_types:
            raise ValueError(f'code_type must be one of: {", ".join(valid_types)}')
        return v

    @validator('custom_duration_days')
    def validate_custom_duration(cls, v, values):
        if values.get('code_type') == 'custom' and not v:
            raise ValueError('custom_duration_days is required when code_type is custom')
        return v


class PromoCodeCreate(PromoCodeBase):
    """Schema for creating a new promo code"""
    pass


class PromoCodeUpdate(BaseModel):
    """Schema for updating an existing promo code"""
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class PromoCodeResponse(PromoCodeBase):
    """Schema for promo code response"""
    id: UUID
    times_used: int
    created_by_admin_id: Optional[UUID]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
        orm_mode = True


class PromoCodeRedemption(BaseModel):
    """Schema for redeeming a promo code"""
    code: str = Field(..., min_length=4, max_length=50)


class PromoCodeBulkCreate(BaseModel):
    """Schema for bulk promo code generation"""
    count: int = Field(..., ge=1, le=100, description="Number of codes to generate (1-100)")
    code_type: str = Field(..., description="lifetime, 1year, 6month, or custom")
    custom_duration_days: Optional[int] = None
    usage_limit: Optional[int] = Field(None, description="NULL for unlimited, 1 for single-use")
    expires_at: Optional[datetime] = None
    prefix: Optional[str] = Field(None, max_length=20, description="Optional prefix for generated codes")

    @validator('code_type')
    def validate_code_type(cls, v):
        valid_types = ['lifetime', '1year', '6month', 'custom']
        if v not in valid_types:
            raise ValueError(f'code_type must be one of: {", ".join(valid_types)}')
        return v


class SubscriptionLimitsResponse(BaseModel):
    """Schema for user subscription limits"""
    max_tarantulas: int
    can_use_breeding: bool
    max_photos_per_tarantula: int
    has_priority_support: bool
    is_premium: bool
