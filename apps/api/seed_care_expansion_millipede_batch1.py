"""
Care-guide expansion — MILLIPEDE batch 1 (BRIEF-care-guide-expansion §6).

Popular detritivores; currently only 3 in the catalog. 5 net-new, verified absent
from prod 2026-06-16 (Narceus americanus, Archispirostreptus gigas, Chicobolus
spinigerus already present, excluded).

Single-table insert into `invert_species` (taxon='millipede'); not in legacy `species`.

Honesty-first: every row cites a source_url; conservative consensus husbandry;
unknowns null. Millipedes don't bite/sting — venom_severity null. They CAN secrete
a defensive fluid (benzoquinones) that stains/irritates, so guides say wash hands
and keep away from eyes. feeding_mode='detritivore' (the substrate IS most of the
diet); developmental_class='anamorphic' (they add segments at each molt).
image_url left null for the image agent (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level='beginner'; feeding_mode='detritivore'; burrowing ∈ {none,light,heavy};
  developmental_class='anamorphic'.

Run with: python3 seed_care_expansion_millipede_batch1.py   (idempotent)
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


def _mille(**kw):
    base = dict(
        taxon="millipede", order_name="Spirobolida",
        care_level="beginner", feeding_mode="detritivore", type="terrestrial",
        developmental_class="anamorphic", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True, burrowing="heavy",
        prey_size="n/a (detritivore)",
        feeding_frequency_adult="continuous — leaf litter, decaying hardwood, veg + calcium",
        enclosure_size_adult="terrestrial tank with deep substrate; good ventilation",
        substrate_depth="3-4 inches",
        substrate_type="deep coco/soil + decaying hardwood leaf litter & rotten wood; add calcium (cuttlebone)",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _mille(
        scientific_name="Orthoporus ornatus",
        common_names=["Desert Millipede", "Sonoran Desert Millipede"],
        genus="Orthoporus", family="Spirostreptidae", order_name="Spirostreptida",
        temperament="docile; handleable",
        native_region="Southwestern USA, northern Mexico",
        adult_size="4-9 inches", adult_length_min_mm=100, adult_length_max_mm=230,
        temperature_min=75, temperature_max=80, humidity_min=60, humidity_max=80,
        substrate_depth="3-4 inches",
        care_guide=(
            "A hardy, handleable desert millipede and a classic beginner species — long-lived "
            "(around a decade with good care). Unlike tropical millipedes it needs strong "
            "ventilation: moisten only about a third of the substrate (deep, loose, with oak leaf "
            "litter on top) and let the rest stay drier, targeting 60-80% humidity without "
            "stagnation. Room warmth (75-80°F); never put a heat mat under the substrate. A "
            "detritivore — the leaf litter and rotting wood are its food, plus a calcium source. "
            "Harmless, though it can release a staining defensive fluid, so wash hands after "
            "handling."
        ),
        source_url="https://dubiaroaches.com/blogs/answers/desert-millipede-care-sheet",
    ),
    _mille(
        scientific_name="Anadenobolus monilicornis",
        common_names=["Bumblebee Millipede"],
        genus="Anadenobolus", family="Rhinocricidae", order_name="Spirobolida",
        temperament="docile, active", growth_rate="medium",
        native_region="Caribbean; introduced to Florida",
        adult_size="2-3 inches", adult_length_min_mm=25, adult_length_max_mm=75,
        temperature_min=71, temperature_max=82, humidity_min=70, humidity_max=80,
        substrate_depth="2-4 inches",
        care_guide=(
            "A small, attractive millipede ringed in black and yellow 'bumblebee' bands — fast, "
            "prolific, and a great beginner colony species. Keep it a touch above room "
            "temperature (71-82°F) on consistently semi-moist substrate (70-80%) at least 2 "
            "inches deep, made of soil, decaying wood, and leaf litter, which is also its food. "
            "Add a calcium source. Communal and easy to breed. Harmless; may release a mild "
            "defensive fluid, so wash hands after handling."
        ),
        source_url="https://bantam.earth/bumblebee-millipede-anadenobolus-monilicornis/",
    ),
    _mille(
        scientific_name="Trigoniulus corallinus",
        common_names=["Rusty Millipede", "Scarlet Millipede"],
        genus="Trigoniulus", family="Trigoniulidae", order_name="Spirobolida",
        temperament="peaceful, nocturnal", growth_rate="medium",
        native_region="Southeast Asia (widely introduced)",
        adult_size="2-3 inches (5-7 cm)", adult_length_min_mm=50, adult_length_max_mm=70,
        temperature_min=72, temperature_max=79, humidity_min=70, humidity_max=85,
        substrate_depth="3-4 inches",
        care_guide=(
            "A glossy rusty-red millipede — peaceful, nocturnal, and very easy, keeping well in "
            "groups. Maintain a moist (not soggy) tropical setup, 72-79°F and 70-85% humidity, "
            "with deep substrate of soil, decaying leaves, and wood plus a calcium source — the "
            "substrate is most of its diet. Long-lived for its size with good care. Harmless; "
            "can secrete a defensive fluid, so wash hands after handling."
        ),
        source_url="https://bantam.earth/scarlet-red-millipede-trigoniulus-corallinus/",
    ),
    _mille(
        scientific_name="Telodeinopus aoutii",
        common_names=["Giant African Olive Millipede", "Ghana Speckled Leg Millipede"],
        genus="Telodeinopus", family="Spirostreptidae", order_name="Spirostreptida",
        temperament="docile; good climber",
        native_region="West Africa (Ghana region)",
        adult_size="6-7 inches (16-19 cm)", adult_length_min_mm=150, adult_length_max_mm=190,
        temperature_min=75, temperature_max=82, humidity_min=70, humidity_max=90,
        burrowing="light", substrate_depth="4+ inches",
        substrate_type="deep coco/soil + leaf litter, decaying wood & lichen; branches for climbing; calcium",
        care_guide=(
            "A large, olive-toned African millipede — and, unusually, a good climber, so give it "
            "branches and bark in addition to a deep (4+ inch) moist substrate. Keep warm "
            "(75-82°F) and humid (70-90%). A detritivore that also takes fruit, veg, lichen, and "
            "the occasional high-protein item (fish flakes); always provide calcium. Docile and "
            "long-lived, but releases a large amount of staining defensive fluid when disturbed — "
            "handle gently and wash hands afterward, keeping it away from your eyes."
        ),
        source_url="https://keepingbugs.com/giant-african-olive-millipede-telodeinopus-aoutii-care-guide/",
    ),
    _mille(
        scientific_name="Narceus gordanus",
        common_names=["Smokey Oak Millipede", "Smokey Ghost Millipede"],
        genus="Narceus", family="Spirobolidae", order_name="Spirobolida",
        temperament="docile; handleable",
        native_region="Southeastern USA",
        adult_size="up to 4 inches", adult_length_min_mm=60, adult_length_max_mm=120,
        temperature_min=70, temperature_max=78, humidity_min=75, humidity_max=80,
        substrate_depth="4-6 inches",
        substrate_type="coco fiber + sphagnum + leaf litter & decaying wood (deep); calcium source",
        care_guide=(
            "A smooth, smoky-grey giant native to the southeastern US — docile, handleable, and "
            "easy for beginners and experienced keepers alike. Keep a well-ventilated but moist "
            "(not waterlogged) enclosure at 70-78°F and ~75-80% humidity, with at least 4 inches "
            "of coco/sphagnum/leaf-litter substrate for burrowing — which doubles as its food, "
            "alongside decaying wood and a calcium source. Harmless; can release a defensive "
            "fluid, so wash hands after handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Narceus_gordanus",
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
