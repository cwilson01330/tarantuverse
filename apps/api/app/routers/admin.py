from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_superuser
from app.services.email import EmailService
from app.config import settings
import secrets
from datetime import datetime, timedelta, timezone

router = APIRouter(
    dependencies=[Depends(get_current_superuser)]
)

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 1000,
    search: str = None,
    db: Session = Depends(get_db)
):
    """
    List users (Superuser only)
    """
    query = db.query(User)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_filter)) | 
            (User.username.ilike(search_filter)) |
            (User.display_name.ilike(search_filter))
        )
        
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return [UserResponse.from_orm(user) for user in users]

@router.post("/users/{user_id}/reset-password")
async def trigger_password_reset(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Trigger a password reset email for a specific user (Superuser only)
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
    Resend verification email for a specific user (Superuser only)
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
    Manually verify a user (bypass email verification) - Superuser only
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
    Verify ALL unverified users (useful for development/testing) - Superuser only
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


@router.post("/test-email")
async def test_email_sending(
    test_email: str,
):
    """
    Send a test email to verify SendGrid configuration (Superuser only)
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
