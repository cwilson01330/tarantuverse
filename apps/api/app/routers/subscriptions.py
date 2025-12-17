"""
Subscription API routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from datetime import datetime, timedelta
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.subscription import SubscriptionPlan, UserSubscription, SubscriptionStatus
from app.schemas.subscription import (
    SubscriptionPlan as SubscriptionPlanSchema,
    SubscriptionPlanCreate,
    UserSubscription as UserSubscriptionSchema,
    UserSubscriptionCreate,
    UserSubscriptionWithPlan,
    FeatureAccess,
    ReceiptValidationRequest,
    ReceiptValidationResponse
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/plans", response_model=List[SubscriptionPlanSchema])
def get_subscription_plans(db: Session = Depends(get_db)):
    """Get all available subscription plans"""
    plans = db.query(SubscriptionPlan).all()
    return plans


@router.get("/me", response_model=UserSubscriptionWithPlan)
def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's active subscription"""
    subscription = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active"
        )
    ).first()

    if not subscription:
        # Get free plan
        free_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "free"
        ).first()

        if not free_plan:
            raise HTTPException(status_code=500, detail="Free plan not found")

        # Create free subscription for user
        subscription = UserSubscription(
            user_id=current_user.id,
            plan_id=free_plan.id,
            status="active"
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
    
    return subscription


@router.post("/subscribe", response_model=UserSubscriptionWithPlan)
def create_subscription(
    subscription_data: UserSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create or upgrade a subscription"""
    # Get the plan
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == subscription_data.plan_id
    ).first()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Check if user already has an active subscription
    existing = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active"
        )
    ).first()

    if existing:
        # Cancel existing subscription
        existing.status = "cancelled"
        existing.cancelled_at = datetime.utcnow()

    # Create new subscription
    # Set expiry to 1 month from now for monthly, 1 year for yearly
    expires_at = None
    if plan.price_monthly > 0:
        # For paid plans, set expiry (in production, this would come from payment provider)
        expires_at = datetime.utcnow() + timedelta(days=30)

    new_subscription = UserSubscription(
        user_id=current_user.id,
        plan_id=subscription_data.plan_id,
        status="active",
        expires_at=expires_at,
        payment_provider=subscription_data.payment_provider,
        payment_provider_id=subscription_data.payment_provider_id
    )
    
    db.add(new_subscription)
    db.commit()
    db.refresh(new_subscription)
    
    return new_subscription


@router.post("/cancel")
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel current subscription"""
    subscription = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active"
        )
    ).first()

    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")

    # Don't cancel free plan
    if subscription.plan.name == "free":
        raise HTTPException(status_code=400, detail="Cannot cancel free plan")

    subscription.status = "cancelled"
    subscription.cancelled_at = datetime.utcnow()
    
    db.commit()
    
    return {"message": "Subscription cancelled successfully"}


@router.get("/features/{feature}", response_model=FeatureAccess)
def check_feature_access(
    feature: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has access to a specific feature"""
    subscription = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active"
        )
    ).first()

    if not subscription:
        return FeatureAccess(
            has_access=False,
            feature=feature,
            reason="No active subscription"
        )

    plan = subscription.plan
    has_access = False

    # Check feature access
    if feature == "edit_species":
        has_access = plan.can_edit_species
    elif feature == "submit_species":
        has_access = plan.can_submit_species
    elif feature == "advanced_filters":
        has_access = plan.has_advanced_filters
    elif feature == "priority_support":
        has_access = plan.has_priority_support

    return FeatureAccess(
        has_access=has_access,
        feature=feature,
        plan_name=plan.name,
        reason=None if has_access else f"Requires premium subscription"
    )


@router.post("/validate-receipt", response_model=ReceiptValidationResponse)
def validate_receipt(
    receipt_data: ReceiptValidationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Validate an Apple/Google in-app purchase receipt and activate subscription

    For MVP: Basic validation and subscription activation
    Production TODO: Validate with Apple/Google servers
    """
    # Map product IDs to subscription plans
    product_to_plan_map = {
        "com.tarantuverse.premium.monthly": "monthly",
        "com.tarantuverse.premium.monthly.v2": "monthly",  # New iOS product ID
        "com.tarantuverse.premium.yearly": "yearly",
        "com.tarantuverse.lifetime": "lifetime"
    }

    plan_name = product_to_plan_map.get(receipt_data.product_id)

    if not plan_name:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown product ID: {receipt_data.product_id}"
        )

    # Get the subscription plan
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == plan_name
    ).first()

    if not plan:
        raise HTTPException(
            status_code=404,
            detail=f"Subscription plan '{plan_name}' not found"
        )

    # Check if user already has an active subscription
    existing = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active"
        )
    ).first()

    if existing:
        # Cancel existing subscription
        existing.status = "cancelled"
        existing.cancelled_at = datetime.utcnow()

    # Create new subscription
    # Set expiry based on plan type
    expires_at = None
    if plan_name == "monthly":
        expires_at = datetime.utcnow() + timedelta(days=30)
    elif plan_name == "yearly":
        expires_at = datetime.utcnow() + timedelta(days=365)
    # Lifetime has no expiry

    new_subscription = UserSubscription(
        user_id=current_user.id,
        plan_id=plan.id,
        status="active",
        expires_at=expires_at,
        payment_provider="apple" if receipt_data.platform == "ios" else "google",
        payment_provider_id=receipt_data.transaction_id,
        subscription_source=plan_name,
        auto_renew=True if plan_name in ["monthly", "yearly"] else False
    )

    db.add(new_subscription)
    db.commit()
    db.refresh(new_subscription)

    return ReceiptValidationResponse(
        success=True,
        message=f"Subscription activated successfully",
        subscription=new_subscription
    )
