"""
Seed pet-roach species into `invert_species` (taxon='roach').

Run with: python3 seed_roach_species.py  (idempotent — skips existing)

Honesty notes
-------------
* Roaches (Blattodea) are OMNIVORES — feeding_mode='omnivore'. They eat
  dry roach chow / grain + fresh produce + a protein source; no live
  prey, so they get NO predatory feeding-cadence nudges.
* All harmless: no venom, no bite of concern. venom_severity left None.
* Dubia (Blaptica dubia) is also THE staple feeder insect. This seeds it
  as a keepable display/colony species; the feeder-colony system stays
  separate (a planned rework — intentionally not entangled here).
* Hissers (Gromphadorhina portentosa) hiss by forcing air through
  abdominal spiracles — a display behavior, not distress only.
* Climbing: glossy-walled species (hissers, dominos) climb smooth
  surfaces and need a secure / vaselined-rim lid; dubia largely cannot
  climb smooth plastic. Noted per species.
* Only fields we're confident about are populated; uncertain numerics
  are left null rather than fabricated.
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
        "taxon": "roach",
        "scientific_name": "Gromphadorhina portentosa",
        "common_names": ["Madagascar Hissing Cockroach", "Hisser"],
        "genus": "Gromphadorhina", "family": "Blaberidae", "order_name": "Blattodea",
        "care_level": "beginner", "temperament": "docile, handleable",
        "native_region": "Madagascar",
        "adult_size": "2-3 inches", "growth_rate": "medium", "type": "terrestrial",
        "temperature_min": 75, "temperature_max": 90, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10-gallon for a small colony", "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber; provide egg-crate / cork hides for vertical surface",
        "feeding_mode": "omnivore", "prey_size": "n/a (omnivore)",
        "feeding_frequency_adult": "dry roach chow + fresh produce 2-3x/week; water crystals or gel",
        "water_dish_required": False, "communal_suitable": True,
        "care_guide": (
            "The classic pet roach — large, slow, docile, and handleable, which makes "
            "hissers a popular first invertebrate and a school/education favorite. Keep "
            "a colony warm (75-90 F) with coco-fiber substrate and plenty of stacked "
            "egg-crate or cork hides. They are OMNIVORES: dry roach chow or grain-based "
            "feed plus fresh vegetables and fruit, with a protein source occasionally; "
            "hydrate with water crystals rather than an open dish. IMPORTANT: hissers "
            "climb smooth glass and plastic easily — use a tight lid, and a band of "
            "petroleum jelly around the rim is the standard escape-proofing. They are "
            "harmless: no bite, no venom. The trademark hiss is made by forcing air "
            "through abdominal spiracles, used in courtship and when disturbed. Females "
            "are ovoviviparous (carry eggs internally, give live birth to nymphs)."
        ),
    },
    {
        "taxon": "roach",
        "scientific_name": "Blaptica dubia",
        "common_names": ["Dubia Roach", "Orange-Spotted Roach", "Guyana Spotted Roach"],
        "genus": "Blaptica", "family": "Blaberidae", "order_name": "Blattodea",
        "care_level": "beginner", "temperament": "docile, slow",
        "native_region": "Central & South America",
        "adult_size": "1.5-1.8 inches", "growth_rate": "medium", "type": "terrestrial",
        "temperature_min": 80, "temperature_max": 95, "humidity_min": 40, "humidity_max": 60,
        "enclosure_size_adult": "bin sized to colony; vertical egg-crate stacks",
        "substrate_depth": "bare-bottom or thin coco fiber",
        "substrate_type": "bare-bottom (easiest for colonies) or thin coco fiber; egg-crate hides",
        "feeding_mode": "omnivore", "prey_size": "n/a (omnivore)",
        "feeding_frequency_adult": "roach chow / grain + produce; water crystals or gel",
        "water_dish_required": False, "communal_suitable": True,
        "care_guide": (
            "Dubia are the staple feeder insect of the hobby — but they're also a clean, "
            "odorless, easy display colony in their own right. They CANNOT climb smooth "
            "vertical surfaces and rarely fly, so a smooth-walled bin needs no lid "
            "treatment, which makes them far easier to contain than hissers. Keep warm "
            "(80-95 F drives breeding) with stacked egg-crate for surface area; "
            "bare-bottom bins are easiest to clean. OMNIVORES: dry roach chow or grain "
            "feed plus fresh produce, hydrated with water crystals. Females are "
            "ovoviviparous. Harmless. (If you keep a feeder colony, the colony tooling "
            "lives in the feeder system — this entry is for tracking dubia as kept "
            "animals.)"
        ),
    },
    {
        "taxon": "roach",
        "scientific_name": "Therea petiveriana",
        "common_names": ["Domino Roach", "Seven-Spotted Roach", "Indian Domino Cockroach"],
        "genus": "Therea", "family": "Corydiidae", "order_name": "Blattodea",
        "care_level": "intermediate", "temperament": "active, skittish",
        "native_region": "Southern India",
        "adult_size": "0.9-1 inch", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 75, "temperature_max": 88, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "small bin for a colony", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber / sand mix — nymphs burrow and need depth",
        "feeding_mode": "omnivore", "prey_size": "n/a (omnivore)",
        "feeding_frequency_adult": "roach chow + produce; light moisture gradient",
        "water_dish_required": False, "communal_suitable": True,
        "care_guide": (
            "A striking black-and-white display roach — bold domino markings make it one "
            "of the most popular ornamental species. Nymphs are fossorial and burrow, so "
            "give a few inches of coco/sand substrate; adults are active surface runners. "
            "Slower to breed than dubia and a bit more demanding on substrate depth and a "
            "moisture gradient, hence intermediate. OMNIVORE feeding (chow + produce). "
            "Adults can climb but are typically kept in bins with a secure lid. Harmless."
        ),
    },
    {
        "taxon": "roach",
        "scientific_name": "Therea olegrandjeani",
        "common_names": ["Question Mark Roach", "Six-Spotted Roach"],
        "genus": "Therea", "family": "Corydiidae", "order_name": "Blattodea",
        "care_level": "intermediate", "temperament": "active, skittish",
        "native_region": "Southern India",
        "adult_size": "0.8-1 inch", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 75, "temperature_max": 88, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "small bin for a colony", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber / sand mix; nymphs burrow",
        "feeding_mode": "omnivore", "prey_size": "n/a (omnivore)",
        "feeding_frequency_adult": "roach chow + produce; light moisture gradient",
        "water_dish_required": False, "communal_suitable": True,
        "care_guide": (
            "A close cousin of the domino roach with a bold question-mark / comma pattern "
            "on the pronotum — another prized ornamental display species. Care is "
            "effectively identical to the domino: burrowing fossorial nymphs need a few "
            "inches of coco/sand substrate, adults are fast surface runners, and the "
            "colony breeds slowly. OMNIVORE feeding (chow + produce). Harmless."
        ),
    },
    {
        "taxon": "roach",
        "scientific_name": "Lucihormetica subcincta",
        "common_names": ["Glowspot Roach", "Banded Glowspot Roach"],
        "genus": "Lucihormetica", "family": "Blaberidae", "order_name": "Blattodea",
        "care_level": "intermediate", "temperament": "docile",
        "native_region": "South America",
        "adult_size": "1.2-1.5 inches", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 78, "temperature_max": 90, "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "small bin for a colony", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber with rotting wood / bark hides; kept humid",
        "feeding_mode": "omnivore", "prey_size": "n/a (omnivore)",
        "feeding_frequency_adult": "roach chow + produce + decaying wood; keep humid",
        "water_dish_required": False, "communal_suitable": True,
        "care_guide": (
            "A chunky, popular display roach named for the pair of yellow 'headlight' "
            "spots on the male's pronotum. (Despite older claims, the spots are "
            "reflective coloration, not true bioluminescence.) Keep warmer and more "
            "humid than dominos, with rotting wood and bark hides they'll feed on "
            "alongside roach chow and produce — OMNIVORE. Slow to mature; a calm, "
            "rewarding colony. Harmless."
        ),
    },
]


def seed():
    db = SessionLocal()
    try:
        added = 0
        skipped = 0
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
            species = InvertSpecies(
                id=uuid.uuid4(),
                taxon=taxon,
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **row,
            )
            db.add(species)
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
