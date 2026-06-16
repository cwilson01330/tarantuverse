"""
Species DB expansion — TARANTULAS, batch 1 (research-backed, cited).

Tarantulas live in BOTH the legacy `species` table (what the web care guides,
autocomplete, and collection-add read) AND the unified `invert_species` mirror
(taxon='tarantula', shared id) that the multi-taxon browser reads. So this seed:
  1. inserts each new Species row, then
  2. mirrors it into invert_species via the SAME helper the backfill uses
     (_species_to_invert_species_kwargs → shares the Species id).

Honesty-first: every row carries a `source_url`. Values are conservative
consensus across reputable keeper care sheets; anything we couldn't confirm
(e.g. feeding-interval day counts) is left null rather than invented.

Run with: python3 seed_species_expansion_tarantulas_batch1.py   (idempotent)
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
        "scientific_name": "Aphonopelma seemanni",
        "common_names": ["Costa Rican Striped Knee", "Costa Rican Zebra"],
        "genus": "Aphonopelma", "family": "Theraphosidae",
        "care_level": B, "temperament": "calm but skittish; deep burrower",
        "native_region": "Costa Rica, Central America", "adult_size": "4.5-5 inches", "growth_rate": "slow-medium",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 78, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4-6 inches (deep for burrowing)",
        "substrate_type": "coco fiber / topsoil, mostly dry with a damp corner",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A hardy New World terrestrial favorite with bold leg striping. A heavy "
            "burrower — give deep, mostly-dry substrate with a damp corner and a water "
            "dish. Calm but can be skittish and may stay underground for long stretches "
            "(normal). Has urticating hairs; venom is mild. Good beginner/intermediate."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/aphonopelma-seemanni",
    },
    {
        "scientific_name": "Neoholothele incei",
        "common_names": ["Trinidad Olive", "Trinidad Olive Gold"],
        "genus": "Neoholothele", "family": "Theraphosidae",
        "care_level": I, "temperament": "fast, skittish; prolific webber",
        "native_region": "Trinidad & Venezuela", "adult_size": "2-3 inches (dwarf)", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 78, "humidity_min": 65, "humidity_max": 70,
        "enclosure_size_adult": "6x6x6 inches", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber, mostly dry; plenty of anchor points for webbing",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "heavy", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A small, fast New World dwarf that webs heavily, building beautiful tunnel "
            "complexes. Notable for tolerating communal keeping — though there's always "
            "some cannibalism risk, so it's not a guaranteed-safe communal. Dry substrate, "
            "low-ish humidity, water dish. Skittish and quick; better as a 2nd+ species."
        ),
        "source_url": "https://www.keepingexoticpets.com/neoholothele-incei-care-sheet/",
    },
    {
        "scientific_name": "Tliltocatl verdezi",
        "common_names": ["Mexican Rose Grey"],
        "genus": "Tliltocatl", "family": "Theraphosidae",
        "care_level": B, "temperament": "calm, docile display species",
        "native_region": "Mexico (Guerrero, Oaxaca)", "adult_size": "5-6 inches", "growth_rate": "slow-medium",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 82, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "10x10x10 inches", "substrate_depth": "4 inches",
        "substrate_type": "coco fiber, mostly dry with a water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A calm, hardy Mexican terrestrial that stays out on display — a great "
            "beginner. Dry substrate with a water dish; tolerates a wide temperature "
            "range. Has urticating hairs but rarely kicks; venom is mild. Long-lived "
            "females (15+ years)."
        ),
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/tliltocatl-verdezi",
    },
    {
        "scientific_name": "Homoeomma chilensis",
        "common_names": ["Chilean Flame", "Chilean Dwarf Flame", "Euathlus sp. red"],
        "genus": "Homoeomma", "family": "Theraphosidae",
        "care_level": B, "temperament": "exceptionally docile, curious",
        "native_region": "Chile", "adult_size": "2.5-3 inches (dwarf)", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 65, "temperature_max": 80, "humidity_min": 60, "humidity_max": 70,
        "enclosure_size_adult": "6x6x6 inches", "substrate_depth": "3 inches",
        "substrate_type": "coco fiber, dry with a water dish",
        "feeding_frequency_adult": "1 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": False, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "Long known in the hobby as 'Euathlus sp. red' (now Homoeomma chilensis), this "
            "Chilean dwarf is famous for an unusually gentle, inquisitive temperament. "
            "Keep dry and cool-to-room-temp with a water dish for molt humidity. Small, "
            "slow-growing, and very long-lived — an excellent first tarantula."
        ),
        "source_url": "https://tomsbigspiders.com/2014/04/16/euathlus-sp-red/",
    },
    {
        "scientific_name": "Grammostola actaeon",
        "common_names": ["Brazilian Red-Rump"],
        "genus": "Grammostola", "family": "Theraphosidae",
        "care_level": B, "temperament": "generally calm, occasionally skittish",
        "native_region": "Brazil, Uruguay", "adult_size": "6-7 inches", "growth_rate": "slow",
        "type": "terrestrial", "temperature_min": 70, "temperature_max": 80, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "12x12x12 inches", "substrate_depth": "5-6 inches",
        "substrate_type": "coco fiber, moisture-retaining; keep one area lightly damp",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "A heavy-bodied New World terrestrial from slightly more humid forest floors "
            "than its arid Grammostola cousins, so keep a touch more moisture (deep "
            "substrate it can burrow into, one damp corner, water dish). Mostly calm; "
            "urticating hairs, mild venom. Hardy and long-lived."
        ),
        "source_url": "https://beyondthetreat.com/grammostola-actaeon/",
    },
    {
        "scientific_name": "Lasiodora klugi",
        "common_names": ["Bahia Scarlet Birdeater", "Bahia Scarlet"],
        "genus": "Lasiodora", "family": "Theraphosidae",
        "care_level": I, "temperament": "bold, skittish; flicks urticating hairs readily",
        "native_region": "Brazil (Bahia)", "adult_size": "8-9 inches", "growth_rate": "fast",
        "type": "terrestrial", "temperature_min": 75, "temperature_max": 85, "humidity_min": 65, "humidity_max": 75,
        "enclosure_size_adult": "18x18x14 inches", "substrate_depth": "4-6 inches",
        "substrate_type": "coco fiber, partly damp",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "light", "burrowing": True, "urticating_hairs": True,
        "medically_significant_venom": False, "venom_potency": "Mild",
        "care_guide": (
            "One of the largest New World terrestrials (8-9in), fast-growing and a "
            "spectacular display animal. Venom is mild, but it kicks urticating hairs "
            "more readily and more irritatingly than most — wear care during maintenance. "
            "Bold and can be skittish/defensive as it matures; best for intermediate keepers."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/lasiodora-klugi",
    },
    {
        "scientific_name": "Omothymus violaceopes",
        "common_names": ["Singapore Blue"],
        "genus": "Omothymus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, skittish, defensive when cornered",
        "native_region": "Singapore, Malaysia", "adult_size": "7-8 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 77, "temperature_max": 85, "humidity_min": 70, "humidity_max": 80,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber kept lightly damp; cork bark verticals for climbing",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Medically Significant",
        "care_guide": (
            "A stunning electric-blue Old World arboreal — strictly for experienced keepers. "
            "Extremely fast, prone to bolting, and possesses medically significant venom "
            "(severe pain, cramping). No urticating hairs (Old World). Tall, well-ventilated, "
            "humid enclosure with vertical cork bark. Not for handling."
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/omothymus-violaceopes",
    },
    {
        "scientific_name": "Phormingochilus everetti",
        "common_names": ["Sarawak Earth Tiger", "Sarawak Red Tree Tiger"],
        "genus": "Phormingochilus", "family": "Theraphosidae",
        "care_level": A, "temperament": "fast, defensive, bolts readily",
        "native_region": "Borneo (Sarawak), Malaysia", "adult_size": "7-8 inches", "growth_rate": "fast",
        "type": "arboreal", "temperature_min": 65, "temperature_max": 78, "humidity_min": 75, "humidity_max": 85,
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "4-5 inches",
        "substrate_type": "damp tropical mix (damp, not waterlogged) + good airflow; vertical cork bark",
        "feeding_frequency_adult": "1-2 prey per week", "water_dish_required": True,
        "webbing_amount": "moderate", "burrowing": False, "urticating_hairs": False,
        "medically_significant_venom": True, "venom_potency": "Significant",
        "care_guide": (
            "A large Old World arboreal earth tiger (Ornithoctoninae) for experienced "
            "keepers only — fast, defensive, and quick to bolt. No urticating hairs; potent "
            "Old World venom, so treat with caution. Needs a tall enclosure with damp-but-"
            "ventilated substrate and vertical cork bark. Not for handling."
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
            db.flush()  # assign sp.id before mirroring
            added += 1
            # Mirror into invert_species (shared id) so the unified browser shows it.
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
