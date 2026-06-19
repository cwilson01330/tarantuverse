"""
Care-guide expansion — WHIP SPIDERS + VINEGAROONS batch 2 (BRIEF §2).

6 net-new (4 Amblypygi + 2 Thelyphonida), verified absent from prod.
Single-table insert into `invert_species`.

Honesty-first: cited per row. Whip spiders are venomless/stingless → venom_severity
null; vinegaroons too (they spray acetic acid defensively — noted, not venom).
image_url left null for the sourcer.

Run with: python3 seed_care_expansion_amblypygi_uropygi_batch2.py   (idempotent)
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


def _whip(**kw):
    base = dict(
        taxon="whip_spider", family="Phrynidae", order_name="Amblypygi",
        care_level="intermediate", feeding_mode="predator", type="arboreal",
        burrowing="none", growth_rate="medium",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=True, communal_suitable=False,
        prey_size="crickets, roaches", feeding_frequency_adult="1-2 prey per week",
        temperature_min=72, temperature_max=80, humidity_min=70, humidity_max=90,
        enclosure_size_adult="vertical enclosure with cork bark/flat hides", substrate_depth="2-3 inches",
        substrate_type="moist coco fiber; vertical cork bark for clinging; water dish; strong ventilation",
    )
    base.update(kw)
    return base


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
    _whip(
        scientific_name="Damon johnstonii", common_names=["Johnston's Whip Spider"],
        genus="Damon", family="Phrynichidae", communal_suitable=True,
        temperament="shy; freezes or flees; communal-tolerant",
        native_region="East/Southern Africa",
        adult_size="body 1.2-1.6 in; legspan to ~17 in", adult_length_min_mm=30, adult_length_max_mm=40,
        humidity_min=65, humidity_max=80,
        care_guide=(
            "An African whip spider with an enormous antenniform-leg span — completely harmless "
            "(no venom, no sting). Like other Damon it lives in rock and bark crevices and "
            "tolerates slightly lower humidity (65-80%) than tropical genera, but dehydration is "
            "still the top killer, so mist and provide water. Often kept communally given vertical "
            "cork to cling to. Tall enclosure, strong ventilation. Shy — freezes or bolts."
        ),
        source_url="https://www.thedefiantforest.com/blogs/news/keeping-whip-spiders-the-care-and-maintenance-of-amblypygids",
    ),
    _whip(
        scientific_name="Phrynus longipes", common_names=["Puerto Rican Whip Spider"],
        genus="Phrynus", temperament="shy but territorial; nocturnal",
        native_region="Caribbean (Puerto Rico, Hispaniola)",
        adult_size="body ~0.75 in; legspan to ~10 in", adult_length_min_mm=15, adult_length_max_mm=20,
        care_guide=(
            "A large Caribbean whip spider (the 'guabá'), a dramatic display animal with a "
            "near-ten-inch leg span on a small body. Harmless — no venom, no sting. Keep warm "
            "(72-80°F) and humid (70-90%) with daily misting and good airflow, plus vertical cork "
            "to cling to and molt from. Nocturnal and shy, though territorial toward its own kind, "
            "so house individually unless very spacious."
        ),
        source_url="https://en.wikipedia.org/wiki/Phrynus_longipes",
    ),
    _whip(
        scientific_name="Heterophrynus elaphus", common_names=["Peruvian Giant Whip Spider"],
        genus="Heterophrynus", temperament="shy; freezes or flees",
        native_region="Amazon Basin (Peru)",
        adult_size="body ~1.5-2.4 in; legspan to ~10 in", adult_length_min_mm=40, adult_length_max_mm=60,
        humidity_min=75, humidity_max=90,
        care_guide=(
            "A giant Amazonian whip spider from humid cave mouths and buttressed tree trunks — "
            "an impressive, alien-looking display arachnid, and harmless (no venom, no sting). "
            "Wants warm, very humid conditions (75-90%) with strong ventilation and tall cork bark "
            "to cling to. Nocturnal and extremely shy, freezing or retreating when disturbed. "
            "Dehydration is the main risk — mist and provide water."
        ),
        source_url="https://marshallarachnids.com/pages/whipspider-care-guide",
    ),
    _whip(
        scientific_name="Acanthophrynus coronatus", common_names=["Mexican Giant Whip Spider"],
        genus="Acanthophrynus", temperament="shy; lightning-fast when disturbed",
        native_region="Mexico (incl. Baja)",
        adult_size="legspan to ~7 in (18 cm)", adult_length_min_mm=30, adult_length_max_mm=40,
        temperature_min=70, temperature_max=78, humidity_min=70, humidity_max=85,
        care_guide=(
            "A large Mexican whip spider — totally harmless but startlingly fast. Keep it around "
            "70-78°F with moderate-to-high humidity, a tall enclosure with vertical cork to climb "
            "and molt on, and a couple inches of substrate. Nocturnal; operates largely by touch "
            "via its long feeler legs. Long-lived (~7 years). House individually; mist and provide "
            "water to prevent dehydration."
        ),
        source_url="https://en.wikipedia.org/wiki/Acanthophrynus",
    ),
    _vin(
        scientific_name="Mastigoproctus tohono", common_names=["Sonoran Vinegaroon", "Arizona Vinegaroon"],
        genus="Mastigoproctus", temperament="docile; rarely sprays",
        native_region="Arizona, New Mexico, northern Sonora",
        adult_size="~2.2 in body (plus tail)", adult_length_min_mm=56, adult_length_max_mm=59,
        temperature_min=72, temperature_max=88, humidity_min=50, humidity_max=70,
        care_guide=(
            "The southwestern US vinegaroon (split from the giant vinegaroon), often with a "
            "reddish tint. Docile and slow to use its acetic-acid spray — harmless to people "
            "(only irritating if it reaches the eyes). No venom, no sting. From arid country that "
            "wakes up in monsoon season, so give deep substrate kept dry on top and damp below "
            "for a humid burrow, plus a water dish. Room temperature is fine."
        ),
        source_url="https://en.wikipedia.org/wiki/Mastigoproctus_tohono",
    ),
    _vin(
        scientific_name="Mastigoproctus floridanus", common_names=["Florida Vinegaroon"],
        genus="Mastigoproctus", temperament="docile; sprays acetic acid if pressed",
        native_region="Florida, southeastern USA",
        adult_size="up to 3.5 in body (plus tail)", adult_length_min_mm=40, adult_length_max_mm=60,
        temperature_min=72, temperature_max=85, humidity_min=65, humidity_max=80,
        care_guide=(
            "The Florida member of the giant-vinegaroon complex — care follows Mastigoproctus "
            "giganteus: a deep (4-6 inch) burrowable substrate kept moist below with a drier "
            "surface, cork-bark hides, leaf litter, and a water dish, at 72-85°F and ~65-80% "
            "humidity. No venom and no sting; its only defense is a harmless acetic-acid (vinegar) "
            "spray — keep it out of your eyes. Docile, long-lived, a great display species."
        ),
        source_url="https://www.bugguide.net/node/view/1515503/data",
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
