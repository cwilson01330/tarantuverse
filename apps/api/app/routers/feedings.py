"""
Feeding log routes
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/tarantulas/{tarantula_id}/feedings")
async def get_feeding_logs(tarantula_id: str):
    """Get all feeding logs for a tarantula"""
    return {"message": f"List feedings for {tarantula_id} - TODO"}


@router.post("/tarantulas/{tarantula_id}/feedings")
async def create_feeding_log(tarantula_id: str):
    """Create a new feeding log"""
    return {"message": f"Create feeding log for {tarantula_id} - TODO"}


@router.put("/{feeding_id}")
async def update_feeding_log(feeding_id: str):
    """Update a feeding log"""
    return {"message": f"Update feeding {feeding_id} - TODO"}


@router.delete("/{feeding_id}")
async def delete_feeding_log(feeding_id: str):
    """Delete a feeding log"""
    return {"message": f"Delete feeding {feeding_id} - TODO"}
