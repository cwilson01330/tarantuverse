"""
Import and export routes for user data portability.

Export endpoints are available to ALL users (free + premium) for GDPR
compliance.  Import is also available to all users (subject to the
per-tier tarantula limit enforced by the tarantulas router).
"""
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime
import io

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.utils.dependencies import get_current_user
from app.utils.rate_limit import limiter
from app.services.import_service import ImportService
from app.services.export_service import ExportService
from app.services.activity_service import create_activity

router = APIRouter(
    tags=["import-export"]
)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@router.post("/import/collection", status_code=status.HTTP_200_OK)
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

        await create_activity(
            db=db,
            user_id=current_user.id,
            action_type="import_collection",
            target_type="collection",
            target_id=current_user.id,
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


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/export/json")
@limiter.limit("10/hour")
async def export_json(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export all user data as a single JSON file.

    Returns a structured JSON document containing profile info, tarantulas,
    all log types, photos metadata, enclosures, and breeding records.
    Available to all users (free and premium).
    """
    data = ExportService.export_json(db, current_user)
    filename = f"tarantuverse_{current_user.username}_{datetime.utcnow().strftime('%Y-%m-%d')}.json"

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/csv")
@limiter.limit("10/hour")
async def export_csv(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export all user data as a ZIP file containing one CSV per data type.

    Each CSV can be opened in Excel or Google Sheets. Includes a README.
    Available to all users (free and premium).
    """
    data = ExportService.export_csv_zip(db, current_user)
    filename = f"tarantuverse_{current_user.username}_{datetime.utcnow().strftime('%Y-%m-%d')}_csv.zip"

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/full")
@limiter.limit("3/hour")
async def export_full(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Export a complete backup including data organized by tarantula plus
    downloaded photo files bundled into a ZIP archive.

    This may take longer for large collections with many photos.
    Available to all users (free and premium).
    """
    data = await ExportService.export_full_zip(db, current_user)
    filename = f"tarantuverse_{current_user.username}_{datetime.utcnow().strftime('%Y-%m-%d')}_full.zip"

    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/preview")
async def export_preview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Preview what will be included in an export without downloading.

    Returns counts of each data type so users can see the scope of
    their export before requesting it.
    """
    tarantulas = db.query(Tarantula).filter(Tarantula.user_id == current_user.id).all()
    t_ids = [t.id for t in tarantulas]

    from app.models.feeding_log import FeedingLog
    from app.models.molt_log import MoltLog
    from app.models.substrate_change import SubstrateChange
    from app.models.photo import Photo
    from app.models.enclosure import Enclosure
    from app.models.pairing import Pairing
    from app.models.egg_sac import EggSac
    from app.models.offspring import Offspring

    feeding_count = db.query(FeedingLog).filter(FeedingLog.tarantula_id.in_(t_ids)).count() if t_ids else 0
    molt_count = db.query(MoltLog).filter(MoltLog.tarantula_id.in_(t_ids)).count() if t_ids else 0
    substrate_count = db.query(SubstrateChange).filter(SubstrateChange.tarantula_id.in_(t_ids)).count() if t_ids else 0
    photo_count = db.query(Photo).filter(Photo.tarantula_id.in_(t_ids)).count() if t_ids else 0
    enclosure_count = db.query(Enclosure).filter(Enclosure.user_id == current_user.id).count()
    pairing_count = db.query(Pairing).filter(Pairing.user_id == current_user.id).count()
    egg_sac_count = db.query(EggSac).filter(EggSac.user_id == current_user.id).count()
    offspring_count = db.query(Offspring).filter(Offspring.user_id == current_user.id).count()

    return {
        "username": current_user.username,
        "counts": {
            "tarantulas": len(tarantulas),
            "feeding_logs": feeding_count,
            "molt_logs": molt_count,
            "substrate_changes": substrate_count,
            "photos": photo_count,
            "enclosures": enclosure_count,
            "pairings": pairing_count,
            "egg_sacs": egg_sac_count,
            "offspring": offspring_count,
        },
        "formats_available": ["json", "csv", "full"],
    }
