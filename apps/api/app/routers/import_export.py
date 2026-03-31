from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.utils.dependencies import get_current_user
from app.services.import_service import ImportService
from app.services.activity_service import create_activity

router = APIRouter(
    prefix="/import",
    tags=["import"]
)

@router.post("/collection", status_code=status.HTTP_200_OK)
async def import_collection(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import tarantula collection from CSV, JSON, or Excel file.
    """
    valid_tarantulas, errors = await ImportService.process_file(file)
    
    imported_count = 0
    
    for tarantula_data in valid_tarantulas:
        new_tarantula = Tarantula(
            user_id=current_user.id,
            **tarantula_data.model_dump()
        )
        db.add(new_tarantula)
        imported_count += 1
    
    if imported_count > 0:
        db.commit()
        
        # Log activity for the first imported tarantula (or a summary)
        await create_activity(
            db=db,
            user_id=current_user.id,
            action_type="import_collection",
            target_type="collection",
            target_id=current_user.id, # Using user ID as target for collection import
            metadata={
                "count": imported_count,
                "filename": file.filename
            }
        )
    
    return {
        "message": f"Processed {len(valid_tarantulas) + len(errors)} rows.",
        "imported_count": imported_count,
        "errors": errors
    }
