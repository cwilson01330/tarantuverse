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

        # ── Pass 2: bare epithet + exact common name ──────────────────────
        #
        # A pre-consolidation bulk add stored only the species epithet —
        # "cyaneopubescens" instead of "Chromatopelma cyaneopubescens" — while
        # keeping the common name intact ("Green Bottle Blue"). Pass 1 can't
        # see these because there's no genus to match on.
        #
        # Requiring BOTH halves to agree is what makes this safe: an epithet
        # alone is ambiguous across genera (several taxa have a "rufus"), and a
        # common name alone is ambiguous across species. Together, with the
        # taxon constraint, a false positive would need two independent
        # collisions.
        #
        # HAVING COUNT(DISTINCT s.id) = 1 drops anything that still resolves to
        # more than one catalog row rather than picking arbitrarily — a wrong
        # link would attach confidently wrong husbandry to a live animal, which
        # is worse than leaving it unlinked.
        epithet_matches = db.execute(
            text(
                f"""
                SELECT i.id AS invert_id, i.taxon, i.scientific_name,
                       MIN(s.id::text)::uuid       AS species_id,
                       MIN(s.scientific_name)      AS canonical_name
                FROM inverts i
                JOIN invert_species s
                  ON s.taxon = i.taxon
                 AND lower(split_part(s.scientific_name, ' ', 2)) = lower(trim(i.scientific_name))
                 AND EXISTS (
                       SELECT 1 FROM unnest(s.common_names) c
                       WHERE lower(trim(c)) = lower(trim(i.common_name))
                     )
                WHERE i.species_id IS NULL
                  AND i.scientific_name IS NOT NULL AND trim(i.scientific_name) <> ''
                  AND i.common_name IS NOT NULL AND trim(i.common_name) <> ''
                  AND position(' ' in trim(i.scientific_name)) = 0
                  AND i.transferred_out_at IS NULL
                  {where_user}
                GROUP BY i.id, i.taxon, i.scientific_name
                HAVING COUNT(DISTINCT s.id) = 1
                ORDER BY i.taxon, i.scientific_name
                """
            ),
            params,
        ).fetchall()

        if not matches and not epithet_matches:
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

        for m in epithet_matches:
            legacy = LEGACY_TABLE.get(m.taxon)
            tag = f"+legacy {legacy}" if legacy else "inverts only"
            print(
                f"  REPAIR {m.taxon:10s} {m.scientific_name:20s} -> "
                f"{m.canonical_name:32s} ({tag})"
            )
            if args.commit:
                # Repair the stripped genus on the animal record too, so the
                # detail screen and exports stop showing a bare epithet.
                db.execute(
                    text(
                        "UPDATE inverts SET species_id = :sid, scientific_name = :name "
                        "WHERE id = :iid AND species_id IS NULL"
                    ),
                    {"sid": m.species_id, "name": m.canonical_name, "iid": m.invert_id},
                )
                if legacy:
                    db.execute(
                        text(
                            f"UPDATE {legacy} SET species_id = :sid, scientific_name = :name "
                            "WHERE id = :iid AND species_id IS NULL"
                        ),
                        {"sid": m.species_id, "name": m.canonical_name, "iid": m.invert_id},
                    )
                bumps[m.species_id] = bumps.get(m.species_id, 0) + 1

        matches = list(matches) + list(epithet_matches)

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
