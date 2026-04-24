"""
Authentication routes
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta, timezone
import uuid
import secrets

from app.database import get_db
from app.models.user import User
from app.models.user_oauth_account import UserOAuthAccount
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, UserProfileUpdate, UserVisibilityUpdate, ResetPasswordRequest, ForgotPasswordRequest, UsernameChangeRequest, UsernameAvailabilityResponse
from app.schemas.oauth import GoogleOAuthCallback, AppleOAuthCallback, OAuthLoginResponse, LinkedAccountResponse, LinkAccountRequest
from app.utils.auth import get_password_hash, verify_password, create_access_token, revoke_token, decode_access_token
from app.utils.dependencies import get_current_user
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.oauth import (
    exchange_google_code_for_token,
    exchange_apple_code_for_token,
    verify_apple_id_token,
    generate_username_from_email,
)
from app.services.email import EmailService
from app.services.storage import storage_service
from app.config import settings
from app.utils.username_validation import validate_username
from app.utils.rate_limit import limiter
from app.utils.file_validation import validate_image_bytes

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user

    - **email**: Valid email address
    - **username**: Unique username (3-50 characters)
    - **password**: Password (min 8 characters)
    - **display_name**: Optional display name
    - **referral_code**: Optional referral code from a premium subscriber
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

    # Validate username for offensive content
    is_valid, error_message = validate_username(user_data.username)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        )

    # Validate referral code if provided
    referrer = None
    if user_data.referral_code:
        referrer = db.query(User).filter(
            User.referral_code == user_data.referral_code.upper()
        ).first()

        if not referrer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid referral code"
            )

        # Check if referrer is a premium subscriber
        if not referrer.is_premium:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This referral code is no longer valid"
            )

    # Create new user
    verification_required = settings.EMAIL_VERIFICATION_REQUIRED
    verification_token = None
    verification_token_expires_at = None
    if verification_required:
        verification_token = secrets.token_urlsafe(32)
        verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        display_name=user_data.display_name or user_data.username,
        is_verified=not verification_required,
        verification_token=verification_token,
        verification_token_expires_at=verification_token_expires_at,
        # Set referral info if referral code was provided
        referred_by_user_id=referrer.id if referrer else None,
        referred_at=datetime.now(timezone.utc) if referrer else None
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if verification_required:
        verify_link = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
        await EmailService.send_verification_email(new_user.email, verify_link)
        response_message = "Registration successful. Please check your email to verify your account."
        if referrer:
            response_message = (
                f"Registration successful! You were referred by {referrer.username}. "
                "Please check your email to verify your account."
            )
    else:
        response_message = "Registration successful. Your account is active and ready to log in."
        if referrer:
            response_message = (
                f"Registration successful! You were referred by {referrer.username}. "
                "Your account is active and ready to log in."
            )

    return {
        "message": response_message,
        "requires_email_verification": verification_required,
    }


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
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
    if settings.EMAIL_VERIFICATION_REQUIRED and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your inbox."
        )
    if not settings.EMAIL_VERIFICATION_REQUIRED and not user.is_verified:
        user.is_verified = True
        user.verification_token = None
        user.verification_token_expires_at = None
        db.commit()
        db.refresh(user)

    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})

    return Token(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )


@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revoke the current access token so it cannot be reused even if not yet expired.
    Clients should also discard the token locally.
    """
    from datetime import datetime, timezone, timedelta
    from app.config import settings as app_settings

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti:
            # expires_at is needed so we can clean up the blocklist later
            expires_at = (
                datetime.fromtimestamp(exp, tz=timezone.utc)
                if exp
                else datetime.now(timezone.utc) + timedelta(minutes=app_settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            )
            revoke_token(jti, str(current_user.id), expires_at, db)

    return {"message": "Logged out successfully"}


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

    # Detect a private→public flip so we can cascade to tarantulas below.
    previous_visibility = current_user.collection_visibility
    flipping_to_public = (
        'collection_visibility' in update_data
        and update_data['collection_visibility'] == 'public'
        and previous_visibility != 'public'
    )

    # Update user fields
    for field, value in update_data.items():
        setattr(current_user, field, value)

    # Cascade: when a keeper goes public, flip all their currently-
    # private tarantulas to public so their profile isn't empty. This
    # matches the "public by default" expectation when the profile
    # itself is public. Keepers can still hide individual tarantulas
    # afterwards via the edit form (per-tarantula visibility toggle).
    # Going public→private does NOT cascade — we preserve individual
    # hides so they survive a future re-opening.
    if flipping_to_public:
        from app.models.tarantula import Tarantula
        db.query(Tarantula).filter(
            Tarantula.user_id == current_user.id,
            Tarantula.visibility == 'private',
        ).update({Tarantula.visibility: 'public'}, synchronize_session=False)

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

    When flipping private→public, any tarantulas currently marked
    private are cascaded to public so the keeper's profile isn't
    empty for visitors. Individual tarantulas can still be hidden
    afterwards via the edit form. Flipping public→private does not
    cascade — per-tarantula hide choices are preserved.
    """
    previous_visibility = current_user.collection_visibility
    new_visibility = visibility_data.collection_visibility
    flipping_to_public = (
        new_visibility == 'public' and previous_visibility != 'public'
    )

    current_user.collection_visibility = new_visibility

    if flipping_to_public:
        from app.models.tarantula import Tarantula
        db.query(Tarantula).filter(
            Tarantula.user_id == current_user.id,
            Tarantula.visibility == 'private',
        ).update({Tarantula.visibility: 'public'}, synchronize_session=False)

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
    # Read file data
    try:
        file_data = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}"
        )

    # Validate by magic bytes (not Content-Type header, which is spoofable)
    try:
        detected_mime = validate_image_bytes(file_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if len(file_data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 10MB limit"
        )

    # Upload avatar (use verified MIME, not client-supplied Content-Type)
    try:
        avatar_url = await storage_service.upload_avatar(
            file_data,
            file.filename or "avatar.jpg",
            detected_mime,
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
# Username Change
# ============================================================================

USERNAME_CHANGE_COOLDOWN_DAYS = 30


@router.get("/me/username/check", response_model=UsernameAvailabilityResponse)
async def check_username_availability(
    username: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Check if a username is available and whether the current user is allowed to change.

    Returns:
    - **available**: whether the username is free
    - **days_until_allowed**: how many days remain in the cooldown (null = can change now)
    - **next_change_date**: earliest datetime the user can next change their username
    """
    # Validate format
    is_valid, error_message = validate_username(username)
    if not is_valid:
        return UsernameAvailabilityResponse(
            available=False,
            message=error_message,
        )

    # Check if it's the same as the current username
    if username.lower() == current_user.username.lower():
        return UsernameAvailabilityResponse(
            available=False,
            message="That's already your username.",
        )

    # Check uniqueness
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return UsernameAvailabilityResponse(
            available=False,
            message="Username is already taken.",
        )

    # Check cooldown
    now = datetime.now(timezone.utc)
    if current_user.last_username_change:
        elapsed = now - current_user.last_username_change
        cooldown = timedelta(days=USERNAME_CHANGE_COOLDOWN_DAYS)
        if elapsed < cooldown:
            remaining = cooldown - elapsed
            days_remaining = remaining.days + 1  # ceil to next full day
            next_date = current_user.last_username_change + cooldown
            return UsernameAvailabilityResponse(
                available=True,  # username is free, but change is blocked
                message=f"Username is available, but you must wait {days_remaining} more day(s) before changing.",
                days_until_allowed=days_remaining,
                next_change_date=next_date,
                last_username_change=current_user.last_username_change,
            )

    return UsernameAvailabilityResponse(
        available=True,
        message="Username is available.",
        last_username_change=current_user.last_username_change,
    )


@router.put("/me/username", response_model=UserResponse)
@limiter.limit("5/hour")
async def change_username(
    request: Request,
    data: UsernameChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change the current user's username.

    - **new_username**: The desired new username (3–50 chars, alphanumeric + underscores)
    - Enforces a 30-day cooldown between changes
    - Validates format and uniqueness (case-insensitive)
    - Since all content references users by UUID, historical content automatically
      reflects the new username — no cascade updates required
    """
    new_username = data.new_username.strip()

    # 1. Format validation (reuses registration validator)
    is_valid, error_message = validate_username(new_username)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_message,
        )

    # 2. Same-as-current check
    if new_username.lower() == current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New username must be different from your current username.",
        )

    # 3. Uniqueness check (case-insensitive)
    existing = db.query(User).filter(
        User.username.ilike(new_username)
    ).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken.",
        )

    # 4. Cooldown check
    now = datetime.now(timezone.utc)
    if current_user.last_username_change:
        elapsed = now - current_user.last_username_change
        cooldown = timedelta(days=USERNAME_CHANGE_COOLDOWN_DAYS)
        if elapsed < cooldown:
            remaining = cooldown - elapsed
            days_remaining = remaining.days + 1
            next_date = current_user.last_username_change + cooldown
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You can only change your username once every {USERNAME_CHANGE_COOLDOWN_DAYS} days. "
                    f"Next change allowed in {days_remaining} day(s) "
                    f"({next_date.strftime('%B %d, %Y')})."
                ),
            )

    # 5. Apply change
    current_user.username = new_username
    current_user.last_username_change = now
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
    Accepts user info from Google/Apple after NextAuth exchanges tokens.

    Features:
    - Auto-links OAuth account if email matches existing user
    - Supports multiple OAuth providers per user account
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

        is_new_user = False
        user = None

        # First, check if this OAuth account is already linked
        oauth_account = db.query(UserOAuthAccount).filter(
            UserOAuthAccount.provider == provider,
            UserOAuthAccount.provider_account_id == provider_id
        ).first()

        if oauth_account:
            # OAuth account found - get the linked user
            user = db.query(User).filter(User.id == oauth_account.user_id).first()
        else:
            # OAuth account not found - check if email matches a verified existing user
            # SECURITY: Only auto-link if the existing account's email is verified.
            # Linking to an unverified account could let an attacker pre-register an email
            # and then hijack a legitimate user's OAuth sign-in.
            existing_user = db.query(User).filter(User.email == email).first()

            if existing_user and existing_user.is_verified:
                # Verified email match — safe to auto-link
                user = existing_user
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider=provider,
                    provider_account_id=provider_id,
                    provider_email=email,
                    provider_name=name,
                    provider_avatar=picture,
                )
                db.add(oauth_account)
            elif existing_user and not existing_user.is_verified:
                # Unverified account exists — refuse to link (account takeover vector)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists but is not verified. "
                           "Please verify that account first, or log in with your password.",
                )
            else:
                # No existing user - create new user and link OAuth account
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
                    oauth_provider=provider,  # Keep for backwards compatibility
                    oauth_id=provider_id,
                    hashed_password=None,
                    is_verified=True,
                )
                db.add(user)
                db.flush()  # Get user.id for the OAuth account

                # Create OAuth account link
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider=provider,
                    provider_account_id=provider_id,
                    provider_email=email,
                    provider_name=name,
                    provider_avatar=picture,
                )
                db.add(oauth_account)

        # Update avatar if not set
        if user and not user.avatar_url and picture:
            user.avatar_url = picture

        db.commit()
        if user:
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
                "is_admin": user.is_admin,
            },
            is_new_user=is_new_user,
        )

    except HTTPException:
        raise
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

    Features:
    - Auto-links Google account if email matches existing user
    - Supports multiple OAuth providers per user account
    """
    try:
        # Exchange code for Google user info
        # Pass redirect_uri if provided (for mobile apps)
        google_user = await exchange_google_code_for_token(
            callback_data.code,
            callback_data.redirect_uri
        )

        provider_id = google_user["provider_id"]
        email = google_user["email"]
        name = google_user.get("name")
        picture = google_user.get("picture")
        access_token_from_google = google_user.get("access_token")
        refresh_token_from_google = google_user.get("refresh_token")

        is_new_user = False
        user = None

        # First, check if this Google account is already linked
        oauth_account = db.query(UserOAuthAccount).filter(
            UserOAuthAccount.provider == "google",
            UserOAuthAccount.provider_account_id == provider_id
        ).first()

        if oauth_account:
            # OAuth account found - get the linked user
            user = db.query(User).filter(User.id == oauth_account.user_id).first()
            # Update tokens
            oauth_account.access_token = access_token_from_google
            oauth_account.refresh_token = refresh_token_from_google
        else:
            # OAuth account not found - check if email matches a verified existing user
            existing_user = db.query(User).filter(User.email == email).first()

            if existing_user and existing_user.is_verified:
                # Verified email match — safe to auto-link
                user = existing_user
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider="google",
                    provider_account_id=provider_id,
                    access_token=access_token_from_google,
                    refresh_token=refresh_token_from_google,
                    provider_email=email,
                    provider_name=name,
                    provider_avatar=picture,
                )
                db.add(oauth_account)
            elif existing_user and not existing_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists but is not verified. "
                           "Please verify that account first, or log in with your password.",
                )
            else:
                # No existing user - create new user and link OAuth account
                is_new_user = True

                # Generate username from email (ensure uniqueness)
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
                    oauth_provider="google",  # Keep for backwards compatibility
                    oauth_id=provider_id,
                    oauth_access_token=access_token_from_google,
                    oauth_refresh_token=refresh_token_from_google,
                    hashed_password=None,  # OAuth users don't have passwords
                    is_verified=True,
                )
                db.add(user)
                db.flush()  # Get user.id for the OAuth account

                # Create OAuth account link
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider="google",
                    provider_account_id=provider_id,
                    access_token=access_token_from_google,
                    refresh_token=refresh_token_from_google,
                    provider_email=email,
                    provider_name=name,
                    provider_avatar=picture,
                )
                db.add(oauth_account)

        # Update avatar if not set
        if user and not user.avatar_url and picture:
            user.avatar_url = picture

        db.commit()
        if user:
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
                "is_admin": user.is_admin,
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

    Features:
    - Auto-links Apple account if email matches existing user
    - Supports multiple OAuth providers per user account
    """
    try:
        # Verify Apple ID token
        apple_user = await verify_apple_id_token(callback_data.id_token)

        provider_id = apple_user["provider_id"]
        email = apple_user["email"]

        # Apple sends user info only on first login
        name = None
        if callback_data.user:
            first_name = callback_data.user.get("name", {}).get("firstName", "")
            last_name = callback_data.user.get("name", {}).get("lastName", "")
            name = f"{first_name} {last_name}".strip()

        is_new_user = False
        user = None

        # First, check if this Apple account is already linked
        oauth_account = db.query(UserOAuthAccount).filter(
            UserOAuthAccount.provider == "apple",
            UserOAuthAccount.provider_account_id == provider_id
        ).first()

        if oauth_account:
            # OAuth account found - get the linked user
            user = db.query(User).filter(User.id == oauth_account.user_id).first()
        else:
            # OAuth account not found - check if email matches a verified existing user
            existing_user = db.query(User).filter(User.email == email).first()

            if existing_user and existing_user.is_verified:
                # Verified email match — safe to auto-link
                user = existing_user
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider="apple",
                    provider_account_id=provider_id,
                    provider_email=email,
                    provider_name=name,
                )
                db.add(oauth_account)
            elif existing_user and not existing_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email already exists but is not verified. "
                           "Please verify that account first, or log in with your password.",
                )
            else:
                # No existing user - create new user and link OAuth account
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
                    oauth_provider="apple",  # Keep for backwards compatibility
                    oauth_id=provider_id,
                    hashed_password=None,  # OAuth users don't have passwords
                    is_verified=True,
                )
                db.add(user)
                db.flush()  # Get user.id for the OAuth account

                # Create OAuth account link
                oauth_account = UserOAuthAccount(
                    user_id=user.id,
                    provider="apple",
                    provider_account_id=provider_id,
                    provider_email=email,
                    provider_name=name,
                )
                db.add(oauth_account)

        db.commit()
        if user:
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
                "is_admin": user.is_admin,
            },
            is_new_user=is_new_user,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Apple OAuth failed: {str(e)}"
        )


# ============================================================================
# Linked Accounts Management Endpoints
# ============================================================================

@router.get("/linked-accounts", response_model=List[LinkedAccountResponse])
async def get_linked_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all OAuth accounts linked to the current user.

    Returns a list of linked accounts with provider info.
    """
    oauth_accounts = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == current_user.id
    ).all()

    return [
        LinkedAccountResponse(
            id=str(acc.id),
            provider=acc.provider,
            provider_email=acc.provider_email,
            provider_name=acc.provider_name,
            provider_avatar=acc.provider_avatar,
            created_at=acc.created_at.isoformat() if acc.created_at else None,
        )
        for acc in oauth_accounts
    ]


@router.post("/link-account", response_model=LinkedAccountResponse)
async def link_account(
    link_data: LinkAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually link an OAuth account to the current user.

    - **provider**: 'google' or 'apple'
    - **code**: OAuth authorization code from the provider
    - **id_token**: Required for Apple OAuth
    - **redirect_uri**: Required for mobile apps

    This allows users to add additional sign-in methods to their account.
    """
    provider = link_data.provider.lower()

    # Check if user already has this provider linked
    existing = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == current_user.id,
        UserOAuthAccount.provider == provider
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {provider} account is already linked to your account"
        )

    # Exchange the OAuth code for user info
    if provider == "google":
        try:
            google_user = await exchange_google_code_for_token(
                link_data.code,
                link_data.redirect_uri
            )
            provider_id = google_user["provider_id"]
            email = google_user["email"]
            name = google_user.get("name")
            picture = google_user.get("picture")
            access_token = google_user.get("access_token")
            refresh_token = google_user.get("refresh_token")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to verify Google account: {str(e)}"
            )
    elif provider == "apple":
        if not link_data.id_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="id_token is required for Apple OAuth"
            )
        try:
            apple_user = await verify_apple_id_token(link_data.id_token)
            provider_id = apple_user["provider_id"]
            email = apple_user["email"]
            name = None
            picture = None
            access_token = None
            refresh_token = None
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to verify Apple account: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}. Use 'google' or 'apple'"
        )

    # Check if this OAuth account is already linked to another user
    existing_link = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.provider == provider,
        UserOAuthAccount.provider_account_id == provider_id
    ).first()

    if existing_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This {provider} account is already linked to another user"
        )

    # Create the link
    oauth_account = UserOAuthAccount(
        user_id=current_user.id,
        provider=provider,
        provider_account_id=provider_id,
        access_token=access_token,
        refresh_token=refresh_token,
        provider_email=email,
        provider_name=name,
        provider_avatar=picture,
    )
    db.add(oauth_account)
    db.commit()
    db.refresh(oauth_account)

    return LinkedAccountResponse(
        id=str(oauth_account.id),
        provider=oauth_account.provider,
        provider_email=oauth_account.provider_email,
        provider_name=oauth_account.provider_name,
        provider_avatar=oauth_account.provider_avatar,
        created_at=oauth_account.created_at.isoformat() if oauth_account.created_at else None,
    )


@router.delete("/unlink-account/{provider}")
async def unlink_account(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Unlink an OAuth account from the current user.

    - **provider**: The OAuth provider to unlink ('google' or 'apple')

    Note: Users must have either a password or at least one linked OAuth account
    to maintain access to their account.
    """
    # Find the linked account
    oauth_account = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == current_user.id,
        UserOAuthAccount.provider == provider
    ).first()

    if not oauth_account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {provider} account linked"
        )

    # Check if user has a password or other linked accounts
    other_accounts = db.query(UserOAuthAccount).filter(
        UserOAuthAccount.user_id == current_user.id,
        UserOAuthAccount.provider != provider
    ).count()

    has_password = current_user.hashed_password is not None

    if not has_password and other_accounts == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot unlink the only authentication method. Set a password first or link another account."
        )

    # Delete the linked account
    db.delete(oauth_account)

    # Also clear the legacy oauth fields if this was the primary provider
    if current_user.oauth_provider == provider:
        current_user.oauth_provider = None
        current_user.oauth_id = None
        current_user.oauth_access_token = None
        current_user.oauth_refresh_token = None

    db.commit()

    return {"message": f"{provider.capitalize()} account unlinked successfully"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    forgot_data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Send a password reset email if the account exists and supports password login.
    Always returns a success message to avoid user enumeration.
    """
    user = db.query(User).filter(User.email == forgot_data.email).first()

    if user and user.hashed_password:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=24)

        user.reset_token = token
        user.reset_token_expires_at = expires
        db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await EmailService.send_password_reset_email(user.email, reset_link)

    return {"message": "If an account exists for that email, a password reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
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
    if not settings.EMAIL_VERIFICATION_REQUIRED:
        return {"message": "Email verification is currently disabled. Accounts are activated automatically."}

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

    # Check if this user was referred - grant rewards to referrer
    if user.referred_by_user_id:
        from app.routers.referrals import check_and_grant_rewards
        check_and_grant_rewards(user.referred_by_user_id, db)

    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    email: str,
    db: Session = Depends(get_db)
):
    """
    Resend verification email
    """
    if not settings.EMAIL_VERIFICATION_REQUIRED:
        return {"message": "Email verification is currently disabled. Accounts are activated automatically."}

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


@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete the current user's account and all associated data.

    This action is irreversible. All user data including:
    - Tarantulas and their photos
    - Feeding, molt, and substrate change logs
    - Breeding records (pairings, egg sacs, offspring)
    - Forum posts and messages
    - Direct messages
    - Follows and followers
    - Notification preferences

    will be permanently deleted.
    """
    try:
        # Delete the user - CASCADE will handle related data
        db.delete(current_user)
        db.commit()

        return {"message": "Account deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete account: {str(e)}"
        )
