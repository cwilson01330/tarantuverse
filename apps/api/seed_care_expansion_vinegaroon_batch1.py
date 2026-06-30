"""
Care-guide expansion — VINEGAROON batch (BRIEF-care-guide-expansion §2).

2 net-new vinegaroons (whip scorpions, order Thelyphonida), verified absent
from the live catalog (existing 5: Mastigoproctus giganteus / floridanus /
tohono, Typopeltis crucifer / stimpsonii). Single-table insert into
`invert_species` (taxon='vinegaroon').

The genuinely-kept vinegaroon pool is small, so this is a deliberately short,
honest batch of two well-supported additions rather than padding with
poorly-documented species.

Honesty-first: vinegaroons have NO venom — they defend by spraying a fine
acetic-acid mist (vinegar smell) from the base of the whip → venom_severity
null, with the spray noted in each guide. Cited per row.

Run with: python3 seed_care_expansion_vinegaroon_batch1.py   (idempotent)
"""
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")


def _vin(**kw):
    base = dict(
        taxon="vinegaroon", family="Thelyphonidae", order_name="Thelyphonida",
        care_level="beginner", feeding_mode="predator", type="fossorial",
        burrowing="heavy", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=True, communal_suitable=False,
        prey_size="crickets, roaches", feeding_frequency_adult="1 prey per week",
        temperature_min=72, temperature_max=85, humidity_min=55, humidity_max=75,
        enclosure_size_adult="terrestrial tank with deep substrate", substrate_depth="4-6 inches",
        substrate_type="deep moist coco/topsoil for burrowing; hide; water dish",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _vin(
        scientific_name="Typopeltis guangxiensis",
        common_names=["Chinese Vinegaroon", "Guangxi Whip Scorpion"],
        genus="Typopeltis", care_level="intermediate",
        temperament="strictly nocturnal; secretive deep burrower; sprays acetic acid",
        native_region="Southern China and Southeast Asia",
        adult_size="2.5-3 inches", adult_length_min_mm=50, adult_length_max_mm=75,
        temperature_min=70, temperature_max=82, humidity_min=70, humidity_max=85,
        substrate_type="deep moist peat/coco for deep burrows; cork/rock hides; keep dark; water dish",
        care_guide=(
            "An Asian vinegaroon that, like all whip scorpions, has no venom — it defends by "
            "spraying a fine vinegar-smelling mist of acetic acid from the base of its whip-like "
            "tail. Strictly nocturnal and shy of light, it burrows deeply, so give it 4-6 inches "
            "of moist substrate, hides, and a dark, humid (70-85%) enclosure with a water dish. "
            "A fascinating, harmless display animal; house individually."
        ),
        source_url="https://en.wikipedia.org/wiki/Typopeltis",
    ),
    _vin(
        scientific_name="Mastigoproctus scabrosus",
        common_names=["Rough Giant Vinegaroon"],
        genus="Mastigoproctus", care_level="beginner",
        temperament="docile; sprays acetic acid when threatened",
        native_region="Southwestern USA and Mexico",
        adult_size="2.5-3 inches", adult_length_min_mm=50, adult_length_max_mm=75,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=75,
        substrate_type="deep coco/topsoil that holds a burrow; hide; light moisture gradient; water dish",
        care_guide=(
            "A giant vinegaroon recently recognized as a full species (long lumped under "
            "Mastigoproctus giganteus). Care is identical to the giant vinegaroon: a deep, "
            "burrowable substrate kept with a moisture gradient, a hide, and a water dish at warm "
            "temps. It has no venom — it sprays a vinegar-like acetic-acid mist in defense (avoid "
            "getting it in your eyes). Docile, hardy, and long-lived; an excellent beginner "
            "arachnid."
        ),
        source_url="https://bioone.org/journals/bulletin-of-the-american-museum-of-natural-history/volume-2018/issue-418/0003-0090-418.1.1/Systematic-Revision-of-the-Giant-Vinegaroons-of-the-Mastigoproctus-giganteus/10.1206/0003-0090-418.1.1.full",
    ),
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(), taxon=taxon,
                scientific_name_lower=name.lower(), slug=_slugify(name),
                is_verified=True, **row,
            ))
            added += 1
            print(f"  Added: {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
