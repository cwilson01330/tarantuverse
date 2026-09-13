"""
Move an animal to a different taxon without losing its history.

Keepers pick the wrong taxon at creation — a jumping spider filed as a
tarantula, a vinegaroon filed as "other" — and until this existed the only
remedies were deleting the animal, losing every feeding, molt and photo, or
asking the developer to edit the database by hand. That happened twice before
this was written.

ONE IMPLEMENTATION, TWO CALLERS
-------------------------------
The API endpoint and `retaxon_invert.py` both call `change_invert_taxon`. They
must not grow separate copies: this operation is exactly the shape of the
ADR-005 dual-write divergence bug class, where two implementations of the same
mirror logic drift and one of them starts quietly destroying rows.

THE CASCADE TRAP
----------------
Under dual-write a tarantula or scorpion has BOTH an `inverts` row and a mirror
row in the legacy per-taxon table, and its logs carry BOTH foreign keys.
Measured on the first real case: 17 of 17 feedings had both set.

Every legacy FK is ON DELETE CASCADE, and `mirror_invert_delete_to_legacy`
relies on that — correctly, for a real delete, where you want the logs gone.
For a taxon change you emphatically do not. Dropping the mirror row first takes
every feeding, molt and photo with it, while the animal stays right there
looking fine. That is the failure mode: silent, and invisible until the keeper
scrolls their history.

Hence the fixed order in `change_invert_taxon`:

    1. refuse outright if any child row carries the legacy FK with no invert_id
    2. NULL the legacy FK on every child row
    3. THEN drop the mirror row — now cascading over nothing
    4. THEN change the taxon, fix the species link, and create the new mirror
       row if the destination taxon has one

Steps 1 and 2 exist only to make step 3 survivable. Do not reorder them.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import (
    mirror_invert_create_to_legacy,
    mirror_invert_delete_to_legacy,
)

# Taxa that still keep a mirror row in a legacy per-taxon table (ADR-005).
# Empties out at the Phase D table drop, at which point most of this file
# becomes a no-op rather than needing to be rewritten.
LEGACY_TABLES = {"tarantula": ("tarantulas", "tarantula_id"),
                 "scorpion": ("scorpions", "scorpion_id")}

# Child tables whose rows can carry a legacy FK. Verified against the live
# CHECK constraints 2026-09-13 — each permits a NULL legacy FK while invert_id
# is set, which is what makes the detach in step 2 legal.
CHILD_TABLES = [
    "feeding_logs",
    "molt_logs",
    "substrate_changes",
    "photos",
    "qr_upload_sessions",
]


def _history_counts(db: Session, invert_id: UUID) -> dict:
    """Child rows reachable by invert_id ONLY.

    Deliberately does not also match the legacy FK: the point is to prove rows
    survive once that FK is gone, and a query matching either column would keep
    reporting success right up until it didn't.
    """
    return {
        t: db.execute(
            text(f"SELECT COUNT(*) FROM {t} WHERE invert_id = :i"), {"i": str(invert_id)}
        ).scalar()
        for t in CHILD_TABLES
    }


def _orphan_rows(db: Session, invert_id: UUID, legacy_col: str) -> list[str]:
    """Child rows holding the legacy FK with no invert_id to fall back on.

    These can be neither detached (the parent CHECK would fail) nor left in
    place (the cascade would destroy them), so their presence means the whole
    operation must be refused. Expected to be empty — dual-write sets both —
    but "expected empty" is exactly the assumption worth testing before a
    destructive step.
    """
    found = []
    for t in CHILD_TABLES:
        n = db.execute(
            text(f"SELECT COUNT(*) FROM {t} WHERE {legacy_col} = :i AND invert_id IS NULL"),
            {"i": str(invert_id)},
        ).scalar()
        if n:
            found.append(f"{t}: {n}")
    return found


def change_invert_taxon(
    db: Session,
    invert: Invert,
    new_taxon: str,
    *,
    species_id: Optional[UUID] = None,
    commit: bool = True,
) -> dict:
    """Retaxon `invert`, preserving all history. Returns a summary.

    Raises HTTPException(409) rather than proceeding if history can't be
    preserved. Caller passes commit=False to compose this into a larger
    transaction.
    """
    old_taxon = invert.taxon
    if old_taxon == new_taxon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already a {new_taxon}.",
        )

    before = _history_counts(db, invert.id)

    # --- species link ------------------------------------------------------
    # Resolved before anything is mutated so a bad species id fails clean.
    species = None
    if species_id is not None:
        species = db.query(InvertSpecies).filter(InvertSpecies.id == species_id).first()
        if species is None:
            raise HTTPException(status_code=404, detail="Species not found")
        if species.taxon != new_taxon:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{species.scientific_name} is a {species.taxon}, not a "
                    f"{new_taxon}."
                ),
            )

    # --- steps 1-3: unwind the old legacy mirror ---------------------------
    legacy = LEGACY_TABLES.get(old_taxon)
    detached = {}
    if legacy:
        legacy_table, legacy_col = legacy

        orphans = _orphan_rows(db, invert.id, legacy_col)
        if orphans:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        "This animal has records that would be lost by changing "
                        "its type. Nothing has been changed."
                    ),
                    "orphan_rows": orphans,
                },
            )

        for t in CHILD_TABLES:
            n = db.execute(
                text(f"UPDATE {t} SET {legacy_col} = NULL WHERE {legacy_col} = :i"),
                {"i": str(invert.id)},
            ).rowcount
            if n:
                detached[t] = n

        # Only now is this survivable.
        mirror_invert_delete_to_legacy(db, invert)

    # --- step 4: the change itself -----------------------------------------
    invert.taxon = new_taxon

    if species is not None:
        invert.species_id = species.id
        invert.scientific_name = species.scientific_name
        if species.common_names:
            invert.common_name = species.common_names[0]
    elif invert.species_id is not None:
        # A jumping spider holding a tarantula's species_id is worse than one
        # holding none — it would drive the wrong care sheet, the wrong feeding
        # cadence and the wrong species statistics. Drop it and let the keeper
        # re-link.
        stale = (
            db.query(InvertSpecies.taxon)
            .filter(InvertSpecies.id == invert.species_id)
            .scalar()
        )
        if stale != new_taxon:
            invert.species_id = None
            invert.scientific_name = None

    # New taxon may need a mirror row of its own. Idempotent, and a no-op for
    # invert-native taxa.
    if new_taxon in LEGACY_TABLES:
        mirror_invert_create_to_legacy(db, invert)

    db.flush()
    after = _history_counts(db, invert.id)
    if after != before:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="History count changed during retaxon; rolled back.",
        )

    if commit:
        db.commit()
        db.refresh(invert)

    return {
        "from_taxon": old_taxon,
        "to_taxon": new_taxon,
        "detached": detached,
        "history": after,
        "species_id": str(invert.species_id) if invert.species_id else None,
    }
