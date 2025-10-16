"""
Community/Keeper routes - Public profiles and discovery
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.schemas.user import UserResponse
from app.schemas.tarantula import TarantulaResponse

router = APIRouter()


@router.get("/", response_model=List[UserResponse])
async def list_public_keepers(
    experience_level: Optional[str] = Query(None, description="Filter by experience level"),
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    search: Optional[str] = Query(None, description="Search by username, display name, or location"),
    limit: int = Query(50, le=100, description="Number of results to return"),
    offset: int = Query(0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of public keepers (users with collection_visibility = 'public')
    
    - **experience_level**: Filter by beginner, intermediate, advanced, expert
    - **specialty**: Filter by specialty (e.g., 'arboreal', 'breeding')
    - **search**: Search username, display name, or location
    - **limit**: Max 100 results
    - **offset**: For pagination
    """
    # Base query - only public keepers
    query = db.query(User).filter(User.collection_visibility == 'public')
    
    # Apply filters
    if experience_level:
        query = query.filter(User.profile_experience_level == experience_level)
    
    if specialty:
        # Check if specialty is in the array
        query = query.filter(User.profile_specialties.contains([specialty]))
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                User.username.ilike(search_term),
                User.display_name.ilike(search_term),
                User.profile_location.ilike(search_term)
            )
        )
    
    # Order by most recently created/updated profiles first
    query = query.order_by(User.created_at.desc())
    
    # Apply pagination
    keepers = query.offset(offset).limit(limit).all()
    
    return [UserResponse.from_orm(keeper) for keeper in keepers]


@router.get("/{username}", response_model=UserResponse)
async def get_keeper_profile(
    username: str,
    db: Session = Depends(get_db)
):
    """
    Get a keeper's public profile
    
    - **username**: The keeper's username
    
    Returns 404 if user doesn't exist or collection is private
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()
    
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )
    
    # Check if collection is public
    if user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's profile is private"
        )
    
    return UserResponse.from_orm(user)


@router.get("/{username}/collection", response_model=List[TarantulaResponse])
async def get_keeper_collection(
    username: str,
    db: Session = Depends(get_db)
):
    """
    Get a keeper's public tarantula collection
    
    - **username**: The keeper's username
    
    Returns only tarantulas where visibility = 'public' AND user's collection_visibility = 'public'
    Returns 404 if user doesn't exist or collection is private
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()
    
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )
    
    # Check if collection is public
    if user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's collection is private"
        )
    
    # Get public tarantulas for this user
    tarantulas = db.query(Tarantula).filter(
        and_(
            Tarantula.user_id == user.id,
            Tarantula.visibility == 'public'
        )
    ).order_by(Tarantula.created_at.desc()).all()
    
    return [TarantulaResponse.from_orm(t) for t in tarantulas]


@router.get("/{username}/stats")
async def get_keeper_stats(
    username: str,
    db: Session = Depends(get_db)
):
    """
    Get statistics about a keeper's collection
    
    - **username**: The keeper's username
    
    Returns collection stats (total count, public count, species diversity)
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()
    
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )
    
    # Check if collection is public
    if user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's collection is private"
        )
    
    # Count public tarantulas
    public_count = db.query(Tarantula).filter(
        and_(
            Tarantula.user_id == user.id,
            Tarantula.visibility == 'public'
        )
    ).count()
    
    # Get unique species count
    unique_species = db.query(Tarantula.species_id).filter(
        and_(
            Tarantula.user_id == user.id,
            Tarantula.visibility == 'public',
            Tarantula.species_id.isnot(None)
        )
    ).distinct().count()
    
    # Count by sex
    males = db.query(Tarantula).filter(
        and_(
            Tarantula.user_id == user.id,
            Tarantula.visibility == 'public',
            Tarantula.sex == 'male'
        )
    ).count()
    
    females = db.query(Tarantula).filter(
        and_(
            Tarantula.user_id == user.id,
            Tarantula.visibility == 'public',
            Tarantula.sex == 'female'
        )
    ).count()
    
    return {
        "username": username,
        "total_public": public_count,
        "unique_species": unique_species,
        "males": males,
        "females": females,
        "unsexed": public_count - males - females
    }
