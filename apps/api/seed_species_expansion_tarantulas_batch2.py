"""
Species DB expansion — TARANTULAS, batch 2 (research-backed, cited).

Same dual-table pattern as batch 1: insert into `species`, mirror into
`invert_species` (shared id) via _species_to_invert_species_kwargs.

Honesty notes:
* Psalmopoeus victori is New World but its subfamily (Psalmopoeinae) LACKS
  urticating hairs — set urticating_hairs=False (don't assume NW = has hairs).
* Old World baboons/arboreals (sanderi, schioedtei, birupes) have no urticating
  hairs and potent venom — flagged medically_significant_venom=True out of caution.
* adult_size kept <=50 chars (VARCHAR cap, learned from batch 1).
* Uncertain numerics left null rather than invented.

Run with: python3 seed_species_expansion_tarantulas_batch2.py   (idempotent)
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
        "scientific_name": "Brachypelma baumgarteni",
        "common_names": ["Mexican Orange Beauty"],
        "genus": "Brachypelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "calm as an adult; juveniles skittish",
        "native_region": "Mexico", "adult_size": "5.5-6 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4 inches",
        "substrate_type": "coco fiber / peat, mostly dry with a water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A black-bodied Mexican beauty with vivid orange legs. Classic Brachypelma "
            "care: dry coco/peat with a water dish, low-to-medium humidity, room temp. "
            "Notoriously slow-growing but very long-lived and calm as an adult — a great "
            "display beginner. Urticating hairs, mild venom; rarely defensive."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/brachypelma-baumgarteni",
    },
    {
        "scientific_name": "Psalmopoeus victori",
        "common_names": ["Mexican Half and Half", "Darth Maul"],
        "genus": "Psalmopoeus", "family": "Theraphosidae",
        "care_level": I, "temperament": "fast, skittish; relies on speed",
        "native_region": "Mexico (Veracruz)", "adult_size": "5-6 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 72, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "8x8x12 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber kept lightly moist; cork bark verticals; good ventilation",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": False, "venom_potency": "Moderate",
        "care_guide": (
            "A striking red/black New World arboreal from the humid forests of Veracruz. "
            "Note: like all Psalmopoeus it has NO urticating hairs and relies on speed — "
            "fast and skittish, not a first species. Keep consistent humidity (rains most "
            "of the year in its range) but well-ventilated; tall enclosure with cork bark. "
            "Venom is more notable than most New World species but not medically significant."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/psalmopoeus-victori",
    },
    {
        "scientific_name": "Bumba cabocla",
        "common_names": ["Brazilian Redhead"],
        "genus": "Bumba", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile; skittish when young",
        "native_region": "Brazil", "adult_size": "5-6 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 84, "humidity_min": 55, "humidity_max": 70,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4 inches",
        "substrate_type": "coco fiber; keep one half lightly damp (not swampy)",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A hardy Brazilian terrestrial with a red carapace. Skittish and burrowing as a "
            "youngster, settling into a calm display animal as it grows. Slightly more "
            "moisture than a Mexican species — dampen half the substrate, keep a water dish. "
            "Urticating hairs, mild venom. Good beginner."
        ),
        "source_url": "https://tomsbigspiders.com/2016/01/15/bumba-cabocla-brazilian-redhead-husbandry/",
    },
    {
        "scientific_name": "Thrixopelma ockerti",
        "common_names": ["Peruvian Flame Rump"],
        "genus": "Thrixopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "calm, slow-moving; kicks hair readily",
        "native_region": "Peru", "adult_size": "5-6 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 65, "temperature_max": 75, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, mostly dry with a water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A hardy, colorful New World species and a great beginner — easily raised from "
            "slings. Calm and slow-moving but quick to kick urticating hairs when bothered. "
            "Cool room temps are fine; low-to-moderate humidity with a water dish. Slings "
            "burrow; older spiders may adopt a semi-arboreal retreat."
        ),
        "source_url": "https://www.keepingexoticpets.com/thrixopelma-ockerti-care-sheet/",
    },
    {
        "scientific_name": "Pamphobeteus sp. 'machala'",
        "common_names": ["Purple Bloom", "Colombian Purple Bloom"],
        "genus": "Pamphobeteus", "family": "Theraphosidae",
        "care_level": I, "temperament": "calm but skittish; bold display",
        "native_region": "Ecuador", "adult_size": "8-9 inches", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 68, "temperature_max": 82, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "18x18x14 inches", "substrate_depth": "5-6 inches",
        "substrate_type": "deep moisture-retaining coco fiber; one damp area; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A large New World giant with iridescent purple sheen on mature males. Fast "
            "grower with a hearty appetite. Floor space over height, deep substrate it can "
            "burrow into, one damp corner and a water dish. Calm but skittish; urticating "
            "hairs, mild venom. Best for intermediate keepers given its size and speed."
        ),
        "source_url": "https://www.grimoireexotics.com/product-page/purple-bloom-tarantula-pamphobeteus-sp-machala",
    },
    {
        "scientific_name": "Ceratogyrus sanderi",
        "common_names": ["Namibian Horned Baboon"],
        "genus": "Ceratogyrus", "family": "Theraphosidae",
        "care_level": A, "temperament": "defensive, fast; obligate burrower",
        "native_region": "Namibia, Angola", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 74, "temperature_max": 82, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "6-8 inches",
        "substrate_type": "compact coco/soil-sand mix for stable burrows; slightly damp at the bottom",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "An Old World obligate-burrowing baboon — give 6-8in of compact substrate and a "
            "starter burrow. No urticating hairs; defensive with potent venom and a fast "
            "threat display, so experienced keepers only. Keep substrate slightly damp, not "
            "swampy, with a small water dish. Not for handling."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/ceratogyrus-sanderi",
    },
    {
        "scientific_name": "Omothymus schioedtei",
        "common_names": ["Malaysian Earth Tiger"],
        "genus": "Omothymus", "family": "Theraphosidae",
        "care_level": A, "temperament": "defensive, very fast",
        "native_region": "Malaysia", "adult_size": "8-9 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 78, "temperature_max": 82, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber with a cork bark tube; lightly moist; water bowl",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large, red-haired Old World arboreal earth tiger (Ornithoctoninae) for "
            "experienced keepers — defensive and extremely fast. No urticating hairs; potent "
            "Old World venom. Tall enclosure with a vertical cork bark tube, several inches "
            "of coir, and a water bowl. May also burrow in captivity. Not for handling."
        ),
        "source_url": "https://www.thedefiantforest.com/blogs/news/malaysian-earth-tiger-tarantula-care-guide-omothymus-schioedtei",
    },
    {
        "scientific_name": "Birupes simoroxigorum",
        "common_names": ["Borneo Neon-Blue Leg", "Malaysian Blue"],
        "genus": "Birupes", "family": "Theraphosidae",
        "care_level": A, "temperament": "defensive, fast",
        "native_region": "Borneo (Sarawak), Malaysia", "adult_size": "5-6 inches", "growth_rate": "medium",
        "type": "fossorial", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "10x10x12 inches (deep substrate)", "substrate_depth": "5-6 inches",
        "substrate_type": "damp coco / soil with rotting wood; vertical retreat options; ventilated",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A neon-blue-legged Bornean species (described 2019, its own genus). Old World — "
            "no urticating hairs, more potent venom, defensive and fast: experienced keepers "
            "only. Burrowing/fossorial with some surface and vertical activity; warm, damp-"
            "but-ventilated rainforest setup with deep substrate and rotting wood. No handling."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/birupes-simoroxigorum",
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
