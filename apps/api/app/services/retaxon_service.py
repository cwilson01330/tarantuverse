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

    1. refuse outright if any dependent row would be destroyed rather than
       detached
    2. NULL the legacy FK on every dependent row that has an invert-side
       column to fall back on
    3. THEN drop the mirror row — now cascading over nothing
    4. THEN change the taxon, fix the species link, and create the new mirror
       row if the destination taxon has one

Steps 1 and 2 exist only to make step 3 survivable. Do not reorder them.

COVERAGE IS DERIVED FROM THE SCHEMA, NOT FROM MEMORY
----------------------------------------------------
The first version of this file listed five log tables — the ones that came to
mind. It missed `pairings`, which cascades from `tarantulas` through BOTH
`male_id` and `female_id` and on down to `egg_sacs` and `offspring`. A keeper
correcting one mis-tapped taxon would have silently lost an entire breeding
project. It also missed `broods`.

So the lists below are transcribed from this query, not from recall. Re-run it
whenever a table gains a legacy FK:

    SELECT ccu.table_name AS parent, tc.table_name AS child,
           kcu.column_name AS child_col, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name IN ('tarantulas', 'scorpions')
      AND rc.delete_rule = 'CASCADE';

Verified against production 2026-09-13. `test_retaxon_ordering` pins the
resulting set so a silent omission fails a test rather than a keeper's data.
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

# Polymorphic log tables — same shape for both legacy taxa: one legacy FK
# column plus `invert_id`. Verified against the live CHECK constraints
# 2026-09-13; each permits a NULL legacy FK while invert_id is set, which is
# what makes the detach in step 2 legal.
CHILD_TABLES = [
    "feeding_logs",
    "molt_logs",
    "substrate_changes",
    "photos",
    "qr_upload_sessions",
]

# Everything else that cascades off a legacy row, per taxon.
#
# (table, legacy_column, invert_column). A None invert_column means the row
# has nowhere to be re-pointed, so its presence REFUSES the whole operation
# rather than being detached.
#
#   pairings — polymorphic (male_invert_id / female_invert_id both exist and
#     are nullable, no CHECK constraint), so it detaches like a log table. Two
#     entries because a single animal can be either side. Cascades onward to
#     egg_sacs → offspring, which is why missing it was expensive.
#   broods — `mother_scorpion_id` is NOT NULL and has no invert equivalent
#     (scorpion breeding predates consolidation). A brood mother genuinely
#     cannot change taxon without losing the brood, so we say so and stop.
EXTRA_CASCADES: dict[str, list[tuple[str, str, Optional[str]]]] = {
    "tarantula": [
        ("pairings", "male_id", "male_invert_id"),
        ("pairings", "female_id", "female_invert_id"),
    ],
    "scorpion": [
        ("broods", "mother_scorpion_id", None),
    ],
}


def _cascade_sources(old_taxon: str) -> list[tuple[str, str, Optional[str]]]:
    """Every (table, legacy_col, invert_col) that a mirror-row delete reaches."""
    legacy_col = LEGACY_TABLES[old_taxon][1]
    sources: list[tuple[str, str, Optional[str]]] = [
        (t, legacy_col, "invert_id") for t in CHILD_TABLES
    ]
    sources += EXTRA_CASCADES.get(old_taxon, [])
    return sources


def _history_counts(db: Session, invert_id: UUID, old_taxon: Optional[str] = None) -> dict:
    """Dependent rows reachable by the INVERT-side column only.

    Deliberately does not also match the legacy FK: the point is to prove rows
    survive once that FK is gone, and a query matching either column would keep
    reporting success right up until it didn't.

    Keyed "table.column" because pairings contributes two entries (an animal
    can be either side of one). `old_taxon` is optional so the admin script can
    print log counts before it knows the taxon matters.
    """
    counts = {
        f"{t}.invert_id": db.execute(
            text(f"SELECT COUNT(*) FROM {t} WHERE invert_id = :i"), {"i": str(invert_id)}
        ).scalar()
        for t in CHILD_TABLES
    }
    for table, _legacy_col, invert_col in EXTRA_CASCADES.get(old_taxon or "", []):
        if invert_col is None:
            # Nothing to count — these can't survive, so they're refused
            # up front rather than tracked through the change.
            continue
        counts[f"{table}.{invert_col}"] = db.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE {invert_col} = :i"),
            {"i": str(invert_id)},
        ).scalar()
    return counts


def _orphan_rows(db: Session, invert_id: UUID, old_taxon: str) -> list[str]:
    """Rows the mirror-row delete would destroy rather than detach.

    Two kinds:
      - a polymorphic row holding the legacy FK with no invert-side value to
        fall back on. Can be neither detached (nothing left pointing at the
        animal) nor left in place (the cascade takes it).
      - a row in a table with no invert-side column at all (broods), which can
        never be detached.

    Both mean the whole operation must be refused. The first kind is expected
    to be empty — dual-write sets both columns — but "expected empty" is
    exactly the assumption worth testing immediately before a destructive step.
    """
    found = []
    for table, legacy_col, invert_col in _cascade_sources(old_taxon):
        if invert_col is None:
            sql = f"SELECT COUNT(*) FROM {table} WHERE {legacy_col} = :i"
        else:
            sql = (
                f"SELECT COUNT(*) FROM {table} "
                f"WHERE {legacy_col} = :i AND {invert_col} IS NULL"
            )
        n = db.execute(text(sql), {"i": str(invert_id)}).scalar()
        if n:
            found.append(f"{table}.{legacy_col}: {n}")
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

    before = _history_counts(db, invert.id, old_taxon)

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
        orphans = _orphan_rows(db, invert.id, old_taxon)
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

        for table, legacy_col, invert_col in _cascade_sources(old_taxon):
            if invert_col is None:
                # Unreachable: _orphan_rows already refused on any row here.
                # Skipping rather than NULLing is the safe reading either way,
                # since these columns are NOT NULL.
                continue
            n = db.execute(
                text(f"UPDATE {table} SET {legacy_col} = NULL WHERE {legacy_col} = :i"),
                {"i": str(invert.id)},
            ).rowcount
            if n:
                detached[f"{table}.{legacy_col}"] = n

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
    after = _history_counts(db, invert.id, old_taxon)
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
