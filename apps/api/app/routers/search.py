"""
Global search router - search across tarantulas, species, keepers, and forums
"""
from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.species import Species
from app.models.forum import ForumThread
from app.schemas.search import SearchResult, SearchResponse
from app.utils.auth import decode_access_token

router = APIRouter()

security = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Get current user from token, returns None if not authenticated"""
    if not credentials:
        return None

    payload = decode_access_token(credentials.credentials)
    if payload and payload.get("sub"):
        user = db.query(User).filter(User.id == payload["sub"]).first()
        return user

    return None


@router.get("/search", response_model=SearchResponse)
async def global_search(
    q: str = Query(..., min_length=2, description="Search query"),
    type: Optional[str] = Query(None, description="Filter by type: tarantulas, species, keepers, or forums"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> SearchResponse:
    """
    Global search across tarantulas, species, keepers, and forum threads.

    - **q**: Search query (minimum 2 characters)
    - **type**: Optional filter - tarantulas, species, keepers, or forums
    - Returns up to 5 results per type (20 total max)
    - Unauthenticated users see only public data
    - Authenticated users see their own tarantulas plus public data
    """
    search_term = f"%{q}%"
    results = SearchResponse(query=q, total_results=0)

    # Search tarantulas (only user's own if authenticated)
    if not type or type == "tarantulas":
        if current_user:
            tarantulas = db.query(Tarantula).filter(
                Tarantula.user_id == current_user.id,
                or_(
                    Tarantula.name.ilike(search_term),
                    Tarantula.common_name.ilike(search_term),
                    Tarantula.scientific_name.ilike(search_term),
                )
            ).limit(5).all()

            for tarantula in tarantulas:
                results.tarantulas.append(
                    SearchResult(
                        id=str(tarantula.id),
                        type="tarantula",
                        title=tarantula.name or tarantula.scientific_name or "Unnamed",
                        subtitle=tarantula.common_name or tarantula.scientific_name,
                        image_url=tarantula.photo_url,
                        url=f"/dashboard/tarantulas/{tarantula.id}"
                    )
                )

    # Search species (public, always visible)
    if not type or type == "species":
        species_results = db.query(Species).filter(
            or_(
                Species.scientific_name_lower.ilike(search_term),
                Species.common_names.any(search_term),  # Search in ARRAY
            )
        ).limit(5).all()

        for species in species_results:
            common = ", ".join(species.common_names) if species.common_names else "No common names"
            results.species.append(
                SearchResult(
                    id=str(species.id),
                    type="species",
                    title=species.scientific_name,
                    subtitle=common,
                    image_url=species.image_url,
                    url=f"/species/{species.id}"
                )
            )

    # Search keepers (public keepers only, is_active = True)
    if not type or type == "keepers":
        keepers = db.query(User).filter(
            User.is_active == True,
            or_(
                User.username.ilike(search_term),
                User.display_name.ilike(search_term),
            )
        ).limit(5).all()

        for keeper in keepers:
            results.keepers.append(
                SearchResult(
                    id=str(keeper.id),
                    type="keeper",
                    title=keeper.display_name or keeper.username,
                    subtitle=f"@{keeper.username}",
                    image_url=keeper.avatar_url,
                    url=f"/keeper/{keeper.username}"
                )
            )

    # Search forum threads (public, always visible)
    if not type or type == "forums":
        threads = db.query(ForumThread).filter(
            ForumThread.title.ilike(search_term)
        ).limit(5).all()

        for thread in threads:
            results.forums.append(
                SearchResult(
                    id=str(thread.id),
                    type="forum",
                    title=thread.title,
                    subtitle=f"in {thread.category.name}" if thread.category else "Forum",
                    image_url=None,
                    url=f"/community/forums/thread/{thread.id}"
                )
            )

    # Calculate total results
    results.total_results = (
        len(results.tarantulas) +
        len(results.species) +
        len(results.keepers) +
        len(results.forums)
    )

    return results
