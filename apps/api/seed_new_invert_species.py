"""
Seed species for the ADR-006 expansion taxa — vinegaroon, true spider,
millipede, mantis. Writes into `invert_species` with the right taxon.

Run with: python3 seed_new_invert_species.py  (idempotent — skips existing)

Honesty notes
-------------
* Vinegaroons (Thelyphonida): NO venom, NO sting. They spray a mostly-acetic-
  acid defensive mist (hence "vinegaroon") — harmless. venom_severity=None.
* True spiders (Araneae): the hobby-common species here are not dangerous;
  bites are comparable to a bee sting at worst. We do NOT seed widows /
  recluses. venom_severity is left None or 'mild'.
* Millipedes (Diplopoda): DETRITIVORES — feeding_mode='detritivore'. They eat
  decaying leaf litter / wood + calcium, never live prey. Harmless (some
  secrete benzoquinones — wash hands; don't handle near eyes).
* Mantises (Mantodea): insects, predators, arboreal, short-lived (~1 yr).
  Harmless to humans.
* Only fields we're confident about are populated; uncertain numerics are
  left null rather than fabricated.
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
    # ─── Vinegaroons (harmless, fossorial) ────────────────────────────
    {
        "taxon": "vinegaroon",
        "scientific_name": "Mastigoproctus giganteus",
        "common_names": ["Giant Vinegaroon", "Giant Whip Scorpion"],
        "genus": "Mastigoproctus", "family": "Thelyphonidae", "order_name": "Thelyphonida",
        "care_level": "beginner", "temperament": "docile", "native_region": "Southern USA, Mexico",
        "adult_size": "2.5-3 inches (body)", "growth_rate": "slow", "type": "fossorial",
        "temperature_min": 75, "temperature_max": 85, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": '10x10x8 inches', "substrate_depth": "4-6 inches",
        "substrate_type": "coco fiber / topsoil / sand mix, kept moist below the surface",
        "feeding_mode": "predator", "prey_size": "crickets, roaches",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "burrowing": "heavy", "communal_suitable": False,
        "care_guide": (
            "A hardy, beginner-friendly arachnid that needs deep, moist substrate to "
            "burrow. Vinegaroons have NO venom and NO sting — when threatened they "
            "spray a fine mist that is mostly acetic acid (vinegar), which is harmless "
            "but can sting the eyes. Keep singly; provide a water dish and a humid "
            "burrow."
        ),
    },
    # ─── True spiders (Araneae) ───────────────────────────────────────
    {
        "taxon": "true_spider",
        "scientific_name": "Phidippus regius",
        "common_names": ["Regal Jumping Spider"],
        "genus": "Phidippus", "family": "Salticidae", "order_name": "Araneae",
        "care_level": "beginner", "temperament": "curious, bold", "native_region": "Southeastern USA",
        "adult_size": "0.6-0.9 inch body", "growth_rate": "fast", "type": "arboreal",
        "temperature_min": 70, "temperature_max": 80, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": '4x4x6 inches (vertical)', "substrate_depth": "1 inch",
        "substrate_type": "coco fiber, lightly moist one side",
        "feeding_mode": "predator", "prey_size": "small crickets, flightless fruit flies, BB roaches",
        "feeding_frequency_adult": "2-3 prey per week", "water_dish_required": False,
        "webbing_amount": "retreat webbing only", "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Bites are rare and comparable to a minor bee sting; not dangerous.",
        "care_guide": (
            "The most popular pet jumping spider — visual, intelligent, and easy. Needs "
            "a tall enclosure with cross-ventilation, daily light mist on one side, and "
            "appropriately tiny prey. Not dangerous; bites are rare and trivial."
        ),
    },
    {
        "taxon": "true_spider",
        "scientific_name": "Heteropoda venatoria",
        "common_names": ["Huntsman Spider"],
        "genus": "Heteropoda", "family": "Sparassidae", "order_name": "Araneae",
        "care_level": "intermediate", "temperament": "fast, skittish", "native_region": "Pantropical",
        "adult_size": "3-5 inch legspan", "growth_rate": "medium", "type": "arboreal",
        "temperature_min": 75, "temperature_max": 85, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": '8x8x10 inches', "substrate_depth": "2 inches",
        "substrate_type": "coco fiber, moist", "feeding_mode": "predator",
        "prey_size": "crickets, roaches", "feeding_frequency_adult": "2 prey per week",
        "water_dish_required": True, "venom_severity": "mild",
        "venom_notes": "Bites cause local pain/swelling but are not medically significant.",
        "care_guide": (
            "A large, extremely fast flattened spider that lives on vertical surfaces. "
            "Secure the lid — they're escape artists. Venom is mild (local pain only)."
        ),
    },
    # ─── Millipedes (DETRITIVORE, harmless) ───────────────────────────
    {
        "taxon": "millipede",
        "scientific_name": "Archispirostreptus gigas",
        "common_names": ["Giant African Millipede"],
        "genus": "Archispirostreptus", "family": "Spirostreptidae", "order_name": "Spirostreptida",
        "care_level": "beginner", "temperament": "docile", "native_region": "East Africa",
        "adult_size": "8-11 inches", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 72, "temperature_max": 82, "humidity_min": 75, "humidity_max": 85,
        "enclosure_size_adult": '18x12x12 inches', "substrate_depth": "6+ inches",
        "substrate_type": "deep hardwood-leaf / coco / rotting wood mix; the substrate IS the food",
        "feeding_mode": "detritivore", "prey_size": "n/a (detritivore)",
        "feeding_frequency_adult": "continuous — supplement with veg + calcium (cuttlebone)",
        "water_dish_required": False, "burrowing": "heavy", "communal_suitable": True,
        "care_guide": (
            "The classic giant pet millipede — peaceful, long-lived, and communal. As a "
            "DETRITIVORE it eats decaying hardwood leaf litter and rotting wood (the "
            "substrate is its diet), supplemented with vegetables and a calcium source. "
            "No live prey. Harmless, though it can secrete a brown benzoquinone fluid "
            "when stressed — wash hands after handling."
        ),
    },
    {
        "taxon": "millipede",
        "scientific_name": "Narceus americanus",
        "common_names": ["American Giant Millipede"],
        "genus": "Narceus", "family": "Spirobolidae", "order_name": "Spirobolida",
        "care_level": "beginner", "temperament": "docile", "native_region": "Eastern USA",
        "adult_size": "4-5 inches", "growth_rate": "slow", "type": "terrestrial",
        "temperature_min": 68, "temperature_max": 78, "humidity_min": 70, "humidity_max": 85,
        "enclosure_size_adult": '12x8x8 inches', "substrate_depth": "4-6 inches",
        "substrate_type": "hardwood leaf litter + rotting wood + coco",
        "feeding_mode": "detritivore", "prey_size": "n/a (detritivore)",
        "feeding_frequency_adult": "continuous — leaf litter + veg + calcium",
        "water_dish_required": False, "burrowing": "heavy", "communal_suitable": True,
        "care_guide": (
            "A great native beginner millipede. Same detritivore care as other giants — "
            "deep moist hardwood substrate it can eat, plus calcium. Harmless."
        ),
    },
    # ─── Mantises (predator, arboreal, short-lived) ───────────────────
    {
        "taxon": "mantis",
        "scientific_name": "Hierodula membranacea",
        "common_names": ["Giant Asian Mantis"],
        "genus": "Hierodula", "family": "Mantidae", "order_name": "Mantodea",
        "care_level": "beginner", "temperament": "bold", "native_region": "South & Southeast Asia",
        "adult_size": "3-4 inches", "growth_rate": "fast", "type": "arboreal",
        "temperature_min": 72, "temperature_max": 86, "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": '8x8x12 inches (height = 3x body length)', "substrate_depth": "1-2 inches",
        "substrate_type": "coco fiber, light mist", "feeding_mode": "predator",
        "prey_size": "appropriately sized flies, crickets, roaches",
        "feeding_frequency_adult": "every 2-3 days", "water_dish_required": False,
        "communal_suitable": False,
        "care_guide": (
            "A large, hardy beginner mantis. Enclosure height must be at least 3x the "
            "mantis's body length so it can molt hanging upside down. Feed live prey no "
            "bigger than its head; mist lightly. Solitary and cannibalistic. Harmless to "
            "humans; adults live roughly a year."
        ),
    },
    {
        "taxon": "mantis",
        "scientific_name": "Phyllocrania paradoxa",
        "common_names": ["Ghost Mantis"],
        "genus": "Phyllocrania", "family": "Empusidae", "order_name": "Mantodea",
        "care_level": "beginner", "temperament": "shy", "native_region": "Africa, Madagascar",
        "adult_size": "1.8-2 inches", "growth_rate": "medium", "type": "arboreal",
        "temperature_min": 72, "temperature_max": 85, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": '5x5x8 inches', "substrate_depth": "1 inch",
        "substrate_type": "coco fiber, light mist", "feeding_mode": "predator",
        "prey_size": "fruit flies (nymphs) to small flies/crickets (adults)",
        "feeding_frequency_adult": "every 2-3 days", "water_dish_required": False,
        "communal_suitable": True,
        "care_guide": (
            "A small, leaf-mimicking mantis and a favorite first species — uniquely "
            "tolerant of light communal keeping when well-fed. Otherwise standard mantis "
            "care: tall enclosure, light misting, appropriately small live prey."
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
            if db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first():
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
