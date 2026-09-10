"""
Correct the isopod catalog: "Panda King" is a Cubaris, not a Porcellio.

Run with:
    python3 fix_isopod_species_ids.py          # dry run, reports every change
    python3 fix_isopod_species_ids.py --apply  # write

Idempotent. Safe to re-run.

WHAT WENT WRONG
---------------
seed_isopod_springtail_species.py (2026-09-08) listed "Panda King" as a common
name of *Porcellio laevis*, and said so again in the care guide: "Dairy Cow,
Panda King and Milkback are colour morphs of this species."

That is wrong. Panda King is *Cubaris* sp. "Panda King" — a different genus,
different care, and roughly three times the price. The two are both
black-and-white, which is presumably how they got conflated. Caught 2026-09-10
while reviewing a commercial plan that priced Panda King at $35-38 a
ten-count against $12 for Dairy Cow.

This matters more than a typo because the catalog is about to back a
storefront. A care sheet telling a customer their $38 Cubaris is a Porcellio
is the kind of error this hobby notices immediately.

WHAT THIS SCRIPT DOES
---------------------
1. Removes "Panda King" from Porcellio laevis common_names and rewrites the
   sentence in its care guide.
2. Adds Cubaris sp. "Panda King" as its own species.
3. Adds Cubaris murina "Little Sea".

CARE DATA HONESTY
-----------------
Both new entries are genuinely kept species with reasonable published care.
Where the hobby disagrees or the information is thin — precise maturation
times, exact brood sizes — nothing is recorded rather than a plausible number.
Both are undescribed or trade-named Cubaris, so treat confident figures from
any single source with suspicion.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ── 1. The correction ────────────────────────────────────────────────────────

LAEVIS_NAME = "Porcellio laevis"
LAEVIS_CORRECT_COMMON = ["Dairy Cow Isopod", "Milkback"]
LAEVIS_WRONG_SENTENCE = (
    "Dairy Cow, Panda King and Milkback are colour morphs of this species, not "
    "separate species."
)
LAEVIS_RIGHT_SENTENCE = (
    "Dairy Cow and Milkback are colour morphs of this species, not separate "
    "species. Do not confuse it with Cubaris sp. \"Panda King\", which is a "
    "different genus with different care and a much higher price — the two are "
    "both black and white and are regularly mixed up."
)


# ── 2 & 3. The additions ─────────────────────────────────────────────────────

_COMMON = {
    "taxon": "other",
    "order_name": "Isopoda",
    "genus": "Cubaris",
    "family": "Armadillidae",
    "type": "terrestrial",
    "feeding_mode": "detritivore",
    "prey_size": "n/a (detritivore)",
    "water_dish_required": False,
    "communal_suitable": True,
    "venom_severity": None,
    "burrowing": "heavy",
}

NEW_SPECIES = [
    {
        **_COMMON,
        "scientific_name": 'Cubaris sp. "Panda King"',
        "common_names": ["Panda King Isopod", "Panda King"],
        "care_level": "intermediate",
        "temperament": "harmless, secretive",
        "native_region": "Thailand",
        "adult_size": "0.4-0.6 inches",
        "growth_rate": "slow",
        "temperature_min": 70, "temperature_max": 80,
        "humidity_min": 75, "humidity_max": 90,
        "enclosure_size_adult": "small tub; deep substrate matters more than floor space",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber and topsoil over a damp base; limestone essential, leaf litter",
        "feeding_frequency_adult": "leaf litter and rotting wood always available; protein sparingly",
        "care_guide": (
            "Bold black-and-white banding on a burrowing Cubaris, and one of the "
            "more available species in a genus known for being expensive. "
            "NOT the same animal as Porcellio laevis \"Dairy Cow\", which is "
            "also black and white, much cheaper and much faster — the two are "
            "confused constantly, including by sellers. If it is inexpensive "
            "and breeding quickly, it is almost certainly the Porcellio. "
            "Care follows the genus: consistently high humidity with deep "
            "substrate it can burrow through, permanent access to limestone, "
            "and a moisture gradient that never fully dries. It reproduces "
            "slowly and stays buried most of the time, so a healthy colony can "
            "look like an empty tub for months. Resist the urge to dig. "
            "DETRITIVORE — leaf litter and rotting hardwood continuously, "
            "protein sparingly. Harmless."
        ),
    },
    {
        **_COMMON,
        "scientific_name": "Cubaris murina",
        "common_names": ["Little Sea Isopod", "Little Sea"],
        "care_level": "beginner",
        "temperament": "harmless, active",
        "native_region": "Pantropical; widely established",
        "adult_size": "0.3-0.4 inches",
        "growth_rate": "medium",
        "temperature_min": 72, "temperature_max": 82,
        "humidity_min": 75, "humidity_max": 90,
        "enclosure_size_adult": "shoebox tub or larger",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber and topsoil kept damp; limestone, leaf litter",
        "feeding_frequency_adult": "leaf litter always available; protein weekly",
        "care_guide": (
            "The Cubaris most people should start with — faster, cheaper and "
            "far more forgiving than the collector species in the genus, while "
            "still wanting the same warm, humid, limestone-rich setup. That "
            "makes it a genuine working clean-up crew for high-humidity "
            "enclosures rather than a display-only animal. "
            "Keep the substrate damp throughout with a wetter corner, provide "
            "limestone or cuttlebone permanently, and feed leaf litter and "
            "rotting wood continuously with an occasional protein source. "
            "Several colour forms circulate in the trade under this name. They "
            "are morphs of one species, and isolating them takes patience and "
            "separate containers rather than anything clever. "
            "DETRITIVORE, harmless."
        ),
    },
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes")
    args = ap.parse_args()
    db = SessionLocal()
    changed, added, skipped, problems = [], [], [], []

    try:
        # 1. Correct Porcellio laevis.
        laevis = (
            db.query(InvertSpecies)
            .filter(InvertSpecies.scientific_name_lower == LAEVIS_NAME.lower())
            .first()
        )
        if not laevis:
            problems.append(f"{LAEVIS_NAME} not found — was the isopod seed run?")
        else:
            if list(laevis.common_names or []) != LAEVIS_CORRECT_COMMON:
                changed.append(
                    f"{LAEVIS_NAME} common_names {laevis.common_names} -> {LAEVIS_CORRECT_COMMON}"
                )
                if args.apply:
                    laevis.common_names = LAEVIS_CORRECT_COMMON
            guide = laevis.care_guide or ""
            if LAEVIS_WRONG_SENTENCE in guide:
                changed.append(f"{LAEVIS_NAME} care_guide sentence corrected")
                if args.apply:
                    laevis.care_guide = guide.replace(
                        LAEVIS_WRONG_SENTENCE, LAEVIS_RIGHT_SENTENCE
                    )
            elif "Panda King" in guide:
                # Don't guess at a rewrite we can't match exactly.
                problems.append(
                    f"{LAEVIS_NAME} care_guide still mentions Panda King but the "
                    "expected sentence did not match — edit by hand."
                )

        # 2 & 3. Add the two Cubaris.
        for data in NEW_SPECIES:
            name = data["scientific_name"]
            if (
                db.query(InvertSpecies)
                .filter(InvertSpecies.scientific_name_lower == name.lower())
                .first()
            ):
                skipped.append(name)
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            added.append(name)
            if args.apply:
                db.add(
                    InvertSpecies(
                        id=uuid.uuid4(),
                        taxon=taxon,
                        scientific_name_lower=name.lower(),
                        slug=_slugify(name),
                        **row,
                    )
                )

        if args.apply:
            db.commit()

        print("APPLIED" if args.apply else "DRY RUN")
        for label, items in (
            ("corrected", changed),
            ("added", added),
            ("already present", skipped),
        ):
            print(f"  {label}: {len(items)}")
            for i in items:
                print(f"      {i}")
        if problems:
            print(f"  NEEDS ATTENTION: {len(problems)}")
            for p in problems:
                print(f"      ! {p}")
        return 1 if problems else 0
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
