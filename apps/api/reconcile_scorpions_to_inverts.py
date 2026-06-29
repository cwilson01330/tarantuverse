"""
Reconcile legacy `scorpions` rows into the unified `inverts` table.

A handful of scorpions exist only in the legacy `scorpions` table (a dual-write
or backfill gap) and were therefore missing from the unified surface — excluded
from the cross-taxon cap count and the inverts-based collection analytics. This
mirrors any such straggler into `inverts` (shared PK), idempotently.

Only creates MISSING mirrors — it never overwrites an existing inverts row, so
it can't clobber data that already lives on the unified side.

Dry-run by default. Run on the Render shell from apps/api:
  python3 reconcile_scorpions_to_inverts.py            # report stragglers
  python3 reconcile_scorpions_to_inverts.py --commit   # create the mirrors
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.scorpion import Scorpion
from app.services.inverts_dualwrite import mirror_scorpion_create


def main():
    commit = "--commit" in sys.argv
    db = SessionLocal()
    try:
        legacy = db.query(Scorpion).all()
        existing_ids = {row[0] for row in db.query(Invert.id).filter(Invert.taxon == "scorpion").all()}

        stragglers = [s for s in legacy if s.id not in existing_ids]
        if not stragglers:
            print("Nothing to reconcile — every legacy scorpion already has an inverts mirror.")
            return

        for s in stragglers:
            name = s.name or s.scientific_name or s.common_name or "Unnamed"
            print(f"  MIRROR  {s.id}  {name}")
            if commit:
                mirror_scorpion_create(db, s)

        if commit:
            db.commit()
            print(f"\nCommitted. Mirrored {len(stragglers)} legacy scorpion(s) into inverts.")
        else:
            print(f"\nDRY RUN — {len(stragglers)} straggler(s). Re-run with --commit to apply.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
