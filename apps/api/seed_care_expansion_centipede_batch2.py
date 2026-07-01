"""
Care-guide expansion — CENTIPEDE batch 2 (BRIEF-care-guide-expansion §6).

2 net-new genuinely-kept centipedes, verified absent from prod (existing coverage:
gigantea, subspinipes, alternans, cingulata, dehaani, heros, polymorpha, hardwickei,
morsitans, galapagoensis, E. trigonopodus, E. rubripes, Rhysida longipes — excluded).

Single-table insert into `invert_species` (taxon='centipede'); not in legacy `species`.

Honesty-first: every row cites a source_url; venom_severity follows the existing
centipede convention (moderate = mid-size; medically_significant = the large
vertebrate-taking Scolopendra). Alipes grandidieri is a distinctive African
feather/flag-tail (family Scolopendridae, subfamily Otostigminae) that stridulates
with its modified rear legs — its bite is very painful but far from lethal (moderate).
Scolopendra viridicornis is a large Amazonian giant that takes small vertebrates on
potent venom (medically_significant). All centipedes are venomous, fast, defensive —
care guides say no handling, escape-proof lids. All Scolopendromorpha are
developmental_class='epimorphic' (hatch with the full segment count).
image_url left null for the image agent (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {intermediate,advanced}; feeding_mode='predator';
  burrowing='heavy'; venom_severity ∈ {moderate,medically_significant};
  developmental_class='epimorphic'.

Run with: python3 seed_care_expansion_centipede_batch2.py   (idempotent)
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


def _cent(**kw):
    base = dict(
        taxon="centipede", family="Scolopendridae", order_name="Scolopendromorpha",
        feeding_mode="predator", type="fossorial", burrowing="heavy",
        developmental_class="epimorphic", growth_rate="medium",
        urticating_hairs=False, medically_significant_venom=False,
        water_dish_required=True, communal_suitable=False,
        typical_leg_pair_count=21,
        prey_size="crickets, roaches, mealworms",
        feeding_frequency_adult="1 prey per week",
        enclosure_size_adult="secure tight-lid tank; floor space to stretch; deep substrate",
        substrate_depth="4-6 inches",
        substrate_type="moist (not wet) coco fiber/peat for burrowing; hide; water dish",
    )
    base.update(kw)
    return base


SPECIES_DATA = [
    _cent(
        scientific_name="Scolopendra viridicornis",
        common_names=["Brazilian Giant Centipede", "Green-horned Centipede"],
        genus="Scolopendra", care_level="advanced",
        temperament="large, powerful, defensive; active hunter",
        native_region="Amazon Basin (Brazil, N. South America)",
        adult_size="8-10 inches", adult_length_min_mm=170, adult_length_max_mm=260,
        temperature_min=75, temperature_max=84, humidity_min=70, humidity_max=85,
        venom_severity="medically_significant",
        venom_notes="A large Amazonian giant with potent venom used to subdue small vertebrates (rodents, frogs, lizards); bites are intensely painful. Advanced keepers only, no handling.",
        care_guide=(
            "A large Amazonian giant centipede, dark-bodied with contrasting greenish antennae — "
            "a powerful nocturnal hunter that takes not just insects but small vertebrates like "
            "rodents, frogs, and lizards on its potent venom. Give it a large, escape-proof "
            "enclosure with deep, moisture-retaining substrate to burrow, warm tropical "
            "conditions (75-84°F, 70-85% humidity), a hide, and a water dish; keep the substrate "
            "moist but never waterlogged. Its size, speed, and venom make this a strictly "
            "advanced, look-don't-touch species — a tight-fitting lid is non-negotiable."
        ),
        source_url="https://en.wikipedia.org/wiki/Scolopendra_viridicornis",
    ),
    _cent(
        scientific_name="Alipes grandidieri",
        common_names=["Feather-tail Centipede", "Flag-tail Centipede"],
        genus="Alipes", family="Scolopendridae",
        care_level="intermediate",
        temperament="skittish, fast; stridulates and waves tail legs when threatened",
        native_region="East Africa (Kenya, Tanzania, Uganda)",
        adult_size="4-6 inches", adult_length_min_mm=100, adult_length_max_mm=150,
        temperature_min=72, temperature_max=82, humidity_min=65, humidity_max=80,
        venom_severity="moderate",
        venom_notes="Bites are extremely painful and slow to heal (1-2 days), but far from lethal — nearly 1000 venom glands' worth would be needed to seriously harm an adult. Fast and defensive; no handling.",
        care_guide=(
            "A distinctive East African centipede with flattened, paddle-like rear legs that look "
            "like feathers or flags — when threatened it waves and rubs them to stridulate, "
            "hissing a warning rather than always biting. Desiccates quickly, so keep it moist "
            "with good humidity (65-80%) on deep substrate it can burrow into, plus a hide and a "
            "water dish, at room-to-warm temperatures. Fast and skittish; its bite is very "
            "painful and slow to heal but nowhere near dangerous. An intermediate species — "
            "escape-proof lid, no handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Alipes_grandidieri",
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
