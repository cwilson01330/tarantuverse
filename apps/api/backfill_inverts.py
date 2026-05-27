"""
Phase B — backfill `inverts` + `invert_species` from legacy data.

Background
----------
ADR-005 expand-contract: Phase A1 created the unified `inverts` and
`invert_species` tables additively. Phase A2 wired dual-write so every
NEW create/update/delete on legacy tables mirrors into the new ones.

This script handles EXISTING data — every tarantula, scorpion, species,
and scorpion_species row that existed before A2 shipped needs a matching
row in the unified tables. It also patches up `invert_id` on the
polymorphic log tables (feeding_logs, molt_logs, substrate_changes,
photos, qr_upload_sessions) for rows logged pre-A2 or against parents
whose invert mirror didn't exist yet at log time.

Run order matters
-----------------
1. Tarantulas → inverts (taxon='tarantula', species_id=NULL)
2. Scorpions  → inverts (taxon='scorpion', species_id=NULL)
3. Species    → invert_species (taxon='tarantula')
4. ScorpionSpecies → invert_species (taxon='scorpion')
5. Resolve `inverts.species_id` from the legacy parent — only safe
   after steps 3+4 because the FK target rows need to exist.
6. Walk log tables and set `invert_id = parent_id` where the matching
   invert row now exists.

UUID preservation is the linchpin: legacy `tarantulas.id == inverts.id`
for every tarantula, so `invert_id` on a log row is literally the
parent's `tarantula_id` whenever the mirror exists. No id translation
needed.

Idempotency
-----------
Every step is `WHERE NOT EXISTS / invert_id IS NULL` gated, so re-running
this is safe. You can run it multiple times during the soak period if
new edge cases emerge.

Usage
-----
    # Dry run first (default) — reports what would change, commits nothing.
    python3 backfill_inverts.py

    # Apply changes.
    python3 backfill_inverts.py --apply

    # Just run the post-backfill verification (no writes).
    python3 backfill_inverts.py --verify-only

Run from the Render shell after deploy:
    cd /opt/render/project/src/apps/api
    python3 backfill_inverts.py            # dry run
    python3 backfill_inverts.py --apply    # commit

Safe to re-run.
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Dict

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.scorpion import Scorpion
from app.models.scorpion_species import ScorpionSpecies
from app.models.species import Species
from app.models.tarantula import Tarantula
from app.services.inverts_dualwrite import (
    _scorpion_species_to_invert_species_kwargs,
    _scorpion_to_invert_kwargs,
    _species_to_invert_species_kwargs,
    _tarantula_to_invert_kwargs,
)


# ---------------------------------------------------------------------------
# Step 1-4: mirror legacy parent tables into inverts / invert_species.
# These iterate via the ORM so we reuse the exact kwargs helpers from
# dual-write — same field mapping, same enum coercion, same edge cases.
# Counts in dry-run mode are accurate (count of legacy rows missing a
# mirror). Counts in apply mode equal what was inserted.
# ---------------------------------------------------------------------------

def backfill_tarantulas(db, *, apply: bool) -> int:
    """Insert an `inverts` row for every Tarantula that lacks one."""
    existing_ids = {row[0] for row in db.query(Invert.id).all()}
    pending = [t for t in db.query(Tarantula).all() if t.id not in existing_ids]
    if apply:
        for t in pending:
            db.add(Invert(**_tarantula_to_invert_kwargs(t)))
        db.flush()
    return len(pending)


def backfill_scorpions(db, *, apply: bool) -> int:
    """Insert an `inverts` row for every Scorpion that lacks one."""
    existing_ids = {row[0] for row in db.query(Invert.id).all()}
    pending = [s for s in db.query(Scorpion).all() if s.id not in existing_ids]
    if apply:
        for s in pending:
            db.add(Invert(**_scorpion_to_invert_kwargs(s)))
        db.flush()
    return len(pending)


def backfill_tarantula_species(db, *, apply: bool) -> int:
    """Insert an `invert_species` row for every Species that lacks one.

    `_species_to_invert_species_kwargs` slugifies the scientific name —
    on slug collision (rare for tarantulas, no duplicates expected) the
    UNIQUE constraint will surface the issue at flush time."""
    existing_ids = {row[0] for row in db.query(InvertSpecies.id).all()}
    pending = [sp for sp in db.query(Species).all() if sp.id not in existing_ids]
    if apply:
        for sp in pending:
            db.add(InvertSpecies(**_species_to_invert_species_kwargs(sp)))
        db.flush()
    return len(pending)


def backfill_scorpion_species(db, *, apply: bool) -> int:
    """Insert an `invert_species` row for every ScorpionSpecies that
    lacks one. ScorpionSpecies already carries its own slug column."""
    existing_ids = {row[0] for row in db.query(InvertSpecies.id).all()}
    pending = [sp for sp in db.query(ScorpionSpecies).all() if sp.id not in existing_ids]
    if apply:
        for sp in pending:
            db.add(InvertSpecies(**_scorpion_species_to_invert_species_kwargs(sp)))
        db.flush()
    return len(pending)


# ---------------------------------------------------------------------------
# Step 5: link inverts.species_id from legacy parent.species_id.
# Bulk SQL — way faster than per-row ORM for a one-shot pass.
# ---------------------------------------------------------------------------

def link_species_ids(db, *, apply: bool) -> int:
    """Copy `species_id` from the legacy parent onto the matching Invert.

    Only acts on Invert rows where species_id is NULL AND the legacy
    parent has a species_id AND that species_id now exists in
    invert_species (so the FK target is valid).
    """
    # Dry-run count: how many would each UPDATE touch?
    if not apply:
        t_count = db.execute(text("""
            SELECT COUNT(*)
            FROM inverts i
            JOIN tarantulas t ON t.id = i.id
            WHERE i.species_id IS NULL
              AND t.species_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = t.species_id)
        """)).scalar() or 0
        s_count = db.execute(text("""
            SELECT COUNT(*)
            FROM inverts i
            JOIN scorpions sc ON sc.id = i.id
            WHERE i.species_id IS NULL
              AND sc.species_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = sc.species_id)
        """)).scalar() or 0
        return int(t_count) + int(s_count)

    # Apply: bulk UPDATEs.
    t_result = db.execute(text("""
        UPDATE inverts
        SET species_id = t.species_id
        FROM tarantulas t
        WHERE inverts.id = t.id
          AND inverts.species_id IS NULL
          AND t.species_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = t.species_id)
    """))
    s_result = db.execute(text("""
        UPDATE inverts
        SET species_id = sc.species_id
        FROM scorpions sc
        WHERE inverts.id = sc.id
          AND inverts.species_id IS NULL
          AND sc.species_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = sc.species_id)
    """))
    return int(t_result.rowcount or 0) + int(s_result.rowcount or 0)


# ---------------------------------------------------------------------------
# Step 6: link invert_id on every polymorphic log table.
# UPDATE log SET invert_id = parent_fk WHERE the matching Invert exists.
# ---------------------------------------------------------------------------

# (table, parent_fk_column) pairs we need to patch. Centipedes will join
# here later; HV animal_id is intentionally absent — animals aren't inverts.
_LOG_TABLES: list[tuple[str, str]] = [
    ("feeding_logs", "tarantula_id"),
    ("feeding_logs", "scorpion_id"),
    ("molt_logs", "tarantula_id"),
    ("molt_logs", "scorpion_id"),
    ("substrate_changes", "tarantula_id"),
    ("substrate_changes", "scorpion_id"),
    ("photos", "tarantula_id"),
    ("photos", "scorpion_id"),
    ("qr_upload_sessions", "tarantula_id"),
    ("qr_upload_sessions", "scorpion_id"),
]


def link_log_invert_ids(db, *, apply: bool) -> Dict[str, int]:
    """Set log.invert_id = log.<fk> where invert_id is NULL and the
    matching Invert exists. Returns a dict keyed by 'table.fk'."""
    counts: Dict[str, int] = {}
    for table, fk in _LOG_TABLES:
        if not apply:
            n = db.execute(text(f"""
                SELECT COUNT(*) FROM {table}
                WHERE invert_id IS NULL
                  AND {fk} IS NOT NULL
                  AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = {table}.{fk})
            """)).scalar() or 0
        else:
            r = db.execute(text(f"""
                UPDATE {table}
                SET invert_id = {fk}
                WHERE invert_id IS NULL
                  AND {fk} IS NOT NULL
                  AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = {table}.{fk})
            """))
            n = r.rowcount or 0
        counts[f"{table}.{fk}"] = int(n)
    return counts


# ---------------------------------------------------------------------------
# Verification — every check below should be 0 after a clean backfill.
# Anything non-zero means we missed a row (or new rows landed during the
# script; re-run is safe).
# ---------------------------------------------------------------------------

def verify(db) -> Dict[str, int]:
    """Return a dict of remaining-gap counts. All zeros = clean."""
    checks: Dict[str, int] = {}

    checks["tarantulas missing invert mirror"] = int(db.execute(text("""
        SELECT COUNT(*) FROM tarantulas t
        WHERE NOT EXISTS (SELECT 1 FROM inverts i WHERE i.id = t.id)
    """)).scalar() or 0)

    checks["scorpions missing invert mirror"] = int(db.execute(text("""
        SELECT COUNT(*) FROM scorpions s
        WHERE NOT EXISTS (SELECT 1 FROM inverts i WHERE i.id = s.id)
    """)).scalar() or 0)

    checks["species missing invert_species mirror"] = int(db.execute(text("""
        SELECT COUNT(*) FROM species sp
        WHERE NOT EXISTS (SELECT 1 FROM invert_species i WHERE i.id = sp.id)
    """)).scalar() or 0)

    checks["scorpion_species missing invert_species mirror"] = int(db.execute(text("""
        SELECT COUNT(*) FROM scorpion_species sp
        WHERE NOT EXISTS (SELECT 1 FROM invert_species i WHERE i.id = sp.id)
    """)).scalar() or 0)

    checks["tarantula inverts with parent species but null species_id"] = int(db.execute(text("""
        SELECT COUNT(*) FROM inverts i
        JOIN tarantulas t ON t.id = i.id
        WHERE i.species_id IS NULL
          AND t.species_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = t.species_id)
    """)).scalar() or 0)

    checks["scorpion inverts with parent species but null species_id"] = int(db.execute(text("""
        SELECT COUNT(*) FROM inverts i
        JOIN scorpions sc ON sc.id = i.id
        WHERE i.species_id IS NULL
          AND sc.species_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM invert_species s WHERE s.id = sc.species_id)
    """)).scalar() or 0)

    for table, fk in _LOG_TABLES:
        checks[f"{table}: {fk} set but invert_id missing"] = int(db.execute(text(f"""
            SELECT COUNT(*) FROM {table}
            WHERE invert_id IS NULL
              AND {fk} IS NOT NULL
              AND EXISTS (SELECT 1 FROM inverts i WHERE i.id = {table}.{fk})
        """)).scalar() or 0)

    return checks


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _print_section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Phase B — backfill inverts + invert_species from legacy data."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually commit changes. Without this, runs as a dry-run.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Skip backfill steps; just run the verification queries.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.verify_only:
            _print_section("Verification")
            results = verify(db)
            any_nonzero = False
            for k, v in results.items():
                marker = "OK" if v == 0 else "!!"
                if v != 0:
                    any_nonzero = True
                print(f"  [{marker}] {k}: {v}")
            return 1 if any_nonzero else 0

        mode = "APPLY" if args.apply else "DRY RUN"
        print(f"=== Phase B backfill [{mode}] ===")

        _print_section("Step 1-4: mirror legacy parent rows")
        n_t = backfill_tarantulas(db, apply=args.apply)
        print(f"  Tarantulas → inverts:            {n_t}")
        n_s = backfill_scorpions(db, apply=args.apply)
        print(f"  Scorpions → inverts:             {n_s}")
        n_sp = backfill_tarantula_species(db, apply=args.apply)
        print(f"  Species → invert_species:        {n_sp}")
        n_ssp = backfill_scorpion_species(db, apply=args.apply)
        print(f"  ScorpionSpecies → invert_species:{n_ssp}")

        _print_section("Step 5: link inverts.species_id")
        # In dry-run mode the count reflects what could be linked if
        # steps 1-4 had landed in this transaction — but raw SQL only
        # sees the legacy rows, so the dry count is accurate for the
        # eventual --apply pass.
        n_link = link_species_ids(db, apply=args.apply)
        print(f"  Inverts linked to species:       {n_link}")

        _print_section("Step 6: link invert_id on log tables")
        log_counts = link_log_invert_ids(db, apply=args.apply)
        for k, v in log_counts.items():
            print(f"  {k:48s} {v}")

        if not args.apply:
            print()
            print("DRY RUN complete — no rows committed.")
            print("Re-run with --apply to commit.")
            db.rollback()
            return 0

        db.commit()
        print()
        print("Committed.")

        _print_section("Post-apply verification")
        results = verify(db)
        any_nonzero = False
        for k, v in results.items():
            marker = "OK" if v == 0 else "!!"
            if v != 0:
                any_nonzero = True
            print(f"  [{marker}] {k}: {v}")

        if any_nonzero:
            print()
            print("!! Some gaps remain. Re-run with --apply, or investigate.")
            return 1
        print()
        print("All clean.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
