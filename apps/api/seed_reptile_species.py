"""Seed the reptile species catalog — initial beginner/intermediate snakes.

Per PRD-herpetoverse-v1 §5.3 and docs/design/RUBRIC-care-sheet-content.md.

Every entry carries 3+ citations, at least one Tier A (peer-reviewed or
veterinary) or authoritative keeper reference. Husbandry numbers are
ranges, not single points, to reflect source variation.

Scope: 11 starter species where we have solid multi-source confirmation.

Snakes (5):
  - Python regius (ball python)
  - Pantherophis guttatus (corn snake)
  - Lampropeltis californiae (California kingsnake)
  - Heterodon nasicus (Western hognose)
  - Gongylophis colubrinus (Kenyan sand boa)

Lizards (6) — added when the lizard subsystem reached API parity with
snakes. Feeding intelligence caveat: `life_stage_feeding` was designed
for the snake whole-prey-bolus model (ratio of prey weight to body
weight). For insectivorous and omnivorous lizards the ratio fields are
crude proxies; authoritative feeding protocols live in
`supplementation_notes` and `feeding_frequency_*`.
  - Eublepharis macularius (leopard gecko)
  - Hemitheconyx caudicinctus (African fat-tailed gecko)
  - Correlophus ciliatus (crested gecko)
  - Rhacodactylus auriculatus (gargoyle gecko)
  - Pogona vitticeps (bearded dragon)
  - Tiliqua scincoides (blue-tongued skink)

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
    # --- Lizard citations --------------------------------------------------
    # Leopard gecko
    "reptifiles_leopard_gecko": {
        "source_type": "breeder_community",
        "title": "Leopard Gecko Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/leopard-gecko-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Well-referenced keeper guide for Eublepharis macularius, drawing "
            "on veterinary sources and modern husbandry research."
        ),
    },
    "tree_of_life_leopard_gecko": {
        "source_type": "veterinary",
        "title": "Leopard Gecko Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/lizards/leopard-gecko-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Eublepharis macularius.",
    },
    "biodude_leopard_gecko": {
        "source_type": "breeder_community",
        "title": "Leopard Gecko Care Sheet",
        "author": "The Bio Dude",
        "url": "https://www.thebiodude.com/blogs/lizard-caresheets/leopard-gecko-care-sheet",
        "publication_date": "2023-01-01",
        "summary": "Bioactive-oriented care reference for Eublepharis macularius.",
    },
    # African fat-tailed gecko
    "reptifiles_fat_tailed_gecko": {
        "source_type": "breeder_community",
        "title": "African Fat-Tailed Gecko Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/african-fat-tailed-gecko-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Husbandry ranges with veterinary cross-references for "
            "Hemitheconyx caudicinctus."
        ),
    },
    "biodude_fat_tailed_gecko": {
        "source_type": "breeder_community",
        "title": "African Fat-Tailed Gecko Care Sheet",
        "author": "The Bio Dude",
        "url": "https://www.thebiodude.com/blogs/lizard-caresheets/african-fat-tailed-gecko-care-sheet",
        "publication_date": "2023-01-01",
        "summary": "Bioactive care reference for Hemitheconyx caudicinctus.",
    },
    "reptiles_magazine_fat_tailed_gecko": {
        "source_type": "breeder_community",
        "title": "The African Fat-Tailed Gecko",
        "author": "Reptiles Magazine",
        "url": "https://reptilesmagazine.com/the-african-fat-tailed-gecko/",
        "publication_date": "2019-01-01",
        "summary": "Industry magazine husbandry reference for Hemitheconyx caudicinctus.",
    },
    # Crested gecko
    "reptifiles_crested_gecko": {
        "source_type": "breeder_community",
        "title": "Crested Gecko Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/crested-gecko-care-sheet/",
        "publication_date": "2023-01-01",
        "summary": (
            "Keeper reference for Correlophus ciliatus with veterinary "
            "cross-referenced husbandry ranges."
        ),
    },
    "pangea_crested_gecko": {
        "source_type": "breeder_community",
        "title": "Crested Gecko Care",
        "author": "Pangea Reptile",
        "url": "https://pangeareptile.com/pages/crested-gecko-care-sheet",
        "publication_date": "2023-01-01",
        "summary": (
            "Industry reference from a major crested gecko breeder and MRP "
            "manufacturer."
        ),
    },
    "tree_of_life_crested_gecko": {
        "source_type": "veterinary",
        "title": "Crested Gecko Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/lizards/crested-gecko-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Correlophus ciliatus.",
    },
    # Gargoyle gecko
    "reptifiles_gargoyle_gecko": {
        "source_type": "breeder_community",
        "title": "Gargoyle Gecko Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/gargoyle-gecko-care-guide/",
        "publication_date": "2023-01-01",
        "summary": (
            "Keeper reference for Rhacodactylus auriculatus with veterinary "
            "cross-referenced husbandry ranges."
        ),
    },
    "reptiles_magazine_gargoyle_gecko": {
        "source_type": "breeder_community",
        "title": "Gargoyle Gecko Care Sheet",
        "author": "Reptiles Magazine",
        "url": "https://reptilesmagazine.com/gargoyle-gecko-care-sheet/",
        "publication_date": "2022-01-01",
        "summary": "Industry magazine husbandry reference for Rhacodactylus auriculatus.",
    },
    "biodude_gargoyle_gecko": {
        "source_type": "breeder_community",
        "title": "Gargoyle Gecko Care Sheet and Bioactive Terrarium Maintenance",
        "author": "The Bio Dude",
        "url": "https://www.thebiodude.com/blogs/gecko-caresheets/gargoyle-gecko-care-sheet-and-maintenance",
        "publication_date": "2023-01-01",
        "summary": (
            "Bioactive-focused husbandry reference for Rhacodactylus auriculatus "
            "from a major substrate and vivarium industry supplier."
        ),
    },
    # Bearded dragon
    "reptifiles_bearded_dragon": {
        "source_type": "breeder_community",
        "title": "Bearded Dragon Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/bearded-dragon-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Comprehensive keeper reference for Pogona vitticeps with extensive "
            "veterinary and peer-reviewed sources."
        ),
    },
    "tree_of_life_bearded_dragon": {
        "source_type": "veterinary",
        "title": "Bearded Dragon Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/lizards/bearded-dragon-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Pogona vitticeps.",
    },
    "rspca_bearded_dragon": {
        "source_type": "veterinary",
        "title": "Bearded Dragon Care Sheet",
        "author": "RSPCA",
        "url": "https://www.rspca.org.uk/adviceandwelfare/pets/other/beardeddragon",
        "publication_date": "2020-01-01",
        "summary": (
            "Animal-welfare-charity care sheet with husbandry minimums for "
            "Pogona vitticeps."
        ),
    },
    # Blue-tongued skink
    "reptifiles_blue_tongued_skink": {
        "source_type": "breeder_community",
        "title": "Blue-Tongue Skink Care Sheet",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/blue-tongue-skink-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Keeper reference for Tiliqua scincoides with veterinary "
            "cross-references."
        ),
    },
    "biodude_blue_tongued_skink": {
        "source_type": "breeder_community",
        "title": "Blue Tongue Skink Care Sheet",
        "author": "The Bio Dude",
        "url": "https://www.thebiodude.com/blogs/lizard-caresheets/blue-tongue-skink-care-sheet",
        "publication_date": "2023-01-01",
        "summary": "Bioactive care reference for Tiliqua scincoides.",
    },
    "tree_of_life_blue_tongued_skink": {
        "source_type": "veterinary",
        "title": "Blue-Tongued Skink Care",
        "author": "Tree of Life Exotic Pet Medical Center",
        "url": "https://treeoflifeexotics.vet/education-resource-center/for-clients/lizards/blue-tongued-skink-care",
        "publication_date": "2023-01-01",
        "summary": "Veterinary husbandry reference for Tiliqua scincoides.",
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
    # =======================================================================
    # LIZARDS — initial 5 species spanning beginner to intermediate care.
    # Same rubric: 3+ citations, at least one veterinary source where
    # available, husbandry numbers as ranges.
    #
    # Feeding intelligence caveat: the `life_stage_feeding` schema was
    # designed around the snake whole-prey-bolus model (ratio of prey weight
    # to animal body weight). For insectivorous lizards this maps awkwardly
    # — cricket-based feeding is count-based, not weight-based. Where the
    # ratio fields are populated for lizards, they should be read as crude
    # conservative bounds; the authoritative feeding protocol lives in
    # `supplementation_notes` and the per-life-stage frequency fields. The
    # prey-suggestion endpoint will still return a plausible range, but
    # keepers of insectivores should defer to insect-count guidance.
    # =======================================================================
    # -- Leopard gecko ------------------------------------------------------
    {
        "scientific_name": "Eublepharis macularius",
        "common_names": ["Leopard Gecko"],
        "genus": "Eublepharis",
        "family": "Eublepharidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "crepuscular",
        "native_region": "Afghanistan, Pakistan, northwestern India — arid rocky scrubland",
        "adult_length_min_in": Decimal("7"),
        "adult_length_max_in": Decimal("11"),
        "adult_weight_min_g": Decimal("45"),
        "adult_weight_max_g": Decimal("90"),
        # Temperature — leopard geckos are ground-warmth foragers; provide a
        # belly-warm basking surface and a cool retreat.
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("75"),
        "temp_warm_min": Decimal("80"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("90"),
        "temp_basking_max": Decimal("95"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 30,
        "humidity_max": 40,
        "humidity_shed_boost_min": 60,
        "humidity_shed_boost_max": 80,
        # UVB — historically considered "not required" because of their
        # crepuscular activity, but modern husbandry (ReptiFiles, Baines et
        # al. studies on reptile UVB benefit) now recommends low-level UVB.
        # Kept as required=False to respect existing keeper setups, but
        # flagged as beneficial in care_guide.
        "uvb_required": False,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "10 gallon / 20\"L x 10\"W x 12\"H",
        "enclosure_min_juvenile": "20 gallon long",
        "enclosure_min_adult": "40 gallon / 36\"L x 18\"W x 18\"H minimum",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "topsoil/play sand mix",
            "excavator clay",
            "ceramic tile",
            "paper towel (quarantine)",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "insectivore",
        "prey_size_hatchling": "1/4\" crickets, small dubia, pinhead locusts",
        "prey_size_juvenile": "1/2\" crickets, medium dubia, small hornworms",
        "prey_size_adult": "Adult crickets, medium dubia, hornworms, the occasional pinky",
        "feeding_frequency_hatchling": "Daily; 5–10 appropriately-sized insects per feeding",
        "feeding_frequency_juvenile": "Every other day; 5–7 insects per feeding",
        "feeding_frequency_adult": "Every 3–4 days; 4–6 insects per feeding",
        # Feeding intelligence — crude proxy values. Real protocol is insect
        # count, not ratio. Ratio bounds are deliberately conservative.
        "hatchling_weight_min_g": Decimal("2"),
        "hatchling_weight_max_g": Decimal("5"),
        "power_feeding_threshold_pct": Decimal("10.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 15, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 1, "interval_days_max": 1},
            {"stage": "juvenile", "weight_g_max": 35, "ratio_pct_min": 5, "ratio_pct_max": 8, "interval_days_min": 2, "interval_days_max": 2},
            {"stage": "subadult", "weight_g_max": 55, "ratio_pct_min": 4, "ratio_pct_max": 7, "interval_days_min": 3, "interval_days_max": 3},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 3, "interval_days_max": 4},
        ],
        "supplementation_notes": (
            "Dust insects with calcium + D3 at most feedings and a reptile "
            "multivitamin (e.g. Repashy Calcium Plus, Arcadia EarthPro-A) "
            "1–2× per week. Gut-load feeders 24–48 hours before use. MBD "
            "(metabolic bone disease) is the most common preventable illness "
            "in pet leopard geckos."
        ),
        "water_bowl_description": "Shallow bowl on the cool end; refresh daily.",
        "brumation_required": False,
        "brumation_notes": (
            "Brumation not required for pet animals. Some keepers cycle "
            "breeders through a 60°F rest period of 6–8 weeks."
        ),
        "defensive_displays": ["tail waving", "vocalizing", "tail drop (if severely stressed)"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "complex",
        "care_guide": (
            "**Leopard Gecko (Eublepharis macularius)** — The most commonly "
            "kept pet lizard. Docile, small, and hardy when the basics are "
            "right: a thermal gradient with a warm belly spot, three hides "
            "(warm, cool, and a humid hide for shedding), and a safe "
            "substrate. Leopard geckos are one of the few geckos with "
            "eyelids and are ground-dwelling rather than climbing. Historic "
            "advice said \"no UVB needed\"; modern husbandry recommends "
            "low-level UVB for long-term health. Watch for tail thickness as "
            "a condition indicator — a thick, plump tail is a healthy tail. "
            "**Never pull on the tail** — it will drop."
        ),
        "sources": cite(
            "reptifiles_leopard_gecko",
            "tree_of_life_leopard_gecko",
            "biodude_leopard_gecko",
        ),
    },
    # -- African fat-tailed gecko -------------------------------------------
    {
        "scientific_name": "Hemitheconyx caudicinctus",
        "common_names": ["African Fat-Tailed Gecko", "Fat-Tail Gecko"],
        "genus": "Hemitheconyx",
        "family": "Eublepharidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "nocturnal",
        "native_region": "West Africa — savanna with dry season refugia, humid burrows",
        "adult_length_min_in": Decimal("7"),
        "adult_length_max_in": Decimal("9"),
        "adult_weight_min_g": Decimal("45"),
        "adult_weight_max_g": Decimal("75"),
        "temp_cool_min": Decimal("72"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("80"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": Decimal("88"),
        "temp_basking_max": Decimal("92"),
        "temp_night_min": Decimal("70"),
        "temp_night_max": Decimal("75"),
        # Higher humidity than leopard gecko — AFTs come from more humid
        # burrow microclimates.
        "humidity_min": 50,
        "humidity_max": 70,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 85,
        "uvb_required": False,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "10 gallon",
        "enclosure_min_juvenile": "20 gallon long",
        "enclosure_min_adult": "36\"L x 18\"W x 18\"H minimum",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "topsoil/coco fiber mix",
            "cypress mulch",
            "paper towel (quarantine)",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "insectivore",
        "prey_size_hatchling": "1/4\" crickets, pinhead locusts, small dubia",
        "prey_size_juvenile": "1/2\" crickets, medium dubia, small hornworms",
        "prey_size_adult": "Adult crickets, medium dubia, hornworms",
        "feeding_frequency_hatchling": "Daily; 5–8 insects per feeding",
        "feeding_frequency_juvenile": "Every other day; 5–7 insects per feeding",
        "feeding_frequency_adult": "Every 3–4 days; 4–6 insects per feeding",
        "hatchling_weight_min_g": Decimal("3"),
        "hatchling_weight_max_g": Decimal("6"),
        "power_feeding_threshold_pct": Decimal("10.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 15, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 1, "interval_days_max": 1},
            {"stage": "juvenile", "weight_g_max": 35, "ratio_pct_min": 5, "ratio_pct_max": 8, "interval_days_min": 2, "interval_days_max": 2},
            {"stage": "subadult", "weight_g_max": 50, "ratio_pct_min": 4, "ratio_pct_max": 7, "interval_days_min": 3, "interval_days_max": 3},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 3, "interval_days_max": 4},
        ],
        "supplementation_notes": (
            "Dust insects with calcium + D3 at most feedings and a reptile "
            "multivitamin 1–2× per week. Tail thickness is the condition "
            "indicator — AFTs store fat in the tail like their leopard gecko "
            "cousins. Gut-load feeders 24–48 hours before use."
        ),
        "water_bowl_description": (
            "Shallow bowl. A humid hide with moist sphagnum is essential "
            "for shed cycles — more so than for leopard geckos."
        ),
        "brumation_required": False,
        "defensive_displays": ["vocalizing", "tail waving", "tail drop (if severely stressed)"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**African Fat-Tailed Gecko (Hemitheconyx caudicinctus)** — Close "
            "cousin of the leopard gecko with two key differences: they need "
            "higher humidity and tend toward shyer, less handling-tolerant "
            "temperaments. Provide a humid hide with moist sphagnum — this "
            "species gets stuck sheds more readily than leopard geckos if "
            "humidity is too low. Otherwise similar husbandry: thermal "
            "gradient, belly-warm basking surface, three hides, safe "
            "loose substrate. Never pull on the tail."
        ),
        "sources": cite(
            "reptifiles_fat_tailed_gecko",
            "biodude_fat_tailed_gecko",
            "reptiles_magazine_fat_tailed_gecko",
        ),
    },
    # -- Crested gecko ------------------------------------------------------
    {
        "scientific_name": "Correlophus ciliatus",
        "common_names": ["Crested Gecko", "Eyelash Gecko"],
        "genus": "Correlophus",
        "family": "Diplodactylidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "nocturnal",
        "native_region": "Southern New Caledonia — humid subtropical forest canopy",
        "adult_length_min_in": Decimal("7"),
        "adult_length_max_in": Decimal("9"),
        "adult_weight_min_g": Decimal("35"),
        "adult_weight_max_g": Decimal("55"),
        # Crested geckos do NOT need supplemental heat in most homes —
        # room-temperature husbandry is standard. Heat is harmful above ~82°F.
        "temp_cool_min": Decimal("65"),
        "temp_cool_max": Decimal("72"),
        "temp_warm_min": Decimal("72"),
        "temp_warm_max": Decimal("78"),
        "temp_basking_min": Decimal("78"),
        "temp_basking_max": Decimal("82"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 60,
        "humidity_max": 80,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 90,
        "uvb_required": False,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "arboreal",
        "enclosure_min_hatchling": "Kritter Keeper or 5-gallon equivalent (too large stresses young crestes)",
        "enclosure_min_juvenile": "12\"L x 12\"W x 18\"H minimum",
        "enclosure_min_adult": "18\"L x 18\"W x 24\"H (or 36\"H for a lightly-planted vivarium)",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "coco fiber / topsoil blend",
            "bioactive mix with sphagnum topper",
            "paper towel (quarantine)",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "omnivore",
        "prey_size_hatchling": "Pinhead crickets (rare treat)",
        "prey_size_juvenile": "1/4\" crickets, small dubia (1–2× per week)",
        "prey_size_adult": "Small-to-medium crickets or dubia (treat, 1× per week at most)",
        "feeding_frequency_hatchling": "MRP (e.g. Repashy, Pangea, Black Panther Zoological) nightly; insects optional",
        "feeding_frequency_juvenile": "MRP 3–5× per week; live insects 1–2× per week",
        "feeding_frequency_adult": "MRP 3× per week; live insects 0–1× per week",
        # Crested gecko feeding is MRP-driven, not prey-based. Ratio fields
        # below apply only to optional live-insect supplementation, and are
        # intentionally very small.
        "hatchling_weight_min_g": Decimal("2"),
        "hatchling_weight_max_g": Decimal("4"),
        "power_feeding_threshold_pct": Decimal("8.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 8, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 1, "interval_days_max": 2},
            {"stage": "juvenile", "weight_g_max": 20, "ratio_pct_min": 3, "ratio_pct_max": 5, "interval_days_min": 2, "interval_days_max": 3},
            {"stage": "subadult", "weight_g_max": 35, "ratio_pct_min": 2, "ratio_pct_max": 4, "interval_days_min": 2, "interval_days_max": 3},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 2, "ratio_pct_max": 4, "interval_days_min": 2, "interval_days_max": 3},
        ],
        "supplementation_notes": (
            "Primary diet is a complete powdered gecko meal-replacement "
            "(MRP) — Repashy, Pangea, or Black Panther Zoological are the "
            "industry standards. MRP alone is nutritionally complete; no "
            "calcium/D3 dusting needed when MRP is the primary diet. Live "
            "insects are optional enrichment, 0–2× per week. Dust those "
            "insects with calcium (no D3 needed if MRP is the staple)."
        ),
        "water_bowl_description": (
            "Small bowl plus nightly misting — crestes drink from droplets "
            "on leaves and glass. A fine mist 1–2× daily maintains humidity "
            "while letting the enclosure dry between cycles (no stagnant damp)."
        ),
        "brumation_required": False,
        "defensive_displays": [
            "tail drop (common — tails do not regrow in this species)",
            "vocalizing (squeaks, barks)",
            "jumping",
        ],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "VU",  # Vulnerable per IUCN; captive population is robust
        "wild_population_notes": (
            "Listed as Vulnerable by IUCN due to habitat loss in New "
            "Caledonia. Captive population is large and genetically "
            "well-established; all animals in the pet trade should be "
            "captive-bred."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Crested Gecko (Correlophus ciliatus)** — Rediscovered in 1994 "
            "after being thought extinct, now one of the most popular pet "
            "lizards. Low-maintenance: room-temperature husbandry (no heat "
            "needed in most homes — heat above 82°F is actively harmful), "
            "a complete powdered MRP diet with optional live insects, and a "
            "vertically-oriented planted enclosure. Crested geckos drop "
            "their tails readily and, unlike most geckos, **do not regrow "
            "them** — a tailless crestie is not a health issue but is "
            "permanent. Mist nightly, let the enclosure dry during the day."
        ),
        "sources": cite(
            "reptifiles_crested_gecko",
            "pangea_crested_gecko",
            "tree_of_life_crested_gecko",
        ),
    },
    # -- Gargoyle gecko -----------------------------------------------------
    {
        "scientific_name": "Rhacodactylus auriculatus",
        "common_names": ["Gargoyle Gecko", "Knob-headed Giant Gecko", "New Caledonian Bumpy Gecko"],
        "genus": "Rhacodactylus",
        "family": "Diplodactylidae",
        "order_name": "Squamata",
        "care_level": "beginner",
        "handleability": "docile",
        "activity_period": "nocturnal",
        "native_region": "Southern Grande Terre, New Caledonia — humid subtropical forest and shrubland",
        "adult_length_min_in": Decimal("8"),
        "adult_length_max_in": Decimal("10"),
        "adult_weight_min_g": Decimal("45"),
        "adult_weight_max_g": Decimal("80"),
        # Temperature profile mirrors crested gecko — room-temperature husbandry
        # is standard and temperatures above ~82°F are actively harmful.
        "temp_cool_min": Decimal("68"),
        "temp_cool_max": Decimal("74"),
        "temp_warm_min": Decimal("72"),
        "temp_warm_max": Decimal("80"),
        "temp_basking_min": Decimal("78"),
        "temp_basking_max": Decimal("82"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        # Gargoyles tolerate (and often prefer) slightly drier conditions than
        # cresteds — sources converge around 50–70% ambient with a nightly
        # mist-driven spike.
        "humidity_min": 50,
        "humidity_max": 70,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 90,
        "uvb_required": False,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "arboreal",
        "enclosure_min_hatchling": "Kritter Keeper or 5-gallon equivalent (too large stresses young gargoyles)",
        "enclosure_min_juvenile": "12\"L x 12\"W x 18\"H minimum",
        "enclosure_min_adult": "18\"L x 18\"W x 24\"H (or 36\"H for a planted bioactive vivarium)",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "coco fiber / topsoil blend",
            "bioactive mix with sphagnum topper",
            "paper towel (quarantine)",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "omnivore",
        "prey_size_hatchling": "Pinhead crickets (rare treat)",
        "prey_size_juvenile": "1/4\" crickets, small dubia (1–2× per week)",
        "prey_size_adult": "Medium crickets, dubia, hornworms (1–2× per week)",
        "feeding_frequency_hatchling": "MRP (Repashy, Pangea, Black Panther Zoological) nightly; insects 1× per week once feeding well",
        "feeding_frequency_juvenile": "MRP 3–5× per week; live insects 1–2× per week",
        "feeding_frequency_adult": "MRP 3× per week; live insects 1–2× per week",
        # Same caveat as crested — `life_stage_feeding` ratio fields are crude
        # proxies for an MRP-driven diet. Insect ratios are slightly higher
        # than crested to reflect the documented protein preference.
        "hatchling_weight_min_g": Decimal("2"),
        "hatchling_weight_max_g": Decimal("4"),
        "power_feeding_threshold_pct": Decimal("8.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 8, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 1, "interval_days_max": 2},
            {"stage": "juvenile", "weight_g_max": 25, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 2, "interval_days_max": 3},
            {"stage": "subadult", "weight_g_max": 50, "ratio_pct_min": 2, "ratio_pct_max": 5, "interval_days_min": 2, "interval_days_max": 3},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 2, "ratio_pct_max": 4, "interval_days_min": 2, "interval_days_max": 3},
        ],
        "supplementation_notes": (
            "Primary diet is a complete powdered gecko meal-replacement "
            "(MRP) — Repashy, Pangea, or Black Panther Zoological are the "
            "industry standards. Gargoyles are **more insect-driven than "
            "crested geckos** and visibly thrive on 1–2 insect meals per "
            "week in addition to the MRP staple. Dust insects with calcium "
            "(no D3 needed if MRP is the primary diet). No calcium dusting "
            "of MRP itself is necessary."
        ),
        "water_bowl_description": (
            "Small bowl plus nightly misting — gargoyles drink from droplets "
            "on leaves and glass. A light evening mist on one side of the "
            "enclosure creates a brief humidity spike, with the enclosure "
            "drying through the day."
        ),
        "brumation_required": False,
        "defensive_displays": [
            "tail drop (tail *does* regenerate, unlike crested geckos)",
            "biting (mild, but more willing than crested geckos)",
            "vocalizing (squeaks, barks)",
            "cannibalism toward smaller conspecifics — adults will eat hatchlings and juveniles",
        ],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",  # Least Concern per IUCN (2011 assessment)
        "wild_population_notes": (
            "Endemic to southern Grande Terre and nearby islets in New "
            "Caledonia. Listed as Least Concern by IUCN (assessed 2011) "
            "with an estimated wild population exceeding 10,000 "
            "individuals. Captive population is large and genetically "
            "well-established; all animals in the pet trade should be "
            "captive-bred."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Gargoyle Gecko (Rhacodactylus auriculatus)** — Close cousin "
            "of the crested gecko, often described as a 'crestie with a "
            "chunkier build and a calmer attitude'. Same room-temperature "
            "husbandry (never exceed 82°F), the same MRP-based diet, and "
            "the same vertically-oriented planted enclosure. **Key "
            "differences from crested gecko:** (1) Gargoyles **regrow "
            "their tail** after a drop — crested geckos do not. (2) "
            "Gargoyles are more insect-driven — plan on 1–2 insect meals "
            "per week instead of the crested's optional 0–1. (3) Gargoyles "
            "are **cannibalistic** toward smaller geckos and must be "
            "housed alone except for controlled breeding pairs. (4) "
            "Slightly drier humidity preference (50–70%) and a slightly "
            "larger adult size (45–80 g vs. the crested's 35–55 g). "
            "Temperament is usually calmer and less jumpy than a crestie."
        ),
        "sources": cite(
            "reptifiles_gargoyle_gecko",
            "reptiles_magazine_gargoyle_gecko",
            "biodude_gargoyle_gecko",
        ),
    },
    # -- Bearded dragon -----------------------------------------------------
    {
        "scientific_name": "Pogona vitticeps",
        "common_names": ["Bearded Dragon", "Central Bearded Dragon", "Inland Bearded Dragon"],
        "genus": "Pogona",
        "family": "Agamidae",
        "order_name": "Squamata",
        "care_level": "intermediate",
        "handleability": "docile",
        "activity_period": "diurnal",
        "native_region": "Central and eastern Australia — arid woodland, rocky desert, scrub",
        "adult_length_min_in": Decimal("18"),
        "adult_length_max_in": Decimal("24"),
        "adult_weight_min_g": Decimal("350"),
        "adult_weight_max_g": Decimal("600"),
        # Temperature — high basking requirement; gradient is essential.
        "temp_cool_min": Decimal("75"),
        "temp_cool_max": Decimal("85"),
        "temp_warm_min": Decimal("85"),
        "temp_warm_max": Decimal("95"),
        "temp_basking_min": Decimal("100"),
        "temp_basking_max": Decimal("110"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("75"),
        "humidity_min": 30,
        "humidity_max": 40,
        "humidity_shed_boost_min": 40,
        "humidity_shed_boost_max": 50,
        # UVB is MANDATORY for bearded dragons — MBD is a species-defining
        # husbandry failure. T5 HO with appropriate UVI (3.0–4.0 in basking
        # zone) is the modern standard.
        "uvb_required": True,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("17"),
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "20 gallon long (temporarily)",
        "enclosure_min_juvenile": "40 gallon breeder / 36\"L x 18\"W x 18\"H",
        "enclosure_min_adult": "4\"×2\"×2\" (120 gallon) minimum; 6\"×2\"×2\" preferred",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "topsoil/play sand mix (60/40)",
            "excavator clay",
            "ceramic tile",
            "non-adhesive shelf liner (quarantine)",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "crushed walnut", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "omnivore",
        "prey_size_hatchling": "Pinhead to 1/4\" crickets, small dubia; 80% insect / 20% greens",
        "prey_size_juvenile": "1/2\" crickets, medium dubia, hornworms; 60% insect / 40% greens",
        "prey_size_adult": "Adult dubia, hornworms, occasional pinky; 20% insect / 80% greens",
        "feeding_frequency_hatchling": "2–3× daily; as many insects as they'll eat in 10–15 min, plus greens",
        "feeding_frequency_juvenile": "Daily; insects in measured amount, greens always available",
        "feeding_frequency_adult": "Greens daily; insects 2–3× per week",
        # Bearded dragon feeding is diet-composition-driven, not ratio-driven.
        # Values below are crude; supplementation_notes is authoritative.
        "hatchling_weight_min_g": Decimal("2"),
        "hatchling_weight_max_g": Decimal("5"),
        "power_feeding_threshold_pct": Decimal("8.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 50, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 1, "interval_days_max": 1},
            {"stage": "juvenile", "weight_g_max": 150, "ratio_pct_min": 3, "ratio_pct_max": 6, "interval_days_min": 1, "interval_days_max": 1},
            {"stage": "subadult", "weight_g_max": 350, "ratio_pct_min": 2, "ratio_pct_max": 4, "interval_days_min": 2, "interval_days_max": 3},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 1, "ratio_pct_max": 3, "interval_days_min": 2, "interval_days_max": 4},
        ],
        "supplementation_notes": (
            "**Diet composition shifts with age:** hatchlings are 70–80% "
            "insect / 20–30% plant, shifting to 20–30% insect / 70–80% "
            "plant as adults. Daily salad of collard/turnip/mustard greens, "
            "dandelion, squash; avoid spinach and kale as staples (oxalate/"
            "goitrogen concerns). Dust insects with calcium (no D3 if UVB "
            "is correct) at most feedings; reptile multivitamin 1× per week. "
            "**UVB is non-negotiable** — MBD is the single most common "
            "welfare failure in this species. Obesity in adults is almost "
            "as common; cap the insect portion."
        ),
        "water_bowl_description": (
            "Shallow bowl. Many individuals rarely drink from a bowl and "
            "get hydration from greens and the occasional bath/mist."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Brumation is common and natural in captive adults during "
            "autumn/winter (~6–12 weeks). Healthy brumating animals eat "
            "little to nothing and are lethargic. Monitor weight — drop of "
            ">10% warrants a vet check. Not required for pet animals; some "
            "never brumate."
        ),
        "defensive_displays": [
            "beard-flaring and darkening",
            "gaping (open mouth)",
            "head-bobbing (usually male dominance)",
            "arm-waving (submission signal)",
        ],
        "lifespan_captivity_min_yrs": 10,
        "lifespan_captivity_max_yrs": 15,
        "cites_appendix": None,
        "iucn_status": "LC",
        "wild_population_notes": (
            "Australia prohibits export of native wildlife; all bearded "
            "dragons in the international pet trade are descended from "
            "pre-ban animals and are captive-bred."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Bearded Dragon (Pogona vitticeps)** — Popular pet lizard "
            "rightly considered intermediate, not beginner, because the "
            "husbandry requirements are strict: high basking temperature "
            "(100–110°F on the surface), mandatory quality T5 HO UVB with "
            "correct distance and annual bulb replacement, a large "
            "enclosure (minimum 4'×2'×2' for an adult), and a seasonally-"
            "shifting diet. Get these right and you have a personable, "
            "long-lived lizard that tolerates handling well. Get them wrong "
            "— especially UVB — and metabolic bone disease sets in quickly. "
            "**Beardies should NEVER be kept on calcium sand.**"
        ),
        "sources": cite(
            "reptifiles_bearded_dragon",
            "tree_of_life_bearded_dragon",
            "rspca_bearded_dragon",
        ),
    },
    # -- Blue-tongued skink -------------------------------------------------
    {
        "scientific_name": "Tiliqua scincoides",
        "common_names": ["Blue-Tongued Skink", "Common Blue-Tongue", "Eastern Blue-Tongue"],
        "genus": "Tiliqua",
        "family": "Scincidae",
        "order_name": "Squamata",
        "care_level": "intermediate",
        "handleability": "docile",
        "activity_period": "diurnal",
        "native_region": "Eastern and northern Australia, parts of Indonesia — woodland, grassland, suburbs",
        "adult_length_min_in": Decimal("18"),
        "adult_length_max_in": Decimal("24"),
        "adult_weight_min_g": Decimal("350"),
        "adult_weight_max_g": Decimal("700"),
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("80"),
        "temp_warm_max": Decimal("90"),
        "temp_basking_min": Decimal("95"),
        "temp_basking_max": Decimal("105"),
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("75"),
        # Humidity varies by locale: Northern/Irian-Jaya subspecies prefer
        # higher humidity (60–80%); Eastern/Indonesian/Classic Northern
        # variants are 40–60%. Mid-range set here for Tiliqua scincoides
        # sensu lato; breed-specific adjustments should be applied.
        "humidity_min": 40,
        "humidity_max": 60,
        "humidity_shed_boost_min": 60,
        "humidity_shed_boost_max": 75,
        "uvb_required": True,
        "uvb_type": "T5_HO",
        "uvb_distance_min_in": Decimal("12"),
        "uvb_distance_max_in": Decimal("18"),
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "20 gallon long (temporarily)",
        "enclosure_min_juvenile": "40 gallon breeder",
        "enclosure_min_adult": "4'×2'×1.5' (minimum); 6'×2'×2' strongly preferred",
        "bioactive_suitable": True,
        "substrate_safe_list": [
            "topsoil/coco fiber mix",
            "cypress mulch",
            "aspen shavings (for locales with lower humidity needs)",
            "bioactive with sphagnum layer",
        ],
        "substrate_avoid_list": ["calcium sand", "walnut shell", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("4"),
        "substrate_depth_max_in": Decimal("6"),
        "diet_type": "omnivore",
        "prey_size_hatchling": "Pinky mice, small dubia, eggs, mixed greens",
        "prey_size_juvenile": "Adult mice, medium dubia, mixed protein + greens",
        "prey_size_adult": "Prepared wet food (dog/cat food reference), rodents, snails, greens",
        "feeding_frequency_hatchling": "Daily; varied protein and plant matter",
        "feeding_frequency_juvenile": "Every other day; balanced protein/greens",
        "feeding_frequency_adult": "Every 3–5 days; 50% protein / 40% vegetables / 10% fruit by volume",
        "hatchling_weight_min_g": Decimal("15"),
        "hatchling_weight_max_g": Decimal("30"),
        "power_feeding_threshold_pct": Decimal("8.0"),
        "weight_loss_concern_pct_30d": Decimal("10.0"),
        "life_stage_feeding": [
            {"stage": "hatchling", "weight_g_max": 80, "ratio_pct_min": 5, "ratio_pct_max": 10, "interval_days_min": 1, "interval_days_max": 1},
            {"stage": "juvenile", "weight_g_max": 250, "ratio_pct_min": 4, "ratio_pct_max": 7, "interval_days_min": 2, "interval_days_max": 2},
            {"stage": "subadult", "weight_g_max": 400, "ratio_pct_min": 3, "ratio_pct_max": 5, "interval_days_min": 3, "interval_days_max": 4},
            {"stage": "adult", "weight_g_max": None, "ratio_pct_min": 2, "ratio_pct_max": 4, "interval_days_min": 3, "interval_days_max": 5},
        ],
        "supplementation_notes": (
            "**Balanced omnivore diet** is the defining husbandry concept. "
            "Adults: 50% animal protein (quality canned dog/cat food used as "
            "a reference staple, cooked lean meat, whole prey, snails, "
            "eggs), 40% vegetables (collard greens, squash, green beans), "
            "10% fruit (berries, melon — treat). Dust protein portion with "
            "calcium at most feedings; reptile multivitamin 1× per week. "
            "Obesity is the second-most-common husbandry failure after UVB "
            "neglect — don't overfeed adults."
        ),
        "water_bowl_description": "Large enough to soak; replace daily.",
        "brumation_required": False,
        "brumation_notes": (
            "Adults may brumate or significantly slow down over winter even "
            "in captivity. Not required for pet animals but not a concern "
            "if they self-regulate into a rest period with appropriate "
            "lighting changes."
        ),
        "defensive_displays": [
            "tongue-flashing (displays the blue tongue)",
            "hissing",
            "body-puffing",
            "bite (powerful — capable of drawing blood in adults)",
        ],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",
        "wild_population_notes": (
            "Australian subspecies are export-restricted; most blue-tongued "
            "skinks in the international trade are Indonesian (Tiliqua "
            "scincoides chimaerea / Irian Jaya type) or captive-bred "
            "Australian-descent animals."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Blue-Tongued Skink (Tiliqua scincoides)** — Heavy-bodied, "
            "tongue-flashing omnivore with a reputation as a \"cat of the "
            "reptile world\" — interactive, personable, food-motivated. "
            "Intermediate-level husbandry because of the enclosure size "
            "requirement (4 feet of floor space minimum for an adult), "
            "mandatory UVB, deep substrate for the natural burrowing "
            "behavior, and the balanced omnivore diet. Locale matters — "
            "Northern, Eastern, Indonesian, and Irian Jaya types have "
            "meaningfully different humidity preferences; confirm your "
            "animal's locale and adjust husbandry accordingly. Bites from "
            "adults are capable of drawing blood."
        ),
        "sources": cite(
            "reptifiles_blue_tongued_skink",
            "biodude_blue_tongued_skink",
            "tree_of_life_blue_tongued_skink",
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
