"""
Authentication routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, UserProfileUpdate, UserVisibilityUpdate
from app.utils.auth import get_password_hash, verify_password, create_access_token
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
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
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=get_password_hash(user_data.password),
        display_name=user_data.display_name or user_data.username,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create access token
    access_token = create_access_token(data={"sub": str(new_user.id)})

    return Token(
        access_token=access_token,
        user=UserResponse.from_orm(new_user)
    )


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
