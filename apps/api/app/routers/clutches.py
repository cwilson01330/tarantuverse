"""Clutches — eggs laid from a reptile pairing.

Two access patterns:
  • List under a pairing: GET /reptile-pairings/{id}/clutches
  • Direct read/update/delete: GET/PUT/DELETE /clutches/{id}

The /clutches/{id}/parent-genotypes endpoint packages each parent's
recorded zygosities so the front-end morph calculator can run the
prediction with all its citation + welfare context. Backend
intentionally doesn't reimplement combineOffspring — keeping the math
in one place (the calculator UI) avoids drift.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.animal_genotype import AnimalGenotype
from app.models.clutch import Clutch
from app.models.gene import Gene
from app.models.lizard import Lizard
from app.models.reptile_offspring import ReptileOffspring
from app.models.reptile_pairing import ReptilePairing
from app.models.snake import Snake
from app.models.user import User
from app.schemas.reptile_breeding import (
    ClutchCreate,
    ClutchParentGenotypesResponse,
    ClutchResponse,
    ClutchUpdate,
    GenotypeEntry,
    ParentGenotypeBundle,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


# ─── Helpers ───────────────────────────────────────────────────────────


def _enrich(c: Clutch, db: Session) -> ClutchResponse:
    offspring_count = (
        db.query(ReptileOffspring)
        .filter(ReptileOffspring.clutch_id == c.id)
        .count()
    )
    return ClutchResponse(
        id=c.id,
        pairing_id=c.pairing_id,
        user_id=c.user_id,
        laid_date=c.laid_date,
        pulled_date=c.pulled_date,
        expected_hatch_date=c.expected_hatch_date,
        hatch_date=c.hatch_date,
        incubation_temp_min_f=c.incubation_temp_min_f,
        incubation_temp_max_f=c.incubation_temp_max_f,
        incubation_humidity_min_pct=c.incubation_humidity_min_pct,
        incubation_humidity_max_pct=c.incubation_humidity_max_pct,
        expected_count=c.expected_count,
        fertile_count=c.fertile_count,
        slug_count=c.slug_count,
        hatched_count=c.hatched_count,
        viable_count=c.viable_count,
        candle_log=c.candle_log,
        notes=c.notes,
        photo_url=c.photo_url,
        created_at=c.created_at,
        updated_at=c.updated_at,
        offspring_count=offspring_count,
    )


def _own_pairing_or_404(
    pairing_id: UUID, user_id: UUID, db: Session
) -> ReptilePairing:
    pairing = (
        db.query(ReptilePairing)
        .filter(
            ReptilePairing.id == pairing_id,
            ReptilePairing.user_id == user_id,
        )
        .first()
    )
    if not pairing:
        raise HTTPException(status_code=404, detail="Pairing not found")
    return pairing


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


# ─── Routes — pairing-scoped list + create ─────────────────────────────


@router.get(
    "/reptile-pairings/{pairing_id}/clutches",
    response_model=List[ClutchResponse],
)
async def list_clutches_for_pairing(
    pairing_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pairing = _own_pairing_or_404(pairing_id, current_user.id, db)
    clutches = (
        db.query(Clutch)
        .filter(Clutch.pairing_id == pairing.id)
        .order_by(Clutch.laid_date.desc())
        .all()
    )
    return [_enrich(c, db) for c in clutches]


@router.post(
    "/clutches",
    response_model=ClutchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clutch(
    payload: ClutchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pairing = _own_pairing_or_404(payload.pairing_id, current_user.id, db)
    data = payload.model_dump()
    # JSON-serialize candle_log entries — Pydantic gives us model
    # instances, JSONB wants plain dicts.
    if data.get("candle_log"):
        data["candle_log"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.candle_log or []
        ]
    clutch = Clutch(
        user_id=current_user.id,
        **data,
    )
    db.add(clutch)
    db.commit()
    db.refresh(clutch)
    return _enrich(clutch, db)


# ─── Routes — direct clutch CRUD ───────────────────────────────────────


@router.get("/clutches/{clutch_id}", response_model=ClutchResponse)
async def get_clutch(
    clutch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _own_clutch_or_404(clutch_id, current_user.id, db)
    return _enrich(c, db)


@router.put("/clutches/{clutch_id}", response_model=ClutchResponse)
async def update_clutch(
    clutch_id: UUID,
    payload: ClutchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _own_clutch_or_404(clutch_id, current_user.id, db)
    update = payload.model_dump(exclude_unset=True)
    if "candle_log" in update and update["candle_log"] is not None:
        update["candle_log"] = [
            entry.model_dump() if hasattr(entry, "model_dump") else entry
            for entry in payload.candle_log or []
        ]
    for k, v in update.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return _enrich(c, db)


@router.delete(
    "/clutches/{clutch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_clutch(
    clutch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _own_clutch_or_404(clutch_id, current_user.id, db)
    db.delete(c)
    db.commit()


# ─── Routes — parent genotypes for morph prediction ────────────────────


@router.get(
    "/clutches/{clutch_id}/parent-genotypes",
    response_model=ClutchParentGenotypesResponse,
)
async def get_clutch_parent_genotypes(
    clutch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns each parent's recorded zygosity per gene. The front-end
    morph calculator consumes this to run combineOffspring with full
    citation / welfare context (which it already maintains)."""
    c = _own_clutch_or_404(clutch_id, current_user.id, db)
    pairing = _own_pairing_or_404(c.pairing_id, current_user.id, db)

    if pairing.taxon == "snake":
        male = db.query(Snake).filter(Snake.id == pairing.male_snake_id).first()
        female = db.query(Snake).filter(Snake.id == pairing.female_snake_id).first()
        male_genotypes = _genotypes_for_snake(pairing.male_snake_id, db)
        female_genotypes = _genotypes_for_snake(pairing.female_snake_id, db)
        male_name = (
            male.name or male.common_name or male.scientific_name or "Male"
        ) if male else "Male"
        female_name = (
            female.name or female.common_name or female.scientific_name or "Female"
        ) if female else "Female"
    else:
        male = db.query(Lizard).filter(Lizard.id == pairing.male_lizard_id).first()
        female = db.query(Lizard).filter(Lizard.id == pairing.female_lizard_id).first()
        male_genotypes = _genotypes_for_lizard(pairing.male_lizard_id, db)
        female_genotypes = _genotypes_for_lizard(pairing.female_lizard_id, db)
        male_name = (
            male.name or male.common_name or male.scientific_name or "Male"
        ) if male else "Male"
        female_name = (
            female.name or female.common_name or female.scientific_name or "Female"
        ) if female else "Female"

    male_keys = {g.gene_key for g in male_genotypes}
    female_keys = {g.gene_key for g in female_genotypes}
    overlap = sorted(male_keys & female_keys)

    note = None
    if not male_genotypes and not female_genotypes:
        note = (
            "Neither parent has a recorded genotype yet. Add genotypes to "
            "the parents to see predicted offspring outcomes."
        )
    elif not male_genotypes or not female_genotypes:
        missing = "male" if not male_genotypes else "female"
        note = (
            f"The {missing} doesn't have a recorded genotype yet — "
            "predictions will be empty until both parents are genotyped."
        )
    elif not overlap:
        note = (
            "Parents have genotypes recorded but for different genes — "
            "predictions need at least one shared gene."
        )

    return ClutchParentGenotypesResponse(
        pairing_id=pairing.id,
        clutch_id=c.id,
        taxon=pairing.taxon,
        male=ParentGenotypeBundle(
            animal_id=(
                pairing.male_snake_id
                if pairing.taxon == "snake"
                else pairing.male_lizard_id
            ),
            display_name=male_name,
            genotypes=male_genotypes,
        ),
        female=ParentGenotypeBundle(
            animal_id=(
                pairing.female_snake_id
                if pairing.taxon == "snake"
                else pairing.female_lizard_id
            ),
            display_name=female_name,
            genotypes=female_genotypes,
        ),
        overlapping_gene_keys=overlap,
        note=note,
    )


def _genotypes_for_snake(snake_id, db: Session) -> List[GenotypeEntry]:
    if not snake_id:
        return []
    return _genotype_rows_to_entries(
        db.query(AnimalGenotype, Gene)
        .join(Gene, Gene.id == AnimalGenotype.gene_id)
        .filter(AnimalGenotype.snake_id == snake_id)
        .all()
    )


def _genotypes_for_lizard(lizard_id, db: Session) -> List[GenotypeEntry]:
    if not lizard_id:
        return []
    return _genotype_rows_to_entries(
        db.query(AnimalGenotype, Gene)
        .join(Gene, Gene.id == AnimalGenotype.gene_id)
        .filter(AnimalGenotype.lizard_id == lizard_id)
        .all()
    )


def _genotype_rows_to_entries(rows) -> List[GenotypeEntry]:
    """Map (AnimalGenotype, Gene) tuples into the slim schema entries
    the morph calculator expects. Skips any rows whose zygosity is
    outside the canonical wild/het/hom set so a malformed DB row never
    surfaces 422 errors at the response boundary.

    `gene_key` carries the gene's `common_name` — the front-end
    calculator's existing identifier for genes (the genes table has no
    slug column). Using common_name avoids forcing a schema migration
    for a label we already use everywhere else in the breeding UI.
    """
    valid = {"wild", "het", "hom"}
    out: List[GenotypeEntry] = []
    for genotype, gene in rows:
        z = (genotype.zygosity or "").lower().strip()
        if z not in valid:
            continue
        key = getattr(gene, "common_name", None)
        if not key:
            continue
        out.append(GenotypeEntry(gene_key=key, zygosity=z))  # type: ignore[arg-type]
    return out
