"""Seed the species catalog with 5 starter frog species.

Per PRD-herpetoverse-v1 §5.3 and docs/design/RUBRIC-care-sheet-content.md.

Naming note: the catalog table is `reptile_species` for legacy reasons.
Frogs are amphibians, not reptiles — but the table represents
"non-tarantula animal" semantically (see frg_20260513 migration
docstring) and the user-facing app just calls it "Species."

Scope: 5 well-documented commonly-kept species.

Frogs (5):
  - Ceratophrys ornata (Pacman frog) — chunky terrestrial ambush predator
  - Dendrobates auratus (Green-and-black poison dart frog) — beginner dart
  - Trachycephalus resinifictrix (Amazon milk frog) — arboreal intermediate
  - Litoria caerulea (White's tree frog) — hardy beginner tree frog
  - Pyxicephalus adspersus (African bullfrog) — long-lived terrestrial powerhouse

Citations are honest — only verifiable, accessible sources. Where the
hobby literature converges on a husbandry range, we report the
overlap. Where it diverges, we report the wider envelope and note
contention in `care_guide`.

Run with: python3 seed_frog_species.py
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
# Citation catalog. Same JSONB shape as the snake/lizard catalog uses.
# ---------------------------------------------------------------------------
CITES = {
    "reptifiles_pacman": {
        "source_type": "breeder_community",
        "title": "Pacman Frog Care Guide",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/pacman-frog-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Multi-source hobby care guide for Ceratophrys with husbandry "
            "ranges cross-checked against amphibian-keeping references."
        ),
    },
    "amphibiancare_pacman": {
        "source_type": "breeder_community",
        "title": "Pacman Frog Care",
        "author": "AmphibianCare.com",
        "url": "https://amphibiancare.com/frogs/caresheets/pacman/",
        "publication_date": "2021-01-01",
        "summary": (
            "Long-running amphibian husbandry reference with detailed "
            "Ceratophrys feeding + humidity guidance."
        ),
    },
    "josh_frogs_pacman": {
        "source_type": "breeder",
        "title": "Pacman Frog Care Sheet",
        "author": "Josh's Frogs",
        "url": "https://www.joshsfrogs.com/care-sheets/pacman-frog-care-sheet.html",
        "publication_date": "2023-01-01",
        "summary": (
            "Care sheet from a major US captive-bred amphibian supplier."
        ),
    },
    "josh_frogs_auratus": {
        "source_type": "breeder",
        "title": "Green and Black Dart Frog Care Sheet (Dendrobates auratus)",
        "author": "Josh's Frogs",
        "url": "https://www.joshsfrogs.com/care-sheets/green-and-black-dart-frog-care-sheet-dendrobates-auratus.html",
        "publication_date": "2023-01-01",
        "summary": (
            "Care sheet from the largest US captive-bred dendrobatid supplier."
        ),
    },
    "dendroboard_auratus": {
        "source_type": "breeder_community",
        "title": "Caresheet: Dendrobates auratus",
        "author": "Dendroboard",
        "url": "https://www.dendroboard.com/threads/caresheet-dendrobates-auratus.27437/",
        "publication_date": "2008-01-01",
        "summary": (
            "Long-running peer-reviewed dart-frog keeper community caresheet."
        ),
    },
    "amphibiancare_auratus": {
        "source_type": "breeder_community",
        "title": "Green and Black Dart Frog Care",
        "author": "AmphibianCare.com",
        "url": "https://amphibiancare.com/frogs/caresheets/auratus/",
        "publication_date": "2021-01-01",
        "summary": (
            "Amphibian-keeping reference for Dendrobates auratus."
        ),
    },
    "josh_frogs_milk_frog": {
        "source_type": "breeder",
        "title": "Amazon Milk Frog Care Sheet",
        "author": "Josh's Frogs",
        "url": "https://www.joshsfrogs.com/care-sheets/amazon-milk-frog-care-sheet.html",
        "publication_date": "2023-01-01",
        "summary": (
            "Care sheet for Trachycephalus resinifictrix from a major "
            "captive-bred amphibian supplier."
        ),
    },
    "reptifiles_milk_frog": {
        "source_type": "breeder_community",
        "title": "Amazon Milk Frog Care",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/amazon-milk-frog-care-guide/",
        "publication_date": "2023-01-01",
        "summary": (
            "Multi-source hobby care guide with husbandry ranges for "
            "Trachycephalus resinifictrix."
        ),
    },
    "reptifiles_whites": {
        "source_type": "breeder_community",
        "title": "White's Tree Frog Care Guide",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/whites-tree-frog-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Multi-source hobby reference for Litoria caerulea with "
            "husbandry ranges."
        ),
    },
    "amphibiancare_whites": {
        "source_type": "breeder_community",
        "title": "White's Tree Frog Care",
        "author": "AmphibianCare.com",
        "url": "https://amphibiancare.com/frogs/caresheets/whites/",
        "publication_date": "2021-01-01",
        "summary": (
            "Amphibian-keeping reference for Litoria caerulea."
        ),
    },
    "josh_frogs_whites": {
        "source_type": "breeder",
        "title": "White's Tree Frog Care Sheet",
        "author": "Josh's Frogs",
        "url": "https://www.joshsfrogs.com/care-sheets/whites-tree-frog-care-sheet.html",
        "publication_date": "2023-01-01",
        "summary": (
            "Care sheet from a major captive-bred amphibian supplier."
        ),
    },
    "amphibiancare_bullfrog": {
        "source_type": "breeder_community",
        "title": "African Bullfrog Care",
        "author": "AmphibianCare.com",
        "url": "https://amphibiancare.com/frogs/caresheets/pixie/",
        "publication_date": "2021-01-01",
        "summary": (
            "Amphibian-keeping reference for Pyxicephalus adspersus with "
            "lifespan and feeding cadence guidance."
        ),
    },
    "reptifiles_bullfrog": {
        "source_type": "breeder_community",
        "title": "African Bullfrog Care Guide",
        "author": "ReptiFiles",
        "url": "https://reptifiles.com/african-bullfrog-care/",
        "publication_date": "2023-01-01",
        "summary": (
            "Multi-source husbandry reference for Pyxicephalus adspersus."
        ),
    },
}


def cite(*keys):
    return [CITES[k] | {"ref_key": k} for k in keys]


# ---------------------------------------------------------------------------
# Species entries. Husbandry ranges drawn from the overlap of cited
# sources. life_stage_feeding is omitted — frog feeding cadence is
# insect-prey-count-driven, not weight-ratio-driven, and the snake-
# centric feeding intelligence schema would be misleading here.
# Keepers see the per-stage `feeding_frequency_*` fields instead.
# ---------------------------------------------------------------------------
SPECIES_DATA = [
    # -- Pacman frog --------------------------------------------------------
    {
        "scientific_name": "Ceratophrys ornata",
        "common_names": ["Pacman Frog", "Ornate Horned Frog", "Argentine Horned Frog"],
        "genus": "Ceratophrys",
        "family": "Ceratophryidae",
        "order_name": "Anura",
        "care_level": "beginner",
        "handleability": "minimal_handling",
        "activity_period": "nocturnal",
        "native_region": "Subtropical South America — Argentina, Uruguay, southern Brazil",
        "adult_length_min_in": Decimal("4"),
        "adult_length_max_in": Decimal("6"),
        "adult_weight_min_g": Decimal("200"),
        "adult_weight_max_g": Decimal("500"),
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("76"),
        "temp_warm_min": Decimal("76"),
        "temp_warm_max": Decimal("82"),
        "temp_basking_min": None,
        "temp_basking_max": None,
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 50,
        "humidity_max": 80,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 90,
        "uvb_required": False,
        "uvb_type": "low_optional",
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "Small deli cup / shoebox bin (1-2 gal)",
        "enclosure_min_juvenile": "5 gallon / 16\"L x 8\"W x 10\"H",
        "enclosure_min_adult": "10-20 gallon / 20\"L x 10\"W x 12\"H",
        "bioactive_suitable": True,
        "substrate_safe_list": ["coco fiber", "sphagnum moss", "ABG mix", "deep leaf litter"],
        "substrate_avoid_list": ["sand", "gravel", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("3"),
        "substrate_depth_max_in": Decimal("5"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinhead crickets, fruit flies, small earthworms",
        "prey_size_juvenile": "Medium crickets, dubia, nightcrawlers",
        "prey_size_adult": "Large crickets, dubia, nightcrawlers; occasional pinky mouse",
        "feeding_frequency_hatchling": "Daily",
        "feeding_frequency_juvenile": "Every 2-3 days",
        "feeding_frequency_adult": "Every 7-10 days",
        "supplementation_notes": (
            "Dust insects with calcium + D3 at most feedings for juveniles; "
            "every other for adults. Multivitamin once a week. Rodents are "
            "high-fat and should be occasional treats only, not staples — "
            "fatty liver disease is a common cause of premature death in "
            "rodent-fed Pacmans."
        ),
        "water_bowl_description": (
            "Shallow water dish large enough to soak in. Pacman frogs absorb "
            "water through skin so dechlorinated/spring water is mandatory."
        ),
        "soaking_behavior": (
            "Will soak when humidity is low or before feeding."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Aestivates (not brumation) during dry periods in the wild — "
            "burrows down and forms a cocoon. Captive Pacmans don't need "
            "this if kept on stable humidity year-round."
        ),
        "defensive_displays": ["gaping mouth display", "loud calls when stressed"],
        "lifespan_captivity_min_yrs": 6,
        "lifespan_captivity_max_yrs": 15,
        "cites_appendix": None,
        "iucn_status": "NT",
        "wild_population_notes": (
            "Wild populations are declining due to habitat loss and "
            "agricultural conversion. Captive-bred animals are widely "
            "available and strongly preferred."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Pacman Frog (Ceratophrys ornata)** — A chunky, sit-and-wait "
            "ambush predator with one of the highest bite-force-to-size "
            "ratios in the amphibian world. Pacmans spend most of their "
            "time half-buried, waiting for prey to wander past. Keep on "
            "deep moist substrate they can burrow into, with a shallow "
            "water dish for soaking. Avoid handling — their skin is "
            "permeable and human skin oils can be absorbed. Common pitfall: "
            "feeding rodents too often. Pacmans will eat anything that "
            "fits, but a rodent-heavy diet causes fatty liver disease "
            "and shortens lifespan dramatically. Insects + the occasional "
            "rodent is the right balance."
        ),
        "sources": cite(
            "reptifiles_pacman",
            "amphibiancare_pacman",
            "josh_frogs_pacman",
        ),
    },
    # -- Green-and-black poison dart frog -----------------------------------
    {
        "scientific_name": "Dendrobates auratus",
        "common_names": ["Green and Black Dart Frog", "Green and Black Poison Dart Frog"],
        "genus": "Dendrobates",
        "family": "Dendrobatidae",
        "order_name": "Anura",
        "care_level": "intermediate",
        "handleability": "no_handling",
        "activity_period": "diurnal",
        "native_region": "Central America — Nicaragua to northwestern Colombia; introduced to Hawaii",
        "adult_length_min_in": Decimal("1.0"),
        "adult_length_max_in": Decimal("1.6"),
        "adult_weight_min_g": Decimal("3"),
        "adult_weight_max_g": Decimal("8"),
        # CRITICAL: heat-sensitive. Sources strongly converge that
        # >80°F sustained is dangerous.
        "temp_cool_min": Decimal("68"),
        "temp_cool_max": Decimal("75"),
        "temp_warm_min": Decimal("72"),
        "temp_warm_max": Decimal("78"),
        "temp_basking_min": None,
        "temp_basking_max": None,
        "temp_night_min": Decimal("64"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 80,
        "humidity_max": 100,
        "humidity_shed_boost_min": 90,
        "humidity_shed_boost_max": 100,
        "uvb_required": False,
        "uvb_type": "low_optional",
        "uvb_replacement_months": 12,
        "enclosure_type": "arboreal",
        "enclosure_min_hatchling": "Plastic deli cup with moss + leaf litter",
        "enclosure_min_juvenile": "10 gallon vertical / 12\"L x 12\"W x 18\"H",
        "enclosure_min_adult": "18\"L x 18\"W x 24\"H vivarium, 10+ gal per frog in groups",
        "bioactive_suitable": True,
        "substrate_safe_list": ["ABG mix", "coco fiber + leaf litter", "live moss"],
        "substrate_avoid_list": ["sand", "gravel", "dry coco"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Springtails, melanogaster fruit flies",
        "prey_size_juvenile": "Hydei fruit flies, springtails",
        "prey_size_adult": "Hydei fruit flies, pinhead crickets, isopods, springtails",
        "feeding_frequency_hatchling": "Daily",
        "feeding_frequency_juvenile": "Every 1-2 days",
        "feeding_frequency_adult": "Every 2-3 days",
        "supplementation_notes": (
            "Dust ALL feeders with high-quality vitamin A + calcium + D3 "
            "supplement. Vitamin A deficiency is the leading cause of "
            "short tongue syndrome and early death in captive darts. "
            "Repashy Calcium Plus or Repashy SuperVite + Calcium Plus LoD "
            "are the standard hobby choices. Rotate supplements per a "
            "documented schedule — under-supplementation is common."
        ),
        "water_bowl_description": (
            "Standing water is unnecessary and can be a drowning hazard for "
            "smaller frogs. A bioactive vivarium with daily misting provides "
            "all moisture they need."
        ),
        "soaking_behavior": (
            "Not strong soakers — they prefer wet leaf litter and moss."
        ),
        "brumation_required": False,
        "defensive_displays": ["pattern advertisement (aposematism)"],
        "lifespan_captivity_min_yrs": 10,
        "lifespan_captivity_max_yrs": 15,
        "cites_appendix": "II",
        "iucn_status": "LC",
        "wild_population_notes": (
            "Captive-bred animals are NON-TOXIC. Wild dart frogs derive "
            "their alkaloid toxins from arthropod prey in their native "
            "range; captive-bred specimens raised on hobby feeders never "
            "develop the toxic alkaloid profile. Buy captive-bred only — "
            "wild-caught dendrobatids should be avoided for welfare + "
            "legal reasons (CITES II)."
        ),
        "has_morph_market": True,
        "morph_complexity": "moderate",
        "care_guide": (
            "**Green-and-Black Poison Dart Frog (Dendrobates auratus)** — "
            "One of the most beginner-friendly dart frogs. Bold, diurnal, "
            "and willing to be seen — unlike many darts that hide. The "
            "critical husbandry parameter is temperature: sustained "
            "exposure above 80°F is fatal. A planted bioactive vivarium "
            "with a misting system, ABG mix substrate, leaf litter, and "
            "live springtail + isopod populations is the standard setup. "
            "Captive-bred animals are non-toxic — the alkaloid toxicity is "
            "diet-derived and absent in hobby-fed frogs. Vitamin A "
            "supplementation is non-negotiable: short tongue syndrome "
            "from A deficiency is the most common preventable death."
        ),
        "sources": cite(
            "josh_frogs_auratus",
            "dendroboard_auratus",
            "amphibiancare_auratus",
        ),
    },
    # -- Amazon milk frog ---------------------------------------------------
    {
        "scientific_name": "Trachycephalus resinifictrix",
        "common_names": ["Amazon Milk Frog", "Mission Golden-eyed Tree Frog"],
        "genus": "Trachycephalus",
        "family": "Hylidae",
        "order_name": "Anura",
        "care_level": "intermediate",
        "handleability": "minimal_handling",
        "activity_period": "nocturnal",
        "native_region": "Amazon basin — Brazil, Peru, Colombia, Venezuela",
        "adult_length_min_in": Decimal("2.5"),
        "adult_length_max_in": Decimal("4"),
        "adult_weight_min_g": Decimal("30"),
        "adult_weight_max_g": Decimal("70"),
        "temp_cool_min": Decimal("72"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": None,
        "temp_basking_max": None,
        "temp_night_min": Decimal("68"),
        "temp_night_max": Decimal("75"),
        "humidity_min": 65,
        "humidity_max": 85,
        "humidity_shed_boost_min": 80,
        "humidity_shed_boost_max": 100,
        "uvb_required": True,
        "uvb_type": "low_5_uvb",
        "uvb_replacement_months": 12,
        "enclosure_type": "arboreal",
        "enclosure_min_hatchling": "Plastic deli cup, vertical orientation",
        "enclosure_min_juvenile": "12\"L x 12\"W x 18\"H vivarium",
        "enclosure_min_adult": "18\"L x 18\"W x 24\"H vivarium per pair; larger for groups",
        "bioactive_suitable": True,
        "substrate_safe_list": ["ABG mix", "coco fiber + sphagnum", "bioactive mixes"],
        "substrate_avoid_list": ["sand", "gravel", "untreated wood mulch"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Hydei fruit flies, pinhead crickets",
        "prey_size_juvenile": "Small crickets, small dubia",
        "prey_size_adult": "Adult crickets, medium dubia, hornworms; rare pinky as treat",
        "feeding_frequency_hatchling": "Daily",
        "feeding_frequency_juvenile": "Every 2-3 days",
        "feeding_frequency_adult": "Every 3-5 days",
        "supplementation_notes": (
            "Dust feeders with calcium + D3 at most feedings; multivitamin "
            "weekly. Vitamin A is important — short tongue syndrome can "
            "occur with under-supplementation."
        ),
        "water_bowl_description": (
            "Shallow water dish for soaking; some keepers use a small "
            "water feature in bioactive setups."
        ),
        "soaking_behavior": (
            "Will soak occasionally — provide a shallow dish even though "
            "they spend most time arboreal."
        ),
        "brumation_required": False,
        "defensive_displays": [
            "milky skin secretion when severely stressed (do not handle)",
            "puffing up",
        ],
        "lifespan_captivity_min_yrs": 5,
        "lifespan_captivity_max_yrs": 10,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": False,
        "morph_complexity": "none",
        "care_guide": (
            "**Amazon Milk Frog (Trachycephalus resinifictrix)** — A "
            "charismatic arboreal tree frog with vivid blue patterning and "
            "striking golden eyes. Calm temperament, but their name comes "
            "from a milky-white skin secretion released under severe "
            "stress — minimize handling to a quick relocation only. "
            "Set up vertically with abundant climbing branches, a large "
            "water dish for soaking, and lush plant cover. Misting twice "
            "daily keeps humidity in the right band. Bioactive vivariums "
            "with springtails + isopods work beautifully and reduce "
            "spot-cleaning. UVB is increasingly considered beneficial "
            "even though they're nocturnal — a low-output 5.0 lamp on a "
            "12-hour cycle is the modern recommendation."
        ),
        "sources": cite(
            "josh_frogs_milk_frog",
            "reptifiles_milk_frog",
        ),
    },
    # -- White's tree frog --------------------------------------------------
    {
        "scientific_name": "Litoria caerulea",
        "common_names": [
            "White's Tree Frog",
            "Australian Green Tree Frog",
            "Dumpy Tree Frog",
        ],
        "genus": "Litoria",
        "family": "Hylidae",
        "order_name": "Anura",
        "care_level": "beginner",
        "handleability": "minimal_handling",
        "activity_period": "nocturnal",
        "native_region": "Northern and eastern Australia; New Guinea",
        "adult_length_min_in": Decimal("3"),
        "adult_length_max_in": Decimal("4.5"),
        "adult_weight_min_g": Decimal("40"),
        "adult_weight_max_g": Decimal("100"),
        "temp_cool_min": Decimal("70"),
        "temp_cool_max": Decimal("76"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": None,
        "temp_basking_max": None,
        "temp_night_min": Decimal("65"),
        "temp_night_max": Decimal("72"),
        "humidity_min": 50,
        "humidity_max": 70,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 80,
        "uvb_required": True,
        "uvb_type": "low_5_uvb",
        "uvb_replacement_months": 12,
        "enclosure_type": "arboreal",
        "enclosure_min_hatchling": "5 gallon vertical / plastic deli cup",
        "enclosure_min_juvenile": "12\"L x 12\"W x 18\"H vivarium",
        "enclosure_min_adult": "18\"L x 18\"W x 24\"H vivarium per pair; larger for groups",
        "bioactive_suitable": True,
        "substrate_safe_list": ["coco fiber", "ABG mix", "cypress mulch", "sphagnum moss"],
        "substrate_avoid_list": ["sand", "gravel", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("2"),
        "substrate_depth_max_in": Decimal("4"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Pinhead crickets, fruit flies",
        "prey_size_juvenile": "Small to medium crickets, small dubia",
        "prey_size_adult": "Adult crickets, dubia, hornworms; occasional pinky as treat",
        "feeding_frequency_hatchling": "Daily",
        "feeding_frequency_juvenile": "Every 2-3 days",
        "feeding_frequency_adult": "Every 5-7 days",
        "supplementation_notes": (
            "Dust with calcium + D3 at most feedings for growing frogs, "
            "every other for adults; multivitamin weekly. White's tree "
            "frogs are notoriously prone to obesity — adults need restraint "
            "on feeding frequency and quantity, especially if rodents are "
            "offered."
        ),
        "water_bowl_description": (
            "Large shallow water dish for soaking. Chlorine-free water only."
        ),
        "soaking_behavior": (
            "Regular soakers — provide a generous shallow dish."
        ),
        "brumation_required": False,
        "defensive_displays": ["very mild — these are exceptionally calm frogs"],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 20,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": True,
        "morph_complexity": "low",
        "care_guide": (
            "**White's Tree Frog (Litoria caerulea)** — Arguably the most "
            "beginner-friendly tree frog in the hobby. Hardy, forgiving "
            "of beginner husbandry mistakes, calm enough to tolerate "
            "occasional handling, and long-lived (15-20 years is normal). "
            "Their main problem is obesity — they'll eat anything they can "
            "fit in their mouth, and over-fed adults develop fat folds and "
            "shortened lifespans. Feed adults sparingly. Otherwise: "
            "vertical setup, branches, modest humidity (they tolerate "
            "drier conditions than most tropical frogs), shallow water dish."
        ),
        "sources": cite(
            "reptifiles_whites",
            "amphibiancare_whites",
            "josh_frogs_whites",
        ),
    },
    # -- African bullfrog ---------------------------------------------------
    {
        "scientific_name": "Pyxicephalus adspersus",
        "common_names": ["African Bullfrog", "Pixie Frog", "Giant African Bullfrog"],
        "genus": "Pyxicephalus",
        "family": "Pyxicephalidae",
        "order_name": "Anura",
        "care_level": "intermediate",
        "handleability": "minimal_handling",
        "activity_period": "nocturnal",
        "native_region": "Sub-Saharan Africa — savanna grasslands",
        # Males much larger than females — note the wide range.
        "adult_length_min_in": Decimal("4"),
        "adult_length_max_in": Decimal("9.5"),
        "adult_weight_min_g": Decimal("400"),
        "adult_weight_max_g": Decimal("2000"),
        "temp_cool_min": Decimal("72"),
        "temp_cool_max": Decimal("78"),
        "temp_warm_min": Decimal("78"),
        "temp_warm_max": Decimal("85"),
        "temp_basking_min": None,
        "temp_basking_max": None,
        "temp_night_min": Decimal("68"),
        "temp_night_max": Decimal("75"),
        "humidity_min": 50,
        "humidity_max": 70,
        "humidity_shed_boost_min": 70,
        "humidity_shed_boost_max": 85,
        "uvb_required": False,
        "uvb_type": "low_optional",
        "uvb_replacement_months": 12,
        "enclosure_type": "terrestrial",
        "enclosure_min_hatchling": "Small plastic bin or 5 gallon",
        "enclosure_min_juvenile": "10 gallon / 20\"L x 10\"W x 12\"H",
        "enclosure_min_adult": "30+ gallon / 36\"L x 18\"W x 12\"H for males; smaller for females",
        "bioactive_suitable": True,
        "substrate_safe_list": ["coco fiber", "ABG mix", "moist topsoil", "sphagnum moss"],
        "substrate_avoid_list": ["sand", "gravel", "cedar", "pine"],
        "substrate_depth_min_in": Decimal("4"),
        "substrate_depth_max_in": Decimal("6"),
        "diet_type": "strict_carnivore",
        "prey_size_hatchling": "Small crickets, fruit flies, springtails",
        "prey_size_juvenile": "Medium crickets, dubia, nightcrawlers",
        "prey_size_adult": "Large insects, occasional rodent (pinky to fuzzy), nightcrawlers",
        "feeding_frequency_hatchling": "Daily",
        "feeding_frequency_juvenile": "Every 2-3 days",
        "feeding_frequency_adult": "Every 7-14 days",
        "supplementation_notes": (
            "Dust insects with calcium + D3 at most feedings; multivitamin "
            "weekly. Adults benefit from variety — rodents should be "
            "occasional, not staple, to avoid fatty liver disease."
        ),
        "water_bowl_description": (
            "Shallow water dish large enough for the frog to fully submerge; "
            "chlorine-free water only. Change frequently — pixies foul "
            "water fast."
        ),
        "soaking_behavior": (
            "Regular soakers. During dry seasons in the wild they aestivate "
            "in a cocoon several feet underground."
        ),
        "brumation_required": False,
        "brumation_notes": (
            "Aestivates rather than brumates — burrows down and forms a "
            "mucus cocoon to wait out dry conditions. Captive pixies on "
            "stable humidity don't aestivate, but providing a deep "
            "substrate they CAN burrow in is good husbandry."
        ),
        "defensive_displays": [
            "open-mouth threat with audible bellow",
            "lunging bite (powerful — pixies have ossified teeth-like projections)",
            "puffing up to look larger",
        ],
        "lifespan_captivity_min_yrs": 15,
        "lifespan_captivity_max_yrs": 30,
        "cites_appendix": None,
        "iucn_status": "LC",
        "has_morph_market": False,
        "morph_complexity": "low",
        "care_guide": (
            "**African Bullfrog (Pyxicephalus adspersus)** — The largest "
            "frog in mainland Africa and the keeper's introduction to "
            "amphibian aggression. Adult males reach softball-sized weights "
            "and have a bite that can draw blood — handle minimally and "
            "only with intent. Sexual dimorphism is dramatic: males are "
            "roughly twice the size of females. Long-lived (15-30 years), "
            "voracious, and absolutely will eat anything that fits. "
            "Provide deep moist substrate they can burrow into, a generous "
            "shallow water dish, and feeders proportional to age. Avoid "
            "rodent-heavy diets — pixies are prone to obesity and fatty "
            "liver disease. House individually; they are cannibalistic."
        ),
        "sources": cite(
            "amphibiancare_bullfrog",
            "reptifiles_bullfrog",
        ),
    },
]


def _slug_taken(slug: str, *, exclude_id=None) -> bool:
    """Reuse the same slug-uniqueness check as seed_reptile_species.py.

    Imported lazily inside main() so the module loads even when the
    DB is unreachable.
    """
    from app.models.reptile_species import ReptileSpecies as _RS

    with SessionLocal() as session:
        q = session.query(_RS.id).filter(_RS.slug == slug)
        if exclude_id is not None:
            q = q.filter(_RS.id != exclude_id)
        return q.first() is not None


def main() -> int:
    db = SessionLocal()
    added = 0
    updated = 0
    try:
        for data in SPECIES_DATA:
            scientific_name = data["scientific_name"]
            scientific_name_lower = scientific_name.lower()

            existing = (
                db.query(ReptileSpecies)
                .filter(ReptileSpecies.scientific_name_lower == scientific_name_lower)
                .first()
            )

            slug_source = scientific_name

            if existing:
                # Update in place — preserve id, submitted_by, slug.
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
            db.flush()
            added += 1
            print(f"  Added:   {scientific_name}  (slug={slug_value})")

        db.commit()
        print(f"\nDone. Added {added}, updated {updated}.")
        return 0
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"Error: {e}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
