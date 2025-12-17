"""
Subscription schemas
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID


# Subscription Plan Schemas
class SubscriptionPlanBase(BaseModel):
    name: str
    display_name: str
    description: Optional[str] = None
    price_monthly: float = 0
    price_yearly: float = 0
    features: Dict[str, Any] = Field(default_factory=dict)
    max_tarantulas: int = 10
    can_edit_species: bool = False
    can_submit_species: bool = False
    has_advanced_filters: bool = False
    has_priority_support: bool = False


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlan(SubscriptionPlanBase):
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# User Subscription Schemas
class UserSubscriptionBase(BaseModel):
    plan_id: UUID
    status: str = "active"
    expires_at: Optional[datetime] = None
    payment_provider: Optional[str] = None
    payment_provider_id: Optional[str] = None


class UserSubscriptionCreate(BaseModel):
    plan_id: UUID
    payment_provider: Optional[str] = None
    payment_provider_id: Optional[str] = None


class UserSubscription(UserSubscriptionBase):
    id: UUID
    user_id: UUID
    started_at: datetime
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserSubscriptionWithPlan(UserSubscription):
    plan: SubscriptionPlan

    model_config = ConfigDict(from_attributes=True)


# Feature Check Response
class FeatureAccess(BaseModel):
    has_access: bool
    feature: str
    plan_name: Optional[str] = None
    reason: Optional[str] = None


# Receipt Validation Schemas
class ReceiptValidationRequest(BaseModel):
    platform: str  # 'ios' or 'android'
    receipt: str  # Transaction receipt data
    product_id: str  # Product ID (e.g., 'com.tarantuverse.premium.monthly')
    transaction_id: str  # Transaction ID from store


class ReceiptValidationResponse(BaseModel):
    success: bool
    message: str
    subscription: Optional[UserSubscriptionWithPlan] = None


# Restore request: client wants to restore/migrate an existing store receipt
class ReceiptRestoreRequest(BaseModel):
    platform: str  # 'ios' or 'android'
    receipt: str  # base64 receipt data

class ReceiptRestoreResponse(BaseModel):
    success: bool
    message: str
    subscription: Optional[UserSubscriptionWithPlan] = None
