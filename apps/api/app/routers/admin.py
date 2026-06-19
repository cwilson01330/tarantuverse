from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from app.database import get_db
from app.models.user import User
from app.models.species import Species
from app.models.invert_species import InvertSpecies
from app.models.subscription import UserSubscription, SubscriptionPlan
from app.models.content_report import ContentReport
from app.utils.subscription import active_subscription_clause
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_admin
from app.services.email import EmailService
from app.config import settings
import secrets
from datetime import datetime, timedelta, timezone

router = APIRouter(
    dependencies=[Depends(get_current_admin)]
)

@router.get("/stats")
async def get_admin_stats(
    db: Session = Depends(get_db)
):
    """
    Get platform statistics for admin dashboard
    """
    # Total users
    total_users = db.query(func.count(User.id)).scalar() or 0

    # Total species across ALL taxa — count the unified `invert_species` catalog,
    # not the legacy tarantula-only `species` table (which omits scorpions,
    # centipedes, mantises, roaches, etc.).
    total_species = db.query(func.count(InvertSpecies.id)).scalar() or 0
    species_by_taxon = {
        taxon: count
        for taxon, count in (
            db.query(InvertSpecies.taxon, func.count(InvertSpecies.id))
            .group_by(InvertSpecies.taxon)
            .all()
        )
    }

    # Premium users: DISTINCT users on a PAID plan whose subscription is active
    # and not past expires_at. Mirrors User.is_premium / get_subscription_limits
    # and utils/subscription.active_subscription_clause. Counting raw
    # status='active' rows overcounts expired-but-unflipped rows + free-plan rows
    # and double-counts renewals.
    premium_users = (
        db.query(func.count(distinct(UserSubscription.user_id)))
        .join(SubscriptionPlan, UserSubscription.plan_id == SubscriptionPlan.id)
        .filter(active_subscription_clause(), SubscriptionPlan.name != "free")
        .scalar()
    ) or 0

    # Pending reports (not resolved)
    pending_reports = db.query(func.count(ContentReport.id)).filter(
        ContentReport.status == 'pending'
    ).scalar() or 0

    return {
        "total_users": total_users,
        "total_species": total_species,
        "species_by_taxon": species_by_taxon,
        "premium_users": premium_users,
        "pending_reports": pending_reports
    }

@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = Query(100, ge=1, le=1000),
    search: str = None,
    db: Session = Depends(get_db)
):
    """
    List users with premium status (Admin only)
    """
    query = db.query(User)

    if search:
        search = search[:100]  # Cap search length to prevent abuse
        search_filter = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_filter)) |
            (User.username.ilike(search_filter)) |
            (User.display_name.ilike(search_filter))
        )

    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    # Build response with is_premium computed from subscription
    result = []
    for user in users:
        user_dict = UserResponse.model_validate(user).model_dump()
        # Check if user has premium subscription
        limits = user.get_subscription_limits()
        user_dict['is_premium'] = limits.get('is_premium', False)
        result.append(user_dict)

    return result


@router.get("/subscriptions")
async def list_subscriptions(
    active_only: bool = Query(True, description="Only currently-active (paid, non-expired) subs."),
    db: Session = Depends(get_db),
):
    """List subscriptions with full detail for the admin Subscriptions view.

    Surfaces provider (apple/stripe/admin grant), plan, dates, transaction id,
    auto-renew, and an expiry-aware `is_active` so Apple/Stripe purchases are
    visible (the users list only shows a premium yes/no badge).
    """
    now = datetime.now(timezone.utc)
    q = (
        db.query(UserSubscription, User, SubscriptionPlan)
        .join(User, User.id == UserSubscription.user_id)
        .outerjoin(SubscriptionPlan, SubscriptionPlan.id == UserSubscription.plan_id)
    )
    if active_only:
        # SubscriptionPlan is already outer-joined above; filtering on its name
        # (non-null) effectively makes it an inner join — do NOT join it again
        # (a second join emits the table twice and 500s).
        q = q.filter(active_subscription_clause(), SubscriptionPlan.name != "free")

    rows = q.order_by(UserSubscription.created_at.desc()).all()

    out = []
    for sub, user, plan in rows:
        expires = sub.expires_at
        if expires is not None and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        is_active = sub.status == "active" and (expires is None or expires > now)
        out.append({
            "id": str(sub.id),
            "username": user.username,
            "email": user.email,
            "plan": plan.name if plan else None,
            "status": sub.status,
            "is_active": is_active,
            "payment_provider": sub.payment_provider,
            "subscription_source": sub.subscription_source,
            "payment_provider_id": sub.payment_provider_id,
            "auto_renew": sub.auto_renew,
            "granted_by_admin": sub.granted_by_admin,
            "promo_code_used": sub.promo_code_used,
            "started_at": sub.started_at,
            "expires_at": sub.expires_at,
            "cancelled_at": sub.cancelled_at,
            "created_at": sub.created_at,
        })
    return out


@router.post("/users/{user_id}/reset-password")
async def trigger_password_reset(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Trigger a password reset email for a specific user (Admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Generate token
    token = secrets.token_urlsafe(32)
    # Set expiration to 24 hours from now
    expires = datetime.now(timezone.utc) + timedelta(hours=24)

    user.reset_token = token
    user.reset_token_expires_at = expires
    db.commit()

    # Construct reset link using configured frontend URL
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    # Send email
    await EmailService.send_password_reset_email(user.email, reset_link)

    return {"message": f"Password reset email sent to {user.email}"}


@router.post("/users/{user_id}/resend-verification")
async def resend_verification_email(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Resend verification email for a specific user (Admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already verified"
        )

    # Generate new verification token
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    user.verification_token = verification_token
    user.verification_token_expires_at = verification_token_expires_at
    db.commit()

    # Construct verification link
    verify_link = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"

    # Send email
    await EmailService.send_verification_email(user.email, verify_link)

    return {"message": f"Verification email sent to {user.email}"}


@router.post("/users/{user_id}/verify")
async def manually_verify_user(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Manually verify a user (bypass email verification) - Admin only
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if user.is_verified:
        return {"message": f"User {user.email} is already verified"}

    # Verify the user
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    db.commit()

    return {"message": f"Successfully verified {user.email}"}


@router.post("/users/verify-all")
async def verify_all_users(
    db: Session = Depends(get_db)
):
    """
    Verify ALL unverified users (useful for development/testing) - Admin only
    """
    unverified_users = db.query(User).filter(User.is_verified == False).all()

    count = len(unverified_users)

    if count == 0:
        return {"message": "All users are already verified", "verified_count": 0}

    for user in unverified_users:
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expires_at = None

    db.commit()

    return {
        "message": f"Successfully verified {count} users",
        "verified_count": count
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a user and all their data (Admin only)
    Use with caution - this is irreversible!
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    username = user.username
    email = user.email

    # Delete the user (CASCADE will handle related records)
    db.delete(user)
    db.commit()

    return {
        "message": f"Successfully deleted user {username} ({email})",
        "deleted_user_id": user_id
    }


@router.post("/test-email")
async def test_email_sending(
    test_email: str,
):
    """
    Send a test email to verify SendGrid configuration (Admin only)
    Useful for debugging email delivery issues
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"🧪 Testing email send to: {test_email}")

    try:
        await EmailService.send_email(
            to_email=test_email,
            subject="Test Email from Tarantuverse",
            content="""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>✅ SendGrid Test Email</h2>
                <p>This is a test email from your Tarantuverse API.</p>
                <p>If you're seeing this, SendGrid is configured correctly!</p>
                <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
                <p style="color: #666; font-size: 12px;">Sent from Tarantuverse Email Service</p>
            </div>
            """
        )
        logger.info(f"✅ Test email sent successfully to {test_email}")
        return {"message": f"Test email sent to {test_email}. Check your inbox and Render logs."}
    except Exception as e:
        logger.error(f"❌ Failed to send test email: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send test email: {str(e)}"
        )
