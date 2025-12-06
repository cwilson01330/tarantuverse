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
    Trigger a password reset email for a specific user
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
