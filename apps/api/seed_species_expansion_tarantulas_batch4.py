"""
Species DB expansion — TARANTULAS, batch 4 (research-backed, cited).
Self-sourced spread across beginner -> advanced and NW/OW.

Dual-table pattern (species + invert_species mirror, shared id), as batches 1-3.

Honesty notes:
* Grammostola quirogai is the species long sold in the hobby as "G. pulchra"
  (Uruguayan/Brazilian Black) — kept distinct here with that noted.
* Old World fossorials/arboreals (hainanus, nigerrimum, junodi) have NO
  urticating hairs and potent venom -> medically_significant_venom=True.
* Bonnetina cyaneifemur: species-specific care literature is thin; values are
  standard, well-established Bonnetina dwarf husbandry (dry, burrowing NW dwarf),
  noted as such in the care guide. Uncertain numerics left conservative.
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_tarantulas_batch4.py   (idempotent)
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I, A = CareLevel.BEGINNER, CareLevel.INTERMEDIATE, CareLevel.ADVANCED


SPECIES_DATA = [
    {
        "scientific_name": "Grammostola quirogai",
        "common_names": ["Uruguayan Black Beauty"],
        "genus": "Grammostola", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile; prefers to retreat",
        "native_region": "Uruguay, northern Argentina", "adult_size": "6-7 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, mostly dry with a water dish; good ventilation",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A deep-black, docile terrestrial — much of the hobby's 'Grammostola pulchra' is "
            "actually this species (G. quirogai). Calm, display-friendly, rarely kicks hair. "
            "Dry substrate with a water dish, good ventilation, room temps. Slow-growing and "
            "very long-lived; an excellent beginner."
        ),
        "source_url": "https://www.jamiestarantulas.com/blog-post/grammostola-pulchra-brazilian-black-care-sheet/",
    },
    {
        "scientific_name": "Aphonopelma anax",
        "common_names": ["Texas Tan"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "very docile, calm",
        "native_region": "Southern USA (Texas, Oklahoma), N. Mexico", "adult_size": "5-6 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 85, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber / dry soil, mostly dry with a water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A big, slow-growing North American terrestrial nicknamed the 'golden retriever' "
            "of tarantulas for its calm temperament. Likes it warm and dry — keep low humidity "
            "with a water dish and avoid misting. A great hardy beginner; urticating hairs, "
            "mild venom."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/aphonopelma-anax",
    },
    {
        "scientific_name": "Nhandu carapoensis",
        "common_names": ["Brazilian Red"],
        "genus": "Nhandu", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish, defensive; kicks hair readily; calms with age",
        "native_region": "Brazil", "adult_size": "6-7 inches", "growth_rate": "medium-fast",
        "type": "terrestrial", "temperature_min": 75, "temperature_max": 85, "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, partly damp; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A medium-large Brazilian terrestrial with red abdominal setae. Hardy and "
            "straightforward but skittish and quick to flick urticating hairs — best for "
            "keepers with a little experience. Calms somewhat with age. Slightly damp "
            "substrate, water dish, warm temps."
        ),
        "source_url": "https://www.grimoireexotics.com/post/nhandu-carapoensis-brazilian-red-care-guide",
    },
    {
        "scientific_name": "Bonnetina cyaneifemur",
        "common_names": ["Mexican Blue Femur"],
        "genus": "Bonnetina", "family": "Theraphosidae",
        "care_level": B, "temperament": "skittish; flees / flicks hair when disturbed",
        "native_region": "Mexico", "adult_size": "3-3.5 inches (dwarf)", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 78, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "6x6x6 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, mostly dry with a water dish (standard Bonnetina dwarf care)",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A small Mexican dwarf with blue-tinted femurs. Species-specific literature is "
            "limited, so this follows standard, well-established Bonnetina dwarf husbandry: "
            "a dry, well-ventilated terrestrial setup with a hide/burrow and a water dish, "
            "low-to-medium humidity, room temps. Skittish but harmless — urticating hairs, "
            "mild venom."
        ),
        "source_url": "https://www.tarantupedia.com/theraphosinae/bonnetina/bonnetina-cyaneifemur",
    },
    {
        "scientific_name": "Cyriopagopus hainanus",
        "common_names": ["Chinese Black Earth Tiger", "Chinese Bird Spider"],
        "genus": "Cyriopagopus", "family": "Theraphosidae",
        "care_level": A, "temperament": "defensive, fast; obligate burrower",
        "native_region": "China (Hainan)", "adult_size": "6-7 inches", "growth_rate": "medium-fast",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 82, "humidity_min": 75, "humidity_max": 85,
        "enclosure_size_adult": "12x12x14 inches (deep substrate)", "substrate_depth": "6-8 inches",
        "substrate_type": "deep, moist coco/soil for silk-lined burrows; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large Old World 'earth tiger' that digs deep, silk-lined burrows with alarm "
            "trip-lines. No urticating hairs; potent venom (hainantoxins) and a defensive "
            "disposition — experienced keepers only, no handling. Deep, moist substrate, high "
            "humidity with ventilation, a starter burrow and water dish."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Cyriopagopus_hainanus",
    },
    {
        "scientific_name": "Lampropelma nigerrimum",
        "common_names": ["Sangihe Island Black"],
        "genus": "Lampropelma", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, skittish, defensive; will confront",
        "native_region": "Indonesia (Sangihe Island)", "adult_size": "5-7 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 85,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "moisture-retentive coco with bark/moss; vertical cork bark; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A jet-black Indonesian Old World arboreal — fast, skittish, and more likely to "
            "confront than flee, with potent venom: advanced keepers only, no handling. No "
            "urticating hairs. Tall enclosure with vertical cork bark, moist-but-ventilated "
            "substrate, light misting, and a water dish."
        ),
        "source_url": "https://www.tarantupedia.com/ornithoctoninae/lampropelma/lampropelma-nigerrimum",
    },
    {
        "scientific_name": "Augacephalus junodi",
        "common_names": ["Mozambique Golden Baboon"],
        "genus": "Augacephalus", "family": "Theraphosidae",
        "care_level": A, "temperament": "defensive, fast; web-heavy deep burrower",
        "native_region": "Southern Africa (Mozambique, South Africa)", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 85, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "5-7 inches",
        "substrate_type": "dry sandy/coco mix it can web into deep burrows; small water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A golden-legged African baboon from dry savannas — a fast, defensive, web-heavy "
            "obligate burrower for expert keepers. No urticating hairs; potent Old World "
            "venom. Keep dry with deep substrate it can web into burrows, plus a small water "
            "dish. Not for handling."
        ),
        "source_url": "https://animalscene.mb.com.ph/the-golden-baboon-tarantula-augacephalus-junodi/",
    },
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = mirrored = 0
        existing_invert_ids = {row[0] for row in db.query(InvertSpecies.id).all()}
        for data in SPECIES_DATA:
            row = dict(data)
            name = row["scientific_name"]
            if db.query(Species).filter(Species.scientific_name_lower == name.lower()).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            sp = Species(scientific_name_lower=name.lower(), **row)
            db.add(sp)
            db.flush()
            added += 1
            if sp.id not in existing_invert_ids:
                db.add(InvertSpecies(**_species_to_invert_species_kwargs(sp)))
                mirrored += 1
            print(f"  Added + mirrored: {name}")
        db.commit()
        print(f"\nDone. Added {added} species, mirrored {mirrored}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
