"""
Care-guide expansion — MILLIPEDE batch 2 (BRIEF-care-guide-expansion §2).

5 net-new detritivores, verified absent from prod (existing 8: Narceus americanus,
Archispirostreptus gigas, Chicobolus spinigerus, Orthoporus ornatus, Anadenobolus
monilicornis, Trigoniulus corallinus, Telodeinopus aoutii, Narceus gordanus).
Single-table insert into `invert_species` (taxon='millipede').

Honesty-first: cited per row; harmless detritivores → venom_severity null,
feeding_mode='detritivore', developmental_class='anamorphic'. They can secrete a
defensive fluid (benzoquinones) — wash hands, keep from eyes — noted in guides.
image_url left null for the sourcer.

Run with: python3 seed_care_expansion_millipede_batch2.py   (idempotent)
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


def _mille(**kw):
    base = dict(
        taxon="millipede", order_name="Spirobolida", family="Pachybolidae",
        care_level="beginner", feeding_mode="detritivore", type="terrestrial",
        developmental_class="anamorphic", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True, burrowing="heavy",
        prey_size="n/a (detritivore)",
        feeding_frequency_adult="continuous — leaf litter, decaying hardwood, veg + calcium",
        enclosure_size_adult="terrestrial tank with deep substrate; good ventilation",
        substrate_depth="4-6 inches",
        substrate_type="deep coco/soil + decaying hardwood leaf litter & rotten wood; add calcium (cuttlebone)",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _mille(
        scientific_name="Tonkinbolus dollfusi",
        common_names=["Vietnamese Rainbow Millipede"],
        genus="Tonkinbolus", care_level="intermediate",
        temperament="docile; moves off quickly when touched",
        native_region="Vietnam, Southeast Asia",
        adult_size="up to 4 inches (10 cm)", adult_length_min_mm=80, adult_length_max_mm=100,
        temperature_min=72, temperature_max=77, humidity_min=70, humidity_max=90,
        care_guide=(
            "A beautiful millipede ringed in red, black, and yellow 'rainbow' bands. A touch more "
            "demanding than the African giants: it dislikes temperature swings (keep a steady "
            "72-77°F) and wants high humidity (70-90%) over deep (7-10 cm) soil-based substrate "
            "with leaf litter and rotting wood. Docile and not prone to heavy defensive "
            "secretion. Detritivore — substrate is most of its diet, plus a calcium source. "
            "Harmless; wash hands after handling."
        ),
        source_url="https://bantam.earth/vietnamese-rainbow-millipede-tonkinbolus-dollfusi/",
    ),
    _mille(
        scientific_name="Epibolus pulchripes",
        common_names=["Tanzanian Red-Legged Millipede"],
        genus="Epibolus", care_level="beginner",
        temperament="docile, active", native_region="East Africa (Kenya, Tanzania)",
        adult_size="5-5.5 inches (12-14 cm)", adult_length_min_mm=120, adult_length_max_mm=140,
        temperature_min=72, temperature_max=82, humidity_min=70, humidity_max=80,
        care_guide=(
            "A colourful, active East African millipede — dark-bodied with vivid red legs. Hardy "
            "and easy, a great beginner giant: warm (72-82°F), humid (70-80%) substrate of deep "
            "soil, leaf mulch, and rotting wood, plus a calcium source. In the wild it burrows "
            "deep to aestivate through the dry season. Detritivore. Harmless; can release a mild "
            "defensive fluid, so wash hands after handling."
        ),
        source_url="https://www.invertebratesupplies.co.uk/product-page/tanzanian-red-legged-millipede-epibolus-pulchripes",
    ),
    _mille(
        scientific_name="Aphistogoniulus corallipes",
        common_names=["Madagascar Fire Millipede"],
        genus="Aphistogoniulus", care_level="intermediate",
        temperament="docile; secretes defensive fluid readily",
        native_region="Madagascar",
        adult_size="4-6 inches", adult_length_min_mm=100, adult_length_max_mm=150,
        type="terrestrial", burrowing="light",
        temperature_min=70, temperature_max=77, humidity_min=70, humidity_max=90,
        substrate_type="deep leaf mulch + decaying wood with climbing branches; mostly moist; calcium",
        care_guide=(
            "A striking Madagascan 'fire' millipede — dark body with fiery orange-red legs. "
            "Unusually it likes to climb, so add bark and branches alongside deep moist substrate. "
            "Prefers cooler temps (low 70s °F) with high humidity (70-90%) and good ventilation. "
            "Detritivore (leaf mulch, rotting wood, calcium). Harmless, but a notable producer of "
            "staining defensive fluid — handle gently, wash hands, keep away from eyes. (Genus "
            "taxonomy is in flux; sold as the Madagascar fire millipede.)"
        ),
        source_url="https://animalkingdom.top/the-fascinating-fire-millipede-aphistogoniulus-corallipes/",
    ),
    _mille(
        scientific_name="Spirostreptus servatius",
        common_names=["Firehead Millipede"],
        genus="Spirostreptus", family="Spirostreptidae", order_name="Spirostreptida",
        care_level="beginner", temperament="docile, hardy",
        native_region="East Africa (Tanzania)",
        adult_size="up to 8 inches (20 cm)", adult_length_min_mm=150, adult_length_max_mm=200,
        temperature_min=72, temperature_max=82, humidity_min=70, humidity_max=80,
        care_guide=(
            "A large African millipede, dark olive-black with a contrasting reddish head ('fire "
            "head'). Hardy and beginner-friendly like other giant African species: damp (not "
            "waterlogged) deep substrate of coco/soil, leaf litter, and rotting wood, 70-80% "
            "humidity, room warmth, and a calcium source. Detritivore. Harmless; secretes a mild "
            "defensive fluid — wash hands after handling. (Also placed in Analocostreptus.)"
        ),
        source_url="https://buzzardreptile.co.uk/product/spirostreptus-servatius-firehead-millipede/",
    ),
    _mille(
        scientific_name="Ophistreptus guineensis",
        common_names=["Chocolate Millipede"],
        genus="Ophistreptus", family="Spirostreptidae", order_name="Spirostreptida",
        care_level="beginner", temperament="docile, hardy",
        native_region="West Africa",
        adult_size="up to 8 inches", adult_length_min_mm=150, adult_length_max_mm=200,
        temperature_min=74, temperature_max=86, humidity_min=70, humidity_max=85,
        care_guide=(
            "A glossy chocolate-brown African giant — hardy, long, and a good beginner display "
            "millipede. Keep warm (74-86°F) and humid (70-85%, higher at night) with deep damp "
            "substrate of coco/soil, leaf litter, and rotting wood, plus a calcium source; "
            "moisten about a third of the substrate so it can choose its dampness. Detritivore. "
            "Harmless; can release a mild defensive fluid, so wash hands after handling."
        ),
        source_url="https://bantam.earth/chocolate-millipede-ophistreptus-guineensis/",
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
