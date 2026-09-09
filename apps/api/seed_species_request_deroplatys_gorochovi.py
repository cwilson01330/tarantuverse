"""
Seed Deroplatys gorochovi (Vietnam Dead Leaf Mantis) into `invert_species`.

Run with: python3 seed_species_request_deroplatys_gorochovi.py  (idempotent)

Requested by a keeper through in-app support 2026-09-09.

The catalog already holds three congeners — D. desiccata, D. lobata and
D. truncata — so the husbandry here is genus-level care that those entries
already carry, not fresh claims: tall well-ventilated enclosure, warm and
fairly humid, daily light misting, flying prey, housed individually.

WHAT IS DELIBERATELY ABSENT
---------------------------
`adult_size` is left NULL. D. gorochovi is described in the hobby as one of the
smaller Deroplatys, but the size figures in circulation disagree with each
other and I could not find one worth publishing as fact. A blank field reads as
"we don't know", which is true; a plausible-looking number would not be. The
care guide says the same thing in words. Fill it in when someone who keeps the
species can confirm it — that is a better source than another care sheet.

The genus was moved to Deroplatyidae in more recent classifications, but the
three existing Deroplatys rows all record family='Mantidae'. This row matches
them so the catalog stays internally consistent; correcting all four is a
separate, deliberate change rather than something to do halfway here.
"""
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


SPECIES_DATA = [
    {
        "taxon": "mantis",
        "scientific_name": "Deroplatys gorochovi",
        "common_names": ["Vietnam Dead Leaf Mantis", "Vietnamese Dead Leaf Mantis"],
        "genus": "Deroplatys", "family": "Mantidae", "order_name": "Mantodea",
        "care_level": "intermediate",
        "temperament": "sedentary, cryptic dead-leaf mimic; startle display",
        "native_region": "Vietnam and neighbouring Southeast Asia",
        # adult_size intentionally omitted — see module docstring.
        "growth_rate": "medium", "type": "arboreal", "burrowing": "none",
        "temperature_min": 68, "temperature_max": 86,
        "humidity_min": 60, "humidity_max": 80,
        "enclosure_size_adult": "≥3x body length tall, 2x wide; well-ventilated",
        "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber or paper towel; light misting for humidity/drinking",
        "feeding_mode": "predator",
        "prey_size": "flies, crickets, roaches",
        "feeding_frequency_adult": "every 2-3 days",
        "water_dish_required": False,
        "communal_suitable": False,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "venom_severity": None,
        "care_guide": (
            "A dead-leaf mantis from Vietnam, and one of the less commonly kept "
            "members of the genus — expect less information about it than about "
            "D. desiccata, and treat confident numbers from other sources with some "
            "suspicion. It is reported to be smaller than D. desiccata, but the "
            "figures in circulation disagree enough that no adult size is recorded "
            "here rather than publishing a guess. "
            "Care follows the rest of the genus. Keep warm — around 77-86°F, cooler "
            "at night, which lengthens adult life — and fairly humid at roughly 75%, "
            "with light daily misting. The broad shield behind the head makes a dry "
            "molt genuinely risky, so humidity matters more here than for most "
            "mantids, and it must be paired with real ventilation rather than a "
            "sealed damp box. Height is the thing that matters in an enclosure: at "
            "least three times body length tall so the mantis can hang clear of the "
            "floor to molt, with sturdy branches or mesh to grip. "
            "A patient ambush predator that prefers flying prey — flies are ideal, "
            "with crickets and small roaches accepted. Mantids drink from misted "
            "droplets rather than a dish. Housed individually: like the rest of the "
            "genus this species is not communal and will cannibalise. Harmless to "
            "humans; the raised-arm display is a bluff."
        ),
    },
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(),
                taxon=taxon,
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **row,
            ))
            added += 1
            print(f"  Added [{taxon}]: {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
