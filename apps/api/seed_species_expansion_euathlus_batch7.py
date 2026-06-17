"""
Species DB expansion — EUATHLUS batch 7 (BRIEF-care-guide-expansion §6).

The brief flagged the Euathlus genus as ENTIRELY missing — the "puppy-dog"
Chilean dwarf beginners. 3 net-new, dual-table (tarantula → legacy `species` +
`invert_species` mirror, shared id), as batches 4-6.

Honesty notes:
* Euathlus sp. "red" (Chilean Flame Dwarf) is NOT added here — it was reclassified
  to Homoeomma chilensis, which is already in the catalog (would be a duplicate).
* E. condorito: species-specific husbandry is thin (described 2014; Critically
  Endangered in the wild, hobby stock is captive-bred) — values follow the
  well-established, uniform Euathlus genus care, noted in the care guide.
* All New World → urticating_hairs=True, mild venom. Euathlus don't really burrow
  (burrowing=False) and like it dry/cool — low-moderate humidity, room temps.
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_euathlus_batch7.py   (idempotent)
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B = CareLevel.BEGINNER


def _euathlus(**kw):
    base = dict(
        genus="Euathlus", family="Theraphosidae",
        care_level=B, type="terrestrial", growth_rate="slow",
        temperature_min=65, temperature_max=78, humidity_min=40, humidity_max=50,
        enclosure_size_adult="8x8x8 inches", substrate_depth="3-4 inches",
        substrate_type="dry coco fiber/soil; cork bark hide; water dish (no misting)",
        feeding_frequency_adult="1 prey per week", water_dish_required=True,
        webbing_amount="light", burrowing=False,
        urticating_hairs=True, medically_significant_venom=False, venom_potency="Mild",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _euathlus(
        scientific_name="Euathlus parvulus",
        common_names=["Chilean Gold Burst", "Paraphysa parvula"],
        temperament="docile, calm; occasionally skittish",
        native_region="Chile", adult_size="4-4.5 inches", growth_rate="slow",
        temperature_min=65, temperature_max=80, humidity_min=40, humidity_max=50,
        care_guide=(
            "A calm, sweet-natured Chilean dwarf (formerly Paraphysa parvula) and a superb "
            "beginner. A simple terrestrial setup is all it needs: dry substrate, a cork-bark "
            "hide, and a water dish — no misting, this species likes it dry. Comfortable at room "
            "temperature (mid-60s to low-80s °F). A good eater but slow-growing, so it'll be a "
            "long-lived companion. New World — has urticating hairs and only mild venom, and is "
            "generally placid (some individuals a touch skittish)."
        ),
        source_url="https://tomsbigspiders.com/2014/04/19/paraphysa-parvula-chilean-gold-burst/",
    ),
    _euathlus(
        scientific_name="Euathlus manicatus",
        common_names=["Chilean Flame"],
        temperament="extremely docile, curious; handleable",
        native_region="Chile", adult_size="3-4 inches",
        temperature_min=68, temperature_max=76, humidity_min=40, humidity_max=50,
        care_guide=(
            "One of the most famously docile tarantulas in the hobby — an inquisitive, "
            "slow-moving Chilean dwarf that stays out on display and often investigates rather "
            "than hides (it doesn't burrow). Keep it dry and at room temperature (68-76°F) with "
            "low-to-moderate humidity, a cork-bark hide, and a water dish; no misting needed. "
            "Has a strong feeding response. New World — urticating hairs, mild venom. An ideal "
            "first tarantula. (Sold in gold, green, and black color forms.)"
        ),
        source_url="https://spiderfarm.co.uk/blog/mastering-the-care-of-the-vibrant-euathlus-species",
    ),
    _euathlus(
        scientific_name="Euathlus condorito",
        common_names=["Condorito Dwarf"],
        temperament="docile, slow-moving",
        native_region="Chile (high Andes)", adult_size="dwarf (~3 inches)",
        temperature_min=64, temperature_max=75, humidity_min=40, humidity_max=55,
        care_guide=(
            "A small high-elevation Chilean dwarf (described by Perafán & Pérez-Miles, 2014). "
            "Species-specific husbandry is limited and wild populations are Critically "
            "Endangered, so seek captive-bred stock; care here follows the well-established, "
            "uniform Euathlus genus husbandry: a small dry terrestrial setup with a hide and "
            "water dish, low-to-moderate humidity, and cool-to-room temperatures (it comes from "
            "cool Andean heights, so avoid heat). Docile and slow-growing; New World with "
            "urticating hairs and mild venom."
        ),
        source_url="https://www.tarantupedia.com/theraphosinae/euathlus/euathlus-condorito",
    ),
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
