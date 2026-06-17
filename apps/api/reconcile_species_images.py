"""Reconcile image_url + image_attribution across the two species tables.

Tarantulas live in BOTH the legacy `species` table (read by the tarantula care
guide /species/{id}) and the unified `invert_species` mirror (read by
/species/inverts/{id}) with a SHARED primary key. The image apply pipeline
historically wrote only `invert_species`, so some tarantulas have an image there
but NULL in `species` — their care guide renders imageless despite us having the
image.

This copies an image (URL + attribution) across whenever exactly one side has it
— a null-fill that NEVER overwrites an existing value, so it's safe and
idempotent. Run on the Render shell.

Usage:
  python3 reconcile_species_images.py --dry-run   # report what would sync
  python3 reconcile_species_images.py             # apply
"""
import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species
from app.models.invert_species import InvertSpecies


def run(dry_run: bool) -> int:
    db = SessionLocal()
    try:
        pairs = (
            db.query(Species, InvertSpecies)
            .join(InvertSpecies, InvertSpecies.id == Species.id)
            .all()
        )
        to_species = to_invert = 0
        for sp, iv in pairs:
            if not sp.image_url and iv.image_url:
                to_species += 1
                if not dry_run:
                    sp.image_url = iv.image_url
                    sp.image_attribution = iv.image_attribution
            elif not iv.image_url and sp.image_url:
                to_invert += 1
                if not dry_run:
                    iv.image_url = sp.image_url
                    iv.image_attribution = sp.image_attribution
        if not dry_run:
            db.commit()
        print(f"Shared-id tarantula rows scanned: {len(pairs)}")
        print(f"  invert_species -> legacy species: {to_species}")
        print(f"  legacy species -> invert_species: {to_invert}")
        print("  (dry run — no writes)" if dry_run else "  Committed.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    p = argparse.ArgumentParser(description="Sync species images across legacy + invert tables.")
    p.add_argument("--dry-run", action="store_true", help="report only; no writes")
    return run(p.parse_args().dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
