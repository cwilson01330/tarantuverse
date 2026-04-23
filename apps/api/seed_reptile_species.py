"""Seed the reptile species catalog — initial beginner/intermediate snakes.

Per PRD-herpetoverse-v1 §5.3 and docs/design/RUBRIC-care-sheet-content.md.

Every entry carries 3+ citations, at least one Tier A (peer-reviewed or
veterinary) or authoritative keeper reference. Husbandry numbers are
ranges, not single points, to reflect source variation.

Scope: 5 starter species where we have solid multi-source confirmation:
  - Python regius (ball python)
  - Pantherophis guttatus (corn snake)
  - Lampropeltis californiae (California kingsnake)
  - Heterodon nasicus (Western hognose)
  - Gongylophis colubrinus (Kenyan sand boa)

Future species should go through the rubric's review workflow before
being added here with is_verified=True.

Run with: python3 seed_reptile_species.py
"""
import os
import sys
import uuid
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.reptile_species import ReptileSpecies
from app.utils.slugs import slugify_unique


# ---------------------------------------------------------------------------
# Citation catalog. Structured to match the rubric's JSONB citation shape.
# ---------------------------------------------------------------------------
CITES = {
    "rspca_royal_python": {
        "source_type": "veterinary",
        "title": "Royal Python Care Sheet",
        "author": "RSPCA",
        "url": (
            "https://www.rspca.org.uk/documents/1494939/0/Royal+Python+Care+Sheet+"
            "(PDF+321KB).pdf/c13c4cc7-de89-cd77-f3b3-a946f54e6c9c"
        ),
        "publication_date": "2019-04-01",
        "summary": (
            "Animal-welfare-charity care sheet with husbandry minimums for "
            "Python regius."
        ),
    },
    "tree_of_life_ball_python": {
        "source_type": "veterinary",
        "title": "Ball Python Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/snakes/ball-python-care",
        "publication_date": "2023-01-01",
        "summary": (
            "Exotic-pet-veterinary husbandry guidance for Python regius, "
            "including temperature gradients and humidity ranges."
        ),
    },
    "reptifiles_ball_python": {
        "source_type": "breeder_community",
        "title": "Ball Python Care Guide",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/ball-python-care-guide/",
        "publication_date": "2023-01-01",
        "summary": (
            "Well-referenced hobbyist care guide with husbandry ranges "
            "cross-checked against veterinary sources."
        ),
    },
    "world_of_ball_pythons_care": {
        "source_type": "breeder_community",
        "title": "Care Sheet — Python regius",
        "author": "World of Ball Pythons",
        "url": "https://www.worldofballpythons.com/python-regius/care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "Long-running community reference for ball python husbandry.",
    },
    "tree_of_life_corn_snake": {
        "source_type": "veterinary",
        "title": "Corn Snake Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/snakes/corn-snake-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Pantherophis guttatus.",
    },
    "reptiles_and_research_corn": {
        "source_type": "breeder_community",
        "title": "Corn snake (Pantherophis guttatus) care sheet",
        "author": "Reptiles and Research",
        "url": "https://reptilesandresearch.org/care-sheets/corn-snake-pantherophis-guttatus-care-sheet",
        "publication_date": "2023-01-01",
        "summary": (
            "Evidence-oriented keeper reference drawing on published herpetological "
            "literature."
        ),
    },
    "reptifiles_corn_snake": {
        "source_type": "breeder_community",
        "title": "Corn Snake Temperatures & Humidity Requirements",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/corn-snake-care-guide/corn-snake-temperatures-humidity/",
        "publication_date": "2023-01-01",
        "summary": "Husbandry ranges with cited sources for Pantherophis guttatus.",
    },
    "researchgate_corn_snake": {
        "source_type": "breeder_community",
        "title": "Corn Snake (Pantherophis guttatus) — A Research-based Husbandry/Care Guide",
        "author": "Various",
        "url": "https://www.researchgate.net/publication/374367770_Corn_Snake_Pantherophis_guttatus_-_A_Research-based_HusbandryCare_Guide",
        "publication_date": "2023-01-01",
        "summary": "Research-based compilation of corn snake husbandry parameters.",
    },
    "tree_of_life_california_kingsnake": {
        "source_type": "veterinary",
        "title": "California Kingsnake Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/snakes/california-kingsnake-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Lampropeltis californiae.",
    },
    "chicago_exotics_kingsnake": {
        "source_type": "veterinary",
        "title": "California Kingsnake Care",
        "author": "Chicago Exotics Animal Hospital",
        "url": "http://www.exoticpetvet.com/california-kingsnake-care.html",
        "publication_date": "2020-01-01",
        "summary": "Veterinary care reference for Lampropeltis californiae.",
    },
    "reptifiles_kingsnake": {
        "source_type": "breeder_community",
        "title": "Kingsnake Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/kingsnake-care-sheet/",
        "publication_date": "2023-01-01",
        "summary": "Well-referenced hobbyist guide for the kingsnake genus.",
    },
    "reptiles_magazine_kingsnake": {
        "source_type": "breeder_community",
        "title": "California Kingsnake Care Sheet",
        "author": "Reptiles Magazine",
        "url": "https://reptilesmagazine.com/california-kingsnake-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "Industry magazine husbandry reference.",
    },
    "tree_of_life_hognose": {
        "source_type": "veterinary",
        "title": "Western Hognose Snake Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/snakes/western-hognose-snake-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Heterodon nasicus.",
    },
    "reptifiles_hognose": {
        "source_type": "breeder_community",
        "title": "Hognose Temperature, Lighting & Humidity Requirements",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/heterodon-hognose-snake-care/hognose-temperatures-humidity-lighting/",
        "publication_date": "2023-01-01",
        "summary": "Husbandry ranges with citations for Heterodon nasicus.",
    },
    "biodude_hognose": {
        "source_type": "breeder_community",
        "title": "Western Hognose care sheet and maintenance",
        "author": "The Bio Dude",
        "url": "https://www.thebiodude.com/blogs/snake-caresheets/western-hognose-care-sheet-and-maintenance",
        "publication_date": "2022-01-01",
        "summary": "Bioactive-oriented care reference for Heterodon nasicus.",
    },
    "bgsu_herpetarium_sand_boa": {
        "source_type": "veterinary",
        "title": "Kenyan Sand Boa (East African Sand Boa)",
        "author": "BGSU Herpetarium",
        "url": "https://www.bgsu.edu/content/dam/BGSU/college-of-arts-and-sciences/biological-sciences/Herpetarium-documents/Snakes/new-kenyan-sand-boa-caresheet.pdf",
        "publication_date": "2022-01-01",
        "summary": "University herpetarium care sheet for Gongylophis colubrinus.",
    },
    "researchgate_sand_boa": {
        "source_type": "breeder_community",
        "title": "East African/Egyptian/Kenyan Sand Boa (Eryx colubrinus) — Research-Based Husbandry/Care Guide",
        "author": "Various",
        "url": "https://www.researchgate.net/publication/381179049_East_AfricanEgyptianKenyan_Sand_Boa_Eryx_colubrinus_-_A_Research-Based_HusbandryCare_Guide",
        "publication_date": "2024-01-01",
        "summary": "Research-based compilation of sand boa husbandry parameters.",
    },
    "reptiles_magazine_sand_boa": {
        "source_type": "breeder_community",
        "title": "Expert Care For The Kenyan Sand Boa",
        "author": "Reptiles Magazine",
        "url": "https://reptilesmagazine.com/expert-care-for-the-kenyan-sand-boa/",
        "publication_date": "2020-01-01",
        "summary": "Industry magazine husbandry reference for Gongylophis colubrinus.",
    },
}


def cite(*keys):
    return [CITES[k] | {"ref_key": k} for k in keys]


# ---------------------------------------------------------------------------
# Species entries. Husbandry numbers are expressed as ranges where the source
# literature varies; we prefer the overlap between veterinary and
# authoritative keeper references.
# ---------------------------------------------------------------------------
SPECIES_DATA = [
    # -- Ball python --------------------------------------------------------
    {
        "scientific_name": "Python regius",
        "common_names": ["Ball Python", "Royal Python"],
        "genus": "Python",
        "family": "Pythonidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "nocturnal",
        "native_region": "West and Central Africa — savanna and grassland",
        "adult_length_min_in": Decimal("36"),
        "adult_length_max_in": Decimal("60"),
        "adult_weight_min_g": Decimal("1200"),
        "adult_weight_max_g": Decimal("2200"),
        # Temperature: veterinary + RSPCA sources align on a gradient
        "temp_cool_min": Decimal("78"),
        "temp_cool_max": Decimal("82"),
        "temp_warm_min": Decimal("82"),
        "temp_warm_max": Decimal("88"),
        "temp_basking_min": Decimal("88"),
        "temp_basking_max": Decimal("92"),
        "temp_night_min": Decimal("72"),
        "temp_night_max": Decimal("78"),
        "humidity_min": 55,
        "humidity_max": 70,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 80,
        "uvb_required": False,
        "uvb_type": "not_required",
        "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "20 gallon / 30\"L x 12\"W x 12\"H",
        "enclosure_min_juvenile": "40 gallon / 36\"L x 18\"W x 18\"H",
        "enclosure_min_adult": "120 gallon / 48\"L x 24\"W x 24\"H",
        "bioactive_suitable": True,
        "substrate_safe_list": ["cypress mulch", "coconut husk chips", "coco fiber", "aspen (dry hides only)"],
        "substrate_avoid_list": ["cedar", "pine", "sand"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Hopper mouse or small rat pinky (approx. snake's mid-body width)",
        "prey_size_juvenile": "Small rat / fuzzy to weaned rat",
        "prey_size_adult": "Small to medium rat",
        "feeding_frequency_hatchling": "Every 5–7 days",
        "feeding_frequency_juvenile": "Every 7–10 days",
        "feeding_frequency_adult": "Every 10–14 days",
        # Sprint 5 feeding intelligence — ball pythons are the most-studied
        # species for power feeding thresholds. Ratios drawn from the ReptiFiles
        # and World of Ball Pythons feeding charts, with the 15% power-feeding
        # line well-established across both vet and breeder sources.
        "hatchling_weight_min_g": Decimal("50"),
        "hatchling_weight_max_g": Decimal("100"),
        "power_feeding_threshold_pct": Decimal("15.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 200, "ratio_pct_min": 10, "ratio_pct_max": 15, "interval_days_min": 5, "interval_days_max": 7},
            {"stage": "juvenile", "weight_g_max": 700, "ratio_pct_min": 10, "ratio_pct_max": 12, "interval_days_min": 7, "interval_days_max": 10},
            {"stage": "subadult", "weight_g_max": 1200, "ratio_pct_min": 8, "ratio_pct_max": 10, "interval_days_min": 10, "interval_days_max": 14},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 14, "interval_days_max": 28},
        ],
        "supplementation_notes": (
            "Whole prey meets nutritional needs; no supplementation required "
            "for feeder-fed ball pythons. Variety across rat/mouse is acceptable."
        ),
        "water_bowl_description": "Large enough to soak; positioned on the cool end.",
        "soaking_behavior": (
            "Occasional soaking is normal; persistent soaking can indicate "
            "mites, humidity stress, or other husbandry issues."
        ),
        "brumation_required": False,
        "defensive_displays": ["balling", "hissing", "occasional strike"],
        "lifespan_captivity_min_yrs": 20,
        "lifespan_captivity_max_yrs": 30,
        "cites_appendix": "II",  # P. regius is CITES II
        "iucn_status": "NT",  # Near Threatened per recent IUCN assessments
        "wild_population_notes": (
            "Wild populations are affected by export for the pet trade; "
            "captive-bred animals are strongly preferred. Listed as Near "
            "Threatened by IUCN. Verify current status before publishing."
        ),
        "has_morph_market": True,
        "morph_complexity": "complex",
        "care_guide": (
            "**Ball Python (Python regius)** — The most commonly kept pet snake "
            "in the hobby. Known for a docile temperament, manageable adult size, "
            "and extensive morph market. Provide a secure enclosure with a "
            "thermal gradient, at least two snug hides (warm and cool), and "
            "access to water. Humidity should track 55–70%% with a boost during "
            "shed cycles. Animals may refuse food for extended periods, "
            "especially during winter — an otherwise-healthy ball python can "
            "safely fast for months; weight tracking is the appropriate monitor."
        ),
        "sources": cite(
            "rspca_royal_python",
            "tree_of_life_ball_python",
            "reptifiles_ball_python",
            "world_of_ball_pythons_care",
        ),
    },
    # -- Corn snake ---------------------------------------------------------
    {
        "scientific_name": "Pantherophis guttatus",
        "common_names": ["Corn Snake", "Red Rat Snake"],
        "genus": "Pantherophis",
        "family": "Colubridae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "crepuscular",
        "native_region": "Southeastern United States — pine forests, fields, barns",
        "adult_length_min_in": Decimal("36"),
        "adult_length_max_in": Decimal("72"),
        "adult_weight_min_g": Decimal("700"),
        "adult_weight_max_g": Decimal("900"),
        "temp_cool_min": Decimal("72"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("85"),
        "temp_basking_max": Decimal("88"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("75"),
        "humidity_min": 40,
        "humidity_max": 60,
        "humidity_shed_boost_min": 60,
        "humidity_shed_boost_max": 70,
        "uvb_required": False,
        "uvb_type": "not_required",
        "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "10 gallon / 20\"L x 10\"W x 12\"H",
        "enclosure_min_juvenile": "20 gallon long / 30\"L x 12\"W x 12\"H",
        "enclosure_min_adult": "40 gallon breeder / 36\"L x 18\"W x 18\"H minimum",
        "bioactive_suitable": True,
        "substrate_safe_list": ["aspen shavings", "cypress mulch", "coco husk", "paper-based bedding"],
        "substrate_avoid_list": ["cedar", "pine", "corn cob"],
        "substrate_depth_min_in": Decimal("1.5"),
        "substrate_depth_max_in": Decimal("3"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinky to fuzzy mouse",
        "prey_size_juvenile": "Hopper to adult mouse",
        "prey_size_adult": "Adult mouse or small rat",
        "feeding_frequency_hatchling": "Every 5–7 days",
        "feeding_frequency_juvenile": "Every 7 days",
        "feeding_frequency_adult": "Every 7–14 days",
        # Sprint 5 feeding intelligence — corn snakes tolerate a similar ratio
        # curve to ball pythons but reach maturity at a much lower weight.
        "hatchling_weight_min_g": Decimal("6"),
        "hatchling_weight_max_g": Decimal("15"),
        "power_feeding_threshold_pct": Decimal("15.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 30, "ratio_pct_min": 10, "ratio_pct_max": 15, "interval_days_min": 5, "interval_days_max": 7},
            {"stage": "juvenile", "weight_g_max": 200, "ratio_pct_min": 10, "ratio_pct_max": 12, "interval_days_min": 7, "interval_days_max": 7},
            {"stage": "subadult", "weight_g_max": 500, "ratio_pct_min": 8, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 10},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 14},
        ],
        "supplementation_notes": "None required with appropriately-sized whole prey.",
        "water_bowl_description": "Always available; large enough to soak during shed.",
        "soaking_behavior": (
            "Occasional soaking is normal, especially before shedding. "
            "Persistent soaking can indicate humidity or mite issues."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Brumation is not required for pet corn snakes but may be triggered "
            "by seasonal temperature drops. Required only for breeding; keepers "
            "intending to brumate should consult species-specific protocols."
        ),
        "defensive_displays": ["rattling tail", "musking", "occasional strike"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 23,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Corn Snake (Pantherophis guttatus)** — The archetypal beginner snake: "
            "docile, hardy, reliably-feeding, and long-lived. Corn snakes do well "
            "at room-temperature ambient with a modest warm side and a basking "
            "spot. Respiratory infections are the most commonly seen health issue "
            "and almost always trace to incorrect husbandry — cold temperatures, "
            "humidity that's too high with poor airflow, or a dirty water bowl. "
            "Secure lid latches: corn snakes are accomplished escape artists."
        ),
        "sources": cite(
            "tree_of_life_corn_snake",
            "reptiles_and_research_corn",
            "reptifiles_corn_snake",
            "researchgate_corn_snake",
        ),
    },
    # -- California kingsnake -----------------------------------------------
    {
        "scientific_name": "Lampropeltis californiae",
        "common_names": ["California Kingsnake", "Cal King"],
        "genus": "Lampropeltis",
        "family": "Colubridae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "crepuscular",
        "native_region": "Western United States and Baja — chaparral, desert, grassland",
        "adult_length_min_in": Decimal("36"),
        "adult_length_max_in": Decimal("60"),
        "adult_weight_min_g": Decimal("400"),
        "adult_weight_max_g": Decimal("900"),
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("85"),
        "temp_basking_max": Decimal("90"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("75"),
        "humidity_min": 40,
        "humidity_max": 60,
        "humidity_shed_boost_min": 55,
        "humidity_shed_boost_max": 70,
        "uvb_required": False,
        "uvb_type": "not_required",
        "uvb_replacement_months": None,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "Shoebox or 10 gallon",
        "enclosure_min_juvenile": "20 gallon long",
        "enclosure_min_adult": "48\"L x 24\"W x 24\"H (≈ 4 x 2 x 2 ft)",
        "bioactive_suitable": True,
        "substrate_safe_list": ["aspen shavings", "cypress mulch", "paper-based bedding"],
        "substrate_avoid_list": ["cedar", "pine"],
        "substrate_depth_min_in": Decimal("1.5"),
        "substrate_depth_max_in": Decimal("3"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinky mouse",
        "prey_size_juvenile": "Hopper to adult mouse",
        "prey_size_adult": "Adult mouse or small rat",
        "feeding_frequency_hatchling": "Every 5–7 days",
        "feeding_frequency_juvenile": "Every 7 days",
        "feeding_frequency_adult": "Every 7–14 days",
        # Sprint 5 feeding intelligence — cal kings sit in the same ratio band
        # as corn snakes but run slightly more active and tolerate the shorter
        # end of the interval range.
        "hatchling_weight_min_g": Decimal("8"),
        "hatchling_weight_max_g": Decimal("20"),
        "power_feeding_threshold_pct": Decimal("15.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 30, "ratio_pct_min": 10, "ratio_pct_max": 15, "interval_days_min": 5, "interval_days_max": 7},
            {"stage": "juvenile", "weight_g_max": 200, "ratio_pct_min": 10, "ratio_pct_max": 12, "interval_days_min": 7, "interval_days_max": 7},
            {"stage": "subadult", "weight_g_max": 500, "ratio_pct_min": 8, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 10},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 14},
        ],
        "supplementation_notes": "Whole prey adequate; no supplementation required.",
        "water_bowl_description": (
            "Large enough to soak. Cal kings are notorious escape artists — "
            "ensure a heavy, tip-resistant bowl."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Brumation not required for pet-kept animals. Required for breeding; "
            "keepers should not house multiple kingsnakes together — this species "
            "is cannibalistic (the 'king' in kingsnake refers to ophiophagy)."
        ),
        "defensive_displays": ["musking", "vibrating tail", "occasional strike"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 25,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**California Kingsnake (Lampropeltis californiae)** — Hardy, long-lived, "
            "and widely available. Alert and active for a snake; may be more "
            "bitey as hatchlings, typically settles down with regular gentle "
            "handling. **Housing note:** cal kings are ophiophagous (snake-eating). "
            "Never house two kingsnakes together. Secure the enclosure thoroughly "
            "— they are strong and persistent escape artists."
        ),
        "sources": cite(
            "tree_of_life_california_kingsnake",
            "chicago_exotics_kingsnake",
            "reptifiles_kingsnake",
            "reptiles_magazine_kingsnake",
        ),
    },
    # -- Western hognose ----------------------------------------------------
    {
        "scientific_name": "Heterodon nasicus",
        "common_names": ["Western Hognose", "Plains Hognose"],
        "genus": "Heterodon",
        "family": "Colubridae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "diurnal",
        "native_region": "Great Plains and southern Canada — arid grasslands, sandy soils",
        "adult_length_min_in": Decimal("15"),
        "adult_length_max_in": Decimal("36"),  # Females can reach ~36"
        "adult_weight_min_g": Decimal("70"),
        "adult_weight_max_g": Decimal("350"),
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("85"),
        "temp_basking_max": Decimal("90"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 30,
        "humidity_max": 50,
        "humidity_shed_boost_min": 55,
        "humidity_shed_boost_max": 65,
        "uvb_required": False,  # Beneficial but not strictly required
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "fossorial",
        "enclosure_min_hatchling": "Shoebox or 10 gallon",
        "enclosure_min_juvenile": "20 gallon long",
        "enclosure_min_adult": "36\"L x 18\"W x 12\"H minimum; larger for females",
        "bioactive_suitable": True,
        "substrate_safe_list": ["aspen shavings", "play sand/topsoil mix", "coco husk"],
        "substrate_avoid_list": ["cedar", "pine", "calcium sand"],
        "substrate_depth_min_in": Decimal("3"),
        "substrate_depth_max_in": Decimal("5"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinky mouse",
        "prey_size_juvenile": "Fuzzy to hopper mouse",
        "prey_size_adult": "Adult mouse",
        "feeding_frequency_hatchling": "Every 5–7 days",
        "feeding_frequency_juvenile": "Every 7 days",
        "feeding_frequency_adult": "Every 7–10 days",
        # Sprint 5 feeding intelligence — hognoses show the strongest sexual
        # dimorphism of this starter set (males ≈ 70g, females up to 350g).
        # The bracket shape holds; adult sits at the lower end of the ratio
        # band because small males can trend toward obesity on larger prey.
        "hatchling_weight_min_g": Decimal("5"),
        "hatchling_weight_max_g": Decimal("15"),
        "power_feeding_threshold_pct": Decimal("15.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 20, "ratio_pct_min": 10, "ratio_pct_max": 15, "interval_days_min": 5, "interval_days_max": 7},
            {"stage": "juvenile", "weight_g_max": 80, "ratio_pct_min": 10, "ratio_pct_max": 12, "interval_days_min": 7, "interval_days_max": 7},
            {"stage": "subadult", "weight_g_max": 200, "ratio_pct_min": 8, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 10},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 5, "ratio_pct_max": 8, "interval_days_min": 7, "interval_days_max": 10},
        ],
        "supplementation_notes": (
            "Whole prey adequate. Hognoses are toad specialists in the wild; "
            "captive-bred animals typically accept mice, but some refuse "
            "rodents and may need scenting with toad or fish. Hognoses are "
            "mildly venomous rear-fanged colubrids; envenomation in humans "
            "is rare and almost always results from prolonged chewing bites, "
            "not defensive strikes. Reactions are typically localized "
            "swelling. Not considered medically significant in keeping "
            "contexts, but noted for completeness."
        ),
        "water_bowl_description": (
            "Small bowl; keep the enclosure overall dry. Provide a humid hide "
            "with moist sphagnum for shed cycles."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Brumation not required for pet animals. Required for breeding; "
            "protocols involve 55–65°F for 60–90 days."
        ),
        "defensive_displays": [
            "flattening head (cobra-like hood)",
            "hissing",
            "bluff strikes (often closed-mouth)",
            "playing dead (thanatosis)",
            "musking",
        ],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Western Hognose (Heterodon nasicus)** — Small, personable, highly "
            "theatrical. Famous for their defensive display: flattening the neck "
            "into a hood, hissing, bluff-striking, and then rolling belly-up and "
            "playing dead if the threat persists. They are mildly venomous "
            "rear-fanged colubrids — envenomation in humans is rare and "
            "localized; not considered medically significant. Males stay small "
            "(around 15–24\"); females reach 30–36\". Hognoses are fossorial "
            "and need deep substrate to burrow."
        ),
        "sources": cite(
            "tree_of_life_hognose",
            "reptifiles_hognose",
            "biodude_hognose",
        ),
    },
    # -- Kenyan sand boa ----------------------------------------------------
    {
        "scientific_name": "Gongylophis colubrinus",
        "common_names": ["Kenyan Sand Boa", "East African Sand Boa", "Egyptian Sand Boa"],
        "genus": "Gongylophis",
        "family": "Boidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "crepuscular",
        "native_region": "East Africa — Kenya, Tanzania, Egypt; semi-arid savanna",
        "adult_length_min_in": Decimal("15"),
        "adult_length_max_in": Decimal("30"),
        "adult_weight_min_g": Decimal("100"),
        "adult_weight_max_g": Decimal("500"),
        "temp_cool_min": Decimal("75"),
        "temp_cool_max": Decimal("82"),
        "temp_warm_min": Decimal("85"),
        "temp_warm_max": Decimal("92"),
        "temp_basking_min": Decimal("90"),
        "temp_basking_max": Decimal("95"),
        "temp_night_min": Decimal("70"),
        "temp_night_max": Decimal("78"),
        "humidity_min": 20,
        "humidity_max": 40,
        "humidity_shed_boost_min": 40,
        "humidity_shed_boost_max": 55,
        "uvb_required": False,
        "uvb_type": "not_required",
        "uvb_replacement_months": None,
        "enclosure_type": "fossorial",
        "enclosure_min_hatchling": "Shoebox or 10 gallon",
        "enclosure_min_juvenile": "10–20 gallon",
        "enclosure_min_adult": "20 gallon long minimum (larger acceptable, but floor space > height)",
        "bioactive_suitable": False,  # Low humidity + desert conditions make classic bioactive difficult
        "substrate_safe_list": ["play sand", "aspen shavings", "paper-based bedding"],
        "substrate_avoid_list": ["cedar", "pine", "calcium sand", "damp coco fiber"],
        "substrate_depth_min_in": Decimal("3"),
        "substrate_depth_max_in": Decimal("6"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinky mouse",
        "prey_size_juvenile": "Fuzzy to hopper mouse",
        "prey_size_adult": "Adult mouse (small to medium)",
        "feeding_frequency_hatchling": "Every 5–7 days",
        "feeding_frequency_juvenile": "Every 7 days",
        "feeding_frequency_adult": "Every 10–14 days — sedentary; overfeeding is a common mistake",
        # Sprint 5 feeding intelligence — sand boas get TIGHTER thresholds than
        # the others because the captive population is already widely obese.
        # Lower power-feeding line (12%) and longer adult intervals reflect
        # their sedentary ambush lifestyle. If in doubt, feed less.
        "hatchling_weight_min_g": Decimal("10"),
        "hatchling_weight_max_g": Decimal("25"),
        "power_feeding_threshold_pct": Decimal("12.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 30, "ratio_pct_min": 10, "ratio_pct_max": 12, "interval_days_min": 5, "interval_days_max": 7},
            {"stage": "juvenile", "weight_g_max": 100, "ratio_pct_min": 8, "ratio_pct_max": 10, "interval_days_min": 7, "interval_days_max": 7},
            {"stage": "subadult", "weight_g_max": 250, "ratio_pct_min": 7, "ratio_pct_max": 9, "interval_days_min": 10, "interval_days_max": 14},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 5, "ratio_pct_max": 8, "interval_days_min": 14, "interval_days_max": 21},
        ],
        "supplementation_notes": (
            "Overfeeding is the most common husbandry error. Adults should be "
            "weight-monitored; obesity is widespread in captive sand boas."
        ),
        "water_bowl_description": (
            "Small bowl on the cool end. Large bowls raise enclosure humidity "
            "and are inappropriate for this species."
        ),
        "brumation_required": False,
        "defensive_displays": ["musking", "occasional strike (rare)"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 25,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "simple",
        "care_guide": (
            "**Kenyan Sand Boa (Gongylophis colubrinus)** — Small, heavy-bodied "
            "fossorial boid from the semi-arid savannas of East Africa. Spends "
            "most of its time buried with just eyes and nostrils exposed, "
            "ambushing prey. Simple husbandry: deep dry substrate, a warm end, "
            "a small water bowl kept on the cool side. **Critical:** humidity "
            "must be kept low — damp substrate causes scale rot and respiratory "
            "issues in this species. Secure any heavy décor; sand boas burrow "
            "under everything and can be crushed by shifting hides or rocks."
        ),
        "sources": cite(
            "bgsu_herpetarium_sand_boa",
            "researchgate_sand_boa",
            "reptiles_magazine_sand_boa",
        ),
    },
]


def seed():
    """Upsert the reptile species catalog. Idempotent — re-runs are safe."""
    print(f"Seeding reptile species ({len(SPECIES_DATA)} entries)...")
    db = SessionLocal()

    added = 0
    updated = 0

    def _slug_taken(candidate: str, exclude_id=None) -> bool:
        q = db.query(ReptileSpecies.id).filter(ReptileSpecies.slug == candidate)
        if exclude_id is not None:
            q = q.filter(ReptileSpecies.id != exclude_id)
        return q.first() is not None

    try:
        for data in SPECIES_DATA:
            scientific_name = data["scientific_name"].strip()
            scientific_name_lower = scientific_name.lower()
            common_names = data.get("common_names") or []
            slug_source = (common_names[0] if common_names else None) or scientific_name

            existing = (
                db.query(ReptileSpecies)
                .filter(ReptileSpecies.scientific_name_lower == scientific_name_lower)
                .first()
            )

            if existing:
                # Refresh content on re-run but preserve is_verified /
                # submitted_by. Also preserve any editorial slug override
                # an admin may have applied through the UI — we only
                # regenerate when slug is missing (fresh DB after backfill).
                for field, value in data.items():
                    if field == "scientific_name":
                        continue
                    setattr(existing, field, value)
                if not getattr(existing, "slug", None):
                    existing.slug = slugify_unique(
                        slug_source,
                        is_taken=lambda s: _slug_taken(s, exclude_id=existing.id),
                        fallback=f"species-{str(existing.id)[:8]}",
                    )
                updated += 1
                print(f"  Updated: {scientific_name}  (slug={existing.slug})")
                continue

            new_id = uuid.uuid4()
            slug_value = slugify_unique(
                slug_source,
                is_taken=_slug_taken,
                fallback=f"species-{str(new_id)[:8]}",
            )
            species = ReptileSpecies(
                id=new_id,
                scientific_name_lower=scientific_name_lower,
                slug=slug_value,
                is_verified=True,
                **data,
            )
            db.add(species)
            # Flush so the next iteration's uniqueness check sees this row.
            db.flush()
            added += 1
            print(f"  Added:   {scientific_name}  (slug={slug_value})")

        db.commit()
        print(f"\nDone. Added {added}, updated {updated}.")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
