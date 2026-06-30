"""
Care-guide expansion — MANTIS batch 3 (BRIEF-care-guide-expansion §2).

8 net-new mantises, verified absent from BOTH the live catalog AND the
pending-but-unrun mantis_batch2 (which already covers Hierodula majuscula,
Sphodromantis viridis, Rhombodera basalis, Deroplatys lobata, Theopropus
elegans — run that one too). Single-table insert into `invert_species`
(taxon='mantis').

Honesty-first: cited per row; mantises aren't venomous to humans →
venom_severity null. image_url left null for the sourcer. Controlled vocab
matched to schema.

Run with: python3 seed_care_expansion_mantis_batch3.py   (idempotent)
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
        scientific_name="Mantis religiosa", common_names=["European Mantis", "Praying Mantis"],
        genus="Mantis", care_level="beginner",
        temperament="hardy, bold; the classic beginner mantis",
        native_region="Europe, Asia, Africa; naturalized in North America",
        adult_size="2-3 inches", adult_length_min_mm=50, adult_length_max_mm=75, growth_rate="medium",
        temperature_min=68, temperature_max=86, humidity_min=40, humidity_max=60,
        care_guide=(
            "The original 'praying mantis' — a hardy, adaptable temperate species and a superb "
            "first mantis. Comfortable at household temperatures with moderate 40-60% humidity, "
            "in a tall, well-ventilated enclosure with twigs to climb and hang from for molting. "
            "Light misting every couple of days for drinking. Bold feeder; house individually; "
            "harmless to humans."
        ),
        source_url="https://en.wikipedia.org/wiki/Mantis_religiosa",
    ),
    _mantis(
        scientific_name="Hierodula patellifera", common_names=["Harabiro Mantis", "Giant Asian Mantis"],
        genus="Hierodula", care_level="beginner",
        temperament="bold, voracious; docile toward humans",
        native_region="Central and East Asia",
        adult_size="up to ~3 inches", adult_length_min_mm=55, adult_length_max_mm=75,
        temperature_min=70, temperature_max=86, humidity_min=60, humidity_max=70,
        care_guide=(
            "A robust, broad-bodied green Asian mantis (the 'harabiro') — hardy, voracious, and "
            "easygoing, making it a great larger-mantis beginner. Thrives at room warmth with "
            "60-70% humidity from a daily light mist, in a tall enclosure with perches and a "
            "molting space at the top. Takes large flying and crawling prey including roaches. "
            "House individually; harmless to humans."
        ),
        source_url="https://bantam.earth/giant-asian-mantis-hierodula-patellifera/",
    ),
    _mantis(
        scientific_name="Parasphendale agrionina", common_names=["Budwing Mantis"],
        genus="Parasphendale", care_level="beginner",
        temperament="bold, very aggressive feeder; cannibalistic",
        native_region="East Africa",
        adult_size="female 2.5-3 in, male ~1.5 in", adult_length_min_mm=35, adult_length_max_mm=70,
        temperature_min=75, temperature_max=86, humidity_min=30, humidity_max=60,
        care_guide=(
            "A hardy, no-fuss African mantis and an excellent beginner choice — remarkably "
            "tolerant of humidity (30-60% is fine), wanting just warmth (~80°F) and a mist two "
            "or three times a week for drinking. Tall, well-ventilated cage with thick twigs to "
            "perch on. An aggressive feeder and very cannibalistic, so always house individually. "
            "Harmless to humans."
        ),
        source_url="https://mantidkingdom.com/mantid-care/parasphendale-agrionina/",
    ),
    _mantis(
        scientific_name="Miomantis paykullii", common_names=["Egyptian Pygmy Mantis"],
        genus="Miomantis", care_level="beginner",
        temperament="small, fast, very hardy; cannibalistic",
        native_region="North Africa and the Middle East",
        adult_size="1-1.5 inches", adult_length_min_mm=25, adult_length_max_mm=40,
        temperature_min=72, temperature_max=85, humidity_min=40, humidity_max=50,
        care_guide=(
            "A tiny, exceptionally hardy starter mantis that can live its whole life on fruit "
            "flies. Keep warm (72-85°F) at 40-50% humidity with a light mist once or twice a "
            "day. Notably, unmated females can lay viable eggs that hatch into all-female "
            "offspring (parthenogenesis). Cannibalistic — house individually. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/egyptian-pygmy-mantis-miomantis/",
    ),
    _mantis(
        scientific_name="Creobroter pictipennis", common_names=["Indian Flower Mantis"],
        genus="Creobroter", family="Hymenopodidae", care_level="intermediate",
        temperament="still ambush flower mimic; small",
        native_region="South and Southeast Asia",
        adult_size="1-1.5 inches", adult_length_min_mm=30, adult_length_max_mm=40, growth_rate="medium",
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=80,
        care_guide=(
            "A small, beautifully patterned Asian flower mantis. Wants warm (75-85°F), humid "
            "(60-80%) conditions with strong ventilation and a daily light mist; a planted "
            "bioactive enclosure with springtails/isopods helps control mold. Feeds well on "
            "fruit flies and small flies. Like all mantises it's cannibalistic — house "
            "individually. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/indian-flower-mantis/",
    ),
    _mantis(
        scientific_name="Pseudocreobotra ocellata", common_names=["Spiny Flower Mantis"],
        genus="Pseudocreobotra", family="Hymenopodidae", care_level="intermediate",
        temperament="sedentary ambush flower mimic; spiral eyespot display",
        native_region="East and Southern Africa",
        adult_size="~1.5 inches", adult_length_min_mm=30, adult_length_max_mm=40, growth_rate="medium",
        temperature_min=75, temperature_max=87, humidity_min=40, humidity_max=60,
        care_guide=(
            "An African flower mantis famous for the bright spiral 'eyes' on its wings, flashed "
            "in a startle display. Keep warm (80-85°F) with strong ventilation and only moderate "
            "40-60% humidity — it is prone to mold/mis-molts if kept damp — plus a light daily "
            "mist. Prefers flying prey and strikes from ambush. Can sometimes be kept communally "
            "if very well fed, but solitary is safest. Harmless to humans."
        ),
        source_url="https://www.keepinginsects.com/praying-mantis/species/spiny-flower-mantis/",
    ),
    _mantis(
        scientific_name="Empusa pennata", common_names=["Conehead Mantis"],
        genus="Empusa", family="Empusidae", care_level="intermediate",
        temperament="calm, slow; cryptic cone-headed mimic",
        native_region="Mediterranean (southern Europe, North Africa)",
        adult_size="2.5-3 inches", adult_length_min_mm=55, adult_length_max_mm=75, growth_rate="slow",
        temperature_min=75, temperature_max=95, humidity_min=40, humidity_max=60,
        care_guide=(
            "A spectacular horned mantis from warm, dry Mediterranean scrub. It likes high "
            "daytime warmth (up to ~95°F) with a cooler night drop, excellent ventilation, and "
            "only moderate humidity (~50%). Takes mainly flying prey. In the wild it overwinters "
            "as a nymph, so it's a slower, longer project than the green mantises — an "
            "intermediate keep. Solitary; harmless to humans."
        ),
        source_url="https://bantam.earth/conehead-mantis-empusa-pennata/",
    ),
    _mantis(
        scientific_name="Stagmomantis limbata", common_names=["Bordered Mantis", "Arizona Mantis"],
        genus="Stagmomantis", care_level="beginner",
        temperament="bold; females can be aggressive",
        native_region="Southwestern USA south to Central America",
        adult_size="up to 3 inches", adult_length_min_mm=60, adult_length_max_mm=75,
        temperature_min=70, temperature_max=86, humidity_min=40, humidity_max=60,
        care_guide=(
            "An adaptable North American native and the most beginner-friendly Stagmomantis. "
            "Keep at room temperature in a tall, well-ventilated enclosure with perches for "
            "clean molts, with moderate 40-60% humidity and a daily light mist. The main risks "
            "are bad molts and dehydration if kept too dry, or mold if kept too damp. Bold "
            "feeder; house individually; harmless to humans."
        ),
        source_url="https://en.wikipedia.org/wiki/Stagmomantis_limbata",
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
