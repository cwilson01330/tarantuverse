"""
Care-guide expansion — TRUE SPIDER batch 2 (catalog expansion).

8 net-new true spiders, verified absent from the live catalog AND from
true_spiders_batch1 / jumping_spiders_batch2. Single-table insert into
`invert_species` (taxon='true_spider').

Mix to broaden the taxon:
  * 3 jumping spiders (Salticidae) — mild venom, harmless
  * 1 huntsman (Sparassidae)       — mild venom, fast/skittish
  * 2 orb-weavers (Araneidae)      — mild venom, harmless
  * 1 brown widow (Theridiidae)    — MEDICALLY SIGNIFICANT venom
  * 1 false widow (Theridiidae)    — mild venom (name resemblance only)

Honesty-first: cited per row. Where captive husbandry is thin (wild orb-weavers
Argiope appensa / Araneus diadematus, and Habronattus coecatus) the guide uses
generalized standard husbandry for the group and says so. Latrodectus geometricus
is flagged medically_significant + no handling. image_url left null for the
sourcer. String caps respected (adult_size ≤50, temperament ≤100, type ≤60,
native_region ≤200, substrate_type ≤200).

Run with: python3 seed_care_expansion_true_spiders_batch2.py   (idempotent)
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
        scientific_name="Hyllus semicupreus", common_names=["Heavy-bodied Jumper"],
        genus="Hyllus", care_level="beginner",
        temperament="calm, docile, personable; harmless",
        native_region="South and Southeast Asia",
        adult_size="7-9 mm body", adult_length_min_mm=7, adult_length_max_mm=9,
        temperature_min=72, temperature_max=82, humidity_min=60, humidity_max=70,
        care_guide=(
            "A small, stocky Asian jumper with the big-eyed appeal of the genus, and a calm, "
            "docile temperament that suits beginners. Keep one to a tall little enclosure (an 8-in "
            "cube is plenty) with climbing decor and a high silk retreat, at 72-82°F and 60-70% "
            "humidity with a light mist for drinking. Feeds readily on flies, fruit flies, and "
            "small crickets a few times a week. Short-lived (often ~1 year); harmless, mild venom. "
            "Solitary."
        ),
        source_url="https://bantam.earth/heavy-bodied-jumper-hyllus-semicupreus/",
    ),
    _jumper(
        scientific_name="Menemerus bivittatus", common_names=["Gray Wall Jumper", "Gray Wall Jumping Spider"],
        genus="Menemerus", care_level="beginner",
        temperament="bold, active wall-hunter; curious; harmless",
        native_region="Pantropical; common on walls in warm regions and the southern USA",
        adult_size="~9 mm body", adult_length_min_mm=7, adult_length_max_mm=10,
        temperature_min=70, temperature_max=82, humidity_min=50, humidity_max=60,
        care_guide=(
            "A flat, gray, cosmopolitan jumper usually seen hunting on sunlit walls and fences. "
            "Keep one to a small vertical enclosure (4x4x4 in or larger) with lots of climbing "
            "surfaces and a hide, at 70-79°F and a moderate 50-60% humidity with a light mist "
            "once or twice a week — keep it on the drier side, as it dislikes stagnant damp. "
            "Feeds on fruit flies, houseflies, and small crickets 2-3 times a week. Bold and "
            "low-maintenance; harmless, mild venom. Solitary."
        ),
        source_url="https://exoticssource.com/blogs/exotic-topics/menemerus-bivittatus-gray-wall-jumping-spider-care-sheet",
    ),
    _jumper(
        scientific_name="Habronattus coecatus", common_names=["Coecatus Jumping Spider"],
        genus="Habronattus", care_level="intermediate",
        temperament="tiny, active; males court with vivid displays; harmless",
        native_region="North America",
        adult_size="5-7 mm body", adult_length_min_mm=5, adult_length_max_mm=7,
        temperature_min=68, temperature_max=82, humidity_min=60, humidity_max=70,
        care_guide=(
            "A tiny, jewel-colored North American jumper — the males are famous for elaborate "
            "courtship dances. Species-specific husbandry is sparse, so this uses standard "
            "Habronattus care: a small vertical enclosure with climbing decor and a silk retreat, "
            "room temperature (slightly warmer, ~80°F, by day is fine), and 60-70% humidity from "
            "a light mist, well ventilated to avoid mold. Because it is so small it needs small "
            "prey — fruit flies for youngsters, small flies as adults. Harmless, mild venom. "
            "Solitary."
        ),
        source_url="https://bugsincyberspace.com/jumping-spider-care-sheet/",
    ),
    # ---- Huntsman (Sparassidae) ----
    _jumper(
        scientific_name="Heteropoda boiei", common_names=["Lichen Huntsman Spider"],
        genus="Heteropoda", family="Sparassidae", care_level="intermediate",
        type="arboreal (huntsman)",
        temperament="fast, skittish; flees rather than bites; bite mechanically painful",
        native_region="Southeast Asia",
        adult_size="up to ~6 in leg span", adult_length_min_mm=20, adult_length_max_mm=40,
        webbing_amount="no prey web; silk retreat only",
        enclosure_size_adult="tall enclosure with cork bark slabs to hide behind",
        substrate_type="peat/coco fiber with sphagnum to hold ~75% humidity; cork bark for hides",
        prey_size="crickets, roaches, mealworms", feeding_frequency_adult="about once a week",
        temperature_min=75, temperature_max=86, humidity_min=55, humidity_max=75,
        care_guide=(
            "A large, flat, lichen-patterned huntsman that hunts by ambush and speed rather than "
            "a web. Give it a tall enclosure with cork bark slabs to press behind, warmth of "
            "75-86°F, and 55-75% humidity from regular misting of the walls (it drinks the "
            "droplets); strong ventilation is essential. Feed crickets or roaches about weekly. "
            "It is fast and skittish and will bolt rather than fight — the venom is not dangerous "
            "to a healthy person, though a bite is mechanically painful. Not a handling spider; "
            "keep the enclosure escape-proof. Solitary."
        ),
        source_url="https://spidersworld.eu/en/other-spiders/1253-heteropoda-boiei-3cm-giant-huntsman-spider.html",
    ),
    # ---- Orb-weavers (Araneidae) ----
    _web_spider(
        scientific_name="Argiope appensa", common_names=["Hawaiian Garden Spider", "Banana Spider"],
        genus="Argiope", care_level="intermediate",
        temperament="non-aggressive; sits head-down in web; harmless",
        native_region="Pacific islands, Taiwan, Indonesia, New Guinea; Hawaii",
        adult_size="female 2-2.5 in, male ~0.75 in", adult_length_min_mm=19, adult_length_max_mm=65,
        webbing_amount="large orb web with a zig-zag stabilimentum",
        temperature_min=72, temperature_max=86, humidity_min=55, humidity_max=75,
        care_guide=(
            "A big, boldly black-and-yellow Pacific orb-weaver that hangs head-down in the middle "
            "of its zig-zag-decorated web. Captive husbandry is limited, so this is generalized "
            "orb-weaver care: a tall, airy mesh enclosure large enough for its sizable web, twig "
            "and branch anchor points, warm sunny conditions, flying prey and crickets, and a "
            "daily light mist for ambient humidity. Non-aggressive with only mild, bee-sting-like "
            "venom. An annual, solitary species."
        ),
        source_url="https://en.wikipedia.org/wiki/Argiope_appensa",
    ),
    _web_spider(
        scientific_name="Araneus diadematus", common_names=["European Garden Spider", "Cross Orbweaver"],
        genus="Araneus", care_level="intermediate",
        temperament="shy, non-aggressive; drops from web when disturbed; harmless",
        native_region="Europe; introduced to North America",
        adult_size="female up to ~1 in, male smaller", adult_length_min_mm=6, adult_length_max_mm=20,
        webbing_amount="classic orb web, often rebuilt daily",
        temperature_min=60, temperature_max=80, humidity_min=55, humidity_max=70,
        care_guide=(
            "The familiar cross-marked garden orb-weaver of Europe and, now, North America. It is "
            "an outdoor annual not commonly kept indoors, so captive care is generalized "
            "orb-weaver husbandry: a tall, airy mesh enclosure with twig anchor points for the "
            "orb it rebuilds most days, cool-to-mild temperatures, a daily light mist, and flying "
            "prey such as flies and small crickets. Shy and non-aggressive, dropping from the web "
            "when disturbed; mild venom, harmless to humans. Solitary."
        ),
        source_url="https://en.wikipedia.org/wiki/Araneus_diadematus",
    ),
    # ---- Widow (Theridiidae) — MEDICALLY SIGNIFICANT ----
    _web_spider(
        scientific_name="Latrodectus geometricus", common_names=["Brown Widow"],
        genus="Latrodectus", family="Theridiidae", care_level="advanced",
        type="cobweb (web)",
        temperament="shy, reclusive; venom is MEDICALLY SIGNIFICANT — no handling",
        native_region="Cosmopolitan in warm regions; widespread in the southern USA",
        adult_size="female 7-10 mm, male ~4 mm", adult_length_min_mm=4, adult_length_max_mm=15,
        webbing_amount="irregular tangle (cobweb)",
        medically_significant_venom=True, venom_severity="medically_significant",
        enclosure_size_adult="8x8x10 in or 32oz, vertical web anchors",
        substrate_type="anchor points (sticks, cork, mesh) for an irregular cobweb; substrate optional",
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        care_guide=(
            "A tan, mottled widow with a striking orange hourglass — a hardy, low-maintenance "
            "cobweb-builder, but one for experienced, cautious keepers only. Its venom is the same "
            "type as the black widow's (latrodectism) and is medically significant, so it requires "
            "escape-proof housing and absolutely no handling; in practice brown widow bites tend "
            "to be milder and more localized than black widow bites because far less venom is "
            "delivered, but it must still be treated with full respect. Give a tall enclosure with "
            "anchor points for its irregular web, room temperature, occasional misting for water, "
            "and crickets or flies. Shy and reluctant to bite. Solitary."
        ),
        source_url="https://en.wikipedia.org/wiki/Latrodectus_geometricus",
    ),
    # ---- False widow (Theridiidae) — mild ----
    _web_spider(
        scientific_name="Steatoda grossa", common_names=["False Widow", "Cupboard Spider"],
        genus="Steatoda", family="Theridiidae", care_level="beginner",
        type="cobweb (web)",
        temperament="shy, non-aggressive; flees when disturbed; mild venom",
        native_region="Cosmopolitan; often indoors in cool, dark spots",
        adult_size="female 6-10.5 mm, male 4-10 mm", adult_length_min_mm=4, adult_length_max_mm=11,
        webbing_amount="irregular tangle (cobweb)",
        venom_severity="mild",
        enclosure_size_adult="small enclosure (32oz+) with vertical web anchors",
        substrate_type="anchor points (sticks, cork, mesh) for a tangled cobweb; substrate optional",
        temperature_min=60, temperature_max=78, humidity_min=45, humidity_max=60,
        care_guide=(
            "A glossy dark cobweb-builder often found in cupboards, sheds, and basements — "
            "resembles a true widow but is only distantly related and far less venomous. Very "
            "hardy and low-maintenance: it favors cooler, darker microclimates (about 60-78°F), "
            "modest humidity, and can go months between meals as long as it has water. Give a "
            "small enclosure with anchor points for its tangled web, occasional misting, and "
            "crickets or flies every week or two. Shy and non-aggressive; its bite is minor, "
            "roughly a wasp sting, with no lasting effects. Solitary; very long-lived for a small "
            "spider (females up to ~6 years)."
        ),
        source_url="https://en.wikipedia.org/wiki/Steatoda_grossa",
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
