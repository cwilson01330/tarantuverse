"""Reptile offspring — individual hatchling records under a clutch.

Two access patterns mirror the clutch surface:
  • List under a clutch: GET /clutches/{id}/offspring
  • Direct read/update/delete: GET/PUT/DELETE /reptile-offspring/{id}

If the keeper has registered the hatchling as a live animal record
(`animal_id` set — the hold-back link), that record's own genotype
rows are the source of truth. Otherwise `recorded_genotype` JSONB
holds whatever was observed at hatch — useful for sale paperwork even
if the hatchling moves on before getting a full record.

Holding a hatchling back (setting `animal_id`) copies its
`recorded_genotype` onto the animal's own genotype rows, so the genes
noted at hatch aren't orphaned behind the now-disabled offspring editor.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal import Animal
from app.models.animal_genotype import AnimalGenotype
from app.models.clutch import Clutch
from app.models.gene import Gene
from app.models.reptile_offspring import (
    ReptileOffspring,
    ReptileOffspringStatus,
)
from app.models.user import User
from app.schemas.reptile_breeding import (
    ReptileOffspringCreate,
    ReptileOffspringResponse,
    ReptileOffspringUpdate,
)
from app.utils.dependencies import get_current_user
from app.utils.limits import enforce_hv_premium
from app.utils.access import policy
from app.routers.animals import closed_reason

router = APIRouter()


def _own_clutch_or_404(
    clutch_id: UUID, user_id: UUID, db: Session
) -> Clutch:
    c = (
        db.query(Clutch)
        .filter(Clutch.id == clutch_id, Clutch.user_id == user_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Clutch not found")
    return c


def _own_offspring_or_404(
    offspring_id: UUID, user_id: UUID, db: Session
) -> ReptileOffspring:
    o = (
        db.query(ReptileOffspring)
        .filter(
            ReptileOffspring.id == offspring_id,
            ReptileOffspring.user_id == user_id,
        )
        .first()
    )
    if not o:
        raise HTTPException(status_code=404, detail="Offspring not found")
    return o


def _resolve_link(
    payload, user_id: UUID, db: Session
) -> Optional[Animal]:
    """If the payload sets a hold-back link (animal_id), validate the
    keeper owns that animal and return it. ADR-003 collapsed
    snake_id/lizard_id into a single animal_id."""
    if getattr(payload, "animal_id", None):
        a = db.query(Animal).filter(
            Animal.id == payload.animal_id,
            Animal.user_id == user_id,
        ).first()
        if not a:
            raise HTTPException(
                status_code=404,
                detail="Linked animal not found in your collection.",
            )
        return a
    return None


def _animal_zygosity(gene_type: Optional[str], zygosity: str) -> Optional[str]:
    """Offspring JSONB vocabulary (copies: wild=0, het=1, hom=2) →
    animal_genotypes vocabulary (het / visual / super). Same mapping as the
    morph calculator's countToState: one copy of a recessive is a het, of
    anything else it shows; two copies of a co/incomplete dominant is the
    super, of a recessive or dominant the visual. `wild` records no gene."""
    z = (zygosity or "").strip().lower()
    t = (gene_type or "").strip().lower()
    if z == "het":
        return "het" if t == "recessive" else "visual"
    if z == "hom":
        return "super" if t in ("codominant", "incomplete_dominant") else "visual"
    return None


def _copy_recorded_genotype(
    db: Session, animal: Animal, entries
) -> int:
    """Seed a held-back animal's genotype from the offspring's
    `recorded_genotype`. Returns the number of rows written.

    Only runs when the animal has no genotype rows yet: once the live record
    has genes of its own they are authoritative, and re-linking must never
    duplicate or overwrite them. Gene names are matched case-insensitively
    against the catalog for the animal's species; a name with no catalog
    match is skipped rather than guessed (the keeper's free text stays on
    the offspring record either way).

    Skipped silently (0) when the animal died or was transferred: that
    record is history and its genotype routes answer 409
    (routers/animals.py::refuse_if_closed). The link itself still saves.
    """
    if closed_reason(animal) is not None:
        return 0
    entries = [
        e.model_dump() if hasattr(e, "model_dump") else e
        for e in (entries or [])
    ]
    wanted = {}
    for e in entries:
        if not isinstance(e, dict):
            continue
        key = (e.get("gene_key") or "").strip().lower()
        if key and key not in wanted:
            wanted[key] = e.get("zygosity")
    if not wanted:
        return 0

    already = (
        db.query(AnimalGenotype)
        .filter(AnimalGenotype.animal_id == animal.id)
        .count()
    )
    if already:
        return 0

    species = (getattr(animal, "scientific_name", None) or "").strip().lower()
    candidates = (
        db.query(Gene)
        .filter(func.lower(Gene.common_name).in_(list(wanted)))
        .all()
    )
    by_name: dict = {}
    for g in candidates:
        if species and (g.species_scientific_name or "").strip().lower() != species:
            continue
        by_name.setdefault((g.common_name or "").strip().lower(), []).append(g)

    written = 0
    for key, zygosity in wanted.items():
        matches = by_name.get(key) or []
        # Without a species, a name shared by two catalogs is ambiguous.
        if len(matches) != 1:
            continue
        gene = matches[0]
        z = _animal_zygosity(gene.gene_type, zygosity)
        if not z:
            continue
        db.add(AnimalGenotype(animal_id=animal.id, gene_id=gene.id, zygosity=z))
        written += 1
    return written


# ─── Routes — clutch-scoped list + create ──────────────────────────────


@router.get(
    "/clutches/{clutch_id}/offspring",
    response_model=List[ReptileOffspringResponse],
)
@policy("owner_only")
async def list_offspring_for_clutch(
    clutch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _own_clutch_or_404(clutch_id, current_user.id, db)
    items = (
        db.query(ReptileOffspring)
        .filter(ReptileOffspring.clutch_id == clutch_id)
        .order_by(ReptileOffspring.created_at.asc())
        .all()
    )
    return items


@router.post(
    "/reptile-offspring",
    response_model=ReptileOffspringResponse,
    status_code=status.HTTP_201_CREATED,
)
@policy("owner_only")
async def create_offspring(
    payload: ReptileOffspringCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_hv_premium(current_user, feature="Breeding tracking")
    _own_clutch_or_404(payload.clutch_id, current_user.id, db)
    linked = _resolve_link(payload, current_user.id, db)

    data = payload.model_dump()
    # Serialize GenotypeEntry list to plain dicts for JSONB storage.
    if data.get("recorded_genotype"):
        data["recorded_genotype"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.recorded_genotype or []
        ]
    if "status" in data:
        data["status"] = ReptileOffspringStatus(data["status"])

    offspring = ReptileOffspring(
        user_id=current_user.id,
        **data,
    )
    db.add(offspring)
    if linked is not None:
        _copy_recorded_genotype(db, linked, data.get("recorded_genotype"))
    db.commit()
    db.refresh(offspring)
    return offspring


# ─── Routes — direct CRUD ──────────────────────────────────────────────


@router.get(
    "/reptile-offspring/{offspring_id}",
    response_model=ReptileOffspringResponse,
)
@policy("owner_only")
async def get_offspring(
    offspring_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _own_offspring_or_404(offspring_id, current_user.id, db)


@router.put(
    "/reptile-offspring/{offspring_id}",
    response_model=ReptileOffspringResponse,
)
@policy("owner_only")
async def update_offspring(
    offspring_id: UUID,
    payload: ReptileOffspringUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = _own_offspring_or_404(offspring_id, current_user.id, db)
    linked = _resolve_link(payload, current_user.id, db)

    update = payload.model_dump(exclude_unset=True)
    if "recorded_genotype" in update and update["recorded_genotype"] is not None:
        update["recorded_genotype"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.recorded_genotype or []
        ]
    if "status" in update and update["status"] is not None:
        update["status"] = ReptileOffspringStatus(update["status"])

    # Hold-back: a NEW link carries the hatch genotype onto the live record.
    # Re-sending the same link (any later edit) never re-copies.
    newly_linked = linked is not None and str(linked.id) != str(o.animal_id or "")

    for k, v in update.items():
        setattr(o, k, v)
    if newly_linked:
        _copy_recorded_genotype(db, linked, o.recorded_genotype)
    db.commit()
    db.refresh(o)
    return o


@router.delete(
    "/reptile-offspring/{offspring_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@policy("owner_only")
async def delete_offspring(
    offspring_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    o = _own_offspring_or_404(offspring_id, current_user.id, db)
    db.delete(o)
    db.commit()
