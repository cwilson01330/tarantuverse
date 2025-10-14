"""
FastAPI dependencies for authentication and authorization
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.database import get_db
from app.models.user import User
from app.utils.auth import decode_access_token

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get the current authenticated user from JWT token

    Usage in routes:
        current_user: User = Depends(get_current_user)
    """
    token = credentials.credentials

    # Decode token
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user ID from token
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current active user (additional check for is_active)
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get the current authenticated user from JWT token, or None if not authenticated
    
    Usage in routes:
        current_user: Optional[User] = Depends(get_current_user_optional)
    """
    if credentials is None:
        return None
    
    token = credentials.credentials
    
    # Decode token
    payload = decode_access_token(token)
    if payload is None:
        return None
    
    # Get user ID from token
    user_id: str = payload.get("sub")
    if user_id is None:
        return None
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return None
    
    if not user.is_active:
        return None
    
    return user


def require_premium(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> User:
    """
    Require user to have an active premium subscription or be a verified contributor
    
    Usage in routes:
        current_user: User = Depends(require_premium)
    """
    from app.models.subscription import UserSubscription, SubscriptionStatus
    
    # Check if user has active subscription
    subscription = db.query(UserSubscription).filter(
        and_(
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == SubscriptionStatus.ACTIVE
        )
    ).first()
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required"
        )
    
    # Check if plan allows premium features
    plan = subscription.plan
    
    # Allow if plan allows editing species OR user is verified contributor
    if plan.can_edit_species or plan.name == "verified":
        return current_user
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Premium subscription required to access this feature"
    )


def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Require user to be an admin
    
    Usage in routes:
        current_user: User = Depends(get_current_admin)
    """
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
