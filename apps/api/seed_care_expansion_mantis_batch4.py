"""
Care-guide expansion — MANTIS batch 4 (catalog expansion).

10 net-new mantises, verified absent from the live catalog AND from mantis
batches 1-3. Single-table insert into `invert_species` (taxon='mantis').

Honesty-first: cited per row; mantises aren't venomous to humans →
venom_severity null, urticating_hairs False, feeding_mode predator. Where
species-specific captive data is thin (Phyllovates chlorophaea, Odontomantis
planiceps, Hestiasula brunneriana), the guide falls back to genus-typical
husbandry and says so. image_url left null for the sourcer. Controlled vocab
matched to schema; string caps respected (adult_size ≤50, temperament ≤100,
native_region ≤200, type ≤60, substrate_type ≤200).

Run with: python3 seed_care_expansion_mantis_batch4.py   (idempotent)
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
        scientific_name="Hierodula venosa", common_names=["Golden Mantis", "Golden Praying Mantis"],
        genus="Hierodula", care_level="beginner",
        temperament="bold, voracious ambush predator; docile toward humans",
        native_region="Southeast Asia",
        adult_size="female ~4 in, male ~3.5 in", adult_length_min_mm=90, adult_length_max_mm=100,
        growth_rate="fast",
        temperature_min=72, temperature_max=85, humidity_min=50, humidity_max=70,
        care_guide=(
            "A large, golden-hued Southeast Asian Hierodula — hardy, voracious, and beginner-"
            "friendly like the rest of the genus. Keep at 72-85°F with 50-70% humidity from a "
            "daily light mist, in a tall, well-ventilated enclosure (about 30x30x40 cm) with "
            "perches and clear molting space at the top. Takes large flying and crawling prey "
            "including roaches. House individually; harmless to humans."
        ),
        source_url="https://bantam.earth/golden-praying-mantis-hierodula-venosa/",
    ),
    _mantis(
        scientific_name="Sphodromantis gastrica", common_names=["Common Green Mantis", "Giant African Mantis"],
        genus="Sphodromantis", care_level="beginner",
        temperament="bold, hardy, voracious; docile toward humans",
        native_region="Eastern and Southern Africa",
        adult_size="female ~4 in, male ~3 in", adult_length_min_mm=70, adult_length_max_mm=100,
        temperature_min=68, temperature_max=85, humidity_min=40, humidity_max=60,
        care_guide=(
            "A robust green African mantis in the classic Sphodromantis mold — one of the "
            "hardiest, most low-maintenance mantises and an excellent beginner keep. Comfortable "
            "at 75-85°F with a modest 40-60% humidity and a single light daily mist for drinking, "
            "in a tall enclosure at least 3x its length with a rough ceiling for hanging molts. "
            "A bold, indiscriminate feeder. House individually; harmless to humans."
        ),
        source_url="https://www.panterrapets.com/pages/giant-african-mantis-caresheet",
    ),
    _mantis(
        scientific_name="Tenodera aridifolia", common_names=["Japanese Giant Mantis", "Asian Mantis"],
        genus="Tenodera", care_level="beginner",
        temperament="active, hardy; cannibalistic",
        native_region="East and Southeast Asia",
        adult_size="2.5-4 inches", adult_length_min_mm=65, adult_length_max_mm=100,
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        care_guide=(
            "A large, adaptable Asian mantis very close in care to its famous relative the "
            "Chinese mantis. Keep at 70-80°F (avoid heat above ~88°F) with 50-65% humidity from "
            "a daily light mist, in a tall, well-ventilated enclosure with a rough ceiling for "
            "molting and empty headroom at least twice the mantis's length. Not a picky feeder — "
            "flies, crickets, and small roaches all work. Cannibalistic; house individually; "
            "harmless to humans."
        ),
        source_url="https://bantam.earth/chinese-mantis-tenodera-aridifolia/",
    ),
    _mantis(
        scientific_name="Popa spurca", common_names=["African Twig Mantis"],
        genus="Popa", care_level="intermediate",
        temperament="cryptic, slow twig mimic; aggressive feeder",
        native_region="Central and East Africa",
        adult_size="female ~2.5 in, male ~2 in", adult_length_min_mm=50, adult_length_max_mm=65,
        growth_rate="medium",
        temperature_min=75, temperature_max=86, humidity_min=40, humidity_max=60,
        care_guide=(
            "A slender, brown twig-mimic mantis from warm African scrub and woodland. Wants "
            "warmth (77-86°F), only moderate humidity (40-60%), and light misting — it is prone "
            "to problems if kept too damp, so err on the drier side and ventilate well. Furnish "
            "with vertical twigs and bark for it to stretch out along and disappear. An eager "
            "feeder on flies, crickets, roaches, and moths. House individually (nymphs may be "
            "communal early on if well fed); harmless to humans."
        ),
        source_url="https://usmantis.com/products/popa-spurca-african-twig-mantis",
    ),
    _mantis(
        scientific_name="Deroplatys truncata", common_names=["Malaysian Dead Leaf Mantis", "Dead Leaf Shield Mantis"],
        genus="Deroplatys", care_level="intermediate",
        temperament="sedentary, cryptic dead-leaf mimic; startle display",
        native_region="Southeast Asia",
        adult_size="female 2.5-2.75 in, male ~1.75 in", adult_length_min_mm=45, adult_length_max_mm=70,
        growth_rate="medium",
        temperature_min=68, temperature_max=86, humidity_min=60, humidity_max=80,
        care_guide=(
            "A smaller dead-leaf mantis with the genus's broad, leaf-shaped shield behind the "
            "head. Keep warm (77-86°F, cooler at night to lengthen its life) and fairly humid "
            "(around 75%) with daily misting — the shielded thorax can make molting tricky if "
            "it gets too dry — in a tall, well-ventilated enclosure (about 30x30x30 cm) with "
            "sturdy branches. A patient ambush hunter that prefers flying prey and will flash a "
            "startle display when disturbed. House individually; harmless to humans."
        ),
        source_url="https://www.scalearea.com/en-us/products/deroplatys-truncata-mantis-escudo-hoja-muerta",
    ),
    _mantis(
        scientific_name="Acanthops falcata", common_names=["Tropical Dead Leaf Mantis", "Boxer Dead Leaf Mantis"],
        genus="Acanthops", family="Acanthopidae", care_level="intermediate",
        temperament="cryptic leaf mimic; very aggressive/cannibalistic",
        native_region="Central and South American rainforest",
        adult_size="female ~2.4 in, male ~1.6 in", adult_length_min_mm=40, adult_length_max_mm=60,
        growth_rate="medium",
        temperature_min=68, temperature_max=82, humidity_min=70, humidity_max=80,
        care_guide=(
            "A small, superbly camouflaged dead-leaf mantis from South American rainforest. "
            "Needs warmth (about 79°F day, low 70s at night) with high 70-80% humidity from daily "
            "misting, plus good ventilation and plenty of twigs to perch on. It is not an active "
            "hunter — it ambushes flying prey — but it is exceptionally aggressive and "
            "cannibalistic, so nymphs must be separated early and adults kept strictly alone. "
            "Do not disturb during molts. Harmless to humans."
        ),
        source_url="https://www.mantis-manor.co.uk/acanthops-care-sheet",
    ),
    _mantis(
        scientific_name="Pseudempusa pinnapavonis", common_names=["Peacock Mantis"],
        genus="Pseudempusa", family="Empusidae", care_level="intermediate",
        temperament="calm; flashes bright hindwing eyespots when threatened",
        native_region="Southeast Asia (Myanmar, Thailand)",
        adult_size="female ~4 in, male ~3.3 in", adult_length_min_mm=85, adult_length_max_mm=100,
        growth_rate="medium",
        temperature_min=68, temperature_max=86, humidity_min=50, humidity_max=70,
        care_guide=(
            "A large, elegant Southeast Asian mantis named for the vivid peacock-eye pattern on "
            "its hindwings, flashed in a startle display. Keep at 72-82°F day with a cooler night "
            "drop and moderate ~60% humidity (tolerates 50-80%) from daily misting, in a tall "
            "enclosure at least 3x its body length for safe molting. Feeds on flies, crickets, "
            "and locusts. House individually; harmless to humans."
        ),
        source_url="https://www.evolutionreptiles.co.uk/animals/invertebrates/peacock-mantis/",
    ),
    _mantis(
        scientific_name="Phyllovates chlorophaea", common_names=["Texas Unicorn Mantis"],
        genus="Phyllovates", care_level="intermediate",
        temperament="cryptic horned mantis; slow to molt",
        native_region="Southern USA (Texas) to Central America",
        adult_size="up to ~3 inches", adult_length_min_mm=60, adult_length_max_mm=75,
        growth_rate="medium",
        temperature_min=70, temperature_max=85, humidity_min=50, humidity_max=65,
        care_guide=(
            "A green-brown horned mantis native from Texas down into Central America. "
            "Species-specific captive data is limited, so this follows standard tropical-mantis "
            "husbandry: warmth around 70-85°F, moderate 50-65% humidity from regular misting, and "
            "a tall, well-ventilated enclosure with good molting surfaces. Keepers note it is "
            "slow to molt and prone to mismolts in the final instar if kept too dry, so keep "
            "humidity and molting perches dialed in. House individually; harmless to humans."
        ),
        source_url="https://usmantis.com/products/phyllovates-chlorophaea-with-the-common-name-texas-unicorn-mantis",
    ),
    _mantis(
        scientific_name="Odontomantis planiceps", common_names=["Asian Ant Mantis"],
        genus="Odontomantis", family="Gonypetidae", care_level="beginner",
        temperament="tiny, fast; nymphs mimic ants (Batesian mimicry)",
        native_region="Southeast Asia",
        adult_size="female ~0.8 in, male ~0.55 in", adult_length_min_mm=14, adult_length_max_mm=20,
        temperature_min=72, temperature_max=85, humidity_min=50, humidity_max=70,
        care_guide=(
            "A tiny mantis whose black early nymphs mimic ants for protection. It is small, "
            "hardy, and can live largely on fruit flies, making it a good compact beginner keep. "
            "Detailed species-specific parameters are sparse, so this uses genus-typical care: "
            "warmth around 72-85°F, moderate 50-70% humidity, a light daily mist for drinking, "
            "and — importantly — strong ventilation to prevent stagnant, moldy air in the small "
            "enclosure. House individually; harmless to humans."
        ),
        source_url="https://en.wikipedia.org/wiki/Odontomantis_planiceps",
    ),
    _mantis(
        scientific_name="Hestiasula brunneriana", common_names=["Indian Unicorn Boxer Mantis", "Boxer Mantis"],
        genus="Hestiasula", family="Hymenopodidae", care_level="intermediate",
        temperament="small flower mimic; raises boldly patterned forearms",
        native_region="Indian subcontinent",
        adult_size="~1.2-1.6 inches", adult_length_min_mm=30, adult_length_max_mm=40,
        growth_rate="medium",
        temperature_min=72, temperature_max=85, humidity_min=50, humidity_max=70,
        care_guide=(
            "A small, stocky flower-mantis from the Indian subcontinent that throws up boldly "
            "patterned raptorial 'boxing gloves' in a threat display. Species-specific care data "
            "is limited, so this follows genus-typical Hymenopodidae husbandry: warmth around "
            "75-85°F, 50-70% humidity from a light daily mist, and a small but well-ventilated "
            "planted enclosure. Feeds on fruit flies when small, moving up to houseflies and "
            "small crickets. House individually; harmless to humans."
        ),
        source_url="https://www.inaturalist.org/taxa/553378-Hestiasula-brunneriana",
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
