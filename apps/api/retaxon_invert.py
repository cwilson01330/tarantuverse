"""
Move an animal to a different taxon without losing its history.

    python3 retaxon_invert.py <invert_id> <new_taxon> [--species <scientific name>]
    python3 retaxon_invert.py <invert_id> <new_taxon> [--species ...] --apply

Dry run by default. Prints every row it would touch and re-counts logs after
the change so you can see nothing was lost.

WHY THIS SCRIPT STILL EXISTS
----------------------------
Keepers can now fix their own taxon in-app via POST /inverts/{id}/change-taxon.
This remains for the admin case: repairing someone else's animal without
asking them to do it, and doing it with a dry run first.

ALL THE LOGIC LIVES IN app/services/retaxon_service.py — deliberately. The
endpoint and this script call the same function. Two copies of dual-write
mirror logic is precisely the shape of bug ADR-005 keeps producing, and here
the failure mode is destroying a keeper's history rather than showing a stale
name. If you're about to add a step here, add it to the service instead.

The short version of what the service does, and why the order matters: a
tarantula's logs carry BOTH `tarantula_id` and `invert_id`, every legacy FK is
ON DELETE CASCADE, so dropping the mirror row before detaching those FKs takes
every feeding, molt and photo with it while the animal sits there looking fine.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import HTTPException

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.services.retaxon_service import (
    LEGACY_TABLES,
    _history_counts,
    _orphan_rows,
    change_invert_taxon,
)


def _species_taxon_mismatch(species, new_taxon: str) -> str | None:
    """The one refusal the dry run used to miss.

    The service rejects a species belonging to a different taxon, but it does
    that at apply time. Looking the name up here and printing it made a dry run
    read as clean right up to the point where --apply 400s.
    """
    if species is not None and species.taxon != new_taxon:
        return f"{species.scientific_name} is a {species.taxon}, not a {new_taxon}"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("invert_id")
    ap.add_argument("new_taxon")
    ap.add_argument("--species", default=None, help="scientific name to link")
    ap.add_argument("--clear-species", action="store_true",
                    help="unset species_id instead of linking one")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        inv = db.query(Invert).filter(Invert.id == args.invert_id).first()
        if not inv:
            print(f"No invert {args.invert_id}")
            return 1

        old_taxon = inv.taxon
        print(f"{'APPLY' if args.apply else 'DRY RUN'}")
        print(f"  {inv.name or '(unnamed)'}  {old_taxon} -> {args.new_taxon}")
        print(f"  history by invert-side column: {_history_counts(db, inv.id, old_taxon)}")

        species = None
        if args.species:
            species = (
                db.query(InvertSpecies)
                .filter(InvertSpecies.scientific_name_lower == args.species.lower())
                .first()
            )
            if not species:
                print(f"  ! species not found: {args.species}")
                return 1
            mismatch = _species_taxon_mismatch(species, args.new_taxon)
            if mismatch:
                print(f"  ! WOULD REFUSE — {mismatch}")
                return 1
            print(f"  species -> {species.scientific_name} ({species.taxon})")
        else:
            print("  species -> cleared if it belongs to the old taxon")

        # Same pre-flight the service runs, surfaced here so a dry run reports
        # the refusal instead of only discovering it on --apply.
        legacy = LEGACY_TABLES.get(old_taxon)
        if legacy:
            orphans = _orphan_rows(db, inv.id, old_taxon)
            if orphans:
                print("  ! WOULD REFUSE — these rows would be destroyed, not moved:")
                for o in orphans:
                    print(f"      {o}")
                print("    Backfill the invert-side column first, or unlink them.")
                return 1
            print(f"  legacy mirror: {legacy[0]} row will be removed")

        if not args.apply:
            print("  (re-run with --apply)")
            return 0

        try:
            result = change_invert_taxon(
                db, inv, args.new_taxon,
                species_id=species.id if species else None,
            )
        except HTTPException as e:
            print(f"  ! refused: {e.detail}")
            return 1

        print(f"  detached: {result['detached'] or 'nothing'}")
        print(f"  history after: {result['history']}")
        print("  done, history intact")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
