"""
Care-guide expansion — MILLIPEDE batch 3 (BRIEF-care-guide-expansion §2).

4 net-new millipedes, verified absent from BOTH the live catalog AND the
pending-but-unrun millipede_batch2 (which already covers Aphistogoniulus
corallipes, Epibolus pulchripes, Ophistreptus guineensis, Spirostreptus
servatius, Tonkinbolus dollfusi — run that one too). Single-table insert into
`invert_species` (taxon='millipede').

Adds two flat-backed (polydesmid) millipedes — a different order from the
giant round-backs already in the catalog — plus two more round-backs. All are
detritivores → feeding_mode='detritivore', venom_severity null.

Honesty-first: cited per row. Polydesmids (Apheloria, Desmoxytes) produce
hydrogen cyanide in defense (almond/cherry smell) — flagged with a wash-hands /
no-handling note. order_name + family overridden per species.

Run with: python3 seed_care_expansion_millipede_batch3.py   (idempotent)
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


def _milli(**kw):
    base = dict(
        taxon="millipede", order_name="Spirobolida", family="Pachybolidae",
        care_level="beginner", feeding_mode="detritivore", type="terrestrial",
        developmental_class="anamorphic", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=False, communal_suitable=True, burrowing="heavy",
        temperament="docile, harmless detritivore",
        prey_size="n/a (detritivore)",
        feeding_frequency_adult="continuous — leaf litter, decaying hardwood, veg + calcium",
        enclosure_size_adult="terrestrial tank with deep substrate; good ventilation",
        substrate_depth="4-6 inches",
        substrate_type="deep coco/soil + decaying hardwood leaf litter & rotten wood; add calcium (cuttlebone)",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _milli(
        scientific_name="Apheloria virginiensis",
        common_names=["Black-and-gold Flat Millipede", "Virginia Cherry Millipede"],
        genus="Apheloria", order_name="Polydesmida", family="Xystodesmidae",
        care_level="intermediate", burrowing="light",
        native_region="Eastern USA (Virginia, North Carolina)",
        adult_size="1.5-2 inches", adult_length_min_mm=35, adult_length_max_mm=50,
        temperature_min=60, temperature_max=75, humidity_min=70, humidity_max=85,
        substrate_depth="2-4 inches",
        substrate_type="moist rotting hardwood + leaf litter; cooler than room temp; add calcium",
        care_guide=(
            "A flat-backed North American millipede — glossy black edged in gold/yellow. A "
            "leaf-litter detritivore that wants cooler-than-room temperatures (60-75°F) and a "
            "substrate of moist, rotting hardwood and leaf litter. Famous for its cherry-almond "
            "scent: its defensive secretion contains hydrogen cyanide, harmless in the tiny "
            "amounts produced but wash your hands after handling. Long-lived (up to ~7 years) "
            "and fine in groups."
        ),
        source_url="https://bantam.earth/kentucky-flat-millipede-apheloria-virginiensis/",
    ),
    _milli(
        scientific_name="Desmoxytes purpurosea",
        common_names=["Shocking Pink Dragon Millipede"],
        genus="Desmoxytes", order_name="Polydesmida", family="Paradoxosomatidae",
        care_level="intermediate", burrowing="light",
        native_region="Thailand (limestone caverns, Uthai Thani)",
        adult_size="~1.2 inches", adult_length_min_mm=28, adult_length_max_mm=32,
        growth_rate="medium",
        temperature_min=70, temperature_max=80, humidity_min=70, humidity_max=90,
        substrate_depth="2-3 inches",
        substrate_type="moist coco/leaf litter + decaying wood; humid and well-ventilated",
        care_guide=(
            "A vivid, spiny pink millipede from Thai limestone caves — one of the most striking "
            "inverts in the hobby. It wants a humid (70-90%), well-ventilated, planted terrarium "
            "with moist substrate, decaying wood, and leaf litter at 70-80°F, kept in small "
            "groups. Like other flat-backed millipedes it produces hydrogen cyanide (almond "
            "smell) in defense, so don't handle it. Shorter-lived than the giants (2-3 years)."
        ),
        source_url="https://en.wikipedia.org/wiki/Desmoxytes_purpurosea",
    ),
    _milli(
        scientific_name="Rhapidostreptus virgator",
        common_names=["African Banded Millipede", "Giant African Banded Millipede"],
        genus="Rhapidostreptus", order_name="Spirostreptida", family="Spirostreptidae",
        care_level="beginner", burrowing="heavy",
        native_region="West Africa",
        adult_size="up to ~7 inches", adult_length_min_mm=130, adult_length_max_mm=180,
        temperature_min=70, temperature_max=80, humidity_min=70, humidity_max=80,
        substrate_type="deep coco/soil + oak leaf litter & rotten hardwood; cuttlebone for calcium",
        care_guide=(
            "A large banded African millipede kept much like the giant African (Archispirostreptus "
            "gigas): a deep substrate of coco/soil topped with oak leaf litter and rotten "
            "hardwood, 70-80°F and 70-80% humidity, with cuttlebone for calcium. A gentle, "
            "long-lived detritivore that does well in groups — an easy, rewarding beginner "
            "millipede."
        ),
        source_url="https://dubiaroaches.com/blogs/invert-care/african-giant-millipede-care-sheet",
    ),
    _milli(
        scientific_name="Spirobolus bungii",
        common_names=["Chinese Millipede"],
        genus="Spirobolus", order_name="Spirobolida", family="Spirobolidae",
        care_level="beginner", burrowing="heavy",
        native_region="China (cooler montane regions)",
        adult_size="3-4 inches", adult_length_min_mm=70, adult_length_max_mm=100,
        temperature_min=60, temperature_max=70, humidity_min=65, humidity_max=80,
        substrate_type="moist coco/soil + leaf litter & rotten wood; keep cool (<70°F); add calcium",
        care_guide=(
            "A hardy Chinese millipede from cooler mountainous country, so keep it on the cool "
            "side (below ~70°F) — it does poorly when too warm. Otherwise standard detritivore "
            "care: moist substrate with leaf litter and rotten wood, plus fresh fruit/veg (it "
            "favors cucumber, melon, and banana) and cuttlebone for calcium. Readily kept, "
            "though consistent captive breeding can be tricky."
        ),
        source_url="https://www.bugzuk.com/store/millipedes/395-spirobolus-bungii/",
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
