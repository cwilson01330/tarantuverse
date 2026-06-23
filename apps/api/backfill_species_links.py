"""
Backfill species_id links for inverts that have a typed scientific_name which
exactly matches a catalog species but were never linked (the keeper typed the
name instead of tapping a suggestion).

Matches on taxon + scientific_name_lower (case/space-insensitive). Idempotent —
only fills rows where species_id IS NULL. Dry-run by default.

Dual-table aware (ADR-005 read cutover not done yet):
  - tarantula  -> sets BOTH inverts.species_id AND legacy tarantulas.species_id
  - scorpion   -> sets BOTH inverts.species_id AND legacy scorpions.species_id
  - all others -> inverts.species_id only (those taxa live solely on `inverts`)
The unified inverts row shares its primary key with the legacy row, and the
matched invert_species.id also exists in the legacy species / scorpion_species
catalog, so the same id is valid in every table (verified 2026-06-22).

Usage (Render shell, from apps/api):
  python3 backfill_species_links.py --user netserpent1984           # dry run, one keeper
  python3 backfill_species_links.py --user netserpent1984 --commit  # apply
  python3 backfill_species_links.py --all                            # dry run, everyone
  python3 backfill_species_links.py --all --commit                   # apply to everyone
"""
import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from app.database import SessionLocal

# Legacy per-taxon tables that are still the read source for their taxon.
LEGACY_TABLE = {"tarantula": "tarantulas", "scorpion": "scorpions"}


def main():
    ap = argparse.ArgumentParser()
    scope = ap.add_mutually_exclusive_group(required=True)
    scope.add_argument("--user", help="username or email to scope to")
    scope.add_argument("--all", action="store_true", help="every user")
    ap.add_argument("--commit", action="store_true", help="apply changes (default: dry run)")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        params = {}
        where_user = ""
        if args.user:
            row = db.execute(
                text("SELECT id, username, email FROM users WHERE username = :u OR email = :u"),
                {"u": args.user},
            ).first()
            if not row:
                print(f"User not found: {args.user}")
                return
            params["uid"] = row.id
            where_user = "AND i.user_id = :uid"
            print(f"Scope: {row.username} ({row.email})")
        else:
            print("Scope: ALL users")

        matches = db.execute(
            text(
                f"""
                SELECT i.id AS invert_id, i.taxon, i.scientific_name, s.id AS species_id
                FROM inverts i
                JOIN invert_species s
                  ON s.taxon = i.taxon
                 AND s.scientific_name_lower = lower(trim(i.scientific_name))
                WHERE i.species_id IS NULL
                  AND i.scientific_name IS NOT NULL AND i.scientific_name <> ''
                  AND i.transferred_out_at IS NULL
                  {where_user}
                ORDER BY i.taxon, i.scientific_name
                """
            ),
            params,
        ).fetchall()

        if not matches:
            print("Nothing to link — no unlinked inverts match the catalog.")
            return

        bumps = {}
        for m in matches:
            legacy = LEGACY_TABLE.get(m.taxon)
            tag = f"+legacy {legacy}" if legacy else "inverts only"
            print(f"  LINK  {m.taxon:11s} {m.scientific_name:32s} -> {m.species_id}  ({tag})")
            if args.commit:
                db.execute(
                    text("UPDATE inverts SET species_id = :sid WHERE id = :iid AND species_id IS NULL"),
                    {"sid": m.species_id, "iid": m.invert_id},
                )
                if legacy:
                    db.execute(
                        text(f"UPDATE {legacy} SET species_id = :sid WHERE id = :iid AND species_id IS NULL"),
                        {"sid": m.species_id, "iid": m.invert_id},
                    )
                bumps[m.species_id] = bumps.get(m.species_id, 0) + 1

        if args.commit:
            for sid, n in bumps.items():
                db.execute(
                    text("UPDATE invert_species SET times_kept = COALESCE(times_kept, 0) + :n WHERE id = :sid"),
                    {"n": n, "sid": sid},
                )
            db.commit()
            print(f"\nCommitted. Linked {len(matches)} animal(s) across {len(bumps)} species.")
        else:
            print(f"\nDRY RUN — would link {len(matches)} animal(s). Re-run with --commit to apply.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
