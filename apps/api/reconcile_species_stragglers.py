"""
reconcile_species_stragglers.py — mirror any legacy `species` rows that are
missing from the unified `invert_species` table.

Tarantulas are dual-written: every `species` row should have a matching
`invert_species` row on the SAME id (via _species_to_invert_species_kwargs).
A straggler happens when a species is added to `species` without the mirror
(e.g. an older care-sheet seed that predated dual-write, or a seed that skipped
the mirror because the species already existed). Those rows have care data but
never appear in the unified catalog / species browser counts.

Found 2026-07-01: Hapalopus formosus, Pamphobeteus sp. 'mascara' — in `species`,
not in `invert_species`.

Idempotent — only inserts mirrors that don't already exist. Safe to re-run.
Run on the Render shell:  python3 reconcile_species_stragglers.py
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs


def reconcile():
    db = SessionLocal()
    try:
        existing_invert_ids = {row[0] for row in db.query(InvertSpecies.id).all()}
        mirrored = 0
        for sp in db.query(Species).all():
            if sp.id in existing_invert_ids:
                continue
            db.add(InvertSpecies(**_species_to_invert_species_kwargs(sp)))
            mirrored += 1
            print(f"  Mirrored: {sp.scientific_name}")
        db.commit()
        print(f"\nDone. Mirrored {mirrored} straggler(s) into invert_species.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    reconcile()
