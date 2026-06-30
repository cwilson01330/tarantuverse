"""
Care-guide expansion — TRUE SPIDER batch (BRIEF-care-guide-expansion §2).

7 net-new true spiders, verified absent from BOTH the live catalog AND the
pending-but-unrun jumping_spiders_batch2 (which already covers Hyllus giganteus,
Peucetia viridans, Phidippus cardinalis, Phidippus otiosus, Thiania bhamoensis
— run that one too). Single-table insert into `invert_species`
(taxon='true_spider').

Mix to broaden the taxon beyond salticids:
  * 3 jumping spiders (Salticidae)  — mild venom, harmless
  * 3 orb-weavers (Araneidae)       — mild venom, harmless
  * 1 widow (Theridiidae)           — MEDICALLY SIGNIFICANT venom

Honesty-first: cited per row. For the wild orb-weavers (Joro, spinybacked)
captive data is generalized standard orb-weaver husbandry — noted in the guide.
Latrodectus mactans is flagged medically_significant + no handling. image_url
left null for the sourcer.

Run with: python3 seed_care_expansion_true_spiders_batch1.py   (idempotent)
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


def _web_spider(**kw):
    base = dict(
        taxon="true_spider", family="Araneidae", order_name="Araneae",
        feeding_mode="predator", type="orb-weaver (web)", burrowing="none",
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        water_dish_required=False, communal_suitable=False, growth_rate="fast",
        webbing_amount="builds a large orb web",
        enclosure_size_adult="tall mesh cage with twig anchor points",
        substrate_depth="1-2 inches (web spider; rarely on the ground)",
        substrate_type="moist substrate to hold ambient humidity; twigs/branches to anchor web",
        prey_size="flying insects, crickets", feeding_frequency_adult="2-3 prey per week",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    # ---- Jumping spiders (Salticidae) ----
    _jumper(
        scientific_name="Phidippus clarus", common_names=["Brilliant Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious, tameable; harmless",
        native_region="Eastern North America",
        adult_size="8-10 mm body", adult_length_min_mm=8, adult_length_max_mm=10,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=60,
        care_guide=(
            "A small, bold North American jumper with the big-eyed charm of the genus. Keep one "
            "to a tall little enclosure with climbing decor and a high silk retreat, at "
            "70-85°F and 50-60% humidity with a light mist for drinking. Feed flies, fruit "
            "flies, or small crickets every few days. Curious and tameable; harmless, mild "
            "venom. Solitary."
        ),
        source_url="https://en.wikipedia.org/wiki/Phidippus_clarus",
    ),
    _jumper(
        scientific_name="Phidippus apacheanus", common_names=["Apache Jumping Spider"],
        genus="Phidippus", care_level="beginner",
        temperament="bold, curious (velvet-ant mimic); harmless",
        native_region="Central and southern USA, Mexico",
        adult_size="8-13 mm body", adult_length_min_mm=8, adult_length_max_mm=13,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=60,
        care_guide=(
            "A vivid red-and-black North American jumper that mimics a velvet ant. "
            "Species-specific husbandry is sparse, so this follows standard Phidippus care: a "
            "tall, well-lit enclosure with climbing decor and a silk retreat, room temperature, "
            "light misting for drinking, and flies or small crickets a few times a week. Bold "
            "and personable; harmless, mild venom. Solitary."
        ),
        source_url="https://marshallarachnids.com/pages/phidippus-care-guide",
    ),
    _jumper(
        scientific_name="Plexippus paykulli", common_names=["Pantropical Jumping Spider"],
        genus="Plexippus", care_level="beginner",
        temperament="bold, active, curious; harmless",
        native_region="Pantropical worldwide; common in the southern USA",
        adult_size="9-12 mm body", adult_length_min_mm=9, adult_length_max_mm=12,
        temperature_min=72, temperature_max=82, humidity_min=50, humidity_max=60,
        care_guide=(
            "A hardy, cosmopolitan jumper often seen hunting on walls near lights. Keep one to a "
            "small (4x4x4 in or larger) vertical enclosure with climbing surfaces and a hide, at "
            "72-82°F and 50-60% humidity with a light mist. Feeds readily on flies and small "
            "crickets two or three times a week. Active and low-maintenance; harmless, mild "
            "venom. Solitary."
        ),
        source_url="https://exoticssource.com/blogs/exotic-topics/plexippus-paykulli-pantropical-jumping-spider-care-sheet",
    ),
    # ---- Orb-weavers (Araneidae) ----
    _web_spider(
        scientific_name="Argiope bruennichi", common_names=["Wasp Spider"],
        genus="Argiope", care_level="intermediate",
        temperament="non-aggressive; vibrates web or drops to hide when disturbed",
        native_region="Europe, North Africa, temperate Asia",
        adult_size="female ~15 mm, male ~5 mm", adult_length_min_mm=5, adult_length_max_mm=17,
        webbing_amount="large orb web with a zig-zag stabilimentum",
        temperature_min=68, temperature_max=82, humidity_min=50, humidity_max=70,
        care_guide=(
            "A spectacular yellow-, black-, and white-banded orb-weaver. It needs a tall, airy "
            "mesh cage with twigs and branches to anchor a full orb web; keep ambient humidity "
            "up (add a moist substrate in dry homes) and feed flying insects and crickets. "
            "Non-aggressive — when disturbed it shivers the web into a blur or drops to hide. A "
            "summer-active annual species; solitary and cannibalistic. Mild venom, harmless to "
            "humans."
        ),
        source_url="https://britishspiders.org.uk/wasp-spider",
    ),
    _web_spider(
        scientific_name="Trichonephila clavata", common_names=["Joro Spider"],
        genus="Trichonephila", care_level="intermediate",
        temperament="shy, non-aggressive; tiny fangs rarely break skin",
        native_region="East Asia; introduced to the southeastern USA",
        adult_size="female ~17-25 mm, male ~7 mm", adult_length_min_mm=7, adult_length_max_mm=25,
        webbing_amount="huge golden-silk orb web",
        temperature_min=60, temperature_max=85, humidity_min=50, humidity_max=70,
        care_guide=(
            "A large, vividly colored golden-silk orb-weaver — very topical in the southeastern "
            "US, where it is now established. Shy and non-aggressive, with mild venom and fangs "
            "that rarely penetrate skin. Captive data is limited, so this is generalized "
            "orb-weaver care: a tall, airy mesh enclosure big enough for its very large web, "
            "branch anchor points, flying prey, and a daily light mist; it tolerates a wide "
            "temperature range. An annual species; solitary."
        ),
        source_url="https://fieldreport.caes.uga.edu/publications/C1273/joro-spider-trichonephila-clavata/",
    ),
    _web_spider(
        scientific_name="Gasteracantha cancriformis", common_names=["Spinybacked Orbweaver"],
        genus="Gasteracantha", care_level="beginner",
        temperament="harmless, sedentary",
        native_region="Southern USA, Central and South America",
        adult_size="female 5-9 mm, male 2-3 mm", adult_length_min_mm=2, adult_length_max_mm=9,
        webbing_amount="small orb web, usually rebuilt daily",
        temperature_min=72, temperature_max=85, humidity_min=60, humidity_max=75,
        care_guide=(
            "A tiny, ornate, crab-shaped orb-weaver with six bright spines on a hard abdomen — "
            "completely harmless. Captive data is limited, so this is generalized orb-weaver "
            "care: a small, airy enclosure with twig anchor points for the orb it rebuilds most "
            "mornings, warm temperatures, a light daily mist, and small flying prey (fruit "
            "flies, houseflies). A short-lived annual; solitary."
        ),
        source_url="https://www.bugguide.net/node/view/2026",
    ),
    # ---- Widow (Theridiidae) ----
    _web_spider(
        scientific_name="Latrodectus mactans", common_names=["Southern Black Widow"],
        genus="Latrodectus", family="Theridiidae", care_level="advanced",
        type="cobweb (web)",
        temperament="shy and reclusive; venom is MEDICALLY SIGNIFICANT — no handling",
        native_region="Southeastern USA",
        adult_size="female 8-13 mm, male ~4 mm", adult_length_min_mm=4, adult_length_max_mm=13,
        webbing_amount="irregular tangle (cobweb)",
        medically_significant_venom=True, venom_severity="medically_significant",
        enclosure_size_adult="8x8x10 in or 32oz, vertical web anchors",
        substrate_type="anchor points (sticks, cork, mesh) for an irregular cobweb; substrate optional",
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        care_guide=(
            "The classic glossy-black widow with the red hourglass — a hardy, low-maintenance "
            "web-builder, but strictly for experienced, cautious keepers: its venom is medically "
            "significant (latrodectism), so it demands escape-proof housing and absolutely no "
            "handling. Give a tall enclosure with anchor points for its irregular cobweb, room "
            "temperature, occasional misting for water, and crickets or flies. Shy and reluctant "
            "to bite, but treat with full respect. Solitary."
        ),
        source_url="https://exoticssource.com/blogs/exotic-topics/black-widow-spider-latrodectus-mactans-complete-care-guide",
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
