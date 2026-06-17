"""
Care-guide expansion — TRUE SPIDERS batch 1 (BRIEF-care-guide-expansion §6).

The brief's other top SEO white space: jumping spiders are a booming pet/search
niche with near-zero competition in app care DBs. 7 net-new, verified absent from
prod 2026-06-16 (P. audax, P. regius, H. venatoria already present, excluded).

Single-table insert into `invert_species` (taxon='true_spider'); not in the legacy
`species` table, so no mirror (tarantula-only).

Honesty-first: every row cites a source_url; husbandry numbers are conservative
consensus across keeper care sheets; unknowns left null. These are all harmless to
humans → venom_severity='mild', medically_significant_venom=False. image_url left
null for the image agent to backfill on scientific_name_lower.

P. mystaceus / P. putnami: species-specific husbandry literature is thin, but
Phidippus genus care is highly uniform and well-established; their guides note they
follow standard Phidippus husbandry (honesty-first).

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {beginner,intermediate}; feeding_mode='predator';
  burrowing ∈ {none,heavy}; venom_severity='mild'.

Run with: python3 seed_care_expansion_jumping_spiders_batch1.py   (idempotent)
"""
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _jumper(**kw):
    """Defaults for a Salticid (jumping spider)."""
    base = dict(
        taxon="true_spider", family="Salticidae", order_name="Araneae",
        feeding_mode="predator", type="arboreal", burrowing="none",
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        water_dish_required=False, communal_suitable=False, growth_rate="fast",
        webbing_amount="retreat webbing only",
        enclosure_size_adult="4x4x8 inches (vertical)", substrate_depth="1-2 inches",
        substrate_type="coco fiber; vertical decor for climbing + silk retreats; light mist for drinking",
        prey_size="flies, fruit flies, small crickets, roach nymphs",
        feeding_frequency_adult="2-3 prey per week",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _jumper(
        scientific_name="Phidippus johnsoni",
        common_names=["Johnson's Jumping Spider", "Red-backed Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious; harmless",
        native_region="Western North America",
        adult_size="female 9-14 mm, male 6-11 mm body", adult_length_min_mm=6, adult_length_max_mm=14,
        temperature_min=68, temperature_max=80, humidity_min=40, humidity_max=55,
        care_guide=(
            "One of the most striking North American jumpers — a black spider with a solid red "
            "abdomen (females carry a central black stripe). A diurnal visual hunter from dry "
            "western habitats, so keep it warm and on the dry side: room temperature, low "
            "humidity, and only a light mist on the enclosure wall every few days for drinking "
            "(never spray the spider). Give it a tall, well-lit enclosure with cork, twigs, and "
            "plants to climb and anchor its silk retreat. Bold and people-curious; harmless, with "
            "only mild venom. A superb beginner jumper."
        ),
        source_url="https://thetarantulavault.com/johnsons-jumping-spider-care-guide/",
    ),
    _jumper(
        scientific_name="Phidippus mystaceus",
        common_names=["Peppered Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious; harmless",
        native_region="Southeastern & central North America",
        adult_size="~10 mm body", adult_length_min_mm=7, adult_length_max_mm=11,
        temperature_min=70, temperature_max=82, humidity_min=50, humidity_max=60,
        care_guide=(
            "A fuzzy North American jumper, brown to gray with three sets of black-and-white "
            "abdominal markings; females show a reddish 'mustache' below the eyes. Found in open "
            "grasslands across the southeast. Species-specific husbandry is sparse, so this "
            "follows standard, well-established Phidippus care: a tall, well-lit enclosure with "
            "climbing decor, room temperature, moderate humidity from a light mist every 2-3 days "
            "for drinking. Diurnal visual hunter, bold and curious, harmless with mild venom. A "
            "great beginner jumper."
        ),
        source_url="https://spideridentifications.com/phidippus-mystaceus.html",
    ),
    _jumper(
        scientific_name="Phidippus putnami",
        common_names=["Putnam's Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious; harmless",
        native_region="Eastern North America",
        adult_size="8-15 mm body", adult_length_min_mm=8, adult_length_max_mm=15,
        temperature_min=68, temperature_max=80, humidity_min=50, humidity_max=60,
        care_guide=(
            "A hairy, expressive eastern North American jumper with black tufts above the eyes "
            "and very furry chelicerae, appearing in white, brown, blue, and black morphs. A "
            "leaping ambush hunter (no prey web) with the genus's famously non-aggressive, "
            "people-watching disposition. Species-specific husbandry is sparse, so this follows "
            "standard Phidippus care: a tall, well-lit enclosure with climbing decor, room "
            "temperature, moderate humidity via light misting every 2-3 days. Harmless, mild "
            "venom. An excellent beginner jumper."
        ),
        source_url="https://spideridentifications.com/phidippus-putnami.html",
    ),
    _jumper(
        scientific_name="Hyllus diardi",
        common_names=["Giant Jumping Spider", "Heavy Jumping Spider"],
        genus="Hyllus", care_level="intermediate",
        temperament="bold, fast; harmless",
        native_region="Southeast Asia",
        adult_size="female 10-15 mm body (largest hobby jumper)", adult_length_min_mm=10, adult_length_max_mm=15,
        temperature_min=76, temperature_max=84, humidity_min=70, humidity_max=80,
        enclosure_size_adult="8x8x12 inches (vertical)",
        feeding_frequency_adult="2-3 prey per week",
        care_guide=(
            "The largest jumping spider commonly kept — a heavy-bodied Southeast Asian salticid "
            "with a big, photogenic face. Not a starter jumper: it wants it warmer (76-84°F, "
            "often a thermostat-controlled heat mat on the back panel) and more humid (70-80%) "
            "than a Phidippus, in a tall, well-ventilated enclosure with cork and plants. Lightly "
            "mist every day or two for even humidity and drinking droplets. Fast and bold but "
            "harmless, with mild venom. Best after you've kept a Phidippus first."
        ),
        source_url="https://exopetguides.com/jumping-spider/hyllus-diardi-care/",
    ),
    _jumper(
        scientific_name="Salticus scenicus",
        common_names=["Zebra Jumping Spider"],
        genus="Salticus", care_level="beginner",
        temperament="bold, curious; harmless",
        native_region="Holarctic (Europe, North America)",
        adult_size="5-9 mm body", adult_length_min_mm=5, adult_length_max_mm=9,
        temperature_min=65, temperature_max=78, humidity_min=50, humidity_max=60,
        enclosure_size_adult="4x4x6 inches (vertical)",
        prey_size="fruit flies, flies, small feeders",
        care_guide=(
            "A tiny, charismatic black-and-white striped jumper found on sunny walls and fences "
            "across Europe and North America. Its small size makes it easy to house — a compact, "
            "well-ventilated vertical enclosure with a few climbing anchors is plenty. Comfortable "
            "at cool room temperatures with moderate humidity from a light mist every couple of "
            "days. Feed small prey such as fruit flies. Curious and harmless, with mild venom — a "
            "fun, low-footprint beginner jumper."
        ),
        source_url="https://en.wikipedia.org/wiki/Zebra_spider",
    ),
    _jumper(
        scientific_name="Hogna carolinensis",
        common_names=["Carolina Wolf Spider"],
        genus="Hogna", family="Lycosidae", care_level="beginner",
        temperament="shy ground hunter; bite ~ bee sting",
        native_region="North America",
        adult_size="female 22-35 mm, male 18-20 mm body", adult_length_min_mm=18, adult_length_max_mm=35,
        type="terrestrial", burrowing="heavy", growth_rate="medium",
        water_dish_required=True, webbing_amount="none (ground hunter)",
        temperature_min=70, temperature_max=82, humidity_min=50, humidity_max=65,
        enclosure_size_adult="12x8x8 inches (deep substrate)", substrate_depth="4-6 inches",
        substrate_type="deep coco/soil for burrowing; hide; water dish",
        prey_size="crickets, roaches", feeding_frequency_adult="1-2 prey per week",
        care_guide=(
            "The largest wolf spider in North America — a robust, ground-dwelling night hunter "
            "(females reach ~1.4 inches) that digs deep burrows, sometimes ringed with a turret "
            "of debris. No prey web; it chases prey by speed and sharp eyesight. House it "
            "terrestrially with deep substrate to burrow, a hide, and a small water dish, at room "
            "temperature with moderate humidity. Shy of people but will bite if handled — venom "
            "is not medically significant (roughly a bee sting). A hardy, fascinating native "
            "display spider."
        ),
        source_url="https://en.wikipedia.org/wiki/Hogna_carolinensis",
    ),
    _jumper(
        scientific_name="Heteropoda davidbowie",
        common_names=["David Bowie Huntsman"],
        genus="Heteropoda", family="Sparassidae", care_level="intermediate",
        temperament="very fast, skittish, nocturnal",
        native_region="Malaysia (rainforest)",
        adult_size="body ~2.5 cm, ~4 in legspan", adult_length_min_mm=20, adult_length_max_mm=25,
        type="arboreal", growth_rate="fast",
        webbing_amount="retreat webbing only",
        temperature_min=75, temperature_max=82, humidity_min=70, humidity_max=80,
        enclosure_size_adult="12x12x18 inches (vertical), cork slabs", substrate_depth="2-3 inches",
        substrate_type="coco fiber; large angled cork bark for hiding/climbing; mist for humidity",
        prey_size="crickets, roaches", feeding_frequency_adult="1-2 prey per week",
        care_guide=(
            "A striking golden-haired huntsman named for Ziggy Stardust, from Malaysian "
            "rainforest. Big and flat (legspan to ~4 inches), nocturnal, and very fast — it hides "
            "in bark crevices by day and bolts when disturbed, so it's a look-don't-handle, "
            "intermediate species. Keep it warm (75-82°F) and humid (70-80%) in a tall, "
            "well-ventilated enclosure with large angled cork slabs to hide behind and climb; "
            "mist every 2-3 days. No urticating hairs; harmless mild venom but a fast biter. Not "
            "for handling."
        ),
        source_url="https://exoticsunlimitedusa.com/products/heteropoda-davidbowie-david-bowie-huntsman-0-5",
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
