"""
Species DB expansion — BABOON batch 5 (research-backed, cited).

Old World African baboons (Harpactirinae + allies) — Cory's favorite subgroup.
All net-new vs the live DB (verified against invert_species before writing):
existing baboons skipped — P. murinus/chordatus/lugardi, Ceratogyrus x4,
Harpactira baviana/dictator/pulchripes, Augacephalus ezendami, Idiothele mira,
Eucratoscelus constrictus, Heterothele villosella, Hysterocrates gigas/hercules,
Pelinobius muticus, Monocentropus balfouri, Heteroscodra, Stromatopelma.

Dual-table pattern (species + invert_species mirror, shared id), as batches 1-4.

Honesty notes (matching existing baboon DB convention):
* Every African baboon here: urticating_hairs=False, medically_significant_venom
  =True (potent OW venom — painful bites, cramping; respect, no handling), EXCEPT
  the dwarf Heterothele gabonensis (mild, like its congener H. villosella).
* Idiothele nigrofulva: species-specific numerics are thin; values follow the
  well-established Idiothele genus husbandry (its congener I. mira), noted in the
  care guide. Temperament is its own (very defensive, per keeper accounts).
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_baboon_batch5.py   (idempotent)
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I, A = CareLevel.BEGINNER, CareLevel.INTERMEDIATE, CareLevel.ADVANCED


SPECIES_DATA = [
    {
        "scientific_name": "Harpactira namaquensis",
        "common_names": ["Bronze Baboon"],
        "genus": "Harpactira", "family": "Theraphosidae",
        "care_level": I, "temperament": "one of the calmer baboons; can be defensive",
        "native_region": "South Africa (Namaqualand)", "adult_size": "4.5-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "10x10x10 inches (deep substrate)", "substrate_depth": "5-6 inches",
        "substrate_type": "dry coco/soil it can burrow into; small water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A hardy South African baboon from dry country — reputed to be one of the calmer "
            "baboons, becoming bolder and more terrestrial with age, though still a fast Old "
            "World species with no urticating hairs and potent venom (no handling). Humidity "
            "is a non-issue: keep it dry with deep substrate to burrow and a small water dish. "
            "Room temps, good ventilation."
        ),
        "source_url": "https://cleverpetowners.com/harpactira-namaquensis-bronze-baboon-tarantula/",
    },
    {
        "scientific_name": "Eucratoscelus pachypus",
        "common_names": ["Stout Leg Baboon"],
        "genus": "Eucratoscelus", "family": "Theraphosidae",
        "care_level": I, "temperament": "calmer than most baboons; defensive if pushed",
        "native_region": "Tanzania", "adult_size": "4-5 inches", "growth_rate": "slow-medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 82, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "5-7 inches",
        "substrate_type": "mostly dry coco/soil with a moisture gradient at burrow bottom; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "Instantly recognizable by its massively thickened, velvety back legs, which it "
            "uses as living shovels to dig deep burrows. From arid Tanzania — keep mostly dry "
            "with a deep substrate and a water dish, overflowing it occasionally for a moisture "
            "gradient at the burrow bottom. Generally calmer than other baboons but still an "
            "Old World species: no urticating hairs, potent venom, no handling."
        ),
        "source_url": "https://www.grimoireexotics.com/post/eucratoscelus-pachypus-stout-leg-baboon-care-guide",
    },
    {
        "scientific_name": "Ceratogyrus meridionalis",
        "common_names": ["Lake Malawi Horned Baboon"],
        "genus": "Ceratogyrus", "family": "Theraphosidae",
        "care_level": A, "temperament": "very fast, defensive; obligate burrower",
        "native_region": "Malawi, Mozambique", "adult_size": "5-6 inches", "growth_rate": "medium-fast",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 82, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "12x12x12 inches (deep substrate)", "substrate_depth": "7-8 inches",
        "substrate_type": "deep coco/soil for burrows; keep one corner damp via water dish; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A horned baboon and an active architect, not a 'pet hole' — give an adult ~8 inches "
            "of substrate for its deep burrows. Fast and defensive with potent venom (painful "
            "bites with swelling and cramping reported); no urticating hairs. Keep a humidity "
            "gradient by overflowing one corner of the water dish; warm temps. Advanced keepers "
            "only, no handling."
        ),
        "source_url": "https://antsinvasion.pl/en/ceratogyrus-meridionalis",
    },
    {
        "scientific_name": "Augacephalus breyeri",
        "common_names": ["Gold Blush Baboon"],
        "genus": "Augacephalus", "family": "Theraphosidae",
        "care_level": I, "temperament": "reclusive, skittish; lightning-fast if pushed",
        "native_region": "Southern Africa (South Africa, Mozambique)", "adult_size": "4.5-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 72, "temperature_max": 79, "humidity_min": 50, "humidity_max": 60,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "6-7 inches",
        "substrate_type": "dry-to-semi-moist topsoil/sand mix for deep vertical burrows; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A reclusive deep-burrowing baboon — slightly more laid-back than most, but a "
            "lightning-fast predator with potent venom and no urticating hairs. Give it at "
            "least 15 cm of mostly dry substrate (topsoil/sand) for its ~20 cm vertical "
            "burrows, plus a shallow water dish overflowed occasionally for a gradient. "
            "Intermediate to advanced keepers, no handling."
        ),
        "source_url": "https://spiderfarm.co.uk/blog/beyond-the-buzz-discovering-the-radiant-charm-of-the-augacephalus-breyeri",
    },
    {
        "scientific_name": "Harpactira cafreriana",
        "common_names": ["Cape Copper Baboon", "Copper Orange Baboon"],
        "genus": "Harpactira", "family": "Theraphosidae",
        "care_level": I, "temperament": "mostly calm but defensive; heavy webber",
        "native_region": "South Africa (Eastern Cape)", "adult_size": "4.5-5.5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 68, "temperature_max": 78, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "12x10x10 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco/soil kept damp-not-saturated (like coffee grounds); lots of structure; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A coppery South African baboon and a heavy webber that anchors lots of silk over a "
            "terrestrial/burrow setup — give it plenty of horizontal space and structure. "
            "Mostly calm but will get defensive; Old World, so no urticating hairs, potent "
            "venom, no handling. Keep substrate damp-not-saturated, cooler room temps."
        ),
        "source_url": "https://www.mymonsters.co.za/product/harpactira-cafreriana/",
    },
    {
        "scientific_name": "Ceratogyrus attonitifer",
        "common_names": ["Long-Horned Baboon"],
        "genus": "Ceratogyrus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, defensive; bite is the main defense",
        "native_region": "Angola", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 80, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "12x12x12 inches (deep substrate)", "substrate_depth": "7-8 inches",
        "substrate_type": "deep, semi-dry coco/soil for burrows with good ventilation; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "The famous long-horned baboon — it carries the tallest foveal horn of any "
            "Ceratogyrus. Primarily terrestrial-to-fossorial; floor space matters more than "
            "height, with deep semi-dry substrate for burrowing and good ventilation. Fast and "
            "defensive with potent venom and no urticating hairs — its bite is its defense. "
            "Advanced keepers only, no handling."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/ceratogyrus-darlingi",
    },
    {
        "scientific_name": "Heterothele gabonensis",
        "common_names": ["Gabon Blue Dwarf Baboon"],
        "genus": "Heterothele", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish and fast; runs rather than bites; communal-capable",
        "native_region": "Gabon", "adult_size": "2-3 inches (dwarf)", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 82, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "8x8x8 inches (4x leg span horizontal)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco/soil with hides and anchor points; partly moist; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A tiny, heavy-webbing African dwarf baboon that can be kept communally given "
            "enough space, hides, and anchor points (crowding provokes fighting/cannibalism). "
            "Skittish and very fast but prefers to flee; no urticating hairs and only mild "
            "venom, but its speed still makes it a poor handling candidate. Warm, moderately "
            "humid, with a water dish."
        ),
        "source_url": "https://fearnottarantulas.com/pages/heterothele-gabonensis-tarantula",
    },
    {
        "scientific_name": "Harpactira marksi",
        "common_names": ["Elizabethfontein Baboon"],
        "genus": "Harpactira", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish, defensive",
        "native_region": "South Africa", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "6-8 inches",
        "substrate_type": "deep coco/soil for burrowing with a shelter; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A South African burrowing baboon — skittish and defensive, with potent Old World "
            "venom and no urticating hairs. Provide deep substrate (15-20 cm) for burrows plus "
            "a shelter and water dish, with plenty of horizontal floor space. Not for beginners; "
            "no handling."
        ),
        "source_url": "https://www.mymonsters.co.za/product/harpactira-marksi/",
    },
    {
        "scientific_name": "Idiothele nigrofulva",
        "common_names": ["Common Trapdoor Baboon"],
        "genus": "Idiothele", "family": "Theraphosidae",
        "care_level": A, "temperament": "very defensive; builds a trapdoor burrow",
        "native_region": "Southern Africa", "adult_size": "3.5-4.5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 72, "temperature_max": 79, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "5-7 inches",
        "substrate_type": "deep, packable coco/soil it can dig and cap with a trapdoor; slightly damp; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "One of the very few tarantulas that builds a true trapdoor over its burrow — a "
            "fascinating, if reclusive, display animal. Species-specific data is limited, so "
            "this follows the well-established Idiothele genus husbandry (as for its congener "
            "I. mira): deep packable substrate it can dig and cap, slightly damp, with a water "
            "dish. Reported to be very defensive; no urticating hairs, potent venom, no handling."
        ),
        "source_url": "https://www.inaturalist.org/taxa/472827-Idiothele-nigrofulva",
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
