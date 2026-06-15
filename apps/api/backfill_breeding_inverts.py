"""
ADR-010 Phase B — backfill breeding invert FKs.

Run ONCE on the Render shell AFTER the brd_20260612 migration deploys:
    cd apps/api && python3 backfill_breeding_inverts.py

Verbatim copy, because the inverts consolidation mirrors each tarantula into
`inverts` using the same primary key (Invert.id == Tarantula.id):
    pairings.male_invert_id   <- male_id     (where male_invert_id IS NULL)
    pairings.female_invert_id <- female_id   (where female_invert_id IS NULL)
    offspring.invert_id       <- tarantula_id (where invert_id IS NULL and
                                               tarantula_id IS NOT NULL)

Idempotent: only fills NULLs, so re-running is safe. New rows created after the
deploy are already dual-written, so this only touches pre-existing rows.

Guards: only copies an id that actually exists in `inverts` (so a tarantula
whose mirror hasn't been backfilled yet is skipped rather than creating a
dangling FK — the FK would reject it anyway). Prints a verification summary.
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import SessionLocal


def backfill():
    db = SessionLocal()
    try:
        # Pairings — only copy ids present in inverts to satisfy the FK.
        male = db.execute(text("""
            UPDATE pairings p SET male_invert_id = p.male_id
            WHERE p.male_invert_id IS NULL
              AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = p.male_id)
        """)).rowcount
        female = db.execute(text("""
            UPDATE pairings p SET female_invert_id = p.female_id
            WHERE p.female_invert_id IS NULL
              AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = p.female_id)
        """)).rowcount
        offspring = db.execute(text("""
            UPDATE offspring o SET invert_id = o.tarantula_id
            WHERE o.invert_id IS NULL
              AND o.tarantula_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = o.tarantula_id)
        """)).rowcount
        db.commit()

        # Verification
        gaps_m = db.execute(text(
            "SELECT count(*) FROM pairings WHERE male_invert_id IS NULL"
        )).scalar()
        gaps_f = db.execute(text(
            "SELECT count(*) FROM pairings WHERE female_invert_id IS NULL"
        )).scalar()
        gaps_o = db.execute(text(
            "SELECT count(*) FROM offspring WHERE invert_id IS NULL AND tarantula_id IS NOT NULL"
        )).scalar()

        print(f"Backfilled: male={male}, female={female}, offspring={offspring}")
        print(f"Remaining NULL gaps (should be 0 if all mirrors exist): "
              f"male={gaps_m}, female={gaps_f}, offspring={gaps_o}")
        if gaps_m or gaps_f or gaps_o:
            print("NOTE: non-zero gaps mean some animals have no `inverts` mirror "
                  "yet — run the inverts backfill first, then re-run this.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
