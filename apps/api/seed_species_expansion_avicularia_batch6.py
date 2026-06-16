"""
Species DB expansion — AVICULARIA / Aviculariinae batch 6 (research-backed, cited).

The New World arboreal "pinktoe" subfamily. All net-new vs the live DB (verified
against invert_species first): existing avics skipped — A. avicularia/geroldi/
juruensis/metallica/minatrix/purpurea, Caribena laeta/versicolor, Iridopelma
hirsutum, Pachistopelma rufonigrum, Ybyrapora diversipes.

Dual-table pattern (species + invert_species mirror, shared id), as batches 1-5.

Honesty notes (matching existing Aviculariinae DB convention):
* All arboreal, urticating_hairs=True, medically_significant_venom=False, venom
  "Mild". Aviculariinae DO have (Type II) urticating hairs but rarely kick them —
  they bolt, jump, or launch a fecal stream as defense. Noted in care guides.
* Strong CROSS-VENTILATION is the make-or-break husbandry point for this group
  (stagnant moist air, not low humidity, is the usual killer) — stated in guides.
* Dropped A. taunayi / A. variegata (only low-quality copy-paste boilerplate, self-
  contradictory) and A. hirschii (no species-specific care surfaced).
* A. braunshauseni: a widely used hobby name whose formal taxonomic status is
  unsettled (often listed as Avicularia sp. "Braunshauseni") — noted in the guide.
* adult_size kept <=50 chars (VARCHAR cap).

Run with: python3 seed_species_expansion_avicularia_batch6.py   (idempotent)
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel
from app.models.invert_species import InvertSpecies
from app.services.inverts_dualwrite import _species_to_invert_species_kwargs

B, I, A = CareLevel.BEGINNER, CareLevel.INTERMEDIATE, CareLevel.ADVANCED

_VENT = (
    "Strong cross-ventilation is essential for this group — stagnant, overly wet "
    "air (not low humidity) is the usual cause of sudden 'Avic' losses."
)
_DEFENSE = (
    "Has urticating hairs but rarely kicks them; it would sooner bolt, jump, or "
    "fire a fecal stream. Fast but not aggressive; mild venom."
)


def _arboreal(temp=(75, 82), hum=(70, 80), web="heavy", feed="1 prey per week"):
    return {
        "type": "arboreal", "burrowing": False, "water_dish_required": True,
        "urticating_hairs": True, "medically_significant_venom": False,
        "venom_potency": "Mild", "webbing_amount": web,
        "temperature_min": temp[0], "temperature_max": temp[1],
        "humidity_min": hum[0], "humidity_max": hum[1],
        "enclosure_size_adult": "12x12x18 inches (vertical)", "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber, lightly moist; vertical cork bark + foliage; strong cross-ventilation",
        "feeding_frequency_adult": feed,
    }


SPECIES_DATA = [
    {
        "scientific_name": "Avicularia rufa",
        "common_names": ["Yellow Banded Pinktoe"],
        "genus": "Avicularia", "family": "Theraphosidae",
        "care_level": B, "temperament": "docile, shy", "native_region": "Brazil, Peru",
        "adult_size": "5-6 inches", "growth_rate": "medium-fast",
        **_arboreal(temp=(75, 82), hum=(70, 80), web="moderate"),
        "care_guide": (
            "A larger, easygoing pinktoe with yellow leg banding. Classic arboreal avic care: "
            "a tall enclosure with cork bark to anchor webbing, light misting, a water dish. "
            f"{_VENT} {_DEFENSE} A good, hardy beginner arboreal."
        ),
        "source_url": "https://fearnottarantulas.com/pages/avicularia-rufa-yellow-banded-pinktoe-tarantula",
    },
    {
        "scientific_name": "Avicularia merianae",
        "common_names": ["Tarapoto Pinktoe"],
        "genus": "Avicularia", "family": "Theraphosidae",
        "care_level": B, "temperament": "very docile; fast, can jump when startled",
        "native_region": "Peru (Tarapoto)", "adult_size": "4.5-5 inches", "growth_rate": "medium",
        **_arboreal(temp=(72, 82), hum=(65, 80), web="heavy"),
        "care_guide": (
            "A Peruvian pinktoe from the Tarapoto region — a heavy webber that builds thick "
            "tube retreats high in the enclosure. Very docile but quick and able to jump. "
            "Does fine at room temperature; keep substrate slightly moist with strong airflow. "
            f"{_VENT} {_DEFENSE}"
        ),
        "source_url": "https://exoticsunlimitedusa.com/products/avicularia-merianae-tarapoto-pink-toe-tarantula-for-sale-1",
    },
    {
        "scientific_name": "Ybyrapora gamba",
        "common_names": ["Amazon Pinktoe"],
        "genus": "Ybyrapora", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish; jumps; sensitive to breezes",
        "native_region": "Brazil", "adult_size": "3.5-4 inches", "growth_rate": "medium",
        **_arboreal(temp=(75, 82), hum=(70, 85), web="moderate"),
        "care_guide": (
            "A small Brazilian arboreal, reclassified out of Avicularia in 2017 — its care is "
            "still classic pinktoe: tall, well-ventilated, lightly moist, with large anchor "
            "leaves/cork it likes to tube-web onto. Notably jumpy and sensitive to air currents. "
            f"{_VENT} {_DEFENSE}"
        ),
        "source_url": "https://www.thetarantulacollective.com/caresheets/avicularia-avicularia",
    },
    {
        "scientific_name": "Ybyrapora sooretama",
        "common_names": ["Amazon Purple Sapphire"],
        "genus": "Ybyrapora", "family": "Theraphosidae",
        "care_level": I, "temperament": "skittish, defensive; quick to bolt",
        "native_region": "Brazil", "adult_size": "4-4.5 inches", "growth_rate": "medium",
        **_arboreal(temp=(75, 82), hum=(75, 85), web="heavy"),
        "care_guide": (
            "A jewel-toned Brazilian arboreal (purple/blue sheen). A bit more temperamental "
            "than the easy avics — skittish and quick to bolt, so an intermediate pick. Tall "
            "enclosure, light misting of one wall, water dish. "
            f"{_VENT} {_DEFENSE}"
        ),
        "source_url": "https://www.grimoireexotics.com/post/ybyrapora-sooretama-amazon-purple-sapphire-care-guide",
    },
    {
        "scientific_name": "Antillena rickwesti",
        "common_names": ["Hispaniolan Pinktoe"],
        "genus": "Antillena", "family": "Theraphosidae",
        "care_level": I, "temperament": "arboreal, retreat-builder",
        "native_region": "Dominican Republic (Hispaniola)", "adult_size": "3.5-4.5 inches", "growth_rate": "medium",
        **_arboreal(temp=(75, 80), hum=(70, 80), web="moderate"),
        "care_guide": (
            "A small Caribbean arboreal endemic to Hispaniola — black abdomen with pink setae "
            "and a leaf-patterned carapace, building silk retreats against tree trunks/cork. "
            "Standard pinktoe care: vertical setup, light moisture, water dish. "
            f"{_VENT} {_DEFENSE} A less common, monotypic-genus collector's avic."
        ),
        "source_url": "https://en.wikipedia.org/wiki/Antillena_rickwesti",
    },
    {
        "scientific_name": "Iridopelma zorodes",
        "common_names": ["Bahia Purple & Red Pinktoe"],
        "genus": "Iridopelma", "family": "Theraphosidae",
        "care_level": I, "temperament": "nervous, fast-moving", "native_region": "Brazil (Bahia)",
        "adult_size": "4.5-5 inches", "growth_rate": "medium",
        **_arboreal(temp=(70, 80), hum=(65, 80), web="heavy"),
        "care_guide": (
            "A striking Bahian arboreal — purple-blue body with a reddish abdomen as an adult, "
            "pink-and-striped as a juvenile. Iridopelma care mirrors Avicularia: tall, "
            "well-ventilated, substrate damp-not-saturated. Nervous and fast, so an "
            f"intermediate pick. {_VENT} {_DEFENSE}"
        ),
        "source_url": "https://exoticsunlimitedusa.com/products/iridopelma-zorodes-bahia-purple-red-pinktoe-0-75",
    },
    {
        "scientific_name": "Pachistopelma bromelicola",
        "common_names": ["Brazilian Cadet Blue", "Bromeliad Tree Tarantula"],
        "genus": "Pachistopelma", "family": "Theraphosidae",
        "care_level": I, "temperament": "shy; calm with sudden bursts of speed",
        "native_region": "Brazil (endemic)", "adult_size": "up to 6 inches", "growth_rate": "fast",
        **_arboreal(temp=(75, 82), hum=(70, 80), web="heavy"),
        "care_guide": (
            "A specialist arboreal that lives inside bromeliads in the wild ('bromelicola' = "
            "'of bromeliads') — a heavy webber that builds retreats high in the foliage. Give "
            "it a vertical cork slab and plenty of plant cover, light misting, a water dish. "
            f"Fast-growing and generally shy but quick. {_VENT} {_DEFENSE}"
        ),
        "source_url": "https://en.wikipedia.org/wiki/Pachistopelma_bromelicola",
    },
    {
        "scientific_name": "Avicularia braunshauseni",
        "common_names": ["Goliath Pinktoe"],
        "genus": "Avicularia", "family": "Theraphosidae",
        "care_level": I, "temperament": "nervous but docile; fast, jumps when startled",
        "native_region": "Brazil (Santarem)", "adult_size": "7-8 inches (largest pinktoe)", "growth_rate": "medium-fast",
        **_arboreal(temp=(75, 82), hum=(70, 80), web="moderate to heavy"),
        "care_guide": (
            "The giant of the pinktoes — a ~7-8 inch arboreal, the largest avic in the hobby. "
            "Nervous but docile, fast, and able to jump, so its size makes an intermediate "
            "pick. Note: the name is widely used in the trade but its formal taxonomic status "
            "is unsettled (often listed as Avicularia sp. 'Braunshauseni'). Tall enclosure, "
            f"light moisture, water dish. {_VENT} {_DEFENSE}"
        ),
        "source_url": "https://www.grimoireexotics.com/post/avicularia-sp-braunshauseni-goliath-pink-toe-tarantula-care-guide",
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
