"""
Seed script - Batch 5: Fill gaps to reach ~100 species (verified care data)
Run from apps/api directory: python3 seed_species_batch5.py
Skips any species already in the database by checking scientific_name_lower.
"""

import os
import sys
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.species import Species, CareLevel
from app.config import settings

print("Connecting to database...")
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

count = db.query(Species).count()
print(f"Current species count: {count}")

species_data = [

    # ── NW TERRESTRIAL ────────────────────────────────────────────────────────

    {
        "scientific_name": "Grammostola pulchripes",
        "scientific_name_lower": "grammostola pulchripes",
        "common_names": ["Chaco Golden Knee", "Chaco Golden Knee Tarantula"],
        "genus": "Grammostola",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Exceptionally docile and slow-moving; one of the most handleable tarantulas in the hobby",
        "native_region": "Gran Chaco region — Argentina, Paraguay, Bolivia (dry grassland and shrubland)",
        "adult_size": "7-8 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 80,
        "humidity_min": 55,
        "humidity_max": 70,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "14x10x8 inches",
        "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Grammostola pulchripes is arguably the most popular beginner tarantula in "
            "the hobby, prized for its extraordinary calm temperament and stunning "
            "appearance — a thick-set, golden-kneed body with striking yellow and black "
            "banding on the legs. Adults are impressively large at 7-8 inches. Like "
            "G. rosea, they can engage in extended fasting periods (months at a time), "
            "which is perfectly normal — do not attempt to force feed. Always maintain "
            "a fresh water dish. They prefer a dry substrate with a slightly moistened "
            "deep layer; avoid misting the enclosure directly. Provide ample substrate "
            "depth for burrowing and a hide. Growth is very slow — this is a long-term "
            "commitment, with females living 20-25+ years. Despite their docile nature, "
            "handle over a low surface as they are heavy-bodied and a fall can be fatal. "
            "One of the most highly recommended first tarantulas by experienced keepers."
        ),
        "image_url": None,
        "source_url": "https://www.thetarantulacollective.com/caresheets/grammostola-pulchripes",
    },

    {
        "scientific_name": "Tliltocatl vagans",
        "scientific_name_lower": "tliltocatl vagans",
        "common_names": ["Mexican Red Rump Tarantula", "Mexican Black Velvet"],
        "genus": "Tliltocatl",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Usually calm but can be skittish; kicks urticating hairs readily when disturbed",
        "native_region": "Mexico (Oaxaca, Chiapas), Guatemala, Belize (dry tropical forest)",
        "adult_size": "5-6 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 70,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Tliltocatl vagans is a popular beginner species with a deep, velvet-black "
            "body and a vivid brick-red abdomen — the source of its 'Red Rump' common "
            "name. They are more active and faster than T. albopilosus, and keepers "
            "should be aware they can be skittish and hair-kicky. The urticating hairs "
            "are Type I and III and can cause significant skin irritation. Wash hands "
            "after any contact and never touch your face after handling. They are "
            "enthusiastic burrowers — provide ample depth and a starter hide. Keep "
            "the substrate mostly dry with a slightly moist layer at depth and a "
            "constant water dish. They are hardier and faster-growing than Brachypelma "
            "species, making them a good all-around beginner choice. Formerly placed "
            "in Brachypelma; reclassified to Tliltocatl in 2019 along with several "
            "other closely related species."
        ),
        "image_url": None,
        "source_url": "https://www.thetarantulacollective.com/caresheets/tliltocatl-vagans",
    },

    {
        "scientific_name": "Acanthoscurria brocklehursti",
        "scientific_name_lower": "acanthoscurria brocklehursti",
        "common_names": ["Brazilian Black and White Tarantula", "Brockle's Bird-Eater"],
        "genus": "Acanthoscurria",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Bold and defensive; a fast and determined hair-kicker with an aggressive feeding response",
        "native_region": "Brazil (Mato Grosso — cerrado savanna)",
        "adult_size": "8-9 inches",
        "growth_rate": "moderate to fast",
        "type": "terrestrial",
        "temperature_min": 78,
        "temperature_max": 86,
        "humidity_min": 65,
        "humidity_max": 75,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "8x8x5 inches",
        "enclosure_size_adult": "18x14x8 inches",
        "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Acanthoscurria brocklehursti is a large, impressive Brazilian terrestrial "
            "with bold black and white (or cream) banding on its legs. This genus "
            "is notable for possessing particularly irritating urticating hairs — "
            "even experienced keepers wear gloves and eye protection when working "
            "with A. brocklehursti. Wash hands thoroughly after any contact and "
            "avoid touching eyes or face. They are enthusiastic feeders with a fast "
            "growth rate for a large species, reaching impressive adult sizes in "
            "relatively few years. Provide a large enclosure with ample floor space, "
            "sufficient substrate for burrowing, and a hide. Maintain moderate "
            "humidity with a water dish always present. Their bold temperament and "
            "large size make them excellent display animals for keepers with some "
            "experience managing defensive tarantulas."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/12/27/acanthoscurria-brocklehursti-brazilian-black-and-white/",
    },

    {
        "scientific_name": "Theraphosa stirmi",
        "scientific_name_lower": "theraphosa stirmi",
        "common_names": ["Burgundy Goliath Birdeater", "Goliath Burgundy Birdeater"],
        "genus": "Theraphosa",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Defensive and fast; vigorously kicks urticating hairs; not a handling species",
        "native_region": "Northern Brazil, Guyana (tropical rainforest)",
        "adult_size": "10-11 inches",
        "growth_rate": "fast",
        "type": "fossorial",
        "temperature_min": 76,
        "temperature_max": 82,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "10x10x6 inches",
        "enclosure_size_adult": "20x16x10 inches",
        "substrate_depth": "6-8 inches",
        "substrate_type": "coco fiber, peat moss blend (moist, packable)",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Theraphosa stirmi is one of the two Goliath birdeater species available "
            "in the hobby (alongside T. blondi) and rivals it in size — adults "
            "regularly exceed 10 inches. It differs from T. blondi by its rich "
            "burgundy-brown coloration with distinctly banded legs. Like all Theraphosa, "
            "it has urticating hairs that are particularly nasty — the barbed hairs "
            "cause intense, long-lasting irritation to skin, eyes, and respiratory "
            "tract. Always wear eye protection and a mask when performing maintenance. "
            "Never work with this species near your face. They need high humidity "
            "maintained via deep, consistently moist substrate (not wet) and excellent "
            "ventilation to prevent fungal growth. Provide a burrow or large hide. "
            "They have a powerful bite and should never be handled. Despite the "
            "challenges, they are extraordinary animals and a pinnacle achievement "
            "for serious keepers."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2015/01/28/theraphosa-stirmi-the-burgundy-goliath-bird-eater/",
    },

    {
        "scientific_name": "Theraphosa apophysis",
        "scientific_name_lower": "theraphosa apophysis",
        "common_names": ["Pinkfoot Goliath Birdeater", "Goliath Pink Foot"],
        "genus": "Theraphosa",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely defensive; aggressive hair-kicker — wear eye and respiratory protection always",
        "native_region": "Venezuela, northwestern Brazil (tropical rainforest)",
        "adult_size": "11-13 inches",
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "10x10x6 inches",
        "enclosure_size_adult": "24x18x10 inches",
        "substrate_depth": "5-6 inches",
        "substrate_type": "coco fiber, topsoil mix (moist)",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Theraphosa apophysis is widely regarded as the largest tarantula species "
            "by leg span — females have been documented exceeding 13 inches. It is "
            "distinguished from other Theraphosa by its distinctive pink-tinged foot "
            "pads and more golden-brown overall coloration. Among Theraphosa keepers, "
            "it is considered the most defensive of the three species — it kicks "
            "urticating hairs explosively and with remarkable accuracy. Eye protection "
            "and a dust mask are essential for all maintenance. The hairs cause intense, "
            "long-lasting skin and eye irritation. Unlike T. blondi and T. stirmi, "
            "T. apophysis does not require as high humidity and does well in slightly "
            "drier conditions — keep substrate moist but not saturated, and ensure "
            "strong cross-ventilation. Provide a large hide or burrow. Due to its "
            "extreme temperament, this species is best suited to very experienced "
            "keepers who understand the risks. A truly spectacular animal."
        ),
        "image_url": None,
        "source_url": "https://www.grimoireexotics.com/post/theraphosa-apophysis-pinkfoot-goliath-birdeater-care-guide",
    },

    {
        "scientific_name": "Phormictopus cancerides",
        "scientific_name_lower": "phormictopus cancerides",
        "common_names": ["Haitian Brown Tarantula", "Hispaniolan Giant Tarantula"],
        "genus": "Phormictopus",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Hardy and generally calm for a large species; faster than Brachypelma but less defensive",
        "native_region": "Hispaniola — Haiti and Dominican Republic (dry tropical forest)",
        "adult_size": "5-6 inches",
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 82,
        "humidity_min": 65,
        "humidity_max": 75,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Phormictopus cancerides is an underrated beginner-friendly species from "
            "Hispaniola with a rich bronze-brown coloration and fast growth rate. "
            "They are recommended for keepers who want a larger tarantula without "
            "committing to the decades of slow growth associated with Grammostola "
            "or Brachypelma — P. cancerides can reach adult size in 3-4 years. "
            "They are generally calm but move faster than typical beginner species "
            "like T. albopilosus. Urticating hairs are present but typically not "
            "kicked as aggressively as Nhandu or Acanthoscurria. Keep the substrate "
            "moderately moist with a water dish always available. Provide a hide "
            "and ample floor space. They are opportunistic feeders with a strong "
            "feeding response. The genus Phormictopus contains numerous species; "
            "the auratus (Cuban Gold) and sp. 'Green' are other popular hobby species."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/04/14/phormictopus-cancerides/",
    },

    {
        "scientific_name": "Phormictopus auratus",
        "scientific_name_lower": "phormictopus auratus",
        "common_names": ["Cuban Gold Tarantula", "Cuban Golden Tarantula"],
        "genus": "Phormictopus",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and skittish; can be defensive but calms with age; urticating hairs present",
        "native_region": "Cuba (tropical dry forest)",
        "adult_size": "5-6 inches",
        "growth_rate": "fast",
        "type": "terrestrial",
        "temperature_min": 76,
        "temperature_max": 84,
        "humidity_min": 65,
        "humidity_max": 75,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Phormictopus auratus is a striking tarantula from Cuba with an unusual "
            "golden-metallic sheen to its carapace and legs, making it one of the "
            "more visually distinctive NW species. It grows quickly and reaches "
            "adult size in 3-4 years, giving keepers a satisfying progression "
            "compared to slow-growing Grammostola or Brachypelma. They are faster "
            "and more flighty than P. cancerides, particularly as slings and "
            "juveniles — use caution during enclosure maintenance. Urticating hairs "
            "are present. Care is straightforward: moderate humidity, a water dish, "
            "burrowing substrate, and a hide. Feed regularly with appropriately "
            "sized prey. As with P. cancerides, they have an excellent feeding "
            "response. Cuba's strict export laws mean all specimens in the hobby "
            "are captive bred — always verify provenance."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/phormictopus-auratus-cuban-gold-care.318441/",
    },

    # ── NW ARBOREAL ─────────────────────────────────────────────────────────────

    {
        "scientific_name": "Psalmopoeus pulcher",
        "scientific_name_lower": "psalmopoeus pulcher",
        "common_names": ["Panama Blonde Tarantula", "Panama Blonde"],
        "genus": "Psalmopoeus",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and defensive; bolts readily and will bite without hesitation — behaves more like an OW species",
        "native_region": "Panama and northwestern Colombia (tropical rainforest)",
        "adult_size": "4-5 inches",
        "growth_rate": "moderate to fast",
        "type": "arboreal",
        "temperature_min": 76,
        "temperature_max": 84,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x5 inches",
        "enclosure_size_juvenile": "6x6x10 inches",
        "enclosure_size_adult": "10x10x14 inches",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Psalmopoeus pulcher is often called a 'New World Old World' tarantula "
            "because, despite being from Panama, it lacks urticating hairs and "
            "relies entirely on speed and biting as defense — just like an Old World "
            "species. This makes it significantly more challenging to work with than "
            "most NW arboreals. They are explosively fast and will bite without "
            "warning; always use long tongs and a catch cup. Their coloration is "
            "understated but attractive — a sandy golden-tan with darker leg "
            "markings. They require an arboreal setup with vertical cork bark or "
            "hollow tubes near the top of the enclosure for retreating. Lightly "
            "mist one side every 2-3 days and maintain a ground-level water dish. "
            "They are prolific webbers. Despite the defensive temperament, they "
            "are rewarding display animals once settled in their enclosure. Care "
            "is broadly similar to P. irminia and P. cambridgei."
        ),
        "image_url": None,
        "source_url": "https://www.thetarantulacollective.com/care-sheets-2/psalmopoeus-pulcher",
    },

    {
        "scientific_name": "Tapinauchenius gigas",
        "scientific_name_lower": "tapinauchenius gigas",
        "common_names": ["Giant Rusty Featherleg", "Orange Tree Spider", "Giant Tapinauchenius"],
        "genus": "Tapinauchenius",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and skittish; tends to bolt rather than bite, but should not be handled",
        "native_region": "Guyana, Suriname, northern Brazil (tropical rainforest)",
        "adult_size": "5-6 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 82,
        "enclosure_size_sling": "3x3x5 inches",
        "enclosure_size_juvenile": "6x6x10 inches",
        "enclosure_size_adult": "10x10x16 inches",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Tapinauchenius gigas is the largest species in its genus and one of "
            "the most striking NW arboreals, displaying beautiful rust-orange and "
            "brown coloration with distinctly feathery leg setae. Like all "
            "Tapinauchenius, they lack urticating hairs — an unusual trait for a "
            "New World species — and instead rely on speed to escape threats. They "
            "are extremely fast and will bolt unpredictably during maintenance, "
            "making escape prevention critical. Use a deep catch cup and work "
            "slowly. Provide a tall arboreal enclosure with cork bark tubes or "
            "flats anchored high in the enclosure. They are prolific webbers. "
            "Lightly mist one side every 2-3 days; maintain a small ground-level "
            "water dish. They have an excellent feeding response and are rewarding "
            "animals for keepers stepping beyond the beginner NW arboreals. "
            "Their fast growth rate means they reach impressive adult size quickly."
        ),
        "image_url": None,
        "source_url": "https://beyondthetreat.com/tapinauchenius-gigas/",
    },

    {
        "scientific_name": "Homoeomma sp. 'Blue'",
        "scientific_name_lower": "homoeomma sp. 'blue'",
        "common_names": ["Blue Dwarf Tarantula", "Peru Blue Dwarf", "Homoeomma Blue"],
        "genus": "Homoeomma",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Docile and slow-moving; a good display species despite small size",
        "native_region": "Peru (undescribed species — trade name)",
        "adult_size": "3-4 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 78,
        "humidity_min": 55,
        "humidity_max": 70,
        "enclosure_size_sling": "1x1x1 inches",
        "enclosure_size_juvenile": "4x4x3 inches",
        "enclosure_size_adult": "8x6x5 inches",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber, vermiculite mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "small",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Homoeomma sp. 'Blue' is an undescribed Peruvian dwarf tarantula traded "
            "under the name 'Blue' for the iridescent blue sheen visible on mature "
            "specimens — particularly females, who display the coloration most "
            "prominently. Adults remain small at 3-4 inches, making them suitable "
            "for smaller enclosures. They are docile and relatively slow-moving, "
            "making maintenance straightforward. Prefer slightly cooler, drier "
            "conditions than tropical NW species — avoid high humidity. Provide "
            "substrate for burrowing and a small water dish. Because this species "
            "is undescribed, the name 'Blue' is purely a trade designation. "
            "The Homoeomma genus is found across South America; care requirements "
            "are broadly similar across the genus. A good choice for keepers "
            "interested in dwarf species who want something calmer than Hapalopus."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/homoeomma-sp-blue-info.258184/",
    },

    # ── OW AFRICA ───────────────────────────────────────────────────────────────

    {
        "scientific_name": "Ceratogyrus brachycephalus",
        "scientific_name_lower": "ceratogyrus brachycephalus",
        "common_names": ["Short-horned Baboon Spider", "Straight-horned Baboon"],
        "genus": "Ceratogyrus",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Aggressive and very fast; will bite readily and without warning",
        "native_region": "Zimbabwe, Botswana (arid savanna)",
        "adult_size": "4-5 inches",
        "growth_rate": "moderate",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 84,
        "humidity_min": 45,
        "humidity_max": 60,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "10x8x6 inches",
        "substrate_depth": "5-6 inches",
        "substrate_type": "coco fiber, sand blend (firm and packable)",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Ceratogyrus brachycephalus is one of several 'horned baboon' tarantulas "
            "from southern Africa, distinguished by a smaller, straighter horn "
            "(a foveal protuberance on the carapace) compared to C. darlingi. "
            "The function of the horn is not definitively understood. Like all "
            "Ceratogyrus, they are deep burrowers from arid habitats — keep "
            "substrate dry with periodic deep watering (pour water in one corner "
            "to create a moisture gradient at depth). Avoid misting the surface. "
            "As an Old World species with no urticating hairs, a bite is the only "
            "defense — and they use it readily. Exercise extreme caution during "
            "maintenance; always use long tongs. Venom is medically significant. "
            "Provide ample substrate depth and a starter burrow. They may rarely "
            "be seen above ground. A challenging but rewarding species for "
            "experienced keepers interested in African baboon tarantulas."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/ceratogyrus-brachycephalus-care.312048/",
    },

    # ── OW ASIA ─────────────────────────────────────────────────────────────────

    {
        "scientific_name": "Poecilotheria hanumavilasumica",
        "scientific_name_lower": "poecilotheria hanumavilasumica",
        "common_names": ["Rameshwaram Ornamental Tarantula", "Rameshwaram Parachute Spider"],
        "genus": "Poecilotheria",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely fast and defensive; potent venom, strictly not for handling",
        "native_region": "India — restricted to Rameshwaram Island, Tamil Nadu (critically endangered)",
        "adult_size": "6-7 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 75,
        "temperature_max": 84,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x6 inches",
        "enclosure_size_juvenile": "8x8x12 inches",
        "enclosure_size_adult": "12x10x16 inches",
        "substrate_depth": "3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Poecilotheria hanumavilasumica is one of the rarest Poecilotheria in "
            "captivity, known only from a tiny area around Rameshwaram Island in "
            "Tamil Nadu, India — it is classified as Critically Endangered by the IUCN "
            "and listed on CITES Appendix II. Only captive-bred specimens should ever "
            "be acquired, and records of provenance should be maintained by keepers. "
            "They display attractive grey and yellow patterning similar to other "
            "Poecilotheria species. Care follows the standard Poecilotheria protocol: "
            "tall arboreal enclosure with flat cork bark retreats, light misting "
            "every 2-3 days with strong cross-ventilation, and a ground-level water "
            "dish. As with all Poecilotheria, the venom is medically significant — "
            "documented bites have caused severe systemic symptoms. Approach with "
            "the same extreme caution as P. ornata or P. metallica. Keeping this "
            "species is a conservation responsibility; maintaining breeding records "
            "is strongly encouraged."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/poecilotheria-hanumavilasumica-care.309018/",
    },

]

# ── Insert ─────────────────────────────────────────────────────────────────────
added = 0
skipped = 0

for data in species_data:
    exists = db.query(Species).filter(
        Species.scientific_name_lower == data["scientific_name_lower"]
    ).first()

    if exists:
        print(f"  Skipped (exists): {data['scientific_name']}")
        skipped += 1
        continue

    species = Species(
        id=str(uuid.uuid4()),
        **data,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(species)
    print(f"  Added: {data['scientific_name']}")
    added += 1

db.commit()
new_total = db.query(Species).count()
print(f"\nDone! Added {added}, skipped {skipped} (already existed).")
print(f"New total: {new_total} species")
db.close()
