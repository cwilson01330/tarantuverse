"""
Subscription API routes
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime, timedelta
from uuid import UUID
from pydantic import BaseModel
import stripe
import logging

from app.database import get_db
from app.config import settings
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

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


# Pydantic models for Stripe endpoints
class CreateCheckoutSessionRequest(BaseModel):
    price_type: str  # "monthly", "yearly", or "lifetime"
    success_url: str
    cancel_url: str


class CreateCheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class BillingPortalResponse(BaseModel):
    portal_url: str


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
    # All premium products map to the "premium" plan (monthly/yearly/lifetime are billing periods)
    product_to_plan_map = {
        "com.tarantuverse.premium.monthly": "premium",
        "com.tarantuverse.premium.monthly.v2": "premium",  # New iOS product ID
        "com.tarantuverse.premium.yearly": "premium",
        "com.tarantuverse.lifetime": "premium"
    }

    # Determine billing period for expiry calculation
    product_to_period_map = {
        "com.tarantuverse.premium.monthly": "monthly",
        "com.tarantuverse.premium.monthly.v2": "monthly",
        "com.tarantuverse.premium.yearly": "yearly",
        "com.tarantuverse.lifetime": "lifetime"
    }

    plan_name = product_to_plan_map.get(receipt_data.product_id)
    billing_period = product_to_period_map.get(receipt_data.product_id, "monthly")

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
    # Set expiry based on billing period
    expires_at = None
    if billing_period == "monthly":
        expires_at = datetime.utcnow() + timedelta(days=30)
    elif billing_period == "yearly":
        expires_at = datetime.utcnow() + timedelta(days=365)
    # Lifetime has no expiry

    new_subscription = UserSubscription(
        user_id=current_user.id,
        plan_id=plan.id,
        status="active",
        expires_at=expires_at,
        payment_provider="apple" if receipt_data.platform == "ios" else "google",
        payment_provider_id=receipt_data.transaction_id,
        subscription_source=billing_period,
        auto_renew=True if billing_period in ["monthly", "yearly"] else False
    )

    db.add(new_subscription)
    db.commit()
    db.refresh(new_subscription)

    return ReceiptValidationResponse(
        success=True,
        message=f"Subscription activated successfully",
        subscription=new_subscription
    )


# ==================== STRIPE ENDPOINTS ====================

@router.post("/create-checkout-session", response_model=CreateCheckoutSessionResponse)
def create_checkout_session(
    request_data: CreateCheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Stripe Checkout session for subscription purchase.
    Returns a checkout URL to redirect the user to.
    """
    # Map price type to Stripe price ID
    price_map = {
        "monthly": settings.STRIPE_PRICE_MONTHLY,
        "yearly": settings.STRIPE_PRICE_YEARLY,
        "lifetime": settings.STRIPE_PRICE_LIFETIME,
    }

    price_id = price_map.get(request_data.price_type)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid price type: {request_data.price_type}"
        )

    # Determine if this is a subscription or one-time payment
    is_subscription = request_data.price_type in ["monthly", "yearly"]

    try:
        # Check if user already has a Stripe customer ID
        existing_sub = db.query(UserSubscription).filter(
            and_(
                UserSubscription.user_id == current_user.id,
                UserSubscription.payment_provider == "stripe"
            )
        ).first()

        customer_id = existing_sub.payment_provider_id if existing_sub else None

        # Create or retrieve Stripe customer
        if customer_id:
            # Verify the customer still exists (may not if switching from test to live mode)
            try:
                stripe.Customer.retrieve(customer_id)
            except stripe.InvalidRequestError:
                # Customer doesn't exist (e.g., was in test mode, now in live mode)
                logger.info(f"Customer {customer_id} not found, creating new customer")
                customer_id = None

        if not customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                metadata={"user_id": str(current_user.id)}
            )
            customer_id = customer.id

        # Create checkout session
        checkout_params = {
            "customer": customer_id,
            "success_url": request_data.success_url,
            "cancel_url": request_data.cancel_url,
            "line_items": [{"price": price_id, "quantity": 1}],
            "metadata": {
                "user_id": str(current_user.id),
                "price_type": request_data.price_type
            },
        }

        if is_subscription:
            checkout_params["mode"] = "subscription"
        else:
            checkout_params["mode"] = "payment"

        session = stripe.checkout.Session.create(**checkout_params)

        return CreateCheckoutSessionResponse(
            checkout_url=session.url,
            session_id=session.id
        )

    except stripe.StripeError as e:
        logger.error(f"Stripe error creating checkout session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Stripe webhook events.
    Activates/updates subscriptions based on payment events.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the event
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        await handle_checkout_completed(session, db)

    elif event["type"] == "customer.subscription.updated":
        subscription = event["data"]["object"]
        await handle_subscription_updated(subscription, db)

    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        await handle_subscription_deleted(subscription, db)

    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        await handle_payment_failed(invoice, db)

    return JSONResponse(content={"status": "success"})


async def handle_checkout_completed(session: dict, db: Session):
    """Process completed checkout session"""
    user_id = session.get("metadata", {}).get("user_id")
    price_type = session.get("metadata", {}).get("price_type")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")  # None for one-time payments

    if not user_id:
        logger.error("No user_id in checkout session metadata")
        return

    # Get the premium plan
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "premium"
    ).first()

    if not plan:
        logger.error("Premium plan not found")
        return

    # Cancel any existing active subscription
    existing = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active"
        )
    ).first()

    if existing:
        existing.status = "cancelled"
        existing.cancelled_at = datetime.utcnow()

    # Calculate expiry based on price type
    expires_at = None
    if price_type == "monthly":
        expires_at = datetime.utcnow() + timedelta(days=30)
    elif price_type == "yearly":
        expires_at = datetime.utcnow() + timedelta(days=365)
    # Lifetime has no expiry

    # Create new subscription
    new_subscription = UserSubscription(
        user_id=user_id,
        plan_id=plan.id,
        status="active",
        expires_at=expires_at,
        payment_provider="stripe",
        payment_provider_id=customer_id,
        subscription_source=price_type,
        auto_renew=price_type in ["monthly", "yearly"]
    )

    db.add(new_subscription)
    db.commit()

    logger.info(f"Subscription activated for user {user_id} via Stripe ({price_type})")


async def handle_subscription_updated(subscription: dict, db: Session):
    """Handle subscription updates (renewals, plan changes)"""
    customer_id = subscription.get("customer")
    status = subscription.get("status")

    user_sub = db.query(UserSubscription).filter(
        and_(
            UserSubscription.payment_provider == "stripe",
            UserSubscription.payment_provider_id == customer_id,
            UserSubscription.status == "active"
        )
    ).first()

    if user_sub:
        if status == "active":
            # Subscription renewed - update expiry
            current_period_end = subscription.get("current_period_end")
            if current_period_end:
                user_sub.expires_at = datetime.utcfromtimestamp(current_period_end)
        elif status in ["past_due", "unpaid"]:
            # Payment issue - could add grace period logic here
            logger.warning(f"Subscription {customer_id} has payment issues: {status}")

        db.commit()


async def handle_subscription_deleted(subscription: dict, db: Session):
    """Handle subscription cancellation"""
    customer_id = subscription.get("customer")

    user_sub = db.query(UserSubscription).filter(
        and_(
            UserSubscription.payment_provider == "stripe",
            UserSubscription.payment_provider_id == customer_id,
            UserSubscription.status == "active"
        )
    ).first()

    if user_sub:
        user_sub.status = "cancelled"
        user_sub.cancelled_at = datetime.utcnow()
        db.commit()
        logger.info(f"Subscription cancelled for customer {customer_id}")


async def handle_payment_failed(invoice: dict, db: Session):
    """Handle failed payment"""
    customer_id = invoice.get("customer")
    logger.warning(f"Payment failed for customer {customer_id}")
    # Could implement email notification here


@router.get("/billing-portal", response_model=BillingPortalResponse)
def get_billing_portal(
    return_url: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Stripe Customer Portal session for managing subscriptions.
    Returns a portal URL to redirect the user to.
    """
    # Find user's Stripe customer ID
    user_sub = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.payment_provider == "stripe"
        )
    ).first()

    if not user_sub or not user_sub.payment_provider_id:
        raise HTTPException(
            status_code=404,
            detail="No Stripe subscription found. Please subscribe first."
        )

    try:
        session = stripe.billing_portal.Session.create(
            customer=user_sub.payment_provider_id,
            return_url=return_url,
        )

        return BillingPortalResponse(portal_url=session.url)

    except stripe.StripeError as e:
        logger.error(f"Stripe error creating portal session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create billing portal session")
