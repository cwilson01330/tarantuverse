from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.user import User
from app.models.species import Species
from app.models.subscription import UserSubscription
from app.models.content_report import ContentReport
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

    # Total species
    total_species = db.query(func.count(Species.id)).scalar() or 0

    # Premium users (users with active subscriptions)
    premium_users = db.query(func.count(UserSubscription.id)).filter(
        UserSubscription.status == 'active'
    ).scalar() or 0

    # Pending reports (not resolved)
    pending_reports = db.query(func.count(ContentReport.id)).filter(
        ContentReport.status == 'pending'
    ).scalar() or 0

    return {
        "total_users": total_users,
        "total_species": total_species,
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
