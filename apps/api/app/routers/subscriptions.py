"""
Subscription API routes
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
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
from app.utils.dependencies import get_current_user, get_current_admin
from app.utils.subscription import active_subscription_clause, expire_stale_subscriptions

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
    # Lazily flip stale (past-expiry) rows to 'expired' so they stop
    # masquerading as active and can't shadow the free fallback below.
    if expire_stale_subscriptions(db, current_user.id):
        db.commit()

    subscription = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            active_subscription_clause()
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


@router.get("/app-status")
def get_app_subscription_status(
    app: str = Query("tarantuverse", pattern="^(tarantuverse|herpetoverse)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """App-scoped entitlement for the settings UI.

    Unlike /me (which returns ANY active sub), this resolves premium FOR THE
    GIVEN APP via is_premium_for_app — so a Tarantuverse-only sub never reads as
    Herpetoverse premium, and All-Access ('both') satisfies either app. Returns
    the granting plan + expiry + payment source so settings can show status and
    route management to the right store.
    """
    if expire_stale_subscriptions(db, current_user.id):
        db.commit()

    subs = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == current_user.id, active_subscription_clause())
        .all()
    )
    granting_sub = None
    granting_plan = None
    granting_app = None
    for sub in subs:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
        if not plan or plan.name == "free":
            continue
        plan_app = getattr(plan, "app", None) or "tarantuverse"
        if plan_app in (app, "both"):
            granting_sub, granting_plan, granting_app = sub, plan, plan_app
            # Prefer a 'both'/All-Access grant if present, else take the first.
            if plan_app == "both":
                break

    if not granting_plan:
        return {
            "is_premium": False,
            "tier": "free",
            "plan_name": "free",
            "plan_display_name": "Free",
            "expires_at": None,
            "source": None,
            "app_scope": None,
        }

    return {
        "is_premium": True,
        "tier": "all_access" if granting_app == "both" else "premium",
        "plan_name": granting_plan.name,
        "plan_display_name": granting_plan.display_name,
        "expires_at": granting_sub.expires_at.isoformat() if granting_sub.expires_at else None,
        "source": granting_sub.payment_provider,  # apple | google | stripe | None
        "app_scope": granting_app,                # 'herpetoverse' | 'both'
    }


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
            active_subscription_clause()
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
    Validate an Apple/Google in-app purchase receipt and activate subscription.

    iOS: when the App Store Server API key is configured (APPLE_IAP_*),
    the transaction is verified against Apple's servers — product,
    expiry, and original transaction id come from Apple, not the client.
    Falls back to trust-the-client MVP behavior if unconfigured.
    Android: still MVP (no server-side check yet).
    """
    verified_txn = None
    if receipt_data.platform == "ios":
        from app.services.apple_notification_service import (
            AppleNotificationError,
            api_configured,
            verify_transaction,
        )

        if api_configured():
            try:
                verified_txn, apple_env = verify_transaction(receipt_data.transaction_id)
            except AppleNotificationError as e:
                logger.warning(
                    f"Receipt verification failed for user {current_user.id}, "
                    f"transaction {receipt_data.transaction_id}: {e}"
                )
                raise HTTPException(
                    status_code=400,
                    detail="Could not verify this purchase with Apple. If you were "
                    "charged, try Restore Previous Purchases in a few minutes.",
                )

            if getattr(verified_txn, "revocationDate", None):
                raise HTTPException(
                    status_code=400,
                    detail="This purchase has been refunded or revoked.",
                )

            logger.info(
                f"Apple verified transaction {receipt_data.transaction_id} "
                f"({apple_env}): product {verified_txn.productId}"
            )
        else:
            logger.warning(
                "APPLE_IAP_* not configured — accepting iOS receipt without "
                "server-side verification (MVP fallback)"
            )

    # Trust Apple's product id over the client's when we verified
    effective_product_id = (
        verified_txn.productId if verified_txn and verified_txn.productId
        else receipt_data.product_id
    )

    # Map product IDs to subscription plans
    # All premium products map to the "premium" plan (monthly/yearly/lifetime are billing periods)
    # iOS App Store Connect uses the `.v2` suffix on the monthly and yearly
    # products (both approved 2026-04 — Tarantuverse Premium Group). Android
    # products keep the original IDs. Any new platform IDs added on App
    # Store Connect MUST be added to both maps below or receipt validation
    # will reject the purchase with a 400 and the user will be charged by
    # Apple without getting premium access.
    product_to_plan_map = {
        # ---- Tarantuverse ----
        "com.tarantuverse.premium.monthly": "premium",
        "com.tarantuverse.premium.monthly.v2": "premium",   # iOS monthly
        "com.tarantuverse.premium.yearly": "premium",
        "com.tarantuverse.premium.yearly.v2": "premium",    # iOS yearly
        "com.tarantuverse.lifetime": "premium",
        # ---- Herpetoverse (app-scoped) ----
        # Premium tier -> herpetoverse_premium (app='herpetoverse').
        "herpetoverse.premium.monthly": "herpetoverse_premium",
        "herpetoverse.premium.monthly.v2": "herpetoverse_premium",
        "herpetoverse.premium.yearly": "herpetoverse_premium",
        "herpetoverse.premium.yearly.v2": "herpetoverse_premium",
        "herpetoverse.premium.lifetime": "herpetoverse_premium",
        # All-Access tier -> bundle_premium (app='both', covers TV + HV).
        "herpetoverse.allaccess.monthly": "bundle_premium",
        "herpetoverse.allaccess.monthly.v2": "bundle_premium",
        "herpetoverse.allaccess.yearly": "bundle_premium",
        "herpetoverse.allaccess.yearly.v2": "bundle_premium",
        "herpetoverse.allaccess.lifetime": "bundle_premium",
        # Android: Play subscriptions report the SUBSCRIPTION-level id on
        # purchase (base plan monthly/yearly is not in productId), so map the
        # bare ids too.
        "herpetoverse.premium": "herpetoverse_premium",
        "herpetoverse.allaccess": "bundle_premium",
    }

    # Determine billing period for expiry calculation
    product_to_period_map = {
        # ---- Tarantuverse ----
        "com.tarantuverse.premium.monthly": "monthly",
        "com.tarantuverse.premium.monthly.v2": "monthly",
        "com.tarantuverse.premium.yearly": "yearly",
        "com.tarantuverse.premium.yearly.v2": "yearly",
        "com.tarantuverse.lifetime": "lifetime",
        # ---- Herpetoverse ----
        "herpetoverse.premium.monthly": "monthly",
        "herpetoverse.premium.monthly.v2": "monthly",
        "herpetoverse.premium.yearly": "yearly",
        "herpetoverse.premium.yearly.v2": "yearly",
        "herpetoverse.premium.lifetime": "lifetime",
        "herpetoverse.allaccess.monthly": "monthly",
        "herpetoverse.allaccess.monthly.v2": "monthly",
        "herpetoverse.allaccess.yearly": "yearly",
        "herpetoverse.allaccess.yearly.v2": "yearly",
        "herpetoverse.allaccess.lifetime": "lifetime",
        # Android bare subscription ids — period unknown from id (base plan not
        # in productId); default monthly for the fallback expiry heuristic.
        # Google's real renewal state comes from Play RTDN (future work).
        "herpetoverse.premium": "monthly",
        "herpetoverse.allaccess": "monthly",
    }

    plan_name = product_to_plan_map.get(effective_product_id)
    billing_period = product_to_period_map.get(effective_product_id, "monthly")

    if not plan_name:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown product ID: {effective_product_id}"
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

    # Supersede existing active subscriptions — but SCOPED BY APP. A keeper can
    # legitimately hold a Tarantuverse sub AND a Herpetoverse sub at once
    # (is_premium_for_app checks all active subs), so we must NOT cancel a
    # different-app sub when a new one is purchased. Rules:
    #   • a new 'both' (All-Access) plan supersedes everything;
    #   • otherwise only cancel existing active subs with the SAME app scope
    #     (e.g. replacing HV monthly with HV yearly), never a different app.
    new_app = getattr(plan, "app", None) or "tarantuverse"
    existing_active = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == "active",
        )
        .all()
    )
    for ex in existing_active:
        ex_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == ex.plan_id
        ).first()
        ex_app = (getattr(ex_plan, "app", None) or "tarantuverse") if ex_plan else "tarantuverse"
        if new_app == "both" or ex_app == new_app:
            ex.status = "cancelled"
            ex.cancelled_at = datetime.utcnow()

    # Create new subscription
    # Expiry: prefer Apple's authoritative expiresDate (ms epoch) when
    # the transaction was server-verified; otherwise fall back to the
    # billing-period heuristic.
    expires_at = None
    verified_expires_ms = getattr(verified_txn, "expiresDate", None) if verified_txn else None
    if verified_expires_ms:
        expires_at = datetime.utcfromtimestamp(verified_expires_ms / 1000)
    elif verified_txn is None:
        if billing_period == "monthly":
            expires_at = datetime.utcnow() + timedelta(days=30)
        elif billing_period == "yearly":
            expires_at = datetime.utcnow() + timedelta(days=365)
    # Lifetime (verified, no expiresDate) has no expiry

    # Original transaction id: Apple's verified value first, then the
    # client-sent one, then the per-renewal id as a last resort. App
    # Store Server Notifications match on this.
    original_txn_id = (
        (getattr(verified_txn, "originalTransactionId", None) if verified_txn else None)
        or receipt_data.original_transaction_id
        or receipt_data.transaction_id
    )

    new_subscription = UserSubscription(
        user_id=current_user.id,
        plan_id=plan.id,
        status="active",
        expires_at=expires_at,
        payment_provider="apple" if receipt_data.platform == "ios" else "google",
        payment_provider_id=original_txn_id,
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

    # Idempotency guard: Stripe retries webhooks (and events can be
    # replayed from the dashboard). If this user already has an active
    # Stripe subscription for the same customer + price type, this event
    # was already processed — skip instead of cancelling and recreating.
    duplicate = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == user_id,
            UserSubscription.status == "active",
            UserSubscription.payment_provider == "stripe",
            UserSubscription.payment_provider_id == customer_id,
            UserSubscription.subscription_source == price_type,
        )
    ).first()

    if duplicate:
        logger.info(
            f"Duplicate checkout.session.completed for user {user_id} "
            f"(customer {customer_id}, {price_type}) — already processed, skipping"
        )
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

    # Include 'expired' rows: lazy expiry may have flipped the row just
    # before a renewal webhook arrives — a renewal must reactivate it.
    user_sub = db.query(UserSubscription).filter(
        and_(
            UserSubscription.payment_provider == "stripe",
            UserSubscription.payment_provider_id == customer_id,
            UserSubscription.status.in_(["active", "expired"])
        )
    ).order_by(UserSubscription.started_at.desc()).first()

    if user_sub:
        if status == "active":
            # Subscription renewed - update expiry (and revive if lazily expired)
            current_period_end = subscription.get("current_period_end")
            if current_period_end:
                user_sub.expires_at = datetime.utcfromtimestamp(current_period_end)
            user_sub.status = "active"

            # A free-plan row may have been auto-created by /me while
            # this row sat lazily expired — cancel any other active
            # rows so entitlement reads stay unambiguous.
            others = db.query(UserSubscription).filter(
                and_(
                    UserSubscription.user_id == user_sub.user_id,
                    UserSubscription.id != user_sub.id,
                    UserSubscription.status == "active",
                )
            ).all()
            for other in others:
                other.status = "cancelled"
                other.cancelled_at = datetime.utcnow()
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


# ============== APPLE APP STORE SERVER NOTIFICATIONS (V2) ==============

@router.post("/apple-notifications")
async def apple_server_notifications(request: Request, db: Session = Depends(get_db)):
    """
    Receive Apple App Store Server Notifications (V2).

    Configure this URL in App Store Connect → App Information →
    App Store Server Notifications (both Production and Sandbox):
        https://tarantuverse-api.onrender.com/api/v1/subscriptions/apple-notifications

    Keeps IAP subscriptions in sync: renewals extend expires_at,
    expirations / refunds end premium. Signature is verified against
    Apple's pinned root certificates — unverifiable payloads are
    rejected with 401.
    """
    # Lazy import so the API still boots if the library/certs are
    # missing — only this endpoint degrades.
    from app.services.apple_notification_service import (
        AppleNotificationError,
        decode_notification,
    )

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    signed_payload = body.get("signedPayload")
    if not signed_payload:
        raise HTTPException(status_code=400, detail="Missing signedPayload")

    try:
        notification_type, subtype, txn, environment = decode_notification(signed_payload)
    except AppleNotificationError as e:
        logger.error(f"Apple notification rejected: {e}")
        raise HTTPException(status_code=401, detail="Signature verification failed")

    logger.info(
        f"Apple notification: {notification_type}"
        f"{f'/{subtype}' if subtype else ''} ({environment})"
    )

    # TEST notifications (and some types) carry no transaction info
    if txn is None:
        return JSONResponse(content={"status": "ok"})

    original_txn_id = getattr(txn, "originalTransactionId", None)
    if not original_txn_id:
        logger.warning(f"Apple notification {notification_type}: no originalTransactionId")
        return JSONResponse(content={"status": "ok"})

    # Match on the original transaction id stored at receipt validation.
    # (Initial purchases store it directly; for the very first purchase
    # the per-renewal transactionId equals the original one, so legacy
    # rows usually match too.)
    user_sub = db.query(UserSubscription).filter(
        and_(
            UserSubscription.payment_provider == "apple",
            UserSubscription.payment_provider_id == original_txn_id,
        )
    ).order_by(UserSubscription.started_at.desc()).first()

    if not user_sub:
        # 200 anyway — Apple retries on errors, and a row that predates
        # original-id storage will never match no matter how many retries.
        logger.warning(
            f"Apple notification {notification_type}: no subscription matches "
            f"originalTransactionId {original_txn_id}"
        )
        return JSONResponse(content={"status": "ok"})

    expires_ms = getattr(txn, "expiresDate", None)
    new_expiry = datetime.utcfromtimestamp(expires_ms / 1000) if expires_ms else None

    if notification_type in ("SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED"):
        user_sub.status = "active"
        if new_expiry:
            user_sub.expires_at = new_expiry
        user_sub.auto_renew = True
        user_sub.cancelled_at = None

        # Cancel shadow rows (e.g., the free row /me auto-creates while
        # a row sat lazily expired)
        others = db.query(UserSubscription).filter(
            and_(
                UserSubscription.user_id == user_sub.user_id,
                UserSubscription.id != user_sub.id,
                UserSubscription.status == "active",
            )
        ).all()
        for other in others:
            other.status = "cancelled"
            other.cancelled_at = datetime.utcnow()

        logger.info(
            f"Apple {notification_type}: extended subscription for user "
            f"{user_sub.user_id} to {new_expiry}"
        )

    elif notification_type == "DID_CHANGE_RENEWAL_STATUS":
        user_sub.auto_renew = subtype == "AUTO_RENEW_ENABLED"
        logger.info(
            f"Apple renewal status for user {user_sub.user_id}: "
            f"auto_renew={user_sub.auto_renew}"
        )

    elif notification_type in ("EXPIRED", "GRACE_PERIOD_EXPIRED"):
        user_sub.status = "expired"
        if new_expiry:
            user_sub.expires_at = new_expiry
        user_sub.auto_renew = False
        logger.info(f"Apple {notification_type}: subscription ended for user {user_sub.user_id}")

    elif notification_type in ("REFUND", "REVOKE"):
        user_sub.status = "cancelled"
        user_sub.cancelled_at = datetime.utcnow()
        logger.info(f"Apple {notification_type}: subscription revoked for user {user_sub.user_id}")

    elif notification_type == "REFUND_REVERSED":
        # Apple reversed an earlier refund — reinstate. If the period
        # already lapsed, expiry-aware reads keep premium off anyway.
        user_sub.status = "active"
        user_sub.cancelled_at = None
        if new_expiry:
            user_sub.expires_at = new_expiry
        logger.info(f"Apple REFUND_REVERSED: subscription reinstated for user {user_sub.user_id}")

    elif notification_type == "DID_FAIL_TO_RENEW":
        # GRACE_PERIOD subtype = keep access while Apple retries billing;
        # without it, the EXPIRED notification will follow and end access.
        logger.warning(
            f"Apple DID_FAIL_TO_RENEW for user {user_sub.user_id}"
            f"{' (grace period)' if subtype == 'GRACE_PERIOD' else ''}"
        )

    else:
        logger.info(f"Apple notification {notification_type}: no handler, ignoring")

    db.commit()
    return JSONResponse(content={"status": "ok"})


@router.post("/admin/apple-test-notification")
def request_apple_test_notification(current_user: User = Depends(get_current_admin)):
    """
    Admin: ask Apple to send a TEST notification to our notifications URL.
    Returns a token to check delivery status with the GET endpoint below.
    """
    from app.services.apple_notification_service import (
        AppleNotificationError,
        request_test_notification,
    )

    try:
        environment, token = request_test_notification()
    except AppleNotificationError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"environment": environment, "test_notification_token": token}


@router.get("/admin/apple-test-notification/{token}")
def check_apple_test_notification(token: str, current_user: User = Depends(get_current_admin)):
    """
    Admin: check how our server responded to a TEST notification —
    Apple reports each delivery attempt and the result it recorded.
    """
    from app.services.apple_notification_service import (
        AppleNotificationError,
        get_test_notification_status,
    )

    try:
        environment, attempts = get_test_notification_status(token)
    except AppleNotificationError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"environment": environment, "send_attempts": attempts}
