"""Repair hero photos that disagree across the dual-write pair.

WHY THESE ROWS EXIST
--------------------
All three photo_url write paths mirrored in one direction only (legacy →
invert). A photo uploaded through /inverts/{id}/photos carries no tarantula_id,
so its owner resolved as the Invert and the legacy row was never updated. The
keeper set a new hero, the detail screen changed, and the collection card — which
reads the legacy table — did not.

Fixed in utils/hero_photo.py. This repairs the rows written before that landed.

WHICH VALUE WINS
----------------
The INVERT row. Every observed mismatch is "invert has a newer hero, legacy is
stale", which is exactly the bug's signature: the write that reached one row and
not the other. The invert value is the one the keeper actually chose.

The script refuses to guess in the other direction. If it finds a pair where the
legacy row has a hero and the invert doesn't, that is NOT this bug — it's
something else, and it gets reported rather than silently overwritten.

SAFETY
------
Idempotent. Dry-run unless --commit. Reports every change with the animal's name
so the output can be eyeballed before anything is written.

USAGE (Render shell)
--------------------
    python repair_hero_photo_mirror.py
    python repair_hero_photo_mirror.py --commit
"""
import argparse
import sys

from sqlalchemy import text

from app.database import SessionLocal


# Both legacy tables share a primary key with their `inverts` mirror.
LEGACY_TABLES = ("tarantulas", "scorpions")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Actually write. Otherwise rollback.")
    args = ap.parse_args()

    db = SessionLocal()
    total_fixed = 0
    total_skipped = 0
    try:
        for table in LEGACY_TABLES:
            rows = db.execute(
                text(f"""
                    SELECT i.id,
                           COALESCE(NULLIF(i.name, ''), i.common_name, i.scientific_name, '(unnamed)') AS label,
                           u.username,
                           i.photo_url  AS invert_url,
                           l.photo_url  AS legacy_url
                    FROM inverts i
                    JOIN {table} l ON l.id = i.id
                    JOIN users u   ON u.id = i.user_id
                    WHERE i.photo_url IS DISTINCT FROM l.photo_url
                    ORDER BY u.username, label
                """)
            ).mappings().all()

            if not rows:
                print(f"{table}: nothing to repair")
                continue

            print(f"\n{table}: {len(rows)} mismatched pair(s)")
            for r in rows:
                # The invert value is authoritative ONLY when it's the one that
                # was set. A null invert_url with a non-null legacy_url is a
                # different problem — don't blank someone's hero on a guess.
                if r["invert_url"] is None:
                    print(
                        f"  SKIP  {r['username']}/{r['label']}: invert has no hero but "
                        f"legacy does. Not this bug — leaving alone."
                    )
                    total_skipped += 1
                    continue

                db.execute(
                    text(f"UPDATE {table} SET photo_url = :url WHERE id = :id"),
                    {"url": r["invert_url"], "id": str(r["id"])},
                )
                print(f"  FIX   {r['username']}/{r['label']}")
                total_fixed += 1

        print(f"\n{total_fixed} repaired, {total_skipped} skipped.")
        if args.commit:
            db.commit()
            print("COMMITTED.")
        else:
            db.rollback()
            print("DRY RUN — rolled back. Re-run with --commit to apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
