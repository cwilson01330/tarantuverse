"""
Species DB expansion — BATCH 1 (research-backed, cited).

Spread across under-populated non-tarantula taxa (clean single-table inserts
into `invert_species`; tarantulas are a separate batch because they also need
the legacy `species` mirror that the web care guides read).

Honesty-first: every row carries a `source_url` to the care reference used.
Numerics we couldn't confirm from a reputable source are left null rather than
fabricated — these are live-animal husbandry values. Ranges are conservative
consensus values across multiple keeper care sheets (see source_url + the
secondary sources cited in the PR notes).

Run with: python3 seed_species_expansion_batch1.py   (idempotent — skips existing)
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
    # ─── Mantises ─────────────────────────────────────────────────────
    {
        "taxon": "mantis",
        "scientific_name": "Sphodromantis lineola",
        "common_names": ["Giant African Mantis", "African Lined Mantis"],
        "genus": "Sphodromantis", "family": "Mantidae", "order_name": "Mantodea",
        "care_level": "beginner", "temperament": "bold", "native_region": "West & Central Africa",
        "adult_size": "3-4 inches", "growth_rate": "fast", "type": "arboreal",
        "temperature_min": 75, "temperature_max": 86, "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "6x6x10 inches (height = 3x body length)", "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber, light mist", "feeding_mode": "predator",
        "prey_size": "crickets, roaches, flies, locusts", "feeding_frequency_adult": "every 2-3 days",
        "water_dish_required": False, "communal_suitable": False,
        "care_guide": (
            "A large, hardy beginner mantis. Enclosure height must be at least 3x the "
            "mantis's body length so it can molt hanging upside down. Daytime 75-86F, "
            "cooler at night (not below ~63F). Mist lightly daily for drinking water and "
            "50-70% humidity. Feed live prey no larger than its head; solitary and "
            "cannibalistic. Harmless to humans; adults live roughly 6-9 months."
        ),
        "source_url": "https://www.keepinginsects.com/praying-mantis/species/african-mantis/",
    },
    {
        "taxon": "mantis",
        "scientific_name": "Deroplatys desiccata",
        "common_names": ["Giant Dead Leaf Mantis"],
        "genus": "Deroplatys", "family": "Deroplatyidae", "order_name": "Mantodea",
        "care_level": "beginner", "temperament": "shy, threat-display when disturbed",
        "native_region": "Southeast Asia (Malaysia, Borneo, Sumatra)",
        "adult_size": "3-3.5 inches", "growth_rate": "medium", "type": "arboreal",
        "temperature_min": 75, "temperature_max": 86, "humidity_min": 60, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (tall)", "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber, mist daily", "feeding_mode": "predator",
        "prey_size": "flies, crickets, roaches", "feeding_frequency_adult": "every 2-3 days",
        "water_dish_required": False, "communal_suitable": False,
        "care_guide": (
            "A superb leaf-mimic and a keeper favorite. Care is standard mantis care with "
            "a touch more humidity (60-80%) — keep it on the higher end around molts, since "
            "this species is prone to stuck molts when too dry. Tall enclosure (3x body "
            "length), light daily misting, appropriately sized live prey. Harmless to humans."
        ),
        "source_url": "https://www.keepinginsects.com/praying-mantis/species/dead-leaf-mantis/",
    },
    # ─── Roaches ──────────────────────────────────────────────────────
    {
        "taxon": "roach",
        "scientific_name": "Eublaberus posticus",
        "common_names": ["Orange Head Roach", "Orangehead Cockroach"],
        "genus": "Eublaberus", "family": "Blaberidae", "order_name": "Blattodea",
        "care_level": "beginner", "temperament": "skittish, burrowing", "native_region": "South America",
        "adult_size": "1.5-2 inches", "growth_rate": "fast", "type": "terrestrial",
        "temperature_min": 75, "temperature_max": 90, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": "well-ventilated bin; smooth walls (poor climbers)", "substrate_depth": "2 inches",
        "substrate_type": "coco fiber kept partly moist; egg-crate / bark hides above ground",
        "feeding_mode": "omnivore", "prey_size": "n/a — dry roach chow / grain, fruit & veg",
        "feeding_frequency_adult": "continuous (chow + fresh produce for moisture)",
        "water_dish_required": False, "communal_suitable": True, "burrowing": "moderate",
        "care_guide": (
            "A hardy, fast-breeding species kept both as a feeder and a display colony. "
            "Room temperature is fine; 80-90F speeds breeding. Keep 50%+ humidity with a "
            "moist substrate corner and provide hides. Omnivorous detritivores — feed dry "
            "roach chow plus fruit/veg for moisture; a water dish isn't needed (use produce "
            "or water gel to avoid drowning). Note: can cannibalize if underfed/crowded."
        ),
        "source_url": "https://joshsfrogs.com/care-sheet/orange-head-roach-care-breeding-information",
    },
    # ─── Millipedes (detritivores) ────────────────────────────────────
    {
        "taxon": "millipede",
        "scientific_name": "Chicobolus spinigerus",
        "common_names": ["Florida Ivory Millipede"],
        "genus": "Chicobolus", "family": "Spirobolidae", "order_name": "Spirobolida",
        "care_level": "beginner", "temperament": "docile", "native_region": "Southeastern USA (Florida)",
        "adult_size": "3-4 inches", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 70, "temperature_max": 80, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x8x8 inches", "substrate_depth": "4-6 inches",
        "substrate_type": "decaying hardwood leaf litter + coco coir + sphagnum; add calcium (cuttlebone)",
        "feeding_mode": "detritivore", "prey_size": "n/a (detritivore)",
        "feeding_frequency_adult": "continuous — leaf litter, rotting hardwood, veg + calcium",
        "water_dish_required": False, "communal_suitable": True, "burrowing": "heavy",
        "care_guide": (
            "An easy native beginner millipede. Detritivore — most of its diet IS the "
            "substrate, so give deep (4-6in) moist decaying hardwood leaf litter and rotting "
            "wood, plus a calcium source for the exoskeleton. Keep the substrate moist at the "
            "bottom, surface slightly drier; 70-80% humidity. Harmless, though like many "
            "millipedes it can secrete a defensive fluid — wash hands after handling."
        ),
        "source_url": "https://bantam.earth/ivory-millipede-chicobolus-spinigerus/",
    },
    # ─── True spiders ─────────────────────────────────────────────────
    {
        "taxon": "true_spider",
        "scientific_name": "Phidippus audax",
        "common_names": ["Bold Jumping Spider", "Bold Jumper"],
        "genus": "Phidippus", "family": "Salticidae", "order_name": "Araneae",
        "care_level": "beginner", "temperament": "bold, curious", "native_region": "North America (USA, Canada)",
        "adult_size": "0.5-0.7 inch body", "growth_rate": "fast", "type": "arboreal",
        "temperature_min": 70, "temperature_max": 82, "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "4x4x7 inches (vertical)", "substrate_depth": "1 inch",
        "substrate_type": "coco fiber, lightly moist one side", "feeding_mode": "predator",
        "prey_size": "fruit flies, small crickets, houseflies", "feeding_frequency_adult": "2-3 prey per week",
        "water_dish_required": False, "webbing_amount": "retreat webbing only",
        "communal_suitable": False, "venom_severity": "mild",
        "care_guide": (
            "A charismatic, diurnal jumping spider — it hunts by sight, so give it a daily "
            "light/dark cycle (ambient room light is fine; never direct sun, which overheats "
            "the small enclosure). Vertical setup with a high retreat. 70-82F, 50-70% humidity; "
            "low premolt humidity is the main cause of stuck molts. Bite is harmless to humans "
            "(bee-sting at worst). Don't feed right after a molt."
        ),
        "source_url": "https://exopetguides.com/jumping-spiders/phidippus-audax-care/",
    },
    # ─── Scorpions ────────────────────────────────────────────────────
    {
        "taxon": "scorpion",
        "scientific_name": "Hadogenes troglodytes",
        "common_names": ["Flat Rock Scorpion"],
        "genus": "Hadogenes", "family": "Hormuridae", "order_name": "Scorpiones",
        "care_level": "beginner", "temperament": "docile but fast", "native_region": "Southern Africa",
        "adult_size": "up to 8 inches incl. tail", "growth_rate": "very slow",
        "type": "scansorial", "temperature_min": 65, "temperature_max": 80, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": "14x10x10 inches with stacked flat rocks / crevices", "substrate_depth": "1-2 inches",
        "substrate_type": "sandy/rocky, mostly dry; tightly stacked flat rocks/bark for crevice hides",
        "feeding_mode": "predator", "prey_size": "crickets, roaches",
        "feeding_frequency_adult": "1 prey weekly or less (very slow metabolism)",
        "water_dish_required": True, "communal_suitable": False, "venom_severity": "mild",
        "care_guide": (
            "A flat, crevice-dwelling scorpion that relies on its powerful pincers, not venom "
            "— sting is mild (very high LD50). Extremely slow-growing and long-lived. Provide "
            "stacked flat rocks/bark for tight horizontal crevices, mostly dry sandy substrate, "
            "good ventilation, and 50-60% humidity with a small water dish. Cooler range "
            "(65-80F). A hardy beginner species despite its size."
        ),
        "source_url": "https://aquariumbreeder.com/flat-rock-scorpion-detailed-guide-care-diet-and-breeding/",
    },
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            exists = db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first()
            if exists:
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
                is_verified=True,  # curated, research-backed seed data
                **row,  # includes scientific_name + all care fields
            )
            db.add(species)
            added += 1
            print(f"  Added: {taxon:12s} {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
