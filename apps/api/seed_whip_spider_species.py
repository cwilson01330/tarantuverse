"""
Seed whip spider (Amblypygi) species — initial catalog for ADR-006 taxon #1.

Run with: python3 seed_whip_spider_species.py

Writes directly into `invert_species` with `taxon='whip_spider'` — whip
spiders have no legacy per-taxon table (the centipede pattern).

Honesty notes
-------------
* Whip spiders have NO venom and NO sting. They are completely harmless
  to humans — the pedipalps can deliver a harmless pinch, nothing more.
  So `venom_severity` is None, `medically_significant_venom` is False,
  and `urticating_hairs` is False for every species. The care_guide says
  so plainly rather than leaving keepers to wonder.
* `feeding_mode` is 'predator' for all — they take live prey (crickets,
  roaches, the occasional moth).
* `type` is 'arboreal'. Amblypygids are dorso-ventrally flattened and
  live pressed against vertical surfaces; enclosures need HEIGHT and
  cork bark / vertical cover far more than floor space.
* `communal_suitable` is True for the Damon / Phrynus species commonly
  kept in groups, and False for Heterophrynus (large, best solo). This
  reflects mainstream keeper practice, not a guarantee — communal setups
  still need space and feeding management.
* `webbing_amount` / `burrowing` are left None — whip spiders neither
  web nor burrow.
* `image_url` is None — care-sheet images flow through the shared image
  attribution pipeline.
"""

import os
import re
import sys
import uuid

# Make `app.*` importable when running this from apps/api/
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(scientific_name: str) -> str:
    s = scientific_name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


_HARMLESS = (
    "Whip spiders have no venom and no sting and are harmless to humans; "
    "they are fast and may startle, but cannot hurt you."
)

SPECIES_DATA = [
    {
        "scientific_name": "Damon diadema",
        "common_names": ["Tanzanian Giant Tailless Whip Scorpion", "Crowned Whip Spider"],
        "genus": "Damon",
        "family": "Phrynichidae",
        "order_name": "Amblypygi",
        "care_level": "beginner",
        "temperament": "docile, fast",
        "native_region": "East Africa (Tanzania, Kenya)",
        "adult_size": "7-8 inch legspan",
        "adult_length_min_mm": 150,
        "adult_length_max_mm": 200,
        "growth_rate": "medium",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": '6x6x8 inches',
        "enclosure_size_juvenile": '8x8x12 inches',
        "enclosure_size_adult": '12x12x18 inches (vertical)',
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber / topsoil mix, kept lightly moist",
        "feeding_mode": "predator",
        "prey_size": "appropriately sized crickets or roaches",
        "feeding_frequency_sling": "2-3 small prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "2-3 prey per week",
        "water_dish_required": True,
        "communal_suitable": True,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "The classic beginner whip spider: hardy, docile, and famously "
            "communal — groups cohabit peacefully with enough vertical cork "
            "bark and regular feeding. Provide a tall enclosure, moderate "
            "humidity, and plenty of vertical surfaces. " + _HARMLESS
        ),
    },
    {
        "scientific_name": "Damon medius",
        "common_names": ["West African Giant Whip Spider"],
        "genus": "Damon",
        "family": "Phrynichidae",
        "order_name": "Amblypygi",
        "care_level": "beginner",
        "temperament": "docile, fast",
        "native_region": "West Africa",
        "adult_size": "7-9 inch legspan",
        "adult_length_min_mm": 160,
        "adult_length_max_mm": 230,
        "growth_rate": "medium",
        "type": "arboreal",
        "temperature_min": 73,
        "temperature_max": 83,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_sling": '6x6x8 inches',
        "enclosure_size_juvenile": '8x8x12 inches',
        "enclosure_size_adult": '12x12x18 inches (vertical)',
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber / topsoil, lightly moist",
        "feeding_mode": "predator",
        "prey_size": "crickets, roaches",
        "feeding_frequency_sling": "2-3 small prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "2-3 prey per week",
        "water_dish_required": True,
        "communal_suitable": True,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "Very similar to D. diadema and equally beginner-friendly. Large, "
            "calm, and communal with adequate space and cover. " + _HARMLESS
        ),
    },
    {
        "scientific_name": "Damon variegatus",
        "common_names": ["Common Tailless Whip Scorpion", "Striped Whip Spider"],
        "genus": "Damon",
        "family": "Phrynichidae",
        "order_name": "Amblypygi",
        "care_level": "beginner",
        "temperament": "docile, fast",
        "native_region": "East and Southern Africa",
        "adult_size": "5-7 inch legspan",
        "adult_length_min_mm": 120,
        "adult_length_max_mm": 180,
        "growth_rate": "medium",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 65,
        "humidity_max": 80,
        "enclosure_size_sling": '6x6x8 inches',
        "enclosure_size_juvenile": '8x8x10 inches',
        "enclosure_size_adult": '10x10x16 inches (vertical)',
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber / topsoil, lightly moist",
        "feeding_mode": "predator",
        "prey_size": "crickets, roaches",
        "feeding_frequency_sling": "2-3 small prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "2 prey per week",
        "water_dish_required": True,
        "communal_suitable": True,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "A smaller, tolerant Damon that does well in communal groups. "
            "Slightly more forgiving of lower humidity than its larger "
            "cousins. " + _HARMLESS
        ),
    },
    {
        "scientific_name": "Phrynus marginemaculatus",
        "common_names": ["Florida Tailless Whip Scorpion"],
        "genus": "Phrynus",
        "family": "Phrynidae",
        "order_name": "Amblypygi",
        "care_level": "beginner",
        "temperament": "shy, fast",
        "native_region": "Florida (USA), Caribbean",
        "adult_size": "2-3 inch legspan",
        "adult_length_min_mm": 40,
        "adult_length_max_mm": 70,
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 84,
        "humidity_min": 65,
        "humidity_max": 80,
        "enclosure_size_sling": '4x4x4 inches',
        "enclosure_size_juvenile": '5x5x6 inches',
        "enclosure_size_adult": '6x6x8 inches',
        "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber, lightly moist",
        "feeding_mode": "predator",
        "prey_size": "small crickets, flightless fruit flies, pinhead roaches",
        "feeding_frequency_sling": "2-3 small prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "2 prey per week",
        "water_dish_required": True,
        "communal_suitable": True,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "A small, US-native whip spider and an excellent first amblypygid "
            "— easy to house, breeds readily, and tolerant of communal "
            "keeping. Stays small, so a modest vertical enclosure works. "
            + _HARMLESS
        ),
    },
    {
        "scientific_name": "Heterophrynus batesii",
        "common_names": ["Amazonian Giant Whip Spider"],
        "genus": "Heterophrynus",
        "family": "Phrynidae",
        "order_name": "Amblypygi",
        "care_level": "intermediate",
        "temperament": "skittish, very fast",
        "native_region": "Amazon Basin (South America)",
        "adult_size": "9-11 inch legspan",
        "adult_length_min_mm": 200,
        "adult_length_max_mm": 280,
        "growth_rate": "medium",
        "type": "arboreal",
        "temperature_min": 74,
        "temperature_max": 84,
        "humidity_min": 75,
        "humidity_max": 90,
        "enclosure_size_sling": '8x8x10 inches',
        "enclosure_size_juvenile": '10x10x14 inches',
        "enclosure_size_adult": '14x14x20 inches (vertical)',
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber / sphagnum, kept moist",
        "feeding_mode": "predator",
        "prey_size": "large crickets, roaches",
        "feeding_frequency_sling": "2 prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "1-2 prey per week",
        "water_dish_required": True,
        "communal_suitable": False,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "One of the largest whip spiders in the hobby and a stunning "
            "display animal. Needs high humidity and a tall, well-ventilated "
            "enclosure. Best kept singly — large Heterophrynus are less "
            "reliably communal than Damon. " + _HARMLESS
        ),
    },
    {
        "scientific_name": "Euphrynichus bacillifer",
        "common_names": ["Whirligig Whip Spider"],
        "genus": "Euphrynichus",
        "family": "Phrynichidae",
        "order_name": "Amblypygi",
        "care_level": "intermediate",
        "temperament": "skittish, fast",
        "native_region": "East Africa",
        "adult_size": "5-7 inch legspan",
        "adult_length_min_mm": 120,
        "adult_length_max_mm": 170,
        "growth_rate": "medium",
        "type": "arboreal",
        "temperature_min": 73,
        "temperature_max": 83,
        "humidity_min": 65,
        "humidity_max": 80,
        "enclosure_size_sling": '6x6x8 inches',
        "enclosure_size_juvenile": '8x8x10 inches',
        "enclosure_size_adult": '10x10x16 inches (vertical)',
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber / topsoil, lightly moist",
        "feeding_mode": "predator",
        "prey_size": "crickets, roaches",
        "feeding_frequency_sling": "2-3 small prey per week",
        "feeding_frequency_juvenile": "2 prey per week",
        "feeding_frequency_adult": "2 prey per week",
        "water_dish_required": True,
        "communal_suitable": True,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "care_guide": (
            "A striking patterned whip spider with ornate pedipalps. Slightly "
            "more humidity-sensitive than Damon but otherwise straightforward; "
            "tolerates communal keeping with space. " + _HARMLESS
        ),
    },
]


def seed():
    db = SessionLocal()
    try:
        before = db.query(InvertSpecies).filter(
            InvertSpecies.taxon == "whip_spider"
        ).count()
        print(f"Starting whip spider species count: {before}")

        added = 0
        skipped = 0

        for data in SPECIES_DATA:
            name = data["scientific_name"]
            existing = db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first()

            if existing:
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue

            species = InvertSpecies(
                id=uuid.uuid4(),
                taxon="whip_spider",
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **data,
            )
            db.add(species)
            added += 1
            print(f"  Added: {name}")

        db.commit()
        after = db.query(InvertSpecies).filter(
            InvertSpecies.taxon == "whip_spider"
        ).count()
        print(f"\nDone. Added {added}, skipped {skipped}. Total whip spiders now: {after}")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
