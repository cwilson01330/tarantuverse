"""
Seed centipede species — initial 9-species catalog for ADR-005 Phase C2.

Run with: python3 seed_centipede_species.py

Writes directly into `invert_species` with `taxon='centipede'` — centipedes
have no legacy per-taxon table.

Honesty notes
-------------

* Centipede care literature is thinner than tarantula or scorpion. Where
  captive husbandry is well-documented (S. polymorpha, S. dehaani,
  S. subspinipes) the care_guide reflects mainstream keeper practice.
  Where data is sparser (E. trigonopodus, Rhysida longipes), the guide
  notes that.
* `venom_severity` is the headline safety field — same tier shape as
  scorpions:
    - 'mild'                  — sting comparable to a wasp. Most
                                Ethmostigmus / Rhysida.
    - 'moderate'              — intense local pain, occasional systemic
                                effects. Many large Scolopendra.
    - 'medically_significant' — documented severe envenomation cases.
                                S. gigantea and the S. subspinipes
                                complex. Antivenom is NOT generally
                                available. Hot keepers only.
* `developmental_class` is 'epimorphic' for every species in this seed
  — Scolopendromorpha hatch with their full adult segment count.
  Anamorphic centipedes (Geophilomorpha, Lithobiomorpha) aren't in the
  pet trade in any meaningful numbers and aren't seeded here.
* `communal_suitable` is False for every species. Centipedes are
  cannibalistic — even mated pairs separate after laying. Keepers
  attempting communal setups should expect losses.
* `typical_segment_count` = 21 and `typical_leg_pair_count` = 21 for
  all Scolopendromorpha. Listed for completeness; mobile UI may show it
  on the care sheet as a biology-nerd detail.
* `image_url` is left None — care-sheet images flow through the
  dedicated image attribution pipeline (Task #77).
* DOT / CITES / state-level legal restrictions vary widely for the
  medically-significant species. Keepers must research local laws
  before acquiring S. gigantea or S. subspinipes.
"""

import os
import re
import sys
import uuid

# Make `app.*` importable when running this from apps/api/
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(scientific_name: str) -> str:
    """SEO-friendly slug. Matches the pattern used in
    seed_scorpion_species.py + seed_reptile_species.py."""
    s = scientific_name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ---------------------------------------------------------------------
# 9 species. Order groups by venom tier so a reviewer can scan the
# `venom_severity` column visually (mild → moderate → medically_sig).
# All are Scolopendromorpha, all are epimorphic, all are solitary.
# ---------------------------------------------------------------------

SPECIES_DATA = [

    # ─── Beginner / mild venom (3) ─────────────────────────────────

    {
        "scientific_name": "Ethmostigmus trigonopodus",
        "common_names": ["Yellow-Legged Centipede", "African Yellow-Leg"],
        "genus": "Ethmostigmus",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "beginner",
        "temperament": "defensive, fast",
        "native_region": "Sub-Saharan Africa, Madagascar",
        "adult_size": "5-7 inches",
        "adult_length_min_mm": 130,
        "adult_length_max_mm": 180,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '5x5x5"',
        "enclosure_size_adult": '12x8x6" with 4" substrate',
        "substrate_depth": "4-5 inches",
        "substrate_type": "Coco fiber + topsoil, kept damp",
        "prey_size": "Crickets, roaches, occasional pinkie for adults",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": (
            "Sting comparable to a bee or wasp — intense localized pain "
            "for several hours, no systemic effects reported in healthy "
            "adults. Use tongs; defensive when uncovered."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Yellow-Legged Centipede** — colorful, hardy, and one of "
            "the most beginner-friendly centipedes. Striking yellow legs "
            "against a dark green-blue body. Spends most of its time in "
            "a burrow; provide deep damp substrate and expect to rarely "
            "see it during the day. Sting is mild but defensive — never "
            "handle. Established captive-bred stock is uncommon; most "
            "imports are wild-caught."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Rhysida longipes",
        "common_names": ["Rhysida Centipede"],
        "genus": "Rhysida",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "beginner",
        "temperament": "defensive, fast",
        "native_region": "Pantropical (Africa, Asia, Caribbean, introduced widely)",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 70,
        "adult_length_max_mm": 110,
        "growth_rate": "fast",
        "type": "fossorial",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x6x5" with 3" substrate',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Coco fiber + leaf litter, damp",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": (
            "Mild — localized pain comparable to a bee sting. Small body "
            "size keeps envenomation volume low."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Rhysida** — small, fast, and forgiving. Often the first "
            "centipede recommended for a keeper crossing over from "
            "tarantulas. Pantropical distribution; imports come from "
            "many regions and color variation is wide. Setup is simple "
            "— damp substrate, a hide, a shallow water dish. Cannibalistic, "
            "so no communal. Sting is mild but every centipede gets "
            "tongs, not hands."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Scolopendra polymorpha",
        "common_names": ["Sonoran Tiger", "Sonoran Desert Centipede", "Common Desert Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Southwestern US, northern Mexico",
        "adult_size": "5-7 inches",
        "adult_length_min_mm": 120,
        "adult_length_max_mm": 180,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 72,
        "temperature_max": 85,
        "humidity_min": 50,
        "humidity_max": 70,
        "enclosure_size_juvenile": '5x5x4"',
        "enclosure_size_adult": '12x8x6" with 4-5" substrate',
        "substrate_depth": "4-5 inches",
        "substrate_type": "Coco fiber + sand mix, damp on one side and drier on the other",
        "prey_size": "Crickets, roaches, occasional pinkie for adults",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": (
            "Sting causes intense localized pain, swelling, occasional "
            "lymph-node response. Documented cases of nausea and elevated "
            "heart rate, but no fatalities in healthy adults. Notably "
            "less severe than the larger Scolopendra in this seed."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Sonoran Tiger** — the most commonly kept Scolopendra in "
            "the US trade. Striking dark body with bright orange-red "
            "legs and head. Highly variable in color, hence the species "
            "epithet 'polymorpha.' Hardy if given a humidity gradient — "
            "damp burrowing layer with a drier surface. Cohabits with "
            "no one. Sting is no joke but recoverable; this is the "
            "tier where keepers learn to respect the tool."
        ),
        "is_verified": True,
    },

    # ─── Intermediate / moderate venom (4) ─────────────────────────

    {
        "scientific_name": "Scolopendra heros",
        "common_names": ["Texas Redhead", "Giant Desert Centipede", "Giant Redheaded Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Southern US (Texas, Oklahoma, Arkansas, Louisiana), northern Mexico",
        "adult_size": "6-8 inches",
        "adult_length_min_mm": 150,
        "adult_length_max_mm": 230,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 72,
        "temperature_max": 85,
        "humidity_min": 55,
        "humidity_max": 75,
        "enclosure_size_juvenile": '5x5x4"',
        "enclosure_size_adult": '14x10x6" with 5" substrate",',
        "substrate_depth": "4-6 inches",
        "substrate_type": "Coco fiber + topsoil, damp underneath drier surface",
        "prey_size": "Adult crickets, roaches, pinkie mice for large adults",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": (
            "Larger than S. polymorpha and stings to match. Intense pain "
            "lasting hours, often days; significant swelling, occasional "
            "necrosis at the bite site. No fatalities in healthy adults, "
            "but allergic reactions documented. Treat as a serious sting "
            "risk regardless of legal availability."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Texas Redhead** — large, colorful, and a US-native species "
            "that brings excellent display. Vivid red-orange head and tail "
            "with a black or olive body and yellow legs (color varies "
            "regionally). Burrows deep; provide packable substrate and a "
            "humidity gradient. Step up from S. polymorpha in size and "
            "sting severity but otherwise similar care. Wild-caught "
            "specimens are common; captive-bred is rare."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Scolopendra alternans",
        "common_names": ["Florida Keys Giant Centipede", "Caribbean Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "intermediate",
        "temperament": "defensive, fast",
        "native_region": "Florida Keys, Caribbean, Central America",
        "adult_size": "6-8 inches",
        "adult_length_min_mm": 150,
        "adult_length_max_mm": 200,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '5x5x4"',
        "enclosure_size_adult": '12x8x6" with 4-5" substrate',
        "substrate_depth": "4-5 inches",
        "substrate_type": "Coco fiber + topsoil, kept damp throughout",
        "prey_size": "Crickets, roaches, occasional pinkie",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": (
            "Severe localized pain, often with swelling that spreads up "
            "the affected limb. Recovered within 24-48 hours in healthy "
            "adults; allergic and cardiovascular complications reported."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Florida Keys Giant** — humid-loving Scolopendra with dark "
            "body and contrasting red-orange legs. Slightly higher "
            "humidity requirement than S. heros or S. polymorpha — keep "
            "substrate consistently damp. Care otherwise mirrors the "
            "other large Scolopendra: deep substrate, water dish, "
            "tongs always."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Scolopendra cingulata",
        "common_names": ["Mediterranean Banded Centipede", "Megarian Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Mediterranean basin (Southern Europe, North Africa, Middle East)",
        "adult_size": "4-6 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 150,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 70,
        "temperature_max": 82,
        "humidity_min": 55,
        "humidity_max": 75,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '10x8x5" with 4" substrate',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Coco fiber + topsoil, damp underneath drier surface",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": (
            "Intense localized pain, swelling, occasional lymph node "
            "involvement. No documented fatalities in healthy adults but "
            "stings are routinely reported as severe."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Mediterranean Banded** — the most commonly kept European "
            "Scolopendra. Distinct dark banding on a paler body. Tolerates "
            "a wider temperature range than the tropical species; happy "
            "in the low 70s. Burrows actively; provide depth and a "
            "humidity gradient. Behaves like a smaller S. heros — less "
            "imposing but the same defensive disposition."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Scolopendra dehaani",
        "common_names": ["Vietnamese Centipede", "Asian Forest Centipede", "Dehaan's Giant Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "intermediate",
        "temperament": "defensive, very fast",
        "native_region": "Southeast Asia (Vietnam, Thailand, Laos, Cambodia, Malaysia)",
        "adult_size": "7-9 inches",
        "adult_length_min_mm": 180,
        "adult_length_max_mm": 230,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 75,
        "humidity_max": 90,
        "enclosure_size_juvenile": '5x5x5"',
        "enclosure_size_adult": '14x10x8" with 5-6" substrate',
        "substrate_depth": "5-6 inches",
        "substrate_type": "Coco fiber + topsoil + sphagnum, kept damp throughout",
        "prey_size": "Adult crickets, roaches, pinkie mice for large adults",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": (
            "Significant envenomation potential — severe local pain, "
            "marked swelling, occasional systemic symptoms (nausea, "
            "elevated heart rate, lymph involvement). Larger specimens "
            "approach the medically-significant tier; treat with "
            "extreme caution. Sometimes traded under the S. subspinipes "
            "complex name — keep that ambiguity in mind."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": False,
        "urticating_hairs": False,
        "care_guide": (
            "**Vietnamese Centipede** — large, dark, blazing-fast "
            "rainforest species. Striking gloss-black body with yellow "
            "or orange legs. One of the most reliably-imported large "
            "Scolopendra. Demanding humidity — keep substrate damp "
            "throughout, never let it dry out. Burrows deep; surface "
            "appearances are brief. Defensive on a hair-trigger; "
            "rehouse with care."
        ),
        "is_verified": True,
    },

    # ─── Advanced / medically significant (2) ──────────────────────

    {
        "scientific_name": "Scolopendra subspinipes",
        "common_names": ["Chinese Red-Headed Centipede", "Vietnamese Giant", "Jungle Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "advanced",
        "temperament": "defensive, very fast",
        "native_region": "Pantropical Asia, Caribbean, Pacific (taxonomically a species complex)",
        "adult_size": "7-8 inches",
        "adult_length_min_mm": 180,
        "adult_length_max_mm": 220,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 75,
        "humidity_max": 90,
        "enclosure_size_juvenile": '5x5x5"',
        "enclosure_size_adult": '14x10x8" with 5-6" substrate',
        "substrate_depth": "5-6 inches",
        "substrate_type": "Coco fiber + topsoil + sphagnum, kept damp throughout",
        "prey_size": "Crickets, roaches, pinkie mice for large adults",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "MEDICALLY SIGNIFICANT. Documented severe envenomations "
            "including hospitalizations; at least one fatality recorded "
            "in a small child. Pain is excruciating, swelling can be "
            "extensive, and systemic effects (cardiac, neurological) "
            "have been reported. Antivenom is not generally available. "
            "Taxonomy is a species complex — many imports labeled "
            "S. subspinipes are actually S. dehaani or other relatives. "
            "Treat ALL specimens with maximum caution."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": True,
        "urticating_hairs": False,
        "care_guide": (
            "**Chinese Red-Headed Centipede** — the medically-significant "
            "Scolopendra most commonly seen in the trade. Vivid red head "
            "and tail with a black or dark green body. Care identical to "
            "S. dehaani (humid, deep substrate, water dish) but the sting "
            "tier is materially higher — keepers should have a sting "
            "protocol and emergency contact in place BEFORE acquiring. "
            "Not for first-time invertebrate keepers regardless of prior "
            "tarantula experience."
        ),
        "is_verified": True,
    },

    {
        "scientific_name": "Scolopendra gigantea",
        "common_names": ["Peruvian Giant Centipede", "Amazonian Giant Centipede"],
        "genus": "Scolopendra",
        "family": "Scolopendridae",
        "order_name": "Scolopendromorpha",
        "care_level": "advanced",
        "temperament": "defensive, very fast",
        "native_region": "Northern South America (Venezuela, Colombia, Peru, Trinidad)",
        "adult_size": "10-12 inches",
        "adult_length_min_mm": 250,
        "adult_length_max_mm": 350,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 75,
        "humidity_max": 90,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '18x12x10" with 6-8" substrate',
        "substrate_depth": "6-8 inches",
        "substrate_type": "Coco fiber + topsoil + sphagnum, kept damp throughout",
        "prey_size": "Adult crickets, roaches, fuzzies / pinkie mice, occasional small lizard",
        "feeding_frequency_juvenile": "Once per week",
        "feeding_frequency_adult": "Once every 2-3 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "MEDICALLY SIGNIFICANT. Largest centipede in the trade and "
            "one of the largest venomous arthropods on the planet. "
            "Documented severe envenomations including a fatality in a "
            "child in Venezuela. Pain is described as among the worst of "
            "any arthropod sting; cardiac, neurological, and lymphatic "
            "involvement have been reported. Antivenom is not generally "
            "available. Specialist keepers only. Research local laws and "
            "have a hospital plan BEFORE acquiring."
        ),
        "developmental_class": "epimorphic",
        "typical_segment_count": 21,
        "typical_leg_pair_count": 21,
        "medically_significant_venom": True,
        "urticating_hairs": False,
        "care_guide": (
            "**Peruvian Giant** — the species at the top of the centipede "
            "trade. Easily exceeds 10 inches, can take small mammals and "
            "lizards in the wild. Husbandry mirrors S. subspinipes — "
            "deep damp substrate, broad water dish, gentle handling with "
            "long tongs — but the scale is bigger and the sting tier is "
            "the highest in this seed. Owning one is a serious commitment, "
            "not a status object. If a sting protocol and emergency "
            "contact aren't in place, this is the wrong species."
        ),
        "is_verified": True,
    },
]


def seed():
    """Insert any centipede species not already present in invert_species.

    Idempotent — re-runs skip rows where scientific_name_lower already
    exists. Slug is computed from the scientific name so re-seeding
    never re-randomizes the SEO URL.
    """
    db = SessionLocal()
    try:
        before = db.query(InvertSpecies).filter(
            InvertSpecies.taxon == "centipede"
        ).count()
        print(f"Starting centipede species count: {before}")

        added = 0
        skipped = 0

        for data in SPECIES_DATA:
            name = data["scientific_name"]
            existing = db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first()

            if existing:
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue

            species = InvertSpecies(
                id=uuid.uuid4(),
                taxon="centipede",
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **data,
            )
            db.add(species)
            added += 1
            print(f"  Added: {name}")

        db.commit()
        after = db.query(InvertSpecies).filter(
            InvertSpecies.taxon == "centipede"
        ).count()
        print(f"\nDone. Added {added}, skipped {skipped}. Total centipedes now: {after}")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
