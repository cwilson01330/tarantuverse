"""
Import and export routes for user data portability.

Export endpoints are available to ALL users (free + premium) for GDPR
compliance.  Import is also available to all users (subject to the
per-tier tarantula limit enforced by the tarantulas router).
"""
from fastapi import APIRouter, Depends, Request, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime
import io
import json
import re
import httpx

from app.database import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.utils.rate_limit import limiter
from app.services import import_service
from app.services.export_service import ExportService
from app.services.activity_service import create_activity
from app.routers.inverts import create_invert_row
from app.schemas.invert import InvertCreate
from app.models.animal import Animal
from app.models.tarantula import Sex, Source
from app.schemas.animal import AnimalCreate
from app.utils.limits import active_inverts_query, enforce_animal_limit

router = APIRouter(
    tags=["import-export"]
)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

_SHEET_ID_RE = re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]+)")
_SHEET_GID_RE = re.compile(r"[#&?]gid=([0-9]+)")


async def _read_source(
    file: Optional[UploadFile], sheet_url: Optional[str]
) -> tuple[bytes, str]:
    """Return (content, filename) from an uploaded file or a Google Sheet link.

    For Sheets we convert the link to its CSV export URL and fetch it
    server-side. The sheet must be link-shared ('Anyone with the link') or
    Published to web, or Google returns an HTML sign-in page (handled below).
    OAuth account-connect is a planned fast-follow.
    """
    if file is not None:
        return await file.read(), (file.filename or "upload.csv")
    if sheet_url and sheet_url.strip():
        url = sheet_url.strip()
        if "format=csv" in url or "output=csv" in url:
            csv_url = url
        else:
            m = _SHEET_ID_RE.search(url)
            if not m:
                raise HTTPException(status_code=400, detail="That doesn't look like a Google Sheets link.")
            gid_m = _SHEET_GID_RE.search(url)
            gid = gid_m.group(1) if gid_m else "0"
            csv_url = f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv&gid={gid}"
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                resp = await client.get(csv_url)
        except Exception:
            raise HTTPException(status_code=400, detail="Couldn't reach that Google Sheet — check the link and try again.")
        if resp.status_code != 200 or "text/html" in resp.headers.get("content-type", ""):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Couldn't read that sheet. In Google Sheets, share it as "
                    "'Anyone with the link → Viewer' (or File → Share → Publish to web), "
                    "then paste the link again."
                ),
            )
        return resp.content, "sheet.csv"
    raise HTTPException(status_code=400, detail="Provide a file or a Google Sheet link.")


@router.post("/import/analyze", status_code=status.HTTP_200_OK)
async def import_analyze(
    file: UploadFile = File(None),
    sheet_url: str = Form(None),
    default_taxon: str = Form("tarantula"),
    target: str = Form("invert"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse a file or Google Sheet, auto-map columns (header + value inference),
    match species against the catalog, and return a preview for the confirm
    screen. No writes.

    `target` picks the destination surface: "invert" (Tarantuverse `inverts`,
    default) or "animal" (Herpetoverse `animals`). Each has its own field set,
    header synonyms, taxa, and species catalog."""
    content, filename = await _read_source(file, sheet_url)
    try:
        if target == "animal":
            return import_service.analyze_animals(
                db, current_user, content, filename, default_taxon or "snake"
            )
        return import_service.analyze(db, current_user, content, filename, default_taxon or "tarantula")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Couldn't read that file: {e}")


async def _import_commit_animals(
    db: Session,
    current_user: User,
    content: bytes,
    filename: str,
    col_map: Dict[str, Optional[str]],
    default_taxon: str,
    duplicate_mode: str,
    unmapped_to_notes: bool,
) -> Dict[str, Any]:
    """Create (or update) Herpetoverse animals from the confirmed mapping.

    Mirrors the invert commit path but writes to the `animals` table and matches
    against `herp_species`. Cap-aware: stops at the HV free-tier animal limit and
    reports it (premium keepers are uncapped)."""
    _headers, rows = import_service.parse_bytes(content, filename)

    existing_by_key: Dict[tuple, Any] = {}
    for a in db.query(Animal).filter(Animal.user_id == current_user.id).all():
        key = ((a.name or "").strip().lower(), (a.scientific_name or "").strip().lower())
        existing_by_key.setdefault(key, a)

    imported = updated = skipped = error_rows = 0
    errors: List[str] = []
    cap_reached = False

    for i, raw in enumerate(rows):
        norm = import_service.normalize_animal_row(
            db, raw, col_map, default_taxon, unmapped_to_notes
        )
        if norm["errors"]:
            error_rows += 1
            errors.append(f"Row {i + 1} ({norm['display_name']}): {', '.join(norm['errors'])}")
            continue

        payload = norm["payload"]
        key = (
            (payload.get("name") or "").strip().lower(),
            (payload.get("scientific_name") or "").strip().lower(),
        )
        existing = existing_by_key.get(key) if key != ("", "") else None

        if existing is not None:
            if duplicate_mode == "update":
                for fld, val in payload.items():
                    if fld == "taxon":  # taxon is immutable
                        continue
                    if fld == "sex" and val:
                        try:
                            val = Sex(val)
                        except ValueError:
                            continue
                    if fld == "source" and val:
                        try:
                            val = Source(val)
                        except ValueError:
                            continue
                    if hasattr(existing, fld):
                        setattr(existing, fld, val)
                db.commit()
                updated += 1
            else:
                skipped += 1
            continue

        try:
            create = AnimalCreate(**payload)
        except Exception as e:
            error_rows += 1
            errors.append(f"Row {i + 1} ({norm['display_name']}): {e}")
            continue

        # Free-tier cap: stop importing NEW animals once the keeper is at the
        # limit (updates to existing animals above are always allowed).
        try:
            enforce_animal_limit(db, current_user)
        except HTTPException as he:
            if he.status_code == status.HTTP_402_PAYMENT_REQUIRED:
                cap_reached = True
                break
            raise

        data = create.model_dump()
        if data.get("sex"):
            try:
                data["sex"] = Sex(data["sex"])
            except ValueError:
                data["sex"] = None
        if data.get("source"):
            try:
                data["source"] = Source(data["source"])
            except ValueError:
                data["source"] = None

        animal = Animal(user_id=current_user.id, **data)
        db.add(animal)
        db.commit()
        db.refresh(animal)
        imported += 1
        existing_by_key[key] = animal

    if imported or updated:
        await create_activity(
            db=db,
            user_id=current_user.id,
            action_type="import_collection",
            target_type="collection",
            target_id=current_user.id,
            metadata={"imported": imported, "updated": updated},
        )

    return {
        "imported": imported,
        "updated": updated,
        "skipped_duplicates": skipped,
        "error_rows": error_rows,
        "errors": errors[:50],
        "cap_reached": cap_reached,
    }


@router.post("/import/commit", status_code=status.HTTP_200_OK)
async def import_commit(
    file: UploadFile = File(None),
    sheet_url: str = Form(None),
    mapping: str = Form(...),
    default_taxon: str = Form("tarantula"),
    duplicate_mode: str = Form("skip"),
    unmapped_to_notes: bool = Form(True),
    target: str = Form("invert"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create (or update) inverts from the confirmed column mapping. Cap-aware:
    stops at the free-tier limit and reports it. Duplicates (same name +
    scientific name) are skipped or updated per `duplicate_mode`.

    `target="animal"` routes to the Herpetoverse `animals` table instead."""
    content, filename = await _read_source(file, sheet_url)
    try:
        col_map: Dict[str, Optional[str]] = json.loads(mapping)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid column mapping.")

    if target == "animal":
        return await _import_commit_animals(
            db, current_user, content, filename, col_map,
            default_taxon or "snake", duplicate_mode, unmapped_to_notes,
        )

    _headers, rows = import_service.parse_bytes(content, filename)

    existing_by_key: Dict[tuple, Any] = {}
    for inv in active_inverts_query(db, current_user.id).all():
        key = ((inv.name or "").strip().lower(), (inv.scientific_name or "").strip().lower())
        existing_by_key.setdefault(key, inv)

    imported = updated = skipped = error_rows = 0
    errors: List[str] = []
    cap_reached = False

    for i, raw in enumerate(rows):
        norm = import_service.normalize_row(
            db, raw, col_map, default_taxon or "tarantula", unmapped_to_notes
        )
        if norm["errors"]:
            error_rows += 1
            errors.append(f"Row {i + 1} ({norm['display_name']}): {', '.join(norm['errors'])}")
            continue

        payload = norm["payload"]
        key = (
            (payload.get("name") or "").strip().lower(),
            (payload.get("scientific_name") or "").strip().lower(),
        )
        existing = existing_by_key.get(key) if key != ("", "") else None

        if existing is not None:
            if duplicate_mode == "update":
                for fld, val in payload.items():
                    if fld == "taxon":  # taxon is immutable
                        continue
                    if hasattr(existing, fld):
                        setattr(existing, fld, val)
                db.commit()
                updated += 1
            else:
                skipped += 1
            continue

        try:
            create = InvertCreate(**payload)
        except Exception as e:
            error_rows += 1
            errors.append(f"Row {i + 1} ({norm['display_name']}): {e}")
            continue

        try:
            inv = create_invert_row(db, current_user, create, enforce_limit=True)
        except HTTPException as he:
            if he.status_code == status.HTTP_402_PAYMENT_REQUIRED:
                cap_reached = True
                break
            raise
        imported += 1
        existing_by_key[key] = inv  # dedupe later rows within the same file

    if imported or updated:
        await create_activity(
            db=db,
            user_id=current_user.id,
            action_type="import_collection",
            target_type="collection",
            target_id=current_user.id,
            metadata={"imported": imported, "updated": updated},
        )

    return {
        "imported": imported,
        "updated": updated,
        "skipped_duplicates": skipped,
        "error_rows": error_rows,
        "errors": errors[:50],
        "cap_reached": cap_reached,
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

    # Herpetoverse reptile/amphibian counts — so an HV keeper's preview
    # isn't all zeros (the export itself already includes this data).
    from app.models.animal import Animal
    from app.models.shed_log import ShedLog
    from app.models.weight_log import WeightLog
    from app.models.reptile_pairing import ReptilePairing
    from app.models.clutch import Clutch
    from app.models.reptile_offspring import ReptileOffspring

    animals = db.query(Animal).filter(Animal.user_id == current_user.id).all()
    a_ids = [a.id for a in animals]
    animal_feeding_count = db.query(FeedingLog).filter(FeedingLog.animal_id.in_(a_ids)).count() if a_ids else 0
    shed_count = db.query(ShedLog).filter(ShedLog.animal_id.in_(a_ids)).count() if a_ids else 0
    weight_count = db.query(WeightLog).filter(WeightLog.animal_id.in_(a_ids)).count() if a_ids else 0
    animal_photo_count = db.query(Photo).filter(Photo.animal_id.in_(a_ids)).count() if a_ids else 0
    reptile_pairing_count = db.query(ReptilePairing).filter(ReptilePairing.user_id == current_user.id).count()
    clutch_count = db.query(Clutch).filter(Clutch.user_id == current_user.id).count()
    reptile_offspring_count = db.query(ReptileOffspring).filter(ReptileOffspring.user_id == current_user.id).count()

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
            "animals": len(animals),
            "animal_feeding_logs": animal_feeding_count,
            "shed_logs": shed_count,
            "weight_logs": weight_count,
            "animal_photos": animal_photo_count,
            "reptile_pairings": reptile_pairing_count,
            "clutches": clutch_count,
            "reptile_offspring": reptile_offspring_count,
        },
        "formats_available": ["json", "csv", "full"],
    }
