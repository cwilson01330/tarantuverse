"""
Species routes
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_species():
    """Search and filter species"""
    return {"message": "List/search species - TODO"}


@router.get("/{species_id}")
async def get_species_detail(species_id: str):
    """Get a single species with care guide"""
    return {"message": f"Get species {species_id} - TODO"}


@router.post("/")
async def create_species():
    """Create a new species (admin only)"""
    return {"message": "Create species - TODO"}
