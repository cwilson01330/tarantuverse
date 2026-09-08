"""
Mark the tarantula species that an established part of the hobby keeps communally.

Background
----------
`species.communal_suitable` was added by com_20260908 and defaults False for all
197 tarantulas. Colony mode (ADR-010) gates on that flag, so until this runs no
tarantula can be added as a population — including *Monocentropus balfouri*,
which is the species two of the three colonies in production actually are.

This is a HUSBANDRY CLAIM, not a schema change, which is why it lives in a
reviewable script rather than in a migration. Setting the flag true tells a
keeper the platform thinks housing several of these together is a thing people
do. Getting that wrong invites someone to watch their animals eat each other.

Inclusion standard
------------------
A species goes on this list only when communal keeping is (a) routinely and
openly practised in the hobby, not merely attempted, and (b) documented well
enough that a beginner following common advice has a real chance of success.
Per-species, never per-genus: the genus shortcut is what put a corn snake on a
gecko feeding cadence (see feedback_cgd_gate_by_taxon).

DELIBERATELY EXCLUDED
---------------------
* **Poecilotheria** (13 species in the catalog). Communal Pokies are attempted
  and sometimes succeed, but the practice is contested, failures are common,
  and these are Old World species with medically significant venom — a failed
  communal means opening an enclosure to separate animals that bite. The
  honest answer for a flag that reads as endorsement is no. If you disagree,
  add them here rather than loosening the standard.
* **Holothele longipes** — kept communally by some keepers, but the evidence is
  thinner than for the four below and it is often confused with
  *Neoholothele incei* in the trade. Left off pending better information.
* **Chilobrachys** — not communal. Present in the catalog and superficially
  similar to some of the above (dwarf-ish, heavy webbers); named here so the
  omission reads as a decision rather than an oversight.

Note that being on this list does NOT mean communal keeping is safe or
recommended for a given individual. It means the option should be offered. The
add flow shows a cannibalism-risk warning alongside it.

Run with:
    python3 seed_communal_tarantulas.py          # dry run, reports diffs
    python3 seed_communal_tarantulas.py --apply  # actually write changes

Idempotent. Safe to re-run.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species


# Exact scientific names as stored in the catalog. Verified present 2026-09-08;
# a name that no longer matches is reported rather than silently skipped, since
# a rename would otherwise turn this into a no-op nobody notices.
COMMUNAL_TARANTULAS = {
    # The reference communal tarantula. Sibling-raised groups are the normal
    # way this species is sold and kept; adults tolerate each other unusually
    # well for a theraphosid.
    "Monocentropus balfouri",
    # Long-established dwarf communal, both the normal and gold forms. Heavy
    # communal webbing is characteristic rather than a warning sign.
    "Neoholothele incei",
    # Pumpkin patches — dwarf, prolific webbers, routinely raised in groups.
    "Hapalopus sp. 'Colombia Large'",
    "Hapalopus sp. 'Colombia Small'",
    "Hapalopus formosus",
    # Tanzanian chestnut. Dwarf African communal with a long track record.
    "Heterothele villosella",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = (
            db.query(Species)
            .filter(Species.scientific_name.in_(sorted(COMMUNAL_TARANTULAS)))
            .all()
        )
        found = {r.scientific_name for r in rows}
        missing = COMMUNAL_TARANTULAS - found

        changed, unchanged = [], []
        for r in rows:
            if bool(r.communal_suitable):
                unchanged.append(r.scientific_name)
            else:
                changed.append(r.scientific_name)
                if args.apply:
                    r.communal_suitable = True

        # Anything true that ISN'T on the list is a drift signal — either a
        # manual edit or a stale run of an older list. Report, never silently
        # revert: a human may have set it on purpose.
        unexpected = [
            r.scientific_name
            for r in db.query(Species)
            .filter(Species.communal_suitable.is_(True))
            .all()
            if r.scientific_name not in COMMUNAL_TARANTULAS
        ]

        if args.apply:
            db.commit()

        print(f"{'APPLIED' if args.apply else 'DRY RUN'}")
        print(f"  would set true : {len(changed)}")
        for n in sorted(changed):
            print(f"      + {n}")
        print(f"  already true   : {len(unchanged)}")
        for n in sorted(unchanged):
            print(f"      = {n}")
        if missing:
            print(f"  NOT FOUND      : {len(missing)}  <-- name drift, investigate")
            for n in sorted(missing):
                print(f"      ? {n}")
        if unexpected:
            print(f"  true but off-list: {len(unexpected)}  <-- not reverted, review")
            for n in sorted(unexpected):
                print(f"      ! {n}")

        # The invert_species mirror is refreshed by the dual-write on the next
        # species update, NOT by this script. Colony mode reads `species` for
        # tarantulas, so the flag is live for the add flow immediately; the
        # mirror catches up when the row is next edited.
        print("\nNote: invert_species mirror updates on next species write.")
        return 1 if missing else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
