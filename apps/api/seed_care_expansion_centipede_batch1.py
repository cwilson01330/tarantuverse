"""
Care-guide expansion — CENTIPEDE batch 1 (BRIEF-care-guide-expansion §6).

High-search Scolopendra + an Ethmostigmus giant, all verified absent from prod
2026-06-16 (existing: gigantea, subspinipes, alternans, cingulata, dehaani, heros,
polymorpha, E. trigonopodus, Rhysida longipes — excluded).

Single-table insert into `invert_species` (taxon='centipede'); not in legacy `species`.

Honesty-first: every row cites a source_url; venom_severity follows the existing
centipede convention (mild = small; moderate = mid-size Scolopendra; medically_
significant = the giants like gigantea/subspinipes). venom_notes carry the nuance.
These are venomous, fast, defensive — care guides say no handling. All Scolopendro-
morpha are developmental_class='epimorphic' (hatch with the full segment count).
image_url left null for the image agent (join on scientific_name_lower).

Controlled vocab matched to schemas/invert_species.py:
  care_level ∈ {intermediate,advanced}; feeding_mode='predator';
  burrowing='heavy'; venom_severity ∈ {moderate,medically_significant};
  developmental_class='epimorphic'.

Run with: python3 seed_care_expansion_centipede_batch1.py   (idempotent)
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
        scientific_name="Scolopendra hardwickei",
        common_names=["Indian Tiger Centipede"],
        genus="Scolopendra", care_level="intermediate",
        temperament="fast, defensive; active hunter",
        native_region="India, Southeast Asia",
        adult_size="6-9 inches", adult_length_min_mm=150, adult_length_max_mm=230,
        temperature_min=72, temperature_max=80, humidity_min=70, humidity_max=80,
        venom_severity="moderate",
        venom_notes="Bite causes pain and swelling, with drowsiness reported. Fast and defensive — no handling.",
        care_guide=(
            "A stunning tiger-banded centipede in alternating deep orange and black — one of the "
            "most sought-after Scolopendra. A fast, active hunter that wants a moist (not wet) "
            "deep substrate to burrow, room warmth (72-80°F), and ~70-80% humidity with a water "
            "dish. Feed an appropriately sized cricket or roach weekly. Venom is no joke (pain, "
            "swelling, reported drowsiness) and it's quick and defensive, so this is a "
            "look-don't-touch species with a tight-fitting, escape-proof lid."
        ),
        source_url="https://en.wikipedia.org/wiki/Scolopendra_hardwickei",
    ),
    _cent(
        scientific_name="Scolopendra morsitans",
        common_names=["Tanzanian Red-headed Centipede"],
        genus="Scolopendra", care_level="intermediate",
        temperament="aggressive, fast, nocturnal",
        native_region="Africa, Asia (pantropical)",
        adult_size="4-6 inches", adult_length_min_mm=100, adult_length_max_mm=150,
        temperature_min=75, temperature_max=85, humidity_min=60, humidity_max=75,
        venom_severity="moderate",
        venom_notes="Painful neurotoxic bite; aggressive and fast. No handling.",
        care_guide=(
            "A widespread, adaptable centipede with a bright red head and banded reddish-brown "
            "body — an aggressive, opportunistic night hunter. Hardy across a range of "
            "conditions (75-85°F, 60-75% humidity) but, like all centipedes, loses water easily, "
            "so keep deep moist substrate to burrow plus a water dish. A fast, defensive species "
            "with a painful neurotoxic bite — escape-proof lid, no handling."
        ),
        source_url="https://en.wikipedia.org/wiki/Scolopendra_morsitans",
    ),
    _cent(
        scientific_name="Scolopendra galapagoensis",
        common_names=["Galapagos Giant Centipede"],
        genus="Scolopendra", care_level="advanced",
        temperament="large, powerful, defensive",
        native_region="Galápagos, coastal Ecuador/Peru",
        adult_size="up to 12 inches", adult_length_min_mm=200, adult_length_max_mm=300,
        temperature_min=75, temperature_max=82, humidity_min=70, humidity_max=80,
        venom_severity="medically_significant",
        venom_notes="One of the largest centipedes; powerful venom that subdues small vertebrates. Bites are very painful (not usually fatal). Advanced keepers only, no handling.",
        care_guide=(
            "One of the largest centipedes in the world — a true giant reaching well over a foot "
            "in the wild. A powerful nocturnal predator that takes small vertebrates as well as "
            "insects, with a defensive display of raised rear legs. Needs a large, secure "
            "enclosure with deep, moisture-retaining substrate to burrow, 75-82°F, ~70-80% "
            "humidity, and a water dish. Potent venom and serious size make this an advanced, "
            "strictly hands-off species; a tight, escape-proof lid is essential."
        ),
        source_url="https://en.wikipedia.org/wiki/Scolopendra_galapagoensis",
    ),
    _cent(
        scientific_name="Ethmostigmus rubripes",
        common_names=["Australian Giant Centipede"],
        genus="Ethmostigmus", care_level="intermediate",
        temperament="fast, aggressive (varies by form)",
        native_region="Australia, parts of Asia",
        adult_size="6-9 inches", adult_length_min_mm=130, adult_length_max_mm=230,
        temperature_min=72, temperature_max=82, humidity_min=60, humidity_max=75,
        venom_severity="moderate",
        venom_notes="Potent venom; reported bite pain ranges from wasp-sting to severe and lasting days. Fast and defensive — no handling.",
        care_guide=(
            "Australia's largest centipede, in colors from blue-green-brown to orange-yellow "
            "with black banding and yellow legs. Lightly built, long-legged, lightning-fast, and "
            "often aggressive (temperament varies by regional form). Hardy on slightly moist "
            "coco-peat in a sealed container with good ventilation to avoid fungal issues, room "
            "warmth (72-82°F), and a water dish; give it floor space to stretch out. Venom is "
            "potent and bites can be severe — escape-proof lid, no handling."
        ),
        source_url="https://australian.museum/learn/animals/centipedes/giant-centipede/",
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
