"""
Community/Keeper routes - Public profiles and discovery
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.user import User
from app.utils.test_accounts import real_user_clause
from app.models.invert import Invert
from app.models.tarantula import Sex
from app.schemas.user import PublicKeeperResponse
from app.schemas.invert import InvertResponse
from app.utils.dependencies import get_current_user_optional
from app.utils.limits import active_inverts_query

router = APIRouter()

# Owner-only fields blanked when someone else views a public collection.
PRIVATE_ANIMAL_FIELDS_CLEARED = {
    "price_paid": None, "source": None, "notes": None, "enclosure_notes": None,
    "death_notes": None, "location": None, "enclosure_id": None,
    "source_transfer_id": None,
}


def profile_animals_query(db: Session, user: User, is_own_profile: bool):
    """The animals a keeper profile lists and counts, every taxon.

    Reads the unified `inverts` table (the legacy `tarantulas` table only ever
    held tarantulas, so every scorpion, mantis, isopod... was invisible here).
    Always the ACTIVE collection: an animal that died or was transferred out is
    not part of anyone's collection any more (ADR-015, BRIEF §4b). Visitors
    additionally see only animals the keeper made public; the caller has
    already refused a visitor when the collection itself is private.
    """
    query = active_inverts_query(db, user.id)
    if not is_own_profile:
        query = query.filter(Invert.visibility == "public")
    return query


@router.get("/", response_model=List[PublicKeeperResponse])
async def list_public_keepers(
    experience_level: Optional[str] = Query(None, description="Filter by experience level"),
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    search: Optional[str] = Query(None, description="Search by username, display name, or location"),
    limit: int = Query(50, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, le=10000, description="Number of results to skip"),
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
    query = db.query(User).filter(User.collection_visibility == 'public', real_user_clause())
    
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
    
    return [PublicKeeperResponse.model_validate(keeper) for keeper in keepers]


@router.get("/{username}/", response_model=PublicKeeperResponse)
async def get_keeper_profile(
    username: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get a keeper's public profile

    - **username**: The keeper's username

    Returns 404 if user doesn't exist or collection is private (unless viewing own profile)
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )

    # Allow access if user is viewing their own profile OR collection is public
    is_own_profile = current_user and current_user.id == user.id
    if not is_own_profile and user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's profile is private"
        )

    return PublicKeeperResponse.model_validate(user)


@router.get("/{username}/collection/", response_model=List[InvertResponse])
async def get_keeper_collection(
    username: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get a keeper's collection — every taxon, active animals only.

    - **username**: The keeper's username

    If viewing own profile: every living, untransferred animal (public and private)
    If viewing other's profile: only animals set public, and only if collection_visibility = 'public'
    Returns 404 if user doesn't exist or collection is private (unless viewing own profile)

    Each row is the invert shape, a superset of the old tarantula response,
    plus `taxon`, so clients that read tarantula fields keep working.
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )

    # Check if user is viewing their own profile
    is_own_profile = current_user and current_user.id == user.id

    # If not own profile, check if collection is public
    if not is_own_profile and user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's collection is private"
        )

    animals = (
        profile_animals_query(db, user, bool(is_own_profile))
        .order_by(Invert.created_at.desc())
        .all()
    )

    rows = []
    for animal in animals:
        try:
            rows.append(InvertResponse.model_validate(animal))
        except Exception:  # noqa: BLE001 — one bad row must not blank a profile
            continue
    if is_own_profile:
        return rows
    # Visitors see the animal, not the keeper's private records: what it cost,
    # where it came from, notes, where it lives, and death notes stay owner-only
    # (as on /t, which shows source and notes to the owner alone).
    return [r.model_copy(update=PRIVATE_ANIMAL_FIELDS_CLEARED) for r in rows]


@router.get("/{username}/stats/")
async def get_keeper_stats(
    username: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Get statistics about a keeper's collection

    - **username**: The keeper's username

    If viewing own profile: stats for every active animal, every taxon
    If viewing other's profile: stats for public active animals only (if collection is public)
    Returns 404 if user doesn't exist or collection is private (unless viewing own profile)
    """
    # Find user by username
    user = db.query(User).filter(User.username == username).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Keeper not found"
        )

    # Check if user is viewing their own profile
    is_own_profile = current_user and current_user.id == user.id

    # If not own profile, check if collection is public
    if not is_own_profile and user.collection_visibility != 'public':
        raise HTTPException(
            status_code=404,
            detail="This keeper's collection is private"
        )

    # Same animals the collection endpoint lists (every taxon, active only,
    # public-only for visitors), so the counts and the grid always agree.
    rows = (
        profile_animals_query(db, user, bool(is_own_profile))
        .with_entities(Invert.taxon, Invert.sex, Invert.species_id, Invert.scientific_name)
        .all()
    )
    return summarize_profile_animals(username, rows)


def _sex_value(sex) -> str:
    value = getattr(sex, "value", sex)
    return (value or "").lower()


def summarize_profile_animals(username: str, rows) -> dict:
    """Counts for a profile from (taxon, sex, species_id, scientific_name) rows.

    Unique species counts a linked species once, and an unlinked animal by its
    scientific name, so a keeper who never linked a care sheet still gets a
    sensible number.
    """
    total = len(rows)
    males = sum(1 for r in rows if _sex_value(r[1]) == Sex.MALE.value)
    females = sum(1 for r in rows if _sex_value(r[1]) == Sex.FEMALE.value)
    species_keys = set()
    by_taxon: dict = {}
    for taxon, _sex, species_id, scientific_name in rows:
        by_taxon[taxon] = by_taxon.get(taxon, 0) + 1
        if species_id is not None:
            species_keys.add(("id", str(species_id)))
        elif scientific_name and scientific_name.strip():
            species_keys.add(("name", " ".join(scientific_name.lower().split())))
    unknown = total - males - females
    return {
        "username": username,
        "total_public": total,  # Note: this is "total" when viewing own profile
        "unique_species": len(species_keys),
        "sex_distribution": {
            "male": males,
            "female": females,
            "unknown": unknown,
        },
        # Flat copies — the web keeper page has always read these names.
        "males": males,
        "females": females,
        "unsexed": unknown,
        "by_taxon": by_taxon,
    }
