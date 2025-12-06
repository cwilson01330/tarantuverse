"""
Authentication routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, UserProfileUpdate, UserVisibilityUpdate, ResetPasswordRequest
from app.schemas.oauth import GoogleOAuthCallback, AppleOAuthCallback, OAuthLoginResponse
from app.utils.auth import get_password_hash, verify_password, create_access_token
from app.utils.dependencies import get_current_user
from app.utils.oauth import (
    exchange_google_code_for_token,
    exchange_apple_code_for_token,
    verify_apple_id_token,
    generate_username_from_email,
)
from app.services.email import EmailService
from app.services.storage import storage_service
from app.config import settings
from typing import Optional
from datetime import datetime, timedelta, timezone
import uuid
import secrets

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user

    - **email**: Valid email address
    - **username**: Unique username (3-50 characters)
    - **password**: Password (min 8 characters)
    - **display_name**: Optional display name
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Check if username already exists
    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Create new user
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        display_name=user_data.display_name or user_data.username,
        is_verified=False,
        verification_token=verification_token,
        verification_token_expires_at=verification_token_expires_at
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send verification email
    verify_link = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    pass # prevent blocking
    
    # We use background task or await
    await EmailService.send_verification_email(new_user.email, verify_link)

    return {"message": "Registration successful. Please check your email to verify your account."}


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Login user

    - **email**: User's email
    - **password**: User's password
    """
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    # Check if email is verified (only for password users, OAuth users are verified by default logic or we trust them)
    # We should ensure oauth users have is_verified=True when created (which I didn't do in register but they don't hit this login endpoint often if using oauth-login?)
    # Wait, oauth-login endpoint handles its own login.
    # This /login endpoint is for email/password.
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your inbox."
        )

    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})

    return Token(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile"""
    return UserResponse.from_orm(current_user)


@router.put("/me/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile
    
    - **display_name**: Display name
    - **avatar_url**: URL to avatar image
    - **profile_bio**: Profile bio/description
    - **profile_location**: Location (city, country)
    - **profile_experience_level**: beginner, intermediate, advanced, expert
    - **profile_years_keeping**: Years of experience keeping tarantulas
    - **profile_specialties**: Array of specialties (e.g., ['arboreal', 'breeding'])
    - **social_links**: Social media links (JSON object)
    - **collection_visibility**: 'private' or 'public'
    """
    # Update only provided fields
    update_data = profile_data.model_dump(exclude_unset=True)
    
    # Validate collection_visibility if provided
    if 'collection_visibility' in update_data:
        if update_data['collection_visibility'] not in ['private', 'public']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="collection_visibility must be 'private' or 'public'"
            )
    
    # Validate experience_level if provided
    valid_experience_levels = ['beginner', 'intermediate', 'advanced', 'expert']
    if 'profile_experience_level' in update_data:
        if update_data['profile_experience_level'] not in valid_experience_levels:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"profile_experience_level must be one of: {', '.join(valid_experience_levels)}"
            )
    
    # Update user fields
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse.from_orm(current_user)


@router.patch("/me/visibility", response_model=UserResponse)
async def update_visibility(
    visibility_data: UserVisibilityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Quick toggle for collection visibility

    - **collection_visibility**: 'private' or 'public'
    """
    current_user.collection_visibility = visibility_data.collection_visibility
    db.commit()
    db.refresh(current_user)

    return UserResponse.from_orm(current_user)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload user avatar image

    - **file**: Image file (JPEG, PNG, GIF, WebP)
    - Automatically crops to square and resizes to 200x200px
    - Uploads to Cloudflare R2 or local storage
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )

    # Read file data
    try:
        file_data = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}"
        )

    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if len(file_data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 10MB limit"
        )

    # Upload avatar
    try:
        avatar_url = await storage_service.upload_avatar(
            file_data,
            file.filename or "avatar.jpg",
            file.content_type
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload avatar: {str(e)}"
        )

    # Update user's avatar_url
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)

    return UserResponse.from_orm(current_user)


# ============================================================================
# OAuth Endpoints
# ============================================================================

@router.post("/oauth-login", response_model=OAuthLoginResponse)
async def oauth_login(
    oauth_data: dict,
    db: Session = Depends(get_db)
):
    """
    Handle OAuth login from NextAuth (after NextAuth has completed OAuth flow)
    Accepts user info from Google/Apple after NextAuth exchanges tokens
    """
    try:
        provider = oauth_data.get("provider")  # 'google' or 'apple'
        email = oauth_data.get("email")
        name = oauth_data.get("name")
        picture = oauth_data.get("picture")
        provider_id = oauth_data.get("id") or oauth_data.get("sub")

        if not email or not provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email and provider are required"
            )

        # Check if user exists with this email or OAuth ID
        user = db.query(User).filter(
            (User.email == email) |
            ((User.oauth_provider == provider) & (User.oauth_id == provider_id))
        ).first()

        is_new_user = False

        if not user:
            # Create new user from OAuth data
            is_new_user = True

            # Generate username from email
            base_username = generate_username_from_email(email)
            username = base_username
            counter = 1
            while db.query(User).filter(User.username == username).first():
                username = f"{base_username}{counter}"
                counter += 1

            user = User(
                id=uuid.uuid4(),
                email=email,
                username=username,
                display_name=name or username,
                avatar_url=picture,
                oauth_provider=provider,
                oauth_id=provider_id,
                hashed_password=None,  # OAuth users don't have passwords
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update existing user's OAuth info if needed
            if not user.oauth_provider:
                user.oauth_provider = provider
                user.oauth_id = provider_id
            if not user.avatar_url and picture:
                user.avatar_url = picture
            db.commit()
            db.refresh(user)

        # Create access token for our app
        access_token = create_access_token(data={"sub": str(user.id)})

        return OAuthLoginResponse(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": str(user.id),
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "is_superuser": user.is_superuser,
            },
            is_new_user=is_new_user,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth login failed: {str(e)}"
        )


@router.post("/oauth/google", response_model=OAuthLoginResponse)
async def google_oauth_callback(
    callback_data: GoogleOAuthCallback,
    db: Session = Depends(get_db)
):
    """
    Handle Google OAuth callback
    Exchange authorization code for user info and create/login user
    """
    try:
        # Exchange code for Google user info
        # Pass redirect_uri if provided (for mobile apps)
        google_user = await exchange_google_code_for_token(
            callback_data.code,
            callback_data.redirect_uri
        )
        
        # Check if user exists with this email or Google OAuth ID
        user = db.query(User).filter(
            (User.email == google_user["email"]) |
            ((User.oauth_provider == "google") & (User.oauth_id == google_user["provider_id"]))
        ).first()
        
        is_new_user = False
        
        if not user:
            # Create new user from Google data
            is_new_user = True
            
            # Generate username from email (ensure uniqueness)
            base_username = generate_username_from_email(google_user["email"])
            username = base_username
            counter = 1
            while db.query(User).filter(User.username == username).first():
                username = f"{base_username}{counter}"
                counter += 1
            
            user = User(
                id=uuid.uuid4(),
                email=google_user["email"],
                username=username,
                display_name=google_user.get("name") or username,
                avatar_url=google_user.get("picture"),
                oauth_provider="google",
                oauth_id=google_user["provider_id"],
                oauth_access_token=google_user.get("access_token"),
                oauth_refresh_token=google_user.get("refresh_token"),
                hashed_password=None,  # OAuth users don't have passwords
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update existing user's OAuth tokens
            user.oauth_access_token = google_user.get("access_token")
            user.oauth_refresh_token = google_user.get("refresh_token")
            if not user.oauth_provider:
                user.oauth_provider = "google"
                user.oauth_id = google_user["provider_id"]
            if not user.avatar_url and google_user.get("picture"):
                user.avatar_url = google_user.get("picture")
            db.commit()
            db.refresh(user)
        
        # Create access token for our app
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return OAuthLoginResponse(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": str(user.id),
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "is_superuser": user.is_superuser,
            },
            is_new_user=is_new_user,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth failed: {str(e)}"
        )


@router.post("/oauth/apple", response_model=OAuthLoginResponse)
async def apple_oauth_callback(
    callback_data: AppleOAuthCallback,
    db: Session = Depends(get_db)
):
    """
    Handle Apple OAuth callback
    Exchange authorization code for user info and create/login user
    """
    try:
        # Verify Apple ID token
        apple_user = await verify_apple_id_token(callback_data.id_token)
        
        # Check if user exists with this email or Apple OAuth ID
        user = db.query(User).filter(
            (User.email == apple_user["email"]) |
            ((User.oauth_provider == "apple") & (User.oauth_id == apple_user["provider_id"]))
        ).first()
        
        is_new_user = False
        
        if not user:
            # Create new user from Apple data
            is_new_user = True
            
            # Apple sends user info only on first login
            name = None
            if callback_data.user:
                first_name = callback_data.user.get("name", {}).get("firstName", "")
                last_name = callback_data.user.get("name", {}).get("lastName", "")
                name = f"{first_name} {last_name}".strip()
            
            # Generate username from email
            base_username = generate_username_from_email(apple_user["email"])
            username = base_username
            counter = 1
            while db.query(User).filter(User.username == username).first():
                username = f"{base_username}{counter}"
                counter += 1
            
            user = User(
                id=uuid.uuid4(),
                email=apple_user["email"],
                username=username,
                display_name=name or username,
                oauth_provider="apple",
                oauth_id=apple_user["provider_id"],
                hashed_password=None,  # OAuth users don't have passwords
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update existing user if needed
            if not user.oauth_provider:
                user.oauth_provider = "apple"
                user.oauth_id = apple_user["provider_id"]
            db.commit()
            db.refresh(user)
        
        # Create access token for our app
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return OAuthLoginResponse(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": str(user.id),
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "is_superuser": user.is_superuser,
            },
            is_new_user=is_new_user,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Apple OAuth failed: {str(e)}"
        )


@router.post("/reset-password")
async def reset_password(
    reset_data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Reset password using a valid token
    """
    # Find user by token
    user = db.query(User).filter(User.reset_token == reset_data.token).first()
    
    if not user or not user.reset_token_expires_at:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
        
    # Check expiry
    # Use UTC for comparison as we set it with timezone.utc
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if user.reset_token_expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
        
    # Update password
    user.hashed_password = get_password_hash(reset_data.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    
    db.commit()
    
    return {"message": "Password has been reset successfully"}


@router.post("/verify-email")
async def verify_email(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Verify email using a valid token
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is required"
        )

    user = db.query(User).filter(User.verification_token == token).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
        
    # Check expiry
    if not user.verification_token_expires_at:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )

    now = datetime.now(timezone.utc)
    if user.verification_token_expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired"
        )
        
    # Verify user
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    
    db.commit()
    
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
    email: str,
    db: Session = Depends(get_db)
):
    """
    Resend verification email
    """
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
         # Return success even if user not found to prevent user enumeration
        return {"message": "If an account exists, a verification email has been sent."}
        
    if user.is_verified:
        return {"message": "Account is already verified"}
        
    # Generate new token
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    user.verification_token = verification_token
    user.verification_token_expires_at = verification_token_expires_at
    db.commit()
    
    # Send email
    verify_link = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    
    await EmailService.send_verification_email(user.email, verify_link)
    
    return {"message": "Verification email sent"}

