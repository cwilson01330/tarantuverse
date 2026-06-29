"""
Care-guide expansion — MANTIS batch 2 (BRIEF-care-guide-expansion §2).

5 net-new, verified absent from prod (existing 12 already include Hymenopus,
Idolomantis, Deroplatys desiccata, Hierodula membranacea, Sphodromantis lineola,
etc.). Single-table insert into `invert_species` (taxon='mantis').

Honesty-first: cited per row; mantises aren't venomous to humans → venom_severity
null. image_url left null for the sourcer. Controlled vocab matched to schema.

Run with: python3 seed_care_expansion_mantis_batch2.py   (idempotent)
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


def _mantis(**kw):
    base = dict(
        taxon="mantis", family="Mantidae", order_name="Mantodea",
        feeding_mode="predator", type="arboreal", burrowing="none",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=False, growth_rate="fast",
        enclosure_size_adult="≥3x body length tall, 2x wide; well-ventilated",
        substrate_depth="1-2 inches",
        substrate_type="coco fiber or paper towel; light misting for humidity/drinking",
        prey_size="flies, crickets, roaches", feeding_frequency_adult="every 2-3 days",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _mantis(
        scientific_name="Hierodula majuscula", common_names=["Giant Rainforest Mantis"],
        genus="Hierodula", care_level="beginner",
        temperament="bold, hardy", native_region="Australia (Queensland rainforest)",
        adult_size="3-5 inches", adult_length_min_mm=80, adult_length_max_mm=110,
        temperature_min=75, temperature_max=86, humidity_min=70, humidity_max=80,
        care_guide=(
            "A big, robust green Australian mantis — one of the largest kept and very hardy, "
            "making it a great larger-mantis starter. Comfortable at room warmth (75-86°F) with "
            "70-80% humidity from misting every other day, in a tall enclosure with branches and "
            "foliage to climb. Bold feeder that takes large flying and crawling prey. House "
            "individually; harmless to humans."
        ),
        source_url="https://thepetfaq.com/giant-rainforest-mantis/",
    ),
    _mantis(
        scientific_name="Sphodromantis viridis", common_names=["Giant African Mantis"],
        genus="Sphodromantis", care_level="beginner",
        temperament="bold, hardy", native_region="Africa, Middle East",
        adult_size="up to 4 inches", adult_length_min_mm=80, adult_length_max_mm=100,
        temperature_min=72, temperature_max=85, humidity_min=50, humidity_max=70,
        care_guide=(
            "A classic beginner mantis — large, green, bold, and tolerant of a range of "
            "conditions (68-85°F, moderate 50-70% humidity). A tall, ventilated enclosure with "
            "perches plus light daily-ish misting for drinking and clean molts is all it needs. "
            "Aggressive feeder. House individually; harmless to humans."
        ),
        source_url="https://dubiaroaches.com/blogs/invert-care/african-mantis-care-sheet",
    ),
    _mantis(
        scientific_name="Rhombodera basalis", common_names=["Giant Shield Mantis"],
        genus="Rhombodera", care_level="beginner",
        temperament="calm, hardy", native_region="Southeast Asia (Malaysia)",
        adult_size="~4 inches", adult_length_min_mm=100, adult_length_max_mm=120,
        temperature_min=72, temperature_max=86, humidity_min=60, humidity_max=80,
        care_guide=(
            "A bulky green mantis with a distinctive broad, shield-like extension of the "
            "pronotum. Hardy and forgiving of temperature/humidity swings — a good beginner "
            "large mantis. Keep warm with 60-80% humidity (light daily mist) and a tall "
            "enclosure full of sticks and fake plants to climb and hide in. House individually; "
            "harmless to humans."
        ),
        source_url="https://bantam.earth/malaysian-shield-mantis-rhombodera-basalis/",
    ),
    _mantis(
        scientific_name="Deroplatys lobata", common_names=["Malaysian Dead Leaf Mantis"],
        genus="Deroplatys", family="Deroplatyidae", care_level="intermediate",
        temperament="shy; superb leaf mimic; threat display when disturbed",
        native_region="Southeast Asia",
        adult_size="3-3.5 inches", adult_length_min_mm=80, adult_length_max_mm=90, growth_rate="medium",
        temperature_min=75, temperature_max=86, humidity_min=60, humidity_max=80,
        care_guide=(
            "A spectacular dead-leaf mimic — flattened, mottled brown, with a dramatic startle "
            "display. A touch more demanding than the giant green mantises: it needs higher, "
            "steady humidity (60-80%) and rough bark/sticks at a diagonal for safe molting, as "
            "it's prone to mis-molts if kept too dry. Warm (75-86°F), tall, well-ventilated "
            "enclosure. House individually; harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/dead-leaf-mantis/",
    ),
    _mantis(
        scientific_name="Theopropus elegans", common_names=["Banded Flower Mantis"],
        genus="Theopropus", family="Hymenopodidae", care_level="intermediate",
        temperament="ambush flower mimic; can be skittish",
        native_region="Southeast Asia",
        adult_size="female ~2 in, male ~1.2 in", adult_length_min_mm=30, adult_length_max_mm=50,
        temperature_min=75, temperature_max=86, humidity_min=60, humidity_max=70,
        care_guide=(
            "A small, striking flower mantis — green and cream with bold banding, the female "
            "noticeably larger than the male. Wants warm (75-86°F), moderately humid (60-70%) "
            "conditions with excellent ventilation and fine perches for clean molts. Light daily "
            "misting for drinking. Like other flower mantises, separate nymphs early "
            "(cannibalistic). Harmless to humans."
        ),
        source_url="https://bantam.earth/banded-flower-mantis-theopropus-elegans/",
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
