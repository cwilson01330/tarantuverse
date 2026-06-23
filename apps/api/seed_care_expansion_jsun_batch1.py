"""
Care-guide expansion — JSUN gap fill + true-spider / whip-spider / roach breadth.

9 net-new species into the unified `invert_species` catalog. Three fill gaps a
real keeper (netserpent1984 / "JSUN") had typed freeform with no catalog match
(Eresus walckenaeri, Charinus acosta, Compsodes schwarzi); the other six add
breadth to the under-served true_spider / whip_spider / roach taxa.

Honesty-first: every row cited; care data reflects current hobby husbandry, not
invention. Where captive data is genuinely thin (Charinus acosta, Compsodes
schwarzi) the care_guide says so and conservative values are used. venom_severity
follows the controlled vocab (mild | moderate | medically_significant | null).
Temperatures are °F (consistent with existing seeds). image_url left null for the
image sourcer.

Run (Render shell, from apps/api):  python3 seed_care_expansion_jsun_batch1.py   (idempotent)
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


def _true_spider(**kw):
    base = dict(
        taxon="true_spider", order_name="Araneae", family="Araneidae",
        care_level="intermediate", feeding_mode="predator", type="arboreal",
        burrowing="none", growth_rate="medium",
        urticating_hairs=False, medically_significant_venom=False, venom_severity="mild",
        water_dish_required=False, communal_suitable=False,
        prey_size="appropriately sized crickets / flies", feeding_frequency_adult="1-2 prey per week",
        temperature_min=70, temperature_max=82, humidity_min=50, humidity_max=70,
        enclosure_size_adult="tall enclosure with anchor points for webbing", substrate_depth="1-2 inches",
        substrate_type="coco fiber / topsoil; cross-ventilation",
    )
    base.update(kw)
    return base


def _whip(**kw):
    base = dict(
        taxon="whip_spider", order_name="Amblypygi", family="Charinidae",
        care_level="intermediate", feeding_mode="predator", type="arboreal",
        burrowing="none", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=True, communal_suitable=False,
        prey_size="small crickets / roach nymphs", feeding_frequency_adult="1-2 prey per week",
        temperature_min=72, temperature_max=80, humidity_min=75, humidity_max=90,
        enclosure_size_adult="vertical enclosure with cork bark to cling to", substrate_depth="2-3 inches",
        substrate_type="moist coco fiber; vertical cork bark; strong ventilation",
    )
    base.update(kw)
    return base


def _roach(**kw):
    base = dict(
        taxon="roach", order_name="Blattodea", family="Blaberidae",
        care_level="beginner", feeding_mode="omnivore", type="terrestrial",
        burrowing="light", growth_rate="medium",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True,
        prey_size="dog/fish food, fruit, leaf litter", feeding_frequency_adult="continuous (colony)",
        temperature_min=72, temperature_max=86, humidity_min=50, humidity_max=70,
        enclosure_size_adult="ventilated bin sized to colony", substrate_depth="2-3 inches",
        substrate_type="coco fiber / topsoil; bark + leaf litter hides",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    # ─── True spiders ──────────────────────────────────────────────────────
    _true_spider(
        scientific_name="Eresus walckenaeri", common_names=["Greek Ladybird Spider"],
        genus="Eresus", family="Eresidae", type="fossorial", burrowing="heavy", growth_rate="slow",
        temperament="shy; reclusive burrower", native_region="Greece and the eastern Mediterranean",
        adult_size="female body ~0.6 in", adult_length_min_mm=8, adult_length_max_mm=16,
        temperature_min=68, temperature_max=78, humidity_min=30, humidity_max=50,
        enclosure_size_adult="small terrestrial enclosure, 2+ in substrate", substrate_depth="2-3 inches",
        substrate_type="dry burrowable mix (soil/sand/clay); good ventilation",
        care_guide=(
            "A stunning ladybird spider — adult males are red with black spots, females a "
            "velvety dark burrower. Harmless to people (bite is medically insignificant). Wants "
            "an ARID, well-ventilated setup (30-50% humidity) with deep dry substrate for a "
            "silk-lined burrow; a light mist of the web every week or two is enough water. Keep "
            "around 68-78°F. Slow-growing and reclusive — a display animal you mostly see at the "
            "burrow mouth."
        ),
        source_url="https://www.thetarantulacollective.com/care-sheets-2/eresus-walckenaeri",
    ),
    _true_spider(
        scientific_name="Eresus sandaliatus", common_names=["Ladybird Spider"],
        genus="Eresus", family="Eresidae", type="fossorial", burrowing="heavy", growth_rate="slow",
        temperament="shy; reclusive burrower", native_region="Western and Central Europe",
        adult_size="female body ~0.4-0.6 in", adult_length_min_mm=8, adult_length_max_mm=16,
        temperature_min=66, temperature_max=76, humidity_min=30, humidity_max=50,
        enclosure_size_adult="small terrestrial enclosure, 2+ in substrate", substrate_depth="2-3 inches",
        substrate_type="dry burrowable mix (soil/sand/clay); good ventilation",
        care_guide=(
            "The classic European ladybird spider (the famous red-and-black male). Care mirrors "
            "Eresus walckenaeri: arid, ventilated, deep dry substrate for a burrow, ~30-50% "
            "humidity, cool-to-moderate temps (66-76°F). Harmless. Slow-growing and long-lived "
            "for a true spider; best treated as a burrow-display species rather than a handleable one."
        ),
        source_url="https://spidersworld.eu/en/other-spiders/1487-eresus-sandaliatus-0-5cm-ladybird-spider.html",
    ),
    _true_spider(
        scientific_name="Latrodectus hesperus", common_names=["Western Black Widow"],
        genus="Latrodectus", family="Theridiidae", type="cobweb (terrestrial)", burrowing="none",
        care_level="advanced", growth_rate="medium",
        medically_significant_venom=True, venom_severity="medically_significant",
        temperament="shy but defensive; medically significant venom",
        native_region="western North America",
        adult_size="female body ~0.3-0.5 in", adult_length_min_mm=8, adult_length_max_mm=13,
        temperature_min=70, temperature_max=85, humidity_min=40, humidity_max=60,
        enclosure_size_adult="secure enclosure with upper corners for a cobweb", substrate_depth="1 inch",
        substrate_type="dry substrate; anchor points for irregular cobweb",
        care_guide=(
            "A true black widow — keep ONLY with full respect for its MEDICALLY SIGNIFICANT venom "
            "(latrodectism). Not a beginner or handleable animal: use a very secure, escape-proof "
            "enclosure and never free-handle. Builds a strong irregular cobweb in upper corners; "
            "wants warm (70-85°F), fairly dry (40-60%) conditions and appropriately sized prey. "
            "Hardy and long-lived for a true spider, and a dramatic display species for experienced, "
            "cautious keepers. Know your local regulations and have a plan before keeping."
        ),
        source_url="https://en.wikipedia.org/wiki/Latrodectus_hesperus",
    ),
    _true_spider(
        scientific_name="Argiope aurantia", common_names=["Yellow Garden Spider", "Writing Spider"],
        genus="Argiope", family="Araneidae", type="orb-web (arboreal)", growth_rate="fast",
        venom_severity="mild", temperament="docile; non-aggressive orb weaver",
        native_region="North America",
        adult_size="female body ~0.75-1.1 in", adult_length_min_mm=19, adult_length_max_mm=28,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=70,
        enclosure_size_adult="large vertical/mesh enclosure for a full orb web", substrate_depth="1 inch",
        substrate_type="any; needs open vertical space + frame for the orb web",
        care_guide=(
            "The big, gorgeous black-and-yellow garden orb weaver with the zig-zag 'writing' "
            "(stabilimentum) in its web. Harmless. Needs a LARGE vertical enclosure so it can spin "
            "a full orb web, plus flying/active prey. Warm (70-85°F), moderate humidity, light "
            "misting. Note it's an ANNUAL species — females mature in late summer, produce egg sacs "
            "in fall, and naturally die off after; plan for a seasonal display rather than a "
            "multi-year pet."
        ),
        source_url="https://en.wikipedia.org/wiki/Argiope_aurantia",
    ),
    # ─── Whip spiders ──────────────────────────────────────────────────────
    _whip(
        scientific_name="Charinus acosta", common_names=["Cuban Cave Whip Spider"],
        genus="Charinus", communal_suitable=True, growth_rate="slow",
        temperament="shy; cave-dwelling; freezes when disturbed",
        native_region="Cuba (cave systems)",
        adult_size="body ~0.2 in (4-6 mm)", adult_length_min_mm=4, adult_length_max_mm=6,
        prey_size="pinhead crickets, fruit flies, small roach nymphs",
        care_guide=(
            "A tiny cave-dwelling whip spider from Cuba — and notably PARTHENOGENETIC (only "
            "females are known), so a single specimen can found a colony, and groups can be kept "
            "together. Completely harmless (no venom, no sting). High humidity (75-90%) with good "
            "airflow is the make-or-break parameter, as with all amblypygids; provide vertical cork "
            "to cling to and molt from, plus tiny prey. Captive husbandry data is limited and it is "
            "small and delicate — best for keepers comfortable with micro-inverts."
        ),
        source_url="https://en.wikipedia.org/wiki/Charinus_acosta",
    ),
    # ─── Roaches ───────────────────────────────────────────────────────────
    _roach(
        scientific_name="Compsodes schwarzi", common_names=["Schwarz's Hooded Roach", "Micro Hooded Roach"],
        genus="Compsodes", family="Corydiidae", growth_rate="fast",
        temperament="secretive; hides under bark and debris",
        native_region="southern USA (Arizona to Florida)",
        adult_size="~0.25-0.5 in", adult_length_min_mm=6, adult_length_max_mm=13,
        temperature_min=70, temperature_max=82, humidity_min=40, humidity_max=60,
        enclosure_size_adult="small ventilated tub (24 oz and up)", substrate_depth="1-2 inches",
        substrate_type="coco fiber / leaf litter with bark hides; dry-tolerant",
        care_guide=(
            "A tiny, prolific US native 'micro roach' — adults only a quarter to half an inch. "
            "Harmless and easy: a small ventilated tub with bark and leaf litter, dry-tolerant but "
            "fine with a damp corner, room-temperature to warm. Females tuck small oothecae onto "
            "bark; colonies build up quickly. Males can climb and fly, so use a tight lid. Detailed "
            "husbandry data for this species is limited, so the values here are conservative — treat "
            "it as a hardy, low-maintenance display/cleanup colony."
        ),
        source_url="http://www.invertebratedude.com/p/compsodes-schwarzi-schwarzs-hooded.html",
    ),
    _roach(
        scientific_name="Pseudoglomeris magnifica", common_names=["Emerald Cockroach", "Magnificent Emerald Roach"],
        genus="Pseudoglomeris", family="Corydiidae", type="arboreal", burrowing="none", growth_rate="slow",
        communal_suitable=True, feeding_mode="omnivore",
        temperament="active climber; diurnal display roach",
        native_region="Asia (China, Vietnam)",
        adult_size="~1 in", adult_length_min_mm=20, adult_length_max_mm=25,
        temperature_min=72, temperature_max=86, humidity_min=55, humidity_max=75,
        enclosure_size_adult="tall/arboreal enclosure, thin substrate layer", substrate_depth="1 inch",
        prey_size="bee pollen + fresh fruit (apple, banana)",
        substrate_type="thin coco layer; vertical cork/leaves; high air humidity + good ventilation",
        care_guide=(
            "One of the most beautiful roaches in the hobby — a metallic emerald-green, day-active, "
            "arboreal species (also sold as Corydidarum magnifica). Wants a TALL setup with cork and "
            "leaves, high air humidity (55-75%) but a mostly-dry surface, daily light misting and good "
            "ventilation; they drink droplets off the glass. Specialized diet: bee pollen plus fresh "
            "fruit rather than dog food. Slow to breed and a bit demanding on airflow/humidity balance, "
            "but an unmatched display species. Can climb glass and males can fly — seal the lid."
        ),
        source_url="http://www.invertebratedude.com/p/pseudoglomeris-magnifica-magnificent.html",
    ),
    _roach(
        scientific_name="Ergaula capucina", common_names=["Beetle Mimic Roach"],
        genus="Ergaula", family="Corydiidae", type="fossorial", burrowing="heavy", growth_rate="slow",
        communal_suitable=True,
        temperament="docile; burrowing beetle mimic",
        native_region="Southeast Asia",
        adult_size="~1-1.2 in", adult_length_min_mm=25, adult_length_max_mm=30,
        temperature_min=72, temperature_max=84, humidity_min=60, humidity_max=80,
        enclosure_size_adult="ventilated bin with deep substrate", substrate_depth="2-3 inches",
        substrate_type="coco/topsoil with a thick hardwood leaf-litter layer (nymph food)",
        care_guide=(
            "A charming 'beetle mimic' roach — rounded, glossy females look strikingly like beetles "
            "and are flightless. Harmless. Give 2-3 inches of substrate with a deep hardwood "
            "leaf-litter layer (important nymph food) and a humidity gradient: drier on top, damp "
            "below, with moderate-to-high ventilation, 72-84°F. A slow breeder — oothecae take "
            "3-4 months to hatch and nymphs 6-8 months to mature — so build the colony patiently."
        ),
        source_url="http://www.invertebratedude.com/p/ergaula-spp-velvety-beetle-mimic-roaches.html",
    ),
    _roach(
        scientific_name="Eublaberus distanti", common_names=["Orange-Head Roach", "Four-Spotted Roach"],
        genus="Eublaberus", family="Blaberidae", type="fossorial", burrowing="heavy", growth_rate="fast",
        communal_suitable=True,
        temperament="hardy; prolific; burrows in substrate/frass",
        native_region="Central and South America",
        adult_size="~1.6-2 in", adult_length_min_mm=40, adult_length_max_mm=50,
        temperature_min=75, temperature_max=90, humidity_min=50, humidity_max=65,
        enclosure_size_adult="ventilated bin sized to colony", substrate_depth="2-3 inches",
        substrate_type="coco/substrate or deep frass; a damp corner; strong ventilation",
        care_guide=(
            "A hardy, fast-breeding favorite — popular both as a striking orange-headed display "
            "colony and as a feeder. Burrows readily, eats almost anything (dog/fish food + fruit + "
            "veg), and thrives warm (75-90°F) with a damp corner and good airflow. Note: like most "
            "big prolific roaches it can get odorous if overcrowded or under-ventilated, so give it "
            "space and ventilation. Adults are poor climbers on clean glass but a tight lid is still wise."
        ),
        source_url="https://www.roachcrossing.com/for-sale/roach/all/",
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
