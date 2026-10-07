"""One-off data fix (2026-10-07): give tarantula logs their legacy parent id.

Until 2026-09-29 the generic invert log routes (which mobile tarantulas use)
wrote `invert_id` only. 124 molts and 1,317 feedings on 259 tarantulas had no
`tarantula_id`, and every reader that filtered on it missed them (premolt
flagged freshly moulted spiders as overdue; the web tarantula page showed
an incomplete history). The readers are fixed in code (utils/legacy_logs.py);
this makes the stored rows consistent too.

What it does, per log table: for rows whose invert is a tarantula WITH a
legacy twin row and whose tarantula_id is empty, set tarantula_id = invert_id.
The two ids are the same animal by construction (shared primary key), so
nothing is guessed. Rows with any other parent set are left alone.

Idempotent. Dry run by default; prints counts per table.

Run on the Render shell, from apps/api:
    python3 fix_tarantula_log_links_20261007.py           # dry run
    python3 fix_tarantula_log_links_20261007.py --apply
"""
import sys

from sqlalchemy import text

from app.database import SessionLocal

TABLES = ("feeding_logs", "molt_logs", "substrate_changes", "photos")

WHERE = """
    l.tarantula_id IS NULL
    AND l.animal_id IS NULL
    AND l.scorpion_id IS NULL
    AND l.invert_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = l.invert_id AND i.taxon = 'tarantula')
    AND EXISTS (SELECT 1 FROM tarantulas t WHERE t.id = l.invert_id)
"""


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    try:
        total = 0
        for table in TABLES:
            cols = {r[0] for r in db.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
            ), {"t": table})}
            where = WHERE
            for col in ("animal_id", "scorpion_id"):
                if col not in cols:  # not every log table has every parent column
                    where = where.replace(f"AND l.{col} IS NULL", "")
            for col in ("colony_id", "enclosure_id"):
                if col in cols:
                    where += f" AND l.{col} IS NULL"
            n = db.execute(text(f"SELECT count(*) FROM {table} l WHERE {where}")).scalar()
            total += n
            print(f"  {table:<18} {n} row(s) to link")
            if apply and n:
                db.execute(text(f"UPDATE {table} l SET tarantula_id = l.invert_id WHERE {where}"))
        if apply:
            db.commit()
            print(f"Done. Linked {total} row(s).")
        else:
            print(f"Dry run: {total} row(s) would be linked. Add --apply to save.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
