"""
Promo Code routes (Admin only + user redemption)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.promo_code import PromoCode, PromoCodeType
from app.models.subscription import UserSubscription, SubscriptionPlan, SubscriptionStatus
from app.schemas.promo_code import (
    PromoCodeCreate,
    PromoCodeResponse,
    PromoCodeUpdate,
    PromoCodeRedemption,
    PromoCodeBulkCreate,
    SubscriptionLimitsResponse
)
from app.utils.dependencies import get_current_user, get_current_superuser
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
from typing import List, Optional
import secrets
import string

router = APIRouter()


# Admin comps are resolved to a plan by APP SCOPE, not by a hardcoded name.
# Tarantuverse and Herpetoverse bill separately (see User.is_premium_for_app),
# so "grant premium" is meaningless without saying premium to WHAT. The old
# endpoint hardcoded name == "premium", which happens to be the Tarantuverse
# plan — correct by accident of naming, and unreachable for the other two.
GRANT_PLAN_BY_APP = {
    "tarantuverse": "premium",
    "herpetoverse": "herpetoverse_premium",
    "both": "bundle_premium",
}


class AdminGrantRequest(BaseModel):
    """Body for POST /admin/grant/{user_id}."""
    app: str = Field(default="tarantuverse", pattern="^(tarantuverse|herpetoverse|both)$")
    # None means NO EXPIRY (a permanent comp). The admin UI always sends this
    # field explicitly — either a date or an explicit null — so the ambiguity
    # between "omitted" and "unlimited" never arises in practice.
    expires_at: Optional[datetime] = None


def generate_promo_code(prefix: str = None, length: int = 12) -> str:
    """Generate a random promo code"""
    chars = string.ascii_uppercase + string.digits
    code_part = ''.join(secrets.choice(chars) for _ in range(length))
    if prefix:
        return f"{prefix}-{code_part}"
    return code_part


@router.post("/", response_model=PromoCodeResponse, status_code=status.HTTP_201_CREATED)
async def create_promo_code(
    promo_data: PromoCodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Create a new promo code (Superuser only)
    """
    # Check if code already exists
    existing = db.query(PromoCode).filter(PromoCode.code == promo_data.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Promo code already exists"
        )

    # Create promo code
    promo_code = PromoCode(
        **promo_data.model_dump(),
        created_by_admin_id=current_user.id
    )

    db.add(promo_code)
    db.commit()
    db.refresh(promo_code)

    return promo_code


@router.post("/bulk", response_model=List[PromoCodeResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_promo_codes(
    bulk_data: PromoCodeBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Generate multiple promo codes at once (Superuser only)
    """
    created_codes = []

    for i in range(bulk_data.count):
        # Generate unique code
        max_attempts = 10
        for attempt in range(max_attempts):
            code = generate_promo_code(prefix=bulk_data.prefix)
            existing = db.query(PromoCode).filter(PromoCode.code == code).first()
            if not existing:
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate unique code after {max_attempts} attempts"
            )

        # Create promo code
        promo_code = PromoCode(
            code=code,
            code_type=bulk_data.code_type,
            custom_duration_days=bulk_data.custom_duration_days,
            usage_limit=bulk_data.usage_limit,
            is_active=True,
            expires_at=bulk_data.expires_at,
            created_by_admin_id=current_user.id
        )

        db.add(promo_code)
        created_codes.append(promo_code)

    db.commit()

    # Refresh all codes to get IDs and timestamps
    for code in created_codes:
        db.refresh(code)

    return created_codes


@router.get("/", response_model=List[PromoCodeResponse])
async def list_promo_codes(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    List all promo codes (Superuser only)
    """
    query = db.query(PromoCode)

    if active_only:
        query = query.filter(PromoCode.is_active == True)

    codes = query.order_by(PromoCode.created_at.desc()).offset(skip).limit(limit).all()
    return codes


@router.get("/{code_id}", response_model=PromoCodeResponse)
async def get_promo_code(
    code_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Get a specific promo code (Superuser only)
    """
    promo_code = db.query(PromoCode).filter(PromoCode.id == code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promo code not found"
        )
    return promo_code


@router.patch("/{code_id}", response_model=PromoCodeResponse)
async def update_promo_code(
    code_id: str,
    update_data: PromoCodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Update a promo code (Superuser only)
    """
    promo_code = db.query(PromoCode).filter(PromoCode.id == code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promo code not found"
        )

    # Update fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(promo_code, field, value)

    db.commit()
    db.refresh(promo_code)

    return promo_code


@router.delete("/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promo_code(
    code_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Delete a promo code (Superuser only)
    """
    promo_code = db.query(PromoCode).filter(PromoCode.id == code_id).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promo code not found"
        )

    db.delete(promo_code)
    db.commit()

    return None


@router.post("/redeem", status_code=status.HTTP_200_OK)
async def redeem_promo_code(
    redemption: PromoCodeRedemption,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Redeem a promo code (Any authenticated user)
    """
    # Find promo code
    promo_code = db.query(PromoCode).filter(PromoCode.code == redemption.code).first()
    if not promo_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid promo code"
        )

    # Check if valid
    if not promo_code.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Promo code is expired or no longer valid"
        )

    # Check if user already has an active premium subscription
    # Use string value explicitly for reliable comparison
    existing_subscription = db.query(UserSubscription).filter(
        UserSubscription.user_id == current_user.id,
        UserSubscription.status == "active"
    ).first()

    if existing_subscription:
        # Check if it's a free plan or expired
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == existing_subscription.plan_id
        ).first()

        if plan and plan.name != "free":
            # Check if not expired
            if not existing_subscription.expires_at or existing_subscription.expires_at > datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You already have an active premium subscription"
                )

    # Get premium plan
    premium_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "premium"
    ).first()

    if not premium_plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Premium plan not found. Please contact support."
        )

    # Calculate expiration date
    duration_days = promo_code.get_duration_days()
    expires_at = datetime.now(timezone.utc) + timedelta(days=duration_days) if duration_days < 36500 else None

    # Cancel existing subscription if exists
    if existing_subscription:
        existing_subscription.status = "cancelled"
        existing_subscription.cancelled_at = datetime.now(timezone.utc)

    # Create new subscription
    new_subscription = UserSubscription(
        user_id=current_user.id,
        plan_id=premium_plan.id,
        status="active",
        expires_at=expires_at,
        promo_code_used=promo_code.code,
        subscription_source="promo",
        payment_provider="promo_code",
        granted_by_admin=False
    )

    db.add(new_subscription)

    # Increment promo code usage
    promo_code.times_used += 1

    db.commit()

    return {
        "message": "Promo code redeemed successfully!",
        "subscription_expires_at": expires_at,
        "is_lifetime": expires_at is None
    }


@router.get("/me/limits", response_model=SubscriptionLimitsResponse)
async def get_my_limits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's subscription limits
    """
    limits = current_user.get_subscription_limits()
    return limits


@router.get("/me/debug")
async def debug_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Debug endpoint to see raw subscription data
    """
    # Get all subscriptions for this user
    all_subs = db.query(UserSubscription).filter(
        UserSubscription.user_id == current_user.id
    ).all()

    # Get all plans
    all_plans = db.query(SubscriptionPlan).all()

    return {
        "user_id": str(current_user.id),
        "username": current_user.username,
        "subscriptions": [
            {
                "id": str(sub.id),
                "plan_id": str(sub.plan_id),
                "status": sub.status,
                "status_type": type(sub.status).__name__,
                "expires_at": str(sub.expires_at) if sub.expires_at else None,
                "created_at": str(sub.created_at),
            }
            for sub in all_subs
        ],
        "plans": [
            {
                "id": str(plan.id),
                "name": plan.name,
                "can_use_breeding": plan.can_use_breeding,
            }
            for plan in all_plans
        ],
        "limits_from_method": current_user.get_subscription_limits()
    }


@router.post("/me/revoke", status_code=status.HTTP_200_OK)
async def revoke_my_premium(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Revoke your own premium subscription (for testing purposes)
    """
    # Find active subscription
    active_sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == current_user.id,
        UserSubscription.status == "active"
    ).first()

    if not active_sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found"
        )

    # Check if it's the free plan
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == active_sub.plan_id
    ).first()

    if plan and plan.name == "free":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You're already on the free plan"
        )

    # Cancel the subscription
    active_sub.status = "cancelled"
    active_sub.cancelled_at = datetime.now(timezone.utc)

    db.commit()

    return {
        "message": "Premium subscription revoked successfully",
        "previous_plan": plan.name if plan else "unknown"
    }


def _plan_app(plan: SubscriptionPlan) -> str:
    """App scope of a plan. Legacy rows predate the column and are Tarantuverse."""
    return getattr(plan, "app", None) or "tarantuverse"


def _scopes_overlap(a: str, b: str) -> bool:
    """'both' covers everything; otherwise the scopes must match exactly."""
    return a == b or a == "both" or b == "both"


@router.post("/admin/grant/{user_id}", status_code=status.HTTP_200_OK)
async def grant_premium_to_user(
    user_id: str,
    grant: AdminGrantRequest = AdminGrantRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Manually grant premium to a user, scoped to one app (Superuser only).

    Generates and applies an ADMIN- promo code, which is also what records WHO
    issued the comp (`PromoCode.created_by_admin_id`) — there's no separate
    audit table yet.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    plan_name = GRANT_PLAN_BY_APP[grant.app]
    premium_plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == plan_name
    ).first()

    if not premium_plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Plan '{plan_name}' not found — cannot grant {grant.app} premium"
        )

    expires_at = grant.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expiry must be in the future"
            )

    # Only supersede comps this grant actually replaces. The old code cancelled
    # EVERY active subscription, which — now that scopes exist — would silently
    # kill a Stripe-billed Tarantuverse sub as a side effect of comping
    # Herpetoverse. Cancelling the row also wouldn't stop Stripe billing, so
    # the user would keep paying for access we'd just revoked.
    existing = db.query(UserSubscription).filter(
        UserSubscription.user_id == user_id,
        UserSubscription.status == "active"
    ).all()

    superseded = []
    kept_paid = []
    for sub in existing:
        sub_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == sub.plan_id
        ).first()
        if not sub_plan or not _scopes_overlap(_plan_app(sub_plan), grant.app):
            continue
        if sub_plan.name == "free":
            sub.status = "cancelled"
            sub.cancelled_at = datetime.now(timezone.utc)
            continue
        if not sub.granted_by_admin:
            # A real paid subscription. Leave it alone and say so rather than
            # cancelling something we can't actually refund or un-bill.
            kept_paid.append(sub_plan.name)
            continue
        sub.status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)
        superseded.append(sub_plan.name)

    code = generate_promo_code(prefix="ADMIN")
    promo_code = PromoCode(
        code=code,
        code_type=PromoCodeType.LIFETIME.value if expires_at is None else PromoCodeType.CUSTOM.value,
        custom_duration_days=(
            None if expires_at is None
            else max(1, (expires_at - datetime.now(timezone.utc)).days)
        ),
        usage_limit=1,  # Single use
        is_active=True,
        created_by_admin_id=current_user.id
    )
    db.add(promo_code)
    db.flush()

    new_subscription = UserSubscription(
        user_id=user_id,
        plan_id=premium_plan.id,
        status="active",
        expires_at=expires_at,
        promo_code_used=code,
        subscription_source="promo",
        payment_provider="admin_grant",
        granted_by_admin=True
    )
    db.add(new_subscription)
    promo_code.times_used = 1

    db.commit()

    return {
        "message": f"{premium_plan.display_name} granted to {target_user.username}",
        "app": grant.app,
        "plan": premium_plan.name,
        "plan_display_name": premium_plan.display_name,
        "promo_code": code,
        "expires_at": expires_at,
        "is_lifetime": expires_at is None,
        "superseded_plans": superseded,
        # Surfaced so the admin knows a paid sub is still running alongside
        # the comp — not an error, but not something to discover later either.
        "kept_paid_plans": kept_paid,
    }


@router.post("/admin/revoke/{user_id}", status_code=status.HTTP_200_OK)
async def revoke_premium_from_user(
    user_id: str,
    app: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser)
):
    """
    Revoke premium from a user (Superuser only).

    `app` scopes the revocation to one storefront. Omit it to revoke every
    active paid/comped subscription. The previous version took the FIRST
    active subscription and cancelled that one, which with multiple app-scoped
    subs meant the outcome depended on row order.
    """
    if app is not None and app not in GRANT_PLAN_BY_APP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="app must be tarantuverse, herpetoverse or both"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    active_subs = db.query(UserSubscription).filter(
        UserSubscription.user_id == user_id,
        UserSubscription.status == "active"
    ).all()

    revoked = []
    still_billing = []
    for sub in active_subs:
        plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.id == sub.plan_id
        ).first()
        if not plan or plan.name == "free":
            continue
        if app is not None and not _scopes_overlap(_plan_app(plan), app):
            continue
        sub.status = "cancelled"
        sub.cancelled_at = datetime.now(timezone.utc)
        revoked.append(plan.name)
        if not sub.granted_by_admin and sub.payment_provider not in (None, "admin_grant"):
            # Cancelling our row does NOT cancel Stripe/Apple/Google billing.
            # Say so plainly — otherwise the user loses access and keeps paying.
            still_billing.append(f"{plan.name} via {sub.payment_provider}")

    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No active {app} subscription found for this user"
                if app else "No active paid subscription found for this user"
            )
        )

    db.commit()

    return {
        "message": f"Premium access revoked from {target_user.username}",
        "revoked_plans": revoked,
        "previous_plan": revoked[0],  # kept for older callers
        "still_billing": still_billing,
    }
