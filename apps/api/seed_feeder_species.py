"""
Seed the feeder_species reference table with the v1 list of 11 species.

Run with: python3 seed_feeder_species.py

Idempotent — existing rows (matched by scientific_name_lower) are skipped.
Safe to re-run after adding new entries to FEEDER_SEED.
"""

import sys
import os
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.feeder_species import FeederSpecies


# Care notes are descriptive + practical — no invented stats, no breeding math.
# Temps/humidity are conservative ranges from mainstream keeper references.

FEEDER_SEED = [
    # --------------- CRICKETS ---------------
    {
        "scientific_name": "Acheta domesticus",
        "common_names": ["House cricket", "Brown cricket"],
        "category": "cricket",
        "care_level": "easy",
        "temperature_min": 75,
        "temperature_max": 90,
        "humidity_min": 30,
        "humidity_max": 50,
        "typical_adult_size_mm": 20,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "pinheads"],
        "prey_size_notes": "Pinheads for tiny slings; adults for larger tarantulas. Noisy and smelly; die off quickly if crowded.",
        "care_notes": "Ventilated bin with egg crate hides. Keep dry — too much humidity crashes colonies fast. Offer dry gut-load (chick starter, dry oats) plus fresh veg or water crystals. Remove dead crickets daily.",
    },
    {
        "scientific_name": "Gryllodes sigillatus",
        "common_names": ["Banded cricket", "Tropical house cricket"],
        "category": "cricket",
        "care_level": "easy",
        "temperature_min": 80,
        "temperature_max": 90,
        "humidity_min": 40,
        "humidity_max": 60,
        "typical_adult_size_mm": 18,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "pinheads"],
        "prey_size_notes": "Slightly smaller than A. domesticus at equivalent age; softer body. Less prone to cricket paralysis virus.",
        "care_notes": "Similar keeping to house crickets but prefers warmer, slightly more humid conditions. Generally quieter and less smelly.",
    },

    # --------------- ROACHES ---------------
    {
        "scientific_name": "Blaptica dubia",
        "common_names": ["Dubia roach"],
        "category": "roach",
        "care_level": "easy",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 40,
        "humidity_max": 60,
        "typical_adult_size_mm": 45,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "juveniles", "nymphs"],
        "prey_size_notes": "Nymphs for juvenile tarantulas; adults for large spiders. Soft-bodied and slow — favorite of keepers.",
        "care_notes": "Warm, slightly humid bin with vertical egg crate. Males fly briefly (females wingless). Illegal to keep in Florida and a few other states — check local laws. Gut-load with fresh fruits/veg and dry grain mix.",
    },
    {
        "scientific_name": "Gromphadorhina portentosa",
        "common_names": ["Madagascar hissing cockroach", "Hisser"],
        "category": "roach",
        "care_level": "easy",
        "temperature_min": 75,
        "temperature_max": 90,
        "humidity_min": 60,
        "humidity_max": 75,
        "typical_adult_size_mm": 75,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "nymphs"],
        "prey_size_notes": "Large adults are too big for all but the biggest tarantulas — most keepers offer nymphs as feeders or keep adults as pets.",
        "care_notes": "Humid bin with bark/cork hides. Can climb smooth surfaces — use a tight-sealing lid or petroleum jelly barrier. Live a long time for roaches (2-3 years). Gut-load with fresh produce and dry protein.",
    },
    {
        "scientific_name": "Shelfordella lateralis",
        "common_names": ["Turkestan roach", "Red runner", "Rusty red"],
        "category": "roach",
        "care_level": "moderate",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 30,
        "humidity_max": 50,
        "typical_adult_size_mm": 30,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "nymphs"],
        "prey_size_notes": "Fast, active feeders — great prey response trigger. Nymphs are tiny and good for small slings.",
        "care_notes": "Fast and skittish; escape-prone. Use a deep bin with a smooth upper lip. Prefers dry, warm conditions. Males fly, females flightless. Illegal in Florida.",
    },
    {
        "scientific_name": "Pycnoscelus surinamensis",
        "common_names": ["Surinam roach"],
        "category": "roach",
        "care_level": "moderate",
        "temperature_min": 78,
        "temperature_max": 90,
        "humidity_min": 60,
        "humidity_max": 80,
        "typical_adult_size_mm": 25,
        "supports_life_stages": True,
        "default_life_stages": ["adults", "nymphs"],
        "prey_size_notes": "Parthenogenetic — all females; no males needed for reproduction. Burrowing habit means you'll mostly see them at night.",
        "care_notes": "Needs deep moist substrate (coco fiber works) since they burrow. Can be invasive if released — keep escapes under control. Illegal in several US states.",
    },

    # --------------- LARVAE ---------------
    {
        "scientific_name": "Tenebrio molitor",
        "common_names": ["Mealworm", "Yellow mealworm"],
        "category": "larvae",
        "care_level": "easy",
        "temperature_min": 70,
        "temperature_max": 80,
        "humidity_min": 40,
        "humidity_max": 60,
        "typical_adult_size_mm": 30,
        "supports_life_stages": True,
        "default_life_stages": ["beetles", "worms", "pupae"],
        "prey_size_notes": "Hard chitin — some tarantulas refuse them. Crush the head before offering to prevent substrate burrowing.",
        "care_notes": "Keep in dry oats or wheat bran with a slice of carrot/potato for moisture. Refrigerate to pause growth; room temp to breed. Full life cycle: worm → pupa → beetle → eggs → more worms.",
    },
    {
        "scientific_name": "Zophobas morio",
        "common_names": ["Superworm", "King worm"],
        "category": "larvae",
        "care_level": "easy",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 40,
        "humidity_max": 60,
        "typical_adult_size_mm": 55,
        "supports_life_stages": True,
        "default_life_stages": ["beetles", "worms", "pupae"],
        "prey_size_notes": "Much larger than mealworms; better protein-to-chitin ratio. Strong jaws — crush head before feeding to sensitive spiders.",
        "care_notes": "Keep in dry bran/oats with veg for moisture. Unlike mealworms, larvae don't pupate unless isolated — for pupae, separate individuals into film canisters or egg-crate cells.",
    },
    {
        "scientific_name": "Hermetia illucens",
        "common_names": ["Black soldier fly larvae", "BSFL", "Phoenix worms", "Calci-worms"],
        "category": "larvae",
        "care_level": "moderate",
        "temperature_min": 75,
        "temperature_max": 95,
        "humidity_min": 60,
        "humidity_max": 75,
        "typical_adult_size_mm": 20,
        "supports_life_stages": True,
        "default_life_stages": ["larvae", "pupae"],
        "prey_size_notes": "Naturally high in calcium — less need to dust. Tough skin; some picky spiders refuse.",
        "care_notes": "Sold as larvae; most keepers buy small batches rather than culture (requires warm, humid, ventilated setup + egg-laying medium). Keep cool to slow development.",
    },
    {
        "scientific_name": "Galleria mellonella",
        "common_names": ["Waxworm", "Bee moth larvae"],
        "category": "larvae",
        "care_level": "easy",
        "temperature_min": 60,
        "temperature_max": 75,
        "humidity_min": 40,
        "humidity_max": 60,
        "typical_adult_size_mm": 25,
        "supports_life_stages": True,
        "default_life_stages": ["moths", "worms", "pupae"],
        "prey_size_notes": "Soft-bodied — great for reluctant feeders. Very fatty; treat food, not staple.",
        "care_notes": "Sold in tubs of bran/honey medium. Refrigerate to extend shelf life (do not freeze). Pupate into moths quickly at room temp.",
    },
    {
        "scientific_name": "Bombyx mori",
        "common_names": ["Silkworm"],
        "category": "larvae",
        "care_level": "moderate",
        "temperature_min": 75,
        "temperature_max": 82,
        "humidity_min": 60,
        "humidity_max": 80,
        "typical_adult_size_mm": 50,
        "supports_life_stages": True,
        "default_life_stages": ["moths", "worms", "pupae"],
        "prey_size_notes": "Nutritious, soft-bodied feeder — excellent for convalescing or picky eaters. Size scales with diet.",
        "care_notes": "Only eats mulberry leaves or commercial 'silkworm chow'. Keep on paper towel or food; keep dry (molds easily). Shorter shelf life than mealworms.",
    },
]


def seed() -> None:
    print("Connecting to database...")
    db = SessionLocal()
    added = 0
    skipped = 0
    try:
        existing_count = db.query(FeederSpecies).count()
        print(f"Current feeder_species count: {existing_count}")

        for data in FEEDER_SEED:
            scientific_lower = data["scientific_name"].strip().lower()
            existing = (
                db.query(FeederSpecies)
                .filter(FeederSpecies.scientific_name_lower == scientific_lower)
                .first()
            )
            if existing:
                skipped += 1
                print(f"  Skipped (exists): {data['scientific_name']}")
                continue

            sp = FeederSpecies(
                id=uuid.uuid4(),
                scientific_name=data["scientific_name"].strip(),
                scientific_name_lower=scientific_lower,
                common_names=data.get("common_names"),
                category=data["category"],
                care_level=data.get("care_level"),
                temperature_min=data.get("temperature_min"),
                temperature_max=data.get("temperature_max"),
                humidity_min=data.get("humidity_min"),
                humidity_max=data.get("humidity_max"),
                typical_adult_size_mm=data.get("typical_adult_size_mm"),
                supports_life_stages=data.get("supports_life_stages", False),
                default_life_stages=data.get("default_life_stages"),
                prey_size_notes=data.get("prey_size_notes"),
                care_notes=data.get("care_notes"),
                image_url=data.get("image_url"),
                is_verified=True,
            )
            db.add(sp)
            added += 1
            print(f"  Added: {data['scientific_name']}")

        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
