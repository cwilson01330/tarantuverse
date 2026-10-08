"""
Global search router - search across the keeper's animals (every taxon and
colonies), species (both catalogs), keepers, and forums.

`app=herpetoverse` searches the keeper's own Herpetoverse animals instead of
their Tarantuverse inverts/colonies (results under the `animals` key, with HV
web URLs). Animals are only ever the CURRENT USER's own rows — never another
keeper's, and nothing at all when signed out.
"""
from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.utils.test_accounts import real_user_clause
from app.models.invert import Invert
from app.models.colony import Colony
from app.models.animal import Animal
from app.models.invert_species import InvertSpecies
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
    app: Optional[str] = Query(
        None,
        pattern="^(tarantuverse|herpetoverse)$",
        description="Which app's collection to search; herpetoverse = the keeper's own HV animals",
    ),
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

    # Search the keeper's own animals — every taxon, plus colonies. (Until
    # 2026-10-06 this read only the legacy `tarantulas` table, so a mantis,
    # scorpion or isopod could never be found.) Results stay under the
    # `tarantulas` key so existing clients keep working; the URL routes each
    # one to the right detail screen.
    if app == "herpetoverse":
        if (not type or type == "animals") and current_user:
            # Own animals only (user_id), never co-kept or other keepers'
            # rows. Transferred-out animals belong to the buyer now; died
            # ones stay findable but sort last, as on TV.
            animals = db.query(Animal).filter(
                Animal.user_id == current_user.id,
                Animal.transferred_out_at.is_(None),
                or_(
                    Animal.name.ilike(search_term),
                    Animal.common_name.ilike(search_term),
                    Animal.scientific_name.ilike(search_term),
                )
            ).order_by(Animal.died_at.isnot(None), Animal.name).limit(5).all()

            for animal in animals:
                results.animals.append(
                    SearchResult(
                        id=str(animal.id),
                        type=animal.taxon,
                        title=animal.name or animal.common_name or animal.scientific_name or "Unnamed",
                        subtitle=animal.scientific_name or animal.common_name,
                        image_url=animal.photo_url,
                        url=f"/app/reptiles/{animal.id}",
                    )
                )
    elif not type or type in ("tarantulas", "animals"):
        if current_user:
            inverts = db.query(Invert).filter(
                Invert.user_id == current_user.id,
                Invert.transferred_out_at.is_(None),
                or_(
                    Invert.name.ilike(search_term),
                    Invert.common_name.ilike(search_term),
                    Invert.scientific_name.ilike(search_term),
                )
            ).order_by(Invert.died_at.isnot(None), Invert.name).limit(5).all()

            for animal in inverts:
                # Tarantulas keep their own web detail page (dual-written ids).
                path = "tarantulas" if animal.taxon == "tarantula" else "inverts"
                results.tarantulas.append(
                    SearchResult(
                        id=str(animal.id),
                        type=animal.taxon,
                        title=animal.name or animal.scientific_name or animal.common_name or "Unnamed",
                        subtitle=animal.common_name or animal.scientific_name,
                        image_url=animal.photo_url,
                        url=f"/dashboard/{path}/{animal.id}",
                    )
                )

            room = 5 - len(results.tarantulas)
            if room > 0:
                colonies = db.query(Colony).filter(
                    Colony.user_id == current_user.id,
                    Colony.transferred_out_at.is_(None),
                    Colony.name.ilike(search_term),
                ).limit(room).all()
                for colony in colonies:
                    results.tarantulas.append(
                        SearchResult(
                            id=str(colony.id),
                            type="colony",
                            title=colony.name or "Colony",
                            subtitle="Colony",
                            image_url=colony.photo_url,
                            url=f"/dashboard/colonies/{colony.id}",
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

        # Every other taxon lives in the unified catalog. Tarantula rows there
        # mirror the legacy table above, so they're skipped to avoid duplicates.
        room = 5 - len(results.species)
        if room > 0:
            invert_species = db.query(InvertSpecies).filter(
                InvertSpecies.taxon != "tarantula",
                or_(
                    InvertSpecies.scientific_name_lower.ilike(search_term),
                    func.array_to_string(InvertSpecies.common_names, " ").ilike(search_term),
                )
            ).order_by(InvertSpecies.scientific_name).limit(room).all()
            for sp in invert_species:
                results.species.append(
                    SearchResult(
                        id=str(sp.id),
                        type="species",
                        title=sp.scientific_name,
                        subtitle=", ".join(sp.common_names) if sp.common_names else None,
                        image_url=sp.image_url,
                        url=f"/species/inverts/{sp.id}",
                    )
                )

    # Search keepers (public keepers only, is_active = True)
    if not type or type == "keepers":
        keepers = db.query(User).filter(
            User.is_active == True,
            real_user_clause(),
            or_(
                User.username.ilike(search_term),
                User.display_name.ilike(search_term),
            )
        ).limit(5).all()

        for keeper in keepers:
            # Use /community/{username} because it's the canonical keeper
            # profile route on BOTH web and mobile. Web has /keeper/<u>
            # as a legacy alias too, but mobile only has /community/<u>,
            # so returning /keeper/ here 404s every keeper tap in mobile
            # search (same class of bug as the follow-target fix).
            results.keepers.append(
                SearchResult(
                    id=str(keeper.id),
                    type="keeper",
                    title=keeper.display_name or keeper.username,
                    subtitle=f"@{keeper.username}",
                    image_url=keeper.avatar_url,
                    url=f"/community/{keeper.username}"
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
        len(results.animals) +
        len(results.tarantulas) +
        len(results.species) +
        len(results.keepers) +
        len(results.forums)
    )

    return results
