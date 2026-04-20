"""
One-shot DB correction for Old World tarantula safety flags.

Background
----------
Old World theraphosid species (African + Asian baboons, ornamentals, fossorials)
do NOT have urticating hairs. They defend with fast, defensive bites backed by
medically significant venom. Several species records in the live DB were found
with inverted or missing flags (e.g. Monocentropus balfouri showing urticating
hairs, multiple species showing medically_significant_venom = False).

Per the honesty-first product principle, we should never under-warn on a safety
flag. This script finds any species whose genus is in the Old World allow-list
and normalises:
    urticating_hairs = False
    medically_significant_venom = True

It is idempotent — rows already set correctly are reported as unchanged.

Run with:
    python3 fix_old_world_species_flags.py          # dry run, reports diffs
    python3 fix_old_world_species_flags.py --apply  # actually write changes

Safe to re-run at any time.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species


# Genera considered Old World for the purpose of the urticating-hairs /
# medically-significant-venom flag policy. This list is conservative and
# includes only theraphosid genera endemic to Africa, Asia, and adjacent
# archipelagos (Socotra, Madagascar-excluded since no pet-trade theraphosids).
#
# When adding new genera here, confirm they are (a) Old World, (b) possess
# genuine defensive venom that has been implicated in documented bite reports.
OLD_WORLD_GENERA = {
    # Africa
    "Pterinochilus",
    "Heteroscodra",
    "Stromatopelma",
    "Ceratogyrus",
    "Harpactira",
    "Idiothele",
    "Augacephalus",
    "Encyocratella",
    "Hysterocrates",
    "Citharischius",
    "Pelinobius",
    "Eucratoscelus",
    "Harpactirella",
    "Trichognathella",
    "Brachionopus",
    # Socotra
    "Monocentropus",
    # Asia
    "Poecilotheria",
    "Haplopelma",
    "Cyriopagopus",
    "Ornithoctonus",
    "Phormingochilus",
    "Lampropelma",
    "Chilobrachys",
    "Selenocosmia",
    "Phlogiellus",
    "Birupes",
    "Orphnaecus",
    "Selenobrachys",
    "Coremiocnemis",
    "Omothymus",
}


def _needs_fix(sp: Species) -> bool:
    return bool(sp.urticating_hairs) or not bool(sp.medically_significant_venom)


def run(apply: bool) -> int:
    db = SessionLocal()
    changed = 0
    already_ok = 0
    skipped_non_old_world = 0
    try:
        species = db.query(Species).all()
        for sp in species:
            genus = (sp.genus or (sp.scientific_name or "").split(" ", 1)[0]).strip()
            if not genus or genus not in OLD_WORLD_GENERA:
                skipped_non_old_world += 1
                continue

            if not _needs_fix(sp):
                already_ok += 1
                continue

            print(
                f"  - {sp.scientific_name}  "
                f"urticating_hairs: {sp.urticating_hairs} -> False  |  "
                f"medically_significant_venom: {sp.medically_significant_venom} -> True"
            )
            if apply:
                sp.urticating_hairs = False
                sp.medically_significant_venom = True
            changed += 1

        if apply and changed:
            db.commit()
            print(f"\nCommitted {changed} update(s).")
        elif apply:
            print("\nNothing to commit.")
        else:
            print(
                f"\nDry run. Would update {changed} row(s). "
                f"{already_ok} Old World row(s) already correct. "
                f"{skipped_non_old_world} non-Old-World row(s) skipped."
            )
            print("Re-run with --apply to persist changes.")

        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write changes. Without this flag, runs in dry-run mode.",
    )
    args = parser.parse_args()
    sys.exit(run(apply=args.apply))
