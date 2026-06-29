"""
Care-guide expansion — TRUE SPIDERS batch 2 (BRIEF-care-guide-expansion §2).

5 net-new (4 jumpers + a green lynx for diversity), verified absent from prod.
Single-table insert into `invert_species` (taxon='true_spider').

Honesty-first: cited per row; all harmless to humans → venom_severity='mild',
medically_significant_venom=False. P. cardinalis husbandry follows standard
Phidippus care (its literature is ID-focused), noted. image_url left null for the
sourcer. Controlled vocab matched to schema.

Run with: python3 seed_care_expansion_jumping_spiders_batch2.py   (idempotent)
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


def _jumper(**kw):
    base = dict(
        taxon="true_spider", family="Salticidae", order_name="Araneae",
        feeding_mode="predator", type="arboreal", burrowing="none",
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        water_dish_required=False, communal_suitable=False, growth_rate="fast",
        webbing_amount="retreat webbing only",
        enclosure_size_adult="4x4x8 inches (vertical)", substrate_depth="1-2 inches",
        substrate_type="coco fiber; vertical decor for climbing + silk retreats; light mist for drinking",
        prey_size="flies, fruit flies, small crickets", feeding_frequency_adult="2-3 prey per week",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _jumper(
        scientific_name="Phidippus otiosus", common_names=["Canopy Jumping Spider"],
        genus="Phidippus", care_level="intermediate",
        temperament="bold, curious; high-strung, leaps upward when startled",
        native_region="Southeastern USA",
        adult_size="female ~13 mm, male ~10 mm body", adult_length_min_mm=9, adult_length_max_mm=13,
        temperature_min=70, temperature_max=80, humidity_min=50, humidity_max=70,
        care_guide=(
            "A treetop ('canopy') North American jumper — bold and charismatic like the regal, "
            "but a touch more high-strung and quick to bolt upward, so it's an intermediate pick. "
            "Give it a tall, well-ventilated enclosure with top-heavy decor (it builds hammock "
            "retreats up high), room temperature (70-80°F), and a light mist for drinking. Takes "
            "flying and small crawling prey. Harmless, mild venom."
        ),
        source_url="https://exoticssource.com/blogs/exotic-topics/otiosus-jumping-spider-phidippus-otiosus-complete-care-guide",
    ),
    _jumper(
        scientific_name="Phidippus cardinalis", common_names=["Cardinal Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious; harmless", native_region="Eastern & central USA",
        adult_size="8-12 mm body", adult_length_min_mm=8, adult_length_max_mm=12,
        temperature_min=70, temperature_max=82, humidity_min=50, humidity_max=60,
        care_guide=(
            "A vivid scarlet North American jumper — a velvet-ant (Dasymutilla) mimic, bright red "
            "with black markings. Species-specific husbandry is sparse, so this follows standard "
            "Phidippus care: a tall, well-lit enclosure with climbing decor, room temperature, "
            "moderate humidity via a light mist every 2-3 days. Bold, people-curious, and "
            "harmless with mild venom. A stunning beginner jumper."
        ),
        source_url="https://spideridentifications.com/cardinal-jumping.html",
    ),
    _jumper(
        scientific_name="Hyllus giganteus", common_names=["Giant Jumping Spider"],
        genus="Hyllus", care_level="intermediate",
        temperament="bold but startles easily; not for handling",
        native_region="Southeast Asia, Australia",
        adult_size="female ~25 mm body (largest jumper)", adult_length_min_mm=18, adult_length_max_mm=25,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=70,
        feeding_frequency_adult="2-3 prey per week",
        care_guide=(
            "The largest jumping spider in the world — a heavy-bodied salticid with a huge, "
            "expressive face. Like its cousin H. diardi it wants it warm (75-85°F, often a "
            "thermostatted heat source) and humid (60-70%) in a tall, ventilated enclosure with "
            "cork and plants, misted daily-ish. Bold but startles easily, so an intermediate, "
            "look-don't-handle pick. Harmless, mild venom."
        ),
        source_url="https://spiderswebhq.com/hyllus-giganteus/",
    ),
    _jumper(
        scientific_name="Thiania bhamoensis", common_names=["Fighting Spider", "Asian Fighting Spider"],
        genus="Thiania", care_level="beginner",
        temperament="bold; males fight rivals; builds a leaf retreat",
        native_region="Southeast Asia",
        adult_size="~0.4 in body (1 cm)", adult_length_min_mm=8, adult_length_max_mm=11,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=70,
        prey_size="fruit flies, flies, small feeders",
        care_guide=(
            "A small, dazzling metallic blue-green Southeast Asian jumper, famous as the "
            "children's 'fighting spider' (rival males display and spar — house individually). "
            "Unusually for a jumper it binds two leaves into a silk retreat to rest, molt, and "
            "lay eggs. Keep warm (75-85°F) and humid (60-70%) in a small ventilated enclosure "
            "with foliage. Light feeder. Harmless, mild venom."
        ),
        source_url="https://en.wikipedia.org/wiki/Thiania_bhamoensis",
    ),
    _jumper(
        scientific_name="Peucetia viridans", common_names=["Green Lynx Spider"],
        genus="Peucetia", family="Oxyopidae", care_level="intermediate",
        temperament="agile ambusher; females spray venom in defense",
        native_region="Southern USA, Central America",
        adult_size="female 16-26 mm, male ~12 mm body", adult_length_min_mm=12, adult_length_max_mm=26,
        type="arboreal", webbing_amount="none (ambush hunter, no prey web)",
        temperature_min=72, temperature_max=85, humidity_min=50, humidity_max=65,
        substrate_type="coco fiber with tall plants/foliage to ambush from; light mist",
        prey_size="flies, crickets, moths", feeding_frequency_adult="2-3 prey per week",
        care_guide=(
            "A brilliant green lynx spider (family Oxyopidae, not a jumper) that ambushes "
            "pollinators from flowers and foliage — agile, able to leap, and a fascinating "
            "display animal. No prey web; give it tall plants to hunt from, warm temps, and "
            "moderate humidity with light misting. Harmless to humans (bite is painful but not "
            "medically significant); note that guarding females can 'spit' venom defensively, so "
            "don't handle. Lives about a year."
        ),
        source_url="https://en.wikipedia.org/wiki/Peucetia_viridans",
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
