"""
Molt log routes
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/molts")
async def get_molt_logs(tarantula_id: str):
    """Get all molt logs for a tarantula"""
    return {"message": f"List molts for {tarantula_id} - TODO"}


@router.post("/tarantulas/{tarantula_id}/molts")
async def create_molt_log(tarantula_id: str):
    """Create a new molt log"""
    return {"message": f"Create molt log for {tarantula_id} - TODO"}


@router.put("/{molt_id}")
async def update_molt_log(molt_id: str):
    """Update a molt log"""
    return {"message": f"Update molt {molt_id} - TODO"}


@router.delete("/{molt_id}")
async def delete_molt_log(molt_id: str):
    """Delete a molt log"""
    return {"message": f"Delete molt {molt_id} - TODO"}
