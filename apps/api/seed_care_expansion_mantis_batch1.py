"""
Care-guide expansion — MANTIS batch 1 (BRIEF-care-guide-expansion §6 flagships).

The brief's #1 SEO white space: mantis had only 4 rows and the high-search
flagships were missing. These 8 are all verified absent from prod 2026-06-16
(Phyllocrania paradoxa already present, intentionally excluded).

Single-table insert into `invert_species` (taxon='mantis'); mantises are not in
the legacy `species` table, so no mirror needed (that's tarantula-only).

Honesty-first: every row cites a source_url; husbandry numbers are conservative
consensus across keeper care sheets; unknowns left null. Mantises are not
venomous to humans → venom_severity stays null. image_url is intentionally null —
the image workstream (separate agent) backfills image_url + image_attribution,
joining on scientific_name_lower.

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {beginner,intermediate,advanced}; feeding_mode='predator';
  burrowing='none' (strict set none|light|heavy); type length-bounded string.

Run with: python3 seed_care_expansion_mantis_batch1.py   (idempotent)
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


def _mantis(**kw):
    base = dict(
        taxon="mantis", family="Mantidae", order_name="Mantodea",
        feeding_mode="predator", type="arboreal", burrowing="none",
        urticating_hairs=False, medically_significant_venom=False,
        venom_severity=None, water_dish_required=False, communal_suitable=False,
        growth_rate="fast",
        enclosure_size_adult="≥3x body length tall, 2x wide; well-ventilated",
        substrate_depth="1-2 inches",
        substrate_type="coco fiber or paper towel; light misting for humidity/drinking",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _mantis(
        scientific_name="Hymenopus coronatus",
        common_names=["Orchid Mantis", "Pink Orchid Mantis"],
        genus="Hymenopus", family="Hymenopodidae",
        care_level="intermediate", temperament="docile, sit-and-wait flower mimic",
        native_region="Southeast Asia (Malaysia, Indonesia, Sumatra)",
        adult_size="female ~3 in, male <1 in", adult_length_min_mm=25, adult_length_max_mm=70,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=80,
        prey_size="flying insects — flies, moths, bees; small roaches",
        feeding_frequency_sling="every 1-2 days", feeding_frequency_juvenile="every 2-3 days",
        feeding_frequency_adult="every 2-3 days",
        care_guide=(
            "The orchid mantis is the most famous flower-mimicking mantis in the hobby — "
            "petal-shaped lobed legs and a pink-and-white body that lets it ambush pollinators. "
            "Keep it warm (75-85°F) and moderately humid (60-80%), misting lightly 2-3 times a "
            "week; nymphs are more sensitive to low humidity than adults. Sexual dimorphism is "
            "extreme: females reach ~3 inches while males stay under an inch and mature far "
            "faster, which makes timed breeding tricky. House individually (cannibalistic) in a "
            "tall, well-ventilated enclosure at least three times the mantis's length, with twigs "
            "or mesh at the top for secure molting. A flying-prey specialist that readily takes "
            "flies and other winged feeders. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/orchid-mantis/",
    ),
    _mantis(
        scientific_name="Idolomantis diabolica",
        common_names=["Devil's Flower Mantis", "Giant Devil's Flower Mantis"],
        genus="Idolomantis", family="Empusidae",
        care_level="advanced", temperament="skittish; dramatic threat display",
        native_region="East Africa (Ethiopia, Kenya, Tanzania, Somalia)",
        adult_size="up to 5 inches (~13 cm)", adult_length_min_mm=90, adult_length_max_mm=130,
        growth_rate="medium",
        temperature_min=85, temperature_max=95, humidity_min=40, humidity_max=60,
        prey_size="flying insects only — flies, moths, bluebottles (refuses crawling prey)",
        feeding_frequency_sling="every 2-3 days", feeding_frequency_juvenile="every 3-4 days",
        feeding_frequency_adult="every 4-5 days",
        care_guide=(
            "One of the largest and most spectacular mantises kept — the 'King of mantids' — with "
            "an unmatched startle display of banded forelegs and wings. It is an advanced species: "
            "molting is the number-one killer, and its intricate body shape means a single bad "
            "molt is usually fatal. Keep it hot (85-95°F) and mostly dry (40-60%), but raise "
            "humidity sharply for the critical subadult molt to adult, mimicking the African rainy "
            "season. A strict flying-prey specialist — feed flies and moths; it generally ignores "
            "crickets and roaches. Needs a tall, very well-ventilated enclosure and warmth from a "
            "lamp rather than a damp tank. Not for beginners. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/devils-flower-mantis/",
    ),
    _mantis(
        scientific_name="Creobroter gemmatus",
        common_names=["Jeweled Flower Mantis", "Asian Flower Mantis"],
        genus="Creobroter", family="Hymenopodidae",
        care_level="beginner", temperament="docile, hardy",
        native_region="South & Southeast Asia (India, Vietnam, Thailand)",
        adult_size="1.2-1.6 inches (3-4 cm)", adult_length_min_mm=30, adult_length_max_mm=40,
        temperature_min=75, temperature_max=82, humidity_min=50, humidity_max=60,
        prey_size="flies, crickets, small roaches",
        feeding_frequency_sling="every 1-2 days", feeding_frequency_juvenile="every 2-3 days",
        feeding_frequency_adult="every 2-3 days",
        care_guide=(
            "A small, hardy flower mantis with a cream-and-green body and a bold spiral eyespot on "
            "each wing — one of the best beginner mantises. Comfortable at normal room warmth "
            "(75-82°F) and moderate humidity (~50-60%) with light daily misting; tolerant of "
            "small care mistakes that would kill fussier flower species. Fast-growing and a "
            "reliable feeder on flies, small crickets, and roach nymphs. House individually in a "
            "tall, ventilated enclosure; like all mantises it is cannibalistic. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/",
    ),
    _mantis(
        scientific_name="Pseudocreobotra wahlbergii",
        common_names=["Spiny Flower Mantis"],
        genus="Pseudocreobotra", family="Hymenopodidae",
        care_level="beginner", temperament="bold; striking eyespot display",
        native_region="Eastern & Southern Africa",
        adult_size="1.5-2 inches (~5 cm)", adult_length_min_mm=38, adult_length_max_mm=50,
        temperature_min=75, temperature_max=87, humidity_min=40, humidity_max=60,
        prey_size="flies, crickets, small roaches",
        feeding_frequency_sling="every 1-2 days", feeding_frequency_juvenile="every 2-3 days",
        feeding_frequency_adult="every 2-3 days",
        care_guide=(
            "A showy, beginner-friendly flower mantis whose wings each carry a yellow-and-black "
            "'9'-shaped spiral eyespot, flashed in a deimatic threat display. Keep warm (75-87°F) "
            "and on the drier side (40-60%) with good airflow — this species is prone to fungal "
            "infection if kept damp and stagnant. Light daily misting provides drinking droplets. "
            "Notably aggressive and cannibalistic from hatching, so separate nymphs early and "
            "house individually. Takes flies, crickets, and small roaches readily. Harmless to "
            "humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/spiny-flower-mantis/",
    ),
    _mantis(
        scientific_name="Gongylus gongylodes",
        common_names=["Wandering Violin Mantis", "Indian Rose Mantis"],
        genus="Gongylus", family="Empusidae",
        care_level="intermediate", temperament="calm, slow-moving; communal-tolerant",
        native_region="India, Sri Lanka, Southeast Asia",
        adult_size="female ~4.5 in, male 3-4 in", adult_length_min_mm=75, adult_length_max_mm=115,
        growth_rate="medium", communal_suitable=True,
        temperature_min=85, temperature_max=95, humidity_min=40, humidity_max=50,
        enclosure_size_adult="tall mesh/screen cage with many perches (poor on smooth walls)",
        prey_size="flying insects — flies, moths",
        feeding_frequency_sling="every 2-3 days", feeding_frequency_juvenile="every 3-4 days",
        feeding_frequency_adult="every 3-4 days",
        care_guide=(
            "An ornate, twig-like Empusid with leaf lobes on its legs and a calm, almost languid "
            "temperament. Unusually for a mantis it tolerates communal housing — groups can be "
            "raised and bred together given space and steady feeding, though monitoring is still "
            "wise. Keep hot (85-95°F) and dry (40-50%); as an Empusid it cannot grip smooth glass, "
            "so use a mesh or screen cage with plenty of sticks to climb and molt from. Prefers "
            "flying prey such as flies and moths. Slow, deliberate, and a poor escape risk — a "
            "rewarding intermediate species. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/wandering-violin-mantis/",
    ),
    _mantis(
        scientific_name="Stagmomantis carolina",
        common_names=["Carolina Mantis"],
        genus="Stagmomantis", family="Mantidae",
        care_level="beginner", temperament="hardy sit-and-wait ambusher",
        native_region="Southeastern USA, Mexico, into South America",
        adult_size="2-2.6 inches (50-65 mm)", adult_length_min_mm=50, adult_length_max_mm=65,
        growth_rate="medium",
        temperature_min=70, temperature_max=85, humidity_min=60, humidity_max=70,
        prey_size="flies, crickets, moths, small roaches",
        feeding_frequency_sling="every 1-2 days", feeding_frequency_juvenile="every 2-3 days",
        feeding_frequency_adult="every 2-3 days",
        care_guide=(
            "A native North American mantis common in gardens across the southern US — an "
            "accessible, hardy beginner species (and a legal, locally-sourced option for US "
            "keepers). Comfortable at room temperature (70-85°F) with moderate humidity (60-70%) "
            "and light daily misting. Adult females have short, non-functional wings and a heavier "
            "build; males are slimmer and can fly. Takes a wide range of feeders — flies, crickets, "
            "moths, small roaches. House individually; cannibalistic like all mantises. Harmless "
            "to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/carolina-mantis/",
    ),
    _mantis(
        scientific_name="Tenodera sinensis",
        common_names=["Chinese Mantis"],
        genus="Tenodera", family="Mantidae",
        care_level="beginner", temperament="hardy, bold feeding response",
        native_region="Native to East Asia; widely naturalized in North America",
        adult_size="up to 4 inches (~10 cm)", adult_length_min_mm=80, adult_length_max_mm=110,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        prey_size="crickets, flies, roaches, moths",
        feeding_frequency_sling="every 1-2 days", feeding_frequency_juvenile="every 2-3 days",
        feeding_frequency_adult="every 2-3 days",
        care_guide=(
            "The largest mantis in North America (introduced from East Asia and now widespread) "
            "and one of the easiest to keep — a great first mantis. Long, stick-like body reaching "
            "~4 inches, with a hearty appetite and forgiving care: room temperature (70-85°F), "
            "moderate humidity (50-65%), and a daily light misting. Give it a tall, ventilated "
            "enclosure with something to hang from at the top for molting. Eats almost any "
            "appropriately sized feeder. House individually; cannibalistic. Harmless to humans."
        ),
        source_url="https://reptilesupply.com/blogs/misc-invertebrate-care-sheets/how-to-care-for-your-chinese-mantis",
    ),
    _mantis(
        scientific_name="Blepharopsis mendica",
        common_names=["Thistle Mantis", "Egyptian Flower Mantis"],
        genus="Blepharopsis", family="Empusidae",
        care_level="intermediate", temperament="calm, slow-moving thistle mimic",
        native_region="North Africa, Middle East, Canary Islands",
        adult_size="2-2.5 inches (5-6 cm)", adult_length_min_mm=50, adult_length_max_mm=65,
        growth_rate="medium",
        temperature_min=80, temperature_max=95, humidity_min=30, humidity_max=45,
        enclosure_size_adult="tall mesh/screen cage with perches (poor on smooth walls)",
        prey_size="flying insects — flies, moths",
        feeding_frequency_sling="every 2-3 days", feeding_frequency_juvenile="every 3-4 days",
        feeding_frequency_adult="every 3-4 days",
        care_guide=(
            "A desert Empusid mantis with a crest and leaf-lobed legs, mottled to mimic dry "
            "thistle. Comes from hot, arid North Africa and the Middle East, so keep it warm "
            "(80-95°F under a lamp) and very dry (30-45%), offering water through a light weekly "
            "misting rather than a humid tank. As an Empusid it can't climb smooth surfaces — use "
            "a mesh cage with plenty of perches. Prefers flying prey such as flies and moths. "
            "Calm and slow-moving. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/thistle-mantis/",
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
