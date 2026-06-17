"""
Care-guide expansion — WHIP SPIDERS + VINEGAROONS batch 1 (BRIEF-care-guide-expansion §6).

Amblypygi (whip spiders) + Thelyphonida (vinegaroons) — two thin taxa. All net-new
vs prod 2026-06-16:
  whip_spider existing: Damon diadema/medius/variegatus, Phrynus marginemaculatus,
                        Heterophrynus batesii, Euphrynichus bacillifer  (excluded)
  vinegaroon existing:  Mastigoproctus giganteus  (excluded)

Single-table insert into `invert_species`; neither taxon is in legacy `species`.

Honesty-first: every row cites a source_url; unknowns null.
* Whip spiders have NO venom and no sting — pedipalps look fierce but are harmless;
  venom_severity null. Main husbandry risk is dehydration → high humidity.
* Vinegaroons have NO venom either, but spray acetic acid (vinegar) defensively —
  harmless, can irritate eyes; venom_severity null, noted in care_guide.
* Dropped Mastigoproctus lacandonensis (only M. giganteus care surfaced — no
  species-specific data). Typopeltis stimpsonii uses genus-level Typopeltis
  husbandry (species data thin), noted in its guide.

Controlled vocab matched to schemas/invert_species.py:
  care_level='intermediate'; feeding_mode='predator'; burrowing ∈ {none,heavy};
  venom_severity NULL; type length-bounded string.

Run with: python3 seed_care_expansion_amblypygi_uropygi_batch1.py   (idempotent)
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


def _whip(**kw):
    base = dict(
        taxon="whip_spider", family="Phrynidae", order_name="Amblypygi",
        care_level="intermediate", feeding_mode="predator", type="arboreal",
        burrowing="none", growth_rate="medium",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=True, communal_suitable=True,
        prey_size="crickets, roaches", feeding_frequency_adult="1-2 prey per week",
        temperature_min=72, temperature_max=80, humidity_min=70, humidity_max=90,
        enclosure_size_adult="vertical enclosure with cork bark/flat hides", substrate_depth="2-3 inches",
        substrate_type="moist coco fiber; vertical cork bark for clinging; water dish; strong ventilation",
    )
    base.update(kw)
    return base


def _vin(**kw):
    base = dict(
        taxon="vinegaroon", family="Thelyphonidae", order_name="Thelyphonida",
        care_level="intermediate", feeding_mode="predator", type="fossorial",
        burrowing="heavy", growth_rate="slow",
        urticating_hairs=False, medically_significant_venom=False, venom_severity=None,
        water_dish_required=True, communal_suitable=False,
        prey_size="crickets, roaches", feeding_frequency_adult="1 prey per week",
        temperature_min=75, temperature_max=85, humidity_min=70, humidity_max=85,
        enclosure_size_adult="terrestrial tank with deep substrate", substrate_depth="4-6 inches",
        substrate_type="deep moist coco/topsoil for burrowing; hide; water dish",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    # ─── Whip spiders (Amblypygi) ─────────────────────────────────────
    _whip(
        scientific_name="Phrynus barbadensis",
        common_names=["Barbados Whip Spider"],
        genus="Phrynus", temperament="extremely shy; freezes or flees",
        native_region="Caribbean, Central/South America",
        adult_size="body ~1.5 in; wide legspan", adult_length_min_mm=30, adult_length_max_mm=40,
        care_guide=(
            "A flat, fast, utterly harmless whip spider — no venom and no sting; the long "
            "antenniform front legs are sensory 'whips', not weapons. Extremely shy: it freezes "
            "or bolts when disturbed (often mistaken for tameness). Give it a vertical enclosure "
            "with cork bark to cling to, 72-80°F, and high humidity (70-90%) with strong "
            "ventilation — dehydration is the number-one killer. Often kept communally with "
            "enough vertical space and hides. A water dish and regular misting keep it hydrated."
        ),
        source_url="https://www.thedefiantforest.com/blogs/news/keeping-whip-spiders-the-care-and-maintenance-of-amblypygids",
    ),
    _whip(
        scientific_name="Heterophrynus longicornis",
        common_names=["Amazonian Giant Whip Spider"],
        genus="Heterophrynus", communal_suitable=False,
        temperament="shy; larger, more territorial",
        native_region="Amazon Basin (South America)",
        adult_size="body ~1.5-2 in; legspan to ~7 in", adult_length_min_mm=35, adult_length_max_mm=50,
        care_guide=(
            "One of the larger whip spiders in the hobby — a dramatic, long-legged Amazonian "
            "species found on big buttressed tree trunks and rocky outcrops. Harmless (no venom, "
            "no sting), shy, and nocturnal. Wants a tall enclosure with broad cork bark, warm "
            "tropical conditions (72-80°F), and high humidity (70-90%) with airflow to prevent "
            "mold. Larger and more territorial than the small communal species, so house "
            "individually unless very spacious. Mist regularly and provide a water dish — "
            "dehydration is the main risk."
        ),
        source_url="https://www.thedefiantforest.com/blogs/news/keeping-whip-spiders-the-care-and-maintenance-of-amblypygids",
    ),
    _whip(
        scientific_name="Paraphrynus laevifrons",
        common_names=["Central American Whip Spider"],
        genus="Paraphrynus", temperament="shy, harmless nocturnal ambusher",
        native_region="Central America",
        adult_size="body 0.7-1.1 in (18-28 mm)", adult_length_min_mm=18, adult_length_max_mm=28,
        care_guide=(
            "A small Central American whip spider — a harmless nocturnal ambush predator whose "
            "spiked pedipalps look intimidating but are almost never used in defense (no venom, "
            "no sting). House it in a vertical enclosure roughly twice its span in each "
            "dimension, with cork bark to cling to, 65-80°F, and high humidity (70-90%) "
            "maintained by misting once or twice daily plus a water dish. Tolerant of communal "
            "housing given space and hides. Hardy as long as it never dries out."
        ),
        source_url="https://en.wikipedia.org/wiki/Paraphrynus_laevifrons",
    ),
    # ─── Vinegaroons (Thelyphonida) ───────────────────────────────────
    _vin(
        scientific_name="Typopeltis crucifer",
        common_names=["Japanese Vinegaroon", "Asian Vinegaroon"],
        genus="Typopeltis", temperament="nocturnal, secretive; sprays acetic acid",
        native_region="East Asia (Japan, Taiwan, China)",
        adult_size="~1 in body (plus tail)", adult_length_min_mm=20, adult_length_max_mm=25,
        care_guide=(
            "An East Asian vinegaroon — a tropical cousin of the giant vinegaroon that wants it "
            "warmer (75-85°F) and humid (70-80%). Like all vinegaroons it has NO venom and no "
            "sting; its defense is a fine spray of acetic acid (vinegar) from the tail base — "
            "harmless but best kept away from your eyes. A secretive nocturnal burrower: give it "
            "4-6 inches of moisture-retaining substrate, a hide, and a water dish. Feed crickets "
            "or roaches weekly. Less forgiving of husbandry mistakes than M. giganteus, so an "
            "intermediate pick."
        ),
        source_url="https://en.wikipedia.org/wiki/Typopeltis",
    ),
    _vin(
        scientific_name="Typopeltis stimpsonii",
        common_names=["Stimpson's Vinegaroon"],
        genus="Typopeltis", temperament="strictly nocturnal; deep burrower; sprays acetic acid",
        native_region="East Asia",
        adult_size="up to ~2 in body (plus tail)", adult_length_min_mm=30, adult_length_max_mm=50,
        care_guide=(
            "A robust East Asian vinegaroon with heavy pedipalps. Species-specific husbandry is "
            "thin, so this follows standard tropical Typopeltis care: warm (75-85°F), humid "
            "(70-80%), with deep moist substrate it can burrow into and a hide — it is strictly "
            "nocturnal, flees light, and digs deeply. No venom and no sting; it sprays acetic "
            "acid (vinegar) defensively, which is harmless but can irritate eyes. Feed crickets "
            "or roaches; it's a modest eater. Long-lived for an arachnid."
        ),
        source_url="https://en.wikipedia.org/wiki/Typopeltis_stimpsonii",
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
