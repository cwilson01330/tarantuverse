"""
Species DB expansion — TARANTULA batch 5 (research-backed, cited).

6 net-new tarantulas, verified absent from BOTH the live catalog (153 species
checked) AND the pending-but-unrun batch 4 (which already covers Grammostola
quirogai, Aphonopelma anax, Bonnetina cyaneifemur, Lampropelma nigerrimum,
Nhandu carapoensis, Cyriopagopus hainanus, Augacephalus junodi — run that one too).

Mix: 5 New World terrestrials (urticating hairs, non-medically-significant venom)
plus 1 Old World Asian arboreal (no urticating hairs, potent venom, advanced).

Dual-table pattern (species + invert_species mirror, shared id), as batches 1-4.

Honesty notes:
* Considered "Davus fasciatus" and dropped it — Wikipedia/USFWS indicate it isn't
  actually in the pet trade (hobby "Costa Rican tiger rump" is often misidentified;
  the true hobby tiger rump, Davus pentaloris, is already in the catalog).
* Brachypelma smithi is the DISTINCT species from the redknee B. hamorii
  (reclassified) — larger and reputedly calmer; the historical naming confusion
  is noted in the guide. B. hamorii stays separate in the catalog.
* Acanthoscurria juruenicola: correct common name is "Brazilian Orange-banded"
  (not "red fang"); species-specific numerics are thin, so care follows the
  Acanthoscurria genus (its congener A. geniculata), noted in the guide.
* New World species: urticating_hairs=True, medically_significant_venom=False.
  Old World arboreal (Phormingochilus): urticating_hairs=False, MSV=True.
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_tarantulas_batch5.py   (idempotent)
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
        "scientific_name": "Aphonopelma johnnycashi",
        "common_names": ["Johnny Cash Tarantula"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile and calm; slow-moving",
        "native_region": "California, USA (Sierra Nevada foothills)", "adult_size": "~5 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 50, "humidity_max": 65,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "dry coco/soil with a hide; water dish",
        "feeding_frequency_adult": "1 prey every 1-2 weeks", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A US-native tarantula whose jet-black mature males earned it the Johnny Cash name. "
            "Classic New World care: docile, slow-moving, and very long-lived, kept on dry "
            "substrate with a hide and a water dish at room temperature. Will flick urticating "
            "hairs if pestered, but an excellent, hardy beginner species."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Aphonopelma_johnnycashi",
    },
    {
        "scientific_name": "Brachypelma smithi",
        "common_names": ["Giant Mexican Red Knee"],
        "genus": "Brachypelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile; kicks hair less than B. hamorii",
        "native_region": "Guerrero, Mexico (Pacific coast)", "adult_size": "7-8 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 55, "humidity_max": 65,
        "enclosure_size_adult": "12x12x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "dry coco/soil; hide; water dish overflowed occasionally",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "The TRUE Brachypelma smithi — a distinct species from the classic redknee B. "
            "hamorii (the two were long confused and only formally separated relatively "
            "recently). Larger than hamorii (7-8 inches) and reputed to kick hairs less. A "
            "showpiece beginner tarantula: docile, slow-growing, and very long-lived. Dry "
            "substrate, a hide, and a water dish; warm room temps. Urticating hairs main defense."
        ),
        "source_url": "https://jamiestarantulas.com/wordpress/2020/07/05/brachypelma-hamorii-smithi-mexican-red-knee-care-sheet/",
    },
    {
        "scientific_name": "Thrixopelma pruriens",
        "common_names": ["Peruvian Green Velvet"],
        "genus": "Thrixopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile but a ready hair-kicker",
        "native_region": "Peru and Chile", "adult_size": "4-5 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 60, "humidity_max": 75,
        "enclosure_size_adult": "10x10x8 inches", "substrate_depth": "3-4 inches",
        "substrate_type": "coco/soil it can dig under bark; lightly moist; hide; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A velvety olive-green New World terrestrial from Peru and Chile — docile and hardy, "
            "but quick to flick urticating hairs at the slightest provocation, so keep it "
            "hands-off. Tolerates low humidity; provide a water dish and a few inches of "
            "substrate to dig under bark. (A peptide from its venom, ProTx-I, has been studied "
            "as a potential painkiller.) Easy beginner care."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Thrixopelma_pruriens",
    },
    {
        "scientific_name": "Megaphobema velvetosoma",
        "common_names": ["Ecuadorian Brown Velvet", "Brown Velvet Birdeater"],
        "genus": "Megaphobema", "family": "Theraphosidae",
        "care_level": I, "temperament": "can be defensive; nocturnal ambush hunter",
        "native_region": "Ecuador and Peru (Amazon rainforest floor)", "adult_size": "6-7 inches", "growth_rate": "medium",
        "type": "terrestrial", "temperature_min": 72, "temperature_max": 80, "humidity_min": 65, "humidity_max": 80,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "moist coco/soil with leaf litter and a hide; water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A large, velvety rainforest-floor tarantula from Ecuador and Peru — a nocturnal "
            "ambush hunter that can be quite defensive, so best kept hands-off. Wants a humid, "
            "well-decorated terrestrial setup (moist substrate, leaf litter, a hide) and a water "
            "dish. New World, so urticating hairs are its main defense; venom is not medically "
            "significant. Intermediate due to temperament rather than care complexity."
        ),
        "source_url": "https://www.inaturalist.org/taxa/322980-Megaphobema-velvetosoma",
    },
    {
        "scientific_name": "Acanthoscurria juruenicola",
        "common_names": ["Brazilian Orange-banded"],
        "genus": "Acanthoscurria", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish, can be defensive; hearty eater",
        "native_region": "Brazil", "adult_size": "~7 inches", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 76, "temperature_max": 85, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x10 inches", "substrate_depth": "4-5 inches",
        "substrate_type": "coco/soil kept lightly moist; hide; water dish",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A large Brazilian ground-dweller with orange leg banding. Less common in the hobby, "
            "and species-specific data is thin, so care follows the Acanthoscurria genus (as for "
            "its well-known congener A. geniculata): warm, lightly moist substrate, a hide, and a "
            "water dish, with a robust appetite and fast growth. Skittish and can be defensive, "
            "with urticating hairs — an intermediate keeper's animal."
        ),
        "source_url": "https://www.tarantupedia.com/theraphosinae/acanthoscurria/acanthoscurria-juruenicola",
    },
    {
        "scientific_name": "Phormingochilus arboricola",
        "common_names": ["Borneo Black"],
        "genus": "Phormingochilus", "family": "Theraphosidae",
        "care_level": A, "temperament": "very fast, skittish and defensive",
        "native_region": "Borneo (Malaysia and Indonesia)", "adult_size": "6-7 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 75, "temperature_max": 82, "humidity_min": 70, "humidity_max": 85,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "3-4 inches",
        "substrate_type": "vertical cork plus a few inches of moist substrate (will dig); plant cover; water dish; good airflow",
        "feeding_frequency_adult": "1 prey every 7-14 days", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": True, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large, dark Bornean arboreal with purple undertones that spins heavy webbed tube "
            "retreats up high but will also dig — so provide vertical cork AND a few inches of "
            "moist substrate, with plant cover and good airflow. Very fast and skittish, with "
            "potent Old World venom and no urticating hairs: advanced only, no handling. Keep "
            "humid with a water dish; expect it to seal its retreat before molting."
        ),
        "source_url": "https://marshallarachnids.com/pages/phormingochilus-care-guide",
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
