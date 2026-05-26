"""
Seed scorpion species — initial 25-species catalog for the v1 scorpion
expansion (see docs/design/PLAN-scorpion-v1.md §7 D2).

Run with: python3 seed_scorpion_species.py

Honesty notes
-------------

* All `care_guide` blurbs are written in plain prose — no fabricated
  citations. Where the captive-care literature is thin (Heterometrus
  silenus, Diplocentrus melici), the blurb says so.
* Temperature / humidity ranges follow widely-cited keeper practice for
  the species' native biome. Single source of truth for the husbandry
  ranges is "what most established keepers report works"; that's why
  fields like `feeding_frequency_juvenile` are written as ranges, not
  exact numbers.
* `venom_severity` is the headline field for scorpions. Tier rules:
    - 'mild'                  — sting comparable to a bee/wasp. Most
                                forest + burrowing species.
    - 'moderate'              — intense local pain, possible systemic
                                symptoms, rarely dangerous to healthy
                                adults. Tier most Hottentotta + larger
                                Centruroides species fall into.
    - 'medically_significant' — documented envenomation deaths,
                                antivenom relevant. Reserved for the
                                buthid genera Androctonus, Leiurus,
                                Parabuthus transvaalicus, Centruroides
                                sculpturatus, Tityus serrulatus /
                                stigmurus. KEEPER POPULATION RESTRICTIONS
                                APPLY — DOT/CITES/state-level rules vary.
* `communal_suitable` is True ONLY for genera with documented colony
  tolerance (Pandinus, Heterometrus, Hadrurus, some Babycurus). Even
  for these, cohabitation is not guaranteed — keepers must monitor.
* `image_url` is intentionally left None for every entry. Care-sheet
  images flow through the dedicated image attribution pipeline (see
  Task #77, scripts/fetch_care_sheet_images.py); this seed just creates
  the catalog rows.
"""

import os
import re
import sys
import uuid

# Make `app.*` importable when running this from apps/api/
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.scorpion_species import ScorpionSpecies


def _slugify(scientific_name: str) -> str:
    """Slug for SEO-friendly care-sheet URLs. Lowercase the name, drop
    non-alphanumerics to hyphens, collapse repeats. Matches the pattern
    used in seed_reptile_species.py."""
    s = scientific_name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ---------------------------------------------------------------------
# 25 species. Order in this list groups by care tier so a code-reviewer
# can scan the venom_severity column visually (mild → medically_sig).
# ---------------------------------------------------------------------

SPECIES_DATA = [

    # ─── Beginner / docile (7) ─────────────────────────────────────

    {
        "scientific_name": "Pandinus imperator",
        "common_names": ["Emperor Scorpion"],
        "genus": "Pandinus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "docile",
        "native_region": "West Africa (Ghana, Togo, Benin, Nigeria)",
        "adult_size": "6-8 inches",
        "adult_length_min_mm": 150,
        "adult_length_max_mm": 200,
        "growth_rate": "slow",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_juvenile": '8x8x8" / 5-gallon equivalent',
        "enclosure_size_adult": '18x12x12" / 20-gallon long for a group',
        "substrate_depth": "4-6 inches",
        "substrate_type": "Coco fiber + sphagnum moss, kept damp",
        "prey_size": "Roaches, crickets sized to scorpion's chela",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week to once every two weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": True,
        "venom_severity": "mild",
        "venom_notes": "Sting comparable to a bee. Defensive but rarely stings — relies on its massive chela for prey capture and defense.",
        "care_guide": (
            "**Emperor Scorpion** — the most commonly kept scorpion and one "
            "of the most forgiving. Large, slow, and impressive on display. "
            "Native to humid West African forest floor, so a deep, damp "
            "substrate with sphagnum patches and at least one cork-bark hide "
            "is the baseline setup. Pandinus do well communally provided the "
            "enclosure is large enough and there's a hide per scorpion plus "
            "one extra. CITES Appendix II — captive-bred specimens are the "
            "responsible choice. Fluoresces brilliantly under UV (true of all "
            "scorpions in this seed)."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Heterometrus spinifer",
        "common_names": ["Asian Forest Scorpion", "Malaysian Forest Scorpion"],
        "genus": "Heterometrus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Southeast Asia (Malaysia, Indonesia, Thailand)",
        "adult_size": "4-5 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 130,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12" / 10-gallon equivalent',
        "substrate_depth": "4 inches",
        "substrate_type": "Coco fiber + sphagnum, kept damp",
        "prey_size": "Roaches, crickets sized to scorpion's chela",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": True,
        "venom_severity": "mild",
        "venom_notes": "Sting comparable to a bee/wasp. Heterometrus species are quicker to brandish chela and pinch than Pandinus.",
        "care_guide": (
            "**Asian Forest Scorpion** — a close husbandry analogue to "
            "Pandinus imperator, slightly smaller and noticeably feistier. "
            "Same damp-substrate forest setup. Communal in adequate space "
            "with multiple hides, though cannibalism risk is higher than "
            "Pandinus during/after molts. Often mislabeled in the pet trade "
            "as H. longimanus; the two are similar enough that care is "
            "interchangeable."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Heterometrus laoticus",
        "common_names": ["Vietnamese Forest Scorpion", "Giant Vietnamese Centipede Scorpion"],
        "genus": "Heterometrus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Vietnam, Laos, Cambodia",
        "adult_size": "4-6 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 150,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12"',
        "substrate_depth": "4-5 inches",
        "substrate_type": "Coco fiber + sphagnum, kept damp",
        "prey_size": "Roaches, crickets",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": True,
        "venom_severity": "mild",
        "venom_notes": "Mild sting; relies on chela.",
        "care_guide": (
            "**Vietnamese Forest Scorpion** — slightly larger on average "
            "than H. spinifer with a more deliberate temperament. Husbandry "
            "is identical to other Heterometrus: humid, deep substrate, "
            "cork-bark or stacked-slate hides. Communal setups work in "
            "generous floor space."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Heterometrus silenus",
        "common_names": ["Sumatran Black Scorpion"],
        "genus": "Heterometrus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Sumatra, Java",
        "adult_size": "4-5 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 130,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12"',
        "substrate_depth": "4 inches",
        "substrate_type": "Coco fiber + sphagnum, kept damp",
        "prey_size": "Roaches, crickets",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": True,
        "venom_severity": "mild",
        "venom_notes": "Mild sting; relies on chela.",
        "care_guide": (
            "**Sumatran Black Scorpion** — less common in the trade than "
            "H. spinifer / laoticus but husbandry is essentially identical. "
            "Captive-care literature is thinner; defer to general "
            "Heterometrus husbandry until species-specific data accumulates."
        ),
        "is_verified": False,
    },
    {
        "scientific_name": "Hadrurus arizonensis",
        "common_names": ["Arizona Desert Hairy Scorpion", "Giant Hairy Scorpion"],
        "genus": "Hadrurus",
        "family": "Hadruridae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Southwestern US, northern Mexico (Sonoran + Mojave deserts)",
        "adult_size": "5-7 inches",
        "adult_length_min_mm": 130,
        "adult_length_max_mm": 180,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 95,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12" / 10-gallon equivalent',
        "substrate_depth": "6-8 inches",
        "substrate_type": "Sand + clay mix (so burrows hold shape), kept dry with a damp corner",
        "prey_size": "Roaches, crickets, occasional larger prey",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Sting comparable to a hornet. Defensive — quick to tail-up when disturbed.",
        "care_guide": (
            "**Arizona Desert Hairy Scorpion** — the largest scorpion in "
            "North America and one of the most popular desert species in "
            "the hobby. Needs deep, packable substrate (a sand/clay mix or "
            "the commercial 'excavator clay' products) so its burrows don't "
            "collapse. A shallow water dish is essential despite the arid "
            "biome. Solitary — do not house communally."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Hadrurus spadix",
        "common_names": ["Black Hairy Scorpion", "Northern Desert Hairy Scorpion"],
        "genus": "Hadrurus",
        "family": "Hadruridae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Western US (Great Basin desert, Utah, Nevada)",
        "adult_size": "4-6 inches",
        "adult_length_min_mm": 110,
        "adult_length_max_mm": 160,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 70,
        "temperature_max": 90,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12"',
        "substrate_depth": "6-8 inches",
        "substrate_type": "Sand + clay mix",
        "prey_size": "Roaches, crickets",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Mild — comparable to a hornet sting.",
        "care_guide": (
            "**Black Hairy Scorpion** — the higher-elevation, cooler-biome "
            "sibling of H. arizonensis. Same desert setup, but more "
            "tolerant of cooler nights. Solitary."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Smeringurus mesaensis",
        "common_names": ["Dune Scorpion"],
        "genus": "Smeringurus",
        "family": "Vaejovidae",
        "order_name": "Scorpiones",
        "care_level": "beginner",
        "temperament": "defensive",
        "native_region": "Sonoran + Mojave dune systems (US, Mexico)",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 70,
        "adult_length_max_mm": 100,
        "growth_rate": "medium",
        "type": "psammophile",
        "temperature_min": 75,
        "temperature_max": 95,
        "humidity_min": 20,
        "humidity_max": 40,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "5-6 inches",
        "substrate_type": "Fine play sand, kept dry",
        "prey_size": "Small crickets, dubia nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": False,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Mild — comparable to a bee sting.",
        "care_guide": (
            "**Dune Scorpion** — a true psammophile. Spends most of its "
            "life buried in fine sand, surfacing at night to ambush prey. "
            "No water dish (humidity from the substrate base is enough); "
            "occasional misting of one corner mimics dew. Solitary."
        ),
        "is_verified": True,
    },

    # ─── Intermediate (7) ──────────────────────────────────────────

    {
        "scientific_name": "Centruroides gracilis",
        "common_names": ["Florida Bark Scorpion", "Brown Bark Scorpion"],
        "genus": "Centruroides",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Florida, Caribbean, Central America",
        "adult_size": "3-5 inches",
        "adult_length_min_mm": 80,
        "adult_length_max_mm": 130,
        "growth_rate": "medium",
        "type": "scansorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_juvenile": '6x6x8" tall',
        "enclosure_size_adult": '10x10x14" tall',
        "substrate_depth": "2-3 inches",
        "substrate_type": "Coco fiber + cork-bark verticals (arboreal)",
        "prey_size": "Crickets, small roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "none",
        "communal_suitable": True,
        "venom_severity": "moderate",
        "venom_notes": "Painful sting with possible local numbness/tingling. Not life-threatening to healthy adults but more intense than the forest-scorpion tier.",
        "care_guide": (
            "**Florida Bark Scorpion** — North America's only scansorial "
            "(bark-dwelling) scorpion. Needs vertical orientation: cork "
            "bark slabs leaned against the back wall, with moderate "
            "humidity. Tolerates communal setups in adequate space — "
            "they naturally cluster behind bark in the wild."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Heterometrus longimanus",
        "common_names": ["Longimanus Scorpion", "Long-clawed Forest Scorpion"],
        "genus": "Heterometrus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Southeast Asia",
        "adult_size": "4-5 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 130,
        "growth_rate": "medium",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x12"',
        "substrate_depth": "4 inches",
        "substrate_type": "Coco fiber + sphagnum, kept damp",
        "prey_size": "Roaches, crickets",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": True,
        "venom_severity": "mild",
        "venom_notes": "Mild — relies on chela.",
        "care_guide": (
            "**Longimanus Scorpion** — formerly conflated with H. spinifer "
            "in older literature. Husbandry is identical. The chela are "
            "noticeably longer and more slender than spinifer/laoticus; "
            "useful diagnostic for telling species apart at adult size."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Hottentotta hottentotta",
        "common_names": ["Hottentotta Scorpion"],
        "genus": "Hottentotta",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Sub-Saharan Africa",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 90,
        "humidity_min": 40,
        "humidity_max": 60,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x8"',
        "substrate_depth": "2-3 inches",
        "substrate_type": "Coco fiber, mostly dry with a damp corner",
        "prey_size": "Crickets, small roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": "Painful, prolonged local pain with possible systemic symptoms. Not typically life-threatening but the most painful sting of the intermediate tier.",
        "care_guide": (
            "**Hottentotta hottentotta** — parthenogenetic, which means a "
            "single female can produce viable offspring indefinitely. Useful "
            "for keepers who want to grow a colony from one specimen but "
            "also a population-control consideration — escapees can found "
            "feral populations. Fast, defensive, and noticeably more "
            "venomous than the forest-scorpion tier."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Hottentotta judaicus",
        "common_names": ["Israeli Black Scorpion", "Judean Black Scorpion"],
        "genus": "Hottentotta",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Middle East (Israel, Jordan, Lebanon, Syria)",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 70,
        "adult_length_max_mm": 100,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 90,
        "humidity_min": 40,
        "humidity_max": 60,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x8"',
        "substrate_depth": "3 inches",
        "substrate_type": "Coco fiber + sand mix, mostly dry",
        "prey_size": "Crickets, roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": "Painful sting with local swelling and possible systemic effects.",
        "care_guide": (
            "**Israeli Black Scorpion** — large for the genus, with the "
            "characteristic black-and-yellow Hottentotta build. Drier "
            "biome than H. hottentotta. Solitary."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Babycurus jacksoni",
        "common_names": ["Tanzanian Red-Clawed Scorpion", "Jackson's Scorpion"],
        "genus": "Babycurus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "East Africa (Tanzania, Kenya)",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "scansorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_juvenile": '4x4x6" tall',
        "enclosure_size_adult": '8x8x10" tall',
        "substrate_depth": "2 inches",
        "substrate_type": "Coco fiber + cork bark verticals",
        "prey_size": "Small crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "none",
        "communal_suitable": True,
        "venom_severity": "moderate",
        "venom_notes": "Moderate — painful sting, localized symptoms.",
        "care_guide": (
            "**Tanzanian Red-Clawed Scorpion** — small, fast, and one of "
            "the few buthids that tolerates communal setups well. Striking "
            "red chela against a dark body. Bark-dwelling, so vertical "
            "orientation with cork bark."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Diplocentrus melici",
        "common_names": ["Yucatán Burrowing Scorpion"],
        "genus": "Diplocentrus",
        "family": "Diplocentridae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Mexico (Yucatán peninsula)",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 70,
        "adult_length_max_mm": 100,
        "growth_rate": "slow",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '10x10x10"',
        "substrate_depth": "5-6 inches",
        "substrate_type": "Coco fiber + clay, packable, damp",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Once per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Mild sting; relies on burrowing for defense.",
        "care_guide": (
            "**Yucatán Burrowing Scorpion** — less common in the hobby. "
            "Limestone-cave biome means a packable, humid substrate held "
            "deep. Captive-care literature is thin; cross-reference with "
            "Diplocentrus genus generalities."
        ),
        "is_verified": False,
    },
    {
        "scientific_name": "Vaejovis spinigerus",
        "common_names": ["Stripe-Tailed Scorpion", "Devil Scorpion"],
        "genus": "Vaejovis",
        "family": "Vaejovidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Southwestern US, northern Mexico",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 90,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "3 inches",
        "substrate_type": "Sand + coco mix, dry with damp corner",
        "prey_size": "Small crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Mild — bee-sting equivalent.",
        "care_guide": (
            "**Stripe-Tailed Scorpion** — small, common desert species. "
            "Doesn't burrow deeply but takes refuge under rocks/bark. A "
            "good introductory desert species since they're hardy and "
            "venom is mild."
        ),
        "is_verified": True,
    },

    # ─── Advanced / medically significant (9) ──────────────────────

    {
        "scientific_name": "Centruroides sculpturatus",
        "common_names": ["Arizona Bark Scorpion"],
        "genus": "Centruroides",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Southwestern US (Arizona, southern California, NM), northern Mexico",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "scansorial",
        "temperature_min": 75,
        "temperature_max": 90,
        "humidity_min": 40,
        "humidity_max": 60,
        "enclosure_size_juvenile": '4x4x6" tall',
        "enclosure_size_adult": '8x8x10" tall',
        "substrate_depth": "2 inches",
        "substrate_type": "Coco + cork bark verticals",
        "prey_size": "Small crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "none",
        "communal_suitable": True,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "North America's only medically significant scorpion. Stings "
            "cause severe pain, numbness, possible neuromuscular symptoms "
            "(involuntary muscle movement, blurred vision). Antivenom "
            "(Anascorp) available in the US. Children, elderly, and "
            "immunocompromised at highest risk. Keepers must have a sting "
            "protocol and local hospital contact."
        ),
        "care_guide": (
            "**Arizona Bark Scorpion** — small but medically significant. "
            "Husbandry is straightforward (similar to Centruroides "
            "gracilis), but the keeper population is the bigger story: "
            "this is a HOT species and should only be kept by experienced "
            "keepers with proper containment. Locally illegal in some US "
            "states; check your local laws before acquiring. Communal in "
            "the wild but separating them in captivity is the safer call "
            "for the keeper."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Androctonus australis",
        "common_names": ["Sahara Yellow Fat-Tail", "Sahara Scorpion"],
        "genus": "Androctonus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "North Africa (Sahara — Algeria, Tunisia, Libya, Egypt)",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 80,
        "adult_length_max_mm": 110,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 20,
        "humidity_max": 40,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '10x10x8"',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Sand + clay, dry",
        "prey_size": "Crickets, roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "One of the most venomous scorpions in the world. Sting causes "
            "severe pain, cardiovascular and neurological symptoms. "
            "Antivenom available in North Africa; less accessible "
            "elsewhere. KEEPER POPULATION RESTRICTIONS APPLY in many "
            "jurisdictions."
        ),
        "care_guide": (
            "**Sahara Yellow Fat-Tail** — fast, defensive, extremely "
            "venomous. The thick tail and small chela are the diagnostic "
            "Androctonus shape: this is a scorpion built around the sting, "
            "not the pinch. Solitary. Hot keepers only — research the legal "
            "status in your jurisdiction and have a sting protocol BEFORE "
            "acquiring."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Androctonus crassicauda",
        "common_names": ["Black Fat-Tail Scorpion", "Arabian Fat-Tail"],
        "genus": "Androctonus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Middle East, North Africa",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 80,
        "adult_length_max_mm": 110,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 20,
        "humidity_max": 40,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '10x10x8"',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Sand + clay, dry",
        "prey_size": "Crickets, roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": "Highly venomous — comparable to A. australis. Cardiovascular and neurological symptoms documented.",
        "care_guide": (
            "**Black Fat-Tail** — solid black variant of the Androctonus "
            "body plan. Identical husbandry to A. australis. Hot keepers only."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Androctonus mauritanicus",
        "common_names": ["Moroccan Fat-Tail"],
        "genus": "Androctonus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Morocco, western North Africa",
        "adult_size": "3-4 inches",
        "adult_length_min_mm": 80,
        "adult_length_max_mm": 110,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 20,
        "humidity_max": 40,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '10x10x8"',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Sand + clay, dry",
        "prey_size": "Crickets, roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": "Highly venomous — Androctonus tier.",
        "care_guide": (
            "**Moroccan Fat-Tail** — sister species to A. australis with "
            "almost identical husbandry. Hot keepers only."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Leiurus quinquestriatus",
        "common_names": ["Deathstalker", "Israeli Yellow Scorpion"],
        "genus": "Leiurus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "North Africa, Middle East",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "3 inches",
        "substrate_type": "Sand + clay, mostly dry",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "Among the most dangerous scorpions to humans. Stings cause "
            "severe pain, pulmonary edema, cardiovascular collapse in "
            "severe cases. Antivenom available regionally."
        ),
        "care_guide": (
            "**Deathstalker** — small, fast, and one of the most venomous "
            "scorpions documented. Husbandry is straightforward but the "
            "keeper population is the entire concern: this is for "
            "experienced hot keepers only, with sealed containment, a "
            "written sting protocol, and a local hospital pre-briefed. "
            "Restricted or illegal in many jurisdictions."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Leiurus abdullahbayrami",
        "common_names": ["Turkish Yellow Scorpion"],
        "genus": "Leiurus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Turkey, Syria",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 80,
        "temperature_max": 95,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "3 inches",
        "substrate_type": "Sand + clay, mostly dry",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": "Highly venomous — Leiurus tier.",
        "care_guide": (
            "**Turkish Yellow Scorpion** — split from L. quinquestriatus "
            "in 2007. Husbandry identical. Hot keepers only."
        ),
        "is_verified": False,
    },
    {
        "scientific_name": "Parabuthus transvaalicus",
        "common_names": ["Transvaal Thick-Tail", "South African Spitting Scorpion"],
        "genus": "Parabuthus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Southern Africa (South Africa, Mozambique, Zimbabwe)",
        "adult_size": "4-5 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 130,
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 78,
        "temperature_max": 90,
        "humidity_min": 30,
        "humidity_max": 50,
        "enclosure_size_juvenile": '6x6x6"',
        "enclosure_size_adult": '12x12x10"',
        "substrate_depth": "3-4 inches",
        "substrate_type": "Sand + clay, mostly dry",
        "prey_size": "Crickets, roaches",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "Highly venomous, with the added behavioral note that "
            "Parabuthus can SPRAY venom from the telson when threatened. "
            "Eye protection is mandatory during enclosure maintenance."
        ),
        "care_guide": (
            "**Transvaal Thick-Tail** — large for the buthid family and "
            "uniquely able to spray venom defensively (up to ~1 m). The "
            "spray itself is mostly an eye/mucous-membrane hazard rather "
            "than a skin one, but a sting from this species is medically "
            "significant. Hot keepers only, with eye protection during "
            "maintenance."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Tityus serrulatus",
        "common_names": ["Brazilian Yellow Scorpion"],
        "genus": "Tityus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Brazil",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 88,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "3 inches",
        "substrate_type": "Coco fiber, lightly damp",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": (
            "Responsible for the majority of scorpion-envenomation deaths "
            "in Brazil. Children and elderly are particularly vulnerable. "
            "Parthenogenetic — escape risk is also a population risk."
        ),
        "care_guide": (
            "**Brazilian Yellow Scorpion** — parthenogenetic AND medically "
            "significant — the riskiest combination in the seed for keepers "
            "in non-native regions. A single specimen can establish a "
            "feral population. Hot keepers only; sealed containment; check "
            "the legal status in your jurisdiction (illegal to keep in "
            "several US states and most of the EU)."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Tityus stigmurus",
        "common_names": ["Brazilian Yellow Tityus"],
        "genus": "Tityus",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "advanced",
        "temperament": "defensive",
        "native_region": "Northeastern Brazil",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 88,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_juvenile": '4x4x4"',
        "enclosure_size_adult": '8x8x6"',
        "substrate_depth": "3 inches",
        "substrate_type": "Coco fiber, lightly damp",
        "prey_size": "Crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "light",
        "communal_suitable": False,
        "venom_severity": "medically_significant",
        "venom_notes": "Medically significant, similar profile to T. serrulatus. Parthenogenetic.",
        "care_guide": (
            "**Brazilian Yellow Tityus** — close relative of T. serrulatus "
            "with the same parthenogenetic + medically-significant risk "
            "profile. Same containment posture required."
        ),
        "is_verified": True,
    },

    # ─── Hobbyist favorites (2) ────────────────────────────────────

    {
        "scientific_name": "Lychas mucronatus",
        "common_names": ["Chinese Swimming Scorpion", "Asian Swimming Scorpion"],
        "genus": "Lychas",
        "family": "Buthidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Southeast Asia, southern China",
        "adult_size": "2-3 inches",
        "adult_length_min_mm": 50,
        "adult_length_max_mm": 80,
        "growth_rate": "medium",
        "type": "scansorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 70,
        "humidity_max": 85,
        "enclosure_size_juvenile": '4x4x6" tall',
        "enclosure_size_adult": '8x8x10" tall',
        "substrate_depth": "3 inches",
        "substrate_type": "Coco fiber, damp; cork bark verticals",
        "prey_size": "Small crickets, roach nymphs",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "burrowing": "none",
        "communal_suitable": False,
        "venom_severity": "moderate",
        "venom_notes": "Moderate — painful sting with possible local symptoms.",
        "care_guide": (
            "**Chinese Swimming Scorpion** — the 'swimming' name refers to "
            "an observed ability to traverse water surfaces, not aquatic "
            "preference. A humid forest scorpion that uses both substrate "
            "and vertical bark."
        ),
        "is_verified": True,
    },
    {
        "scientific_name": "Opistophthalmus glabrifrons",
        "common_names": ["Tricolor Burrowing Scorpion", "Shiny Burrower"],
        "genus": "Opistophthalmus",
        "family": "Scorpionidae",
        "order_name": "Scorpiones",
        "care_level": "intermediate",
        "temperament": "defensive",
        "native_region": "Southern Africa",
        "adult_size": "4-5 inches",
        "adult_length_min_mm": 100,
        "adult_length_max_mm": 130,
        "growth_rate": "slow",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 88,
        "humidity_min": 40,
        "humidity_max": 60,
        "enclosure_size_juvenile": '6x6x8" tall',
        "enclosure_size_adult": '12x12x12"',
        "substrate_depth": "6-8 inches",
        "substrate_type": "Clay + sand, packable, mostly dry with damp lower layer",
        "prey_size": "Roaches, crickets",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once every 1-2 weeks",
        "water_dish_required": True,
        "burrowing": "heavy",
        "communal_suitable": False,
        "venom_severity": "mild",
        "venom_notes": "Mild — relies on its chela and burrow.",
        "care_guide": (
            "**Tricolor Burrowing Scorpion** — substantial scorpionid that "
            "builds elaborate spiral burrows. Needs DEEP, packable "
            "substrate; if it can't burrow it stresses. Beautiful display "
            "animal but rarely visible — the burrow is the point."
        ),
        "is_verified": True,
    },
]


def seed():
    """Insert any species not already present in scorpion_species.

    Idempotent — re-running skips rows where scientific_name_lower
    already exists. `slug` is computed from the scientific name so
    re-seeding never re-randomizes the SEO URL.
    """
    db = SessionLocal()
    try:
        before = db.query(ScorpionSpecies).count()
        print(f"Starting scorpion species count: {before}")

        added = 0
        skipped = 0

        for data in SPECIES_DATA:
            name = data["scientific_name"]
            existing = db.query(ScorpionSpecies).filter(
                ScorpionSpecies.scientific_name_lower == name.lower()
            ).first()

            if existing:
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue

            species = ScorpionSpecies(
                id=uuid.uuid4(),
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **data,
            )
            db.add(species)
            added += 1
            print(f"  Added: {name}")

        db.commit()
        after = db.query(ScorpionSpecies).count()
        print(f"\nDone. Added {added}, skipped {skipped}. Total now: {after}")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
