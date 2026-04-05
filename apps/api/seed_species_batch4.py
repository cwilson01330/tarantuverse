"""
Seed script - Batch 4: Species to reach ~100 total (verified care data)
Run from apps/api directory: python3 seed_species_batch4.py
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
        "scientific_name": "Brachypelma boehmei",
        "scientific_name_lower": "brachypelma boehmei",
        "common_names": ["Mexican Fire Leg", "Mexican Fireleg Tarantula"],
        "genus": "Brachypelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Defensive and skittish; readily kicks urticating hairs when threatened",
        "native_region": "Guerrero, Mexico (Pacific coast dry forest)",
        "adult_size": "5.5 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 70,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Brachypelma boehmei is one of the most striking Brachypelma species, "
            "with vivid orange legs contrasting against a black body. They are a "
            "slow-growing, long-lived species (20+ years for females) native to the dry "
            "forests of Guerrero, Mexico. Despite being considered beginner-friendly, "
            "they are noticeably more defensive than B. hamorii and will readily kick "
            "urticating hairs (Type III) as their primary defense — handle with care and "
            "avoid housing near your face. Provide a dry substrate with a lightly misted "
            "corner for a moisture gradient. A hide is appreciated. Feed pre-killed or "
            "live prey every 10-14 days for adults. Like all Brachypelma, they are "
            "CITES Appendix II listed; ensure your specimen is captive bred."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2016/02/13/brachypelma-boehmei-care-sheet/",
    },

    {
        "scientific_name": "Brachypelma emilia",
        "scientific_name_lower": "brachypelma emilia",
        "common_names": ["Mexican Red Leg", "Mexican Red-Legged Tarantula"],
        "genus": "Brachypelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Generally calm and tolerant; occasional hair-kicking when stressed",
        "native_region": "Western Mexico (Jalisco, Nayarit, Sinaloa)",
        "adult_size": "5.5 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 80,
        "humidity_min": 50,
        "humidity_max": 65,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Brachypelma emilia is one of the most beautiful and sought-after Brachypelma "
            "species, distinguished by its striking black carapace with a triangular orange "
            "patch and vivid red-orange legs. Females are exceptionally long-lived (30+ years "
            "has been documented). They are among the more docile Brachypelma and are often "
            "recommended as a first tarantula, though handling should be minimized as they "
            "will kick urticating hairs when stressed. Keep the substrate mostly dry with a "
            "lightly moistened corner. A hide is recommended. Feed adults every 10-14 days. "
            "CITES Appendix II listed — only purchase captive-bred specimens."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/01/25/brachypelma-emilia-care-guide/",
    },

    {
        "scientific_name": "Grammostola rosea",
        "scientific_name_lower": "grammostola rosea",
        "common_names": ["Chilean Rose Hair Tarantula", "Rose Hair", "Chilean Fire Tarantula"],
        "genus": "Grammostola",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Very docile and calm; one of the most handleable species, but notorious for long fasting periods",
        "native_region": "Chile, Bolivia, Argentina (dry scrubland)",
        "adult_size": "5-6 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 65,
        "temperature_max": 75,
        "humidity_min": 40,
        "humidity_max": 55,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x6 inches",
        "substrate_depth": "3 inches",
        "substrate_type": "coco fiber or dry topsoil",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "every 7-10 days",
        "feeding_frequency_adult": "every 14-21 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Grammostola rosea is one of the most iconic beginner tarantulas, known for its "
            "gentle disposition and pink-hued coloration. However, it has a well-documented "
            "reputation for extended fasting periods — adults may refuse food for 6-18 months "
            "or more while appearing perfectly healthy. This is completely normal and keepers "
            "should not attempt to force-feed or alter husbandry drastically during fasts. "
            "Always keep a fresh water dish available. Prefer cooler, drier conditions than "
            "most tarantulas. Avoid misting — this species is prone to stress from high "
            "humidity. Use a deep, dry substrate with one moistened corner. They are "
            "long-lived (20+ years for females) and grow very slowly. Note: Grammostola "
            "porteri (a closely related species from Chile) was historically sold under the "
            "name G. rosea; the two look nearly identical in the hobby."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/07/06/grammostola-rosea-care-guide/",
    },

    {
        "scientific_name": "Nhandu tripepii",
        "scientific_name_lower": "nhandu tripepii",
        "common_names": ["Brazilian Blue Tarantula", "Brazilian Brown"],
        "genus": "Nhandu",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Defensive and prone to threat displays; an aggressive kicker of urticating hairs",
        "native_region": "Brazil (Mato Grosso, Mato Grosso do Sul)",
        "adult_size": "8-9 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 75,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "8x8x5 inches",
        "enclosure_size_adult": "18x12x8 inches",
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
            "Nhandu tripepii is a large, impressive Brazilian terrestrial with a striking "
            "blue-black coloration on its abdomen contrasting with brown-orange leg setae. "
            "This is one of the larger Nhandu species and is known for a bold, defensive "
            "temperament — they are quick to assume a threat posture and will vigorously "
            "kick urticating hairs. Not a species for handling. Provide a spacious enclosure "
            "with ample burrowing substrate. Keep humidity moderate with a water dish always "
            "present. They have a good feeding response and will readily accept large prey "
            "items. Despite the defensive temperament, they are hardy and rewarding display "
            "animals."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/nhandu-tripepii-care-sheet.289003/",
    },

    # ── NW DWARF ────────────────────────────────────────────────────────────────

    {
        "scientific_name": "Hapalopus sp. 'Colombia Small'",
        "scientific_name_lower": "hapalopus sp. 'colombia small'",
        "common_names": ["Pumpkin Patch Tarantula (Small Form)", "Pumpkin Patch Small"],
        "genus": "Hapalopus",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast, skittish, and prone to bolting; not a handling species",
        "native_region": "Colombia (undescribed species, trade name)",
        "adult_size": "1.5-2 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 82,
        "humidity_min": 65,
        "humidity_max": 80,
        "enclosure_size_sling": "1x1x1 inches",
        "enclosure_size_juvenile": "3x3x3 inches",
        "enclosure_size_adult": "6x6x4 inches",
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber, peat moss mix",
        "feeding_frequency_sling": "3x per week",
        "feeding_frequency_juvenile": "2x per week",
        "feeding_frequency_adult": "every 4-5 days",
        "prey_size": "small",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Hapalopus sp. 'Colombia Small' is the smaller of the two undescribed 'Pumpkin "
            "Patch' forms traded in the hobby (the other being 'Colombia Large'). Adults "
            "max out around 1.5-2 inches, making them one of the smallest tarantulas "
            "commonly kept. Despite their tiny size, they are voracious feeders with a "
            "fast metabolism and need more frequent meals than larger species. Their "
            "orange-and-black patterning is stunning. They are prolific webbers and will "
            "create elaborate funnel webs in the enclosure. Keep substrate slightly moist "
            "and maintain a small water dish — a bottle cap works well. They are fast and "
            "defensive; use care when maintaining their enclosure. Note: this species has "
            "not been formally described and 'Colombia Small' is a trade name."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/09/06/hapalopus-sp-colombia-care-guide/",
    },

    # ── NW ARBOREAL ─────────────────────────────────────────────────────────────

    {
        "scientific_name": "Avicularia avicularia",
        "scientific_name_lower": "avicularia avicularia",
        "common_names": ["Common Pink Toe", "Guyana Pink Toe", "South American Pink Toe"],
        "genus": "Avicularia",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Docile and curious; rarely defensive, may flick waste when threatened",
        "native_region": "South America — widespread from Trinidad through Venezuela, Brazil, Guyana",
        "adult_size": "5-6 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 75,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x5 inches (height priority)",
        "enclosure_size_juvenile": "6x6x10 inches",
        "enclosure_size_adult": "12x12x16 inches",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Avicularia avicularia is the quintessential beginner arboreal tarantula and "
            "one of the most widely kept species in the hobby. They are known for their "
            "gentle nature, striking velvet-black body with pink toe pads, and entertaining "
            "behavior. Like all Avicularia, CROSS-VENTILATION is critical — stagnant, "
            "humid air causes rapid respiratory infections and death. Use enclosures with "
            "ventilation on multiple sides (cross-flow), not just a lid. Provide a vertical "
            "cork bark tube or hollow branch near the top of the enclosure for a retreat. "
            "Lightly mist one side of the enclosure every 2-3 days, leaving the other side "
            "dry. A water dish in the substrate is important for humidity regulation. "
            "They are fast as slings but calm as adults. Avicularia taxonomy has been "
            "revised extensively — ensure your specimen is correctly identified."
        ),
        "image_url": None,
        "source_url": "https://fearnottarantulas.com/blogs/care-sheets/avicularia-avicularia",
    },

    {
        "scientific_name": "Ybyrapora diversipes",
        "scientific_name_lower": "ybyrapora diversipes",
        "common_names": ["Amazon Sapphire Pink Toe", "Amazon Sapphire"],
        "genus": "Ybyrapora",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Faster and more skittish than Avicularia; prone to bolting when disturbed",
        "native_region": "Brazil (Amazon basin)",
        "adult_size": "4-5 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x5 inches (height priority)",
        "enclosure_size_juvenile": "6x6x10 inches",
        "enclosure_size_adult": "10x10x14 inches",
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Ybyrapora diversipes is a stunning arboreal species that was formerly placed "
            "in Avicularia before the 2017 genus revision. It features vivid iridescent "
            "blue-green coloration on the abdomen that becomes more prominent with each "
            "molt. Like Avicularia, cross-ventilation is non-negotiable — still, stagnant "
            "air causes fatal respiratory infections. Compared to A. avicularia, they are "
            "noticeably faster and more flighty, making maintenance more challenging. "
            "Provide vertical cork bark or hollow tubes high in the enclosure. Lightly mist "
            "one wall every 2-3 days and keep a small water dish in the substrate. The "
            "genus Ybyrapora currently contains three described species (diversipes, "
            "gamba, sooretama) — care requirements are very similar across the genus."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2017/11/05/ybyrapora-diversipes-care/",
    },

    {
        "scientific_name": "Pachistopelma rufonigrum",
        "scientific_name_lower": "pachistopelma rufonigrum",
        "common_names": ["Brazilian Bromeliad Tarantula", "Red-Black Tarantula"],
        "genus": "Pachistopelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Docile but fast; seldom defensive, an interesting display species",
        "native_region": "Northeastern Brazil (Pernambuco, Bahia — Atlantic Forest)",
        "adult_size": "3-4 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_sling": "2x2x4 inches",
        "enclosure_size_juvenile": "5x5x8 inches",
        "enclosure_size_adult": "8x8x12 inches",
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber, sphagnum moss",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 5-7 days",
        "prey_size": "small",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Pachistopelma rufonigrum is a small, attractive arboreal from Brazil's "
            "Atlantic Forest with a distinctive rust-red and black coloration. In the wild "
            "they are bromelicolous — living inside bromeliad leaf axils — so they "
            "appreciate an enclosure with tight, secure retreat spaces rather than open "
            "tubes. They require higher humidity than most arboreals (~80%) with excellent "
            "cross-ventilation to prevent stagnant air. Mist lightly every 1-2 days. "
            "They are a rare and under-kept species but relatively docile by arboreal "
            "standards. The genus Pachistopelma contains only a handful of described "
            "species, all restricted to Brazil. Not commonly available — seek captive-bred "
            "specimens from reputable breeders."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/pachistopelma-rufonigrum-care.224019/",
    },

    {
        "scientific_name": "Iridopelma hirsutum",
        "scientific_name_lower": "iridopelma hirsutum",
        "common_names": ["Brazilian Arboreal Tarantula", "Hirsutum Arboreal"],
        "genus": "Iridopelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and somewhat defensive; calmer than many other NW arboreals",
        "native_region": "Brazil (Pará, Amazon region)",
        "adult_size": "4-5 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 75,
        "temperature_max": 83,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x5 inches",
        "enclosure_size_juvenile": "6x6x10 inches",
        "enclosure_size_adult": "10x10x14 inches",
        "substrate_depth": "2 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "moderate to heavy",
        "burrowing": False,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Iridopelma hirsutum is a Brazilian arboreal with subtle iridescent coloration "
            "and heavy setae (hence 'hirsutum' — hairy). Like all NW arboreals, cross-"
            "ventilation is critical. They web extensively and will construct funnel-like "
            "retreats near anchor points in the upper portion of the enclosure. Provide "
            "cork bark or wood as climbing and anchoring structures. Mist lightly every "
            "2-3 days with a small water dish available. They are a good intermediate "
            "arboreal for keepers looking to expand beyond Avicularia. The genus Iridopelma "
            "has undergone taxonomic revision in recent years; care requirements are broadly "
            "consistent across the genus."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/iridopelma-hirsutum-care.305172/",
    },

    # ── OW AFRICA ───────────────────────────────────────────────────────────────

    {
        "scientific_name": "Harpactira pulchripes",
        "scientific_name_lower": "harpactira pulchripes",
        "common_names": ["Golden Blue Leg Baboon", "Gold Blue-Legged Baboon Spider"],
        "genus": "Harpactira",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Defensive and fast; will bite readily — not a handling species",
        "native_region": "South Africa (Eastern Cape, KwaZulu-Natal)",
        "adult_size": "4-5 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 50,
        "humidity_max": 70,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "10x8x6 inches",
        "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, topsoil mix",
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
            "Harpactira pulchripes is one of the most beautiful tarantulas in the hobby, "
            "with a striking golden carapace and brilliant blue-violet leg coloration. "
            "It is a slow-growing Old World species from South Africa and commands high "
            "prices due to its rarity in captive collections. As an OW species, it has "
            "no urticating hairs but possesses potent venom — bites require immediate "
            "medical attention. They are secretive burrowers who benefit from deep "
            "substrate and a starter burrow. Keep the substrate mostly dry with a "
            "lightly moistened deep layer and maintain a small water dish. Their slow "
            "growth rate means slings are especially valuable; avoid overfeeding. "
            "Breeding projects are becoming more common, making CB specimens increasingly "
            "available — always purchase captive bred."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2016/08/13/harpactira-pulchripes-care/",
    },

    {
        "scientific_name": "Pelinobius muticus",
        "scientific_name_lower": "pelinobius muticus",
        "common_names": ["King Baboon Tarantula", "King Baboon Spider"],
        "genus": "Pelinobius",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely aggressive and defensive; notorious for stridulating (hissing) and biting readily",
        "native_region": "East Africa (Kenya, Tanzania — semi-arid savanna)",
        "adult_size": "7-8 inches",
        "growth_rate": "slow",
        "type": "fossorial",
        "temperature_min": 78,
        "temperature_max": 86,
        "humidity_min": 55,
        "humidity_max": 70,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "8x8x5 inches",
        "enclosure_size_adult": "18x12x10 inches",
        "substrate_depth": "8-10 inches",
        "substrate_type": "dense clay-mix topsoil, coco fiber blend",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Pelinobius muticus is the only species in its genus and one of the largest "
            "African tarantulas — a massive, impressive animal that is strictly for "
            "experienced keepers. They are legendary for their aggressive temperament; "
            "they stridulate (produce a hissing/rasping sound by rubbing body parts) "
            "as a threat display and will pursue perceived threats rather than retreat. "
            "Bites are rare but can cause severe effects requiring hospitalization. "
            "As a deep fossorial, provide a minimum of 8 inches of dense, packable "
            "substrate (a clay-heavy mix works well as they construct elaborate burrow "
            "systems). They may rarely be seen above ground. Prefer warmer, drier "
            "conditions than many OW species. Feed large prey every 7-10 days when "
            "young; adults may slow their feeding rate significantly. Despite their "
            "temperament, they are magnificent display animals for advanced keepers."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2017/04/15/pelinobius-muticus-care-guide/",
    },

    {
        "scientific_name": "Stromatopelma calceatum",
        "scientific_name_lower": "stromatopelma calceatum",
        "common_names": ["Feather Leg Baboon", "West African Feather Leg Baboon"],
        "genus": "Stromatopelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely fast and defensive; among the most dangerous tarantulas to work with",
        "native_region": "West Africa (Ghana, Togo, Nigeria, Cameroon — tropical rainforest)",
        "adult_size": "5-6 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 76,
        "temperature_max": 84,
        "humidity_min": 70,
        "humidity_max": 80,
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
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Stromatopelma calceatum is widely considered one of the most challenging "
            "tarantulas to keep, not because of care difficulty but because of its "
            "extreme speed and potent venom. They are perhaps the fastest tarantula "
            "in the hobby and will not hesitate to bite. Even experienced keepers "
            "approach them with great caution; always use 12+ inch tongs and a catch "
            "cup for any maintenance. Bites cause severe, debilitating pain and require "
            "immediate medical attention. Despite this, they are spectacular display "
            "animals — active, heavily webbing, and strikingly patterned. As an arboreal, "
            "provide height, cross-ventilation, cork bark tubes near the top of the "
            "enclosure, and light misting every 2-3 days with a ground-level water dish. "
            "Strictly for experienced Old World keepers who understand the risks."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2016/05/14/stromatopelma-calceatum-care/",
    },

    {
        "scientific_name": "Heteroscodra maculata",
        "scientific_name_lower": "heteroscodra maculata",
        "common_names": ["Togo Starburst Baboon", "Ornamental Baboon Tarantula"],
        "genus": "Heteroscodra",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely fast and defensive; unpredictable and prone to biting without warning",
        "native_region": "West Africa (Togo, Ghana, Cameroon — tropical forest)",
        "adult_size": "4-5 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 76,
        "temperature_max": 86,
        "humidity_min": 65,
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
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Heteroscodra maculata is a West African arboreal tarantula with beautiful "
            "starburst patterning on its abdomen. Like its close relative Stromatopelma "
            "calceatum, it is exceptionally fast and defensive, with potent venom capable "
            "of causing severe, prolonged pain and systemic symptoms. Bites require "
            "medical attention. Their speed and unpredictable defensive behavior make "
            "them suitable only for experienced OW keepers. Provide an arboreal setup "
            "with height, cork bark anchors near the top, cross-ventilation, and light "
            "misting every 2-3 days. They are prolific webbers who will fill their "
            "enclosure with silk. A ground-level water dish helps maintain humidity. "
            "Despite the challenge, they are rewarding display animals that are often "
            "visible in their enclosure."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2016/01/09/heteroscodra-maculata-care/",
    },

    # ── OW ASIA ─────────────────────────────────────────────────────────────────

    {
        "scientific_name": "Poecilotheria ornata",
        "scientific_name_lower": "poecilotheria ornata",
        "common_names": ["Fringed Ornamental", "Sri Lanka Ornamental"],
        "genus": "Poecilotheria",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely fast and defensive; one of the most challenging Poecilotheria",
        "native_region": "Sri Lanka (central highlands and lowlands)",
        "adult_size": "9-10 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 76,
        "temperature_max": 84,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x6 inches",
        "enclosure_size_juvenile": "8x8x14 inches",
        "enclosure_size_adult": "16x12x20 inches",
        "substrate_depth": "3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Poecilotheria ornata is the largest Poecilotheria species and one of the most "
            "stunning tarantulas in the hobby — females regularly reach 9-10 inches with "
            "brilliant yellow, black, and grey patterning on the underside of their legs. "
            "Like all Poecilotheria, they possess potent venom documented to cause severe "
            "systemic effects including muscle cramps, fever, and heart palpitations; "
            "hospitalization has been required in multiple documented bite cases. They are "
            "extremely fast and will bolt without warning. Provide a tall arboreal enclosure "
            "with wide, flat cork bark for retreats. Lightly mist one side every 2-3 days; "
            "allow the other side to dry out. All Poecilotheria species are CITES Appendix "
            "II listed — only purchase captive-bred specimens. The population is critically "
            "threatened in the wild due to habitat loss and collection."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/10/18/poecilotheria-ornata-care-guide/",
    },

    {
        "scientific_name": "Poecilotheria regalis",
        "scientific_name_lower": "poecilotheria regalis",
        "common_names": ["Indian Ornamental Tarantula", "Indian Ornamental"],
        "genus": "Poecilotheria",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Fast and defensive; calmer than some Poecilotheria but still unpredictable",
        "native_region": "India (Eastern Ghats — Andhra Pradesh, Tamil Nadu)",
        "adult_size": "7-8 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 65,
        "humidity_max": 80,
        "enclosure_size_sling": "3x3x6 inches",
        "enclosure_size_juvenile": "8x8x12 inches",
        "enclosure_size_adult": "14x10x18 inches",
        "substrate_depth": "3 inches",
        "substrate_type": "coco fiber",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Poecilotheria regalis is often considered the 'entry point' Poecilotheria — "
            "while still fast and capable of a medically significant bite, they are "
            "regarded as slightly less explosive than P. ornata or P. metallica. This "
            "makes them the most commonly recommended Poecilotheria for keepers stepping "
            "into OW arboreals. They grow quickly and become impressive display animals "
            "with striking geometric patterning. Provide a tall enclosure with flat cork "
            "bark as a retreat. Lightly mist one wall every 2-3 days; ensure strong "
            "cross-ventilation. A water dish is important. Their venom can cause severe "
            "systemic effects — never work with them without extreme care. CITES Appendix "
            "II listed; always purchase captive bred."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/04/05/poecilotheria-regalis-care-guide/",
    },

    {
        "scientific_name": "Cyriopagopus lividus",
        "scientific_name_lower": "cyriopagopus lividus",
        "common_names": ["Cobalt Blue Tarantula", "Thai Blue Tarantula"],
        "genus": "Cyriopagopus",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Extremely defensive and fast; a notorious biter that is almost never seen",
        "native_region": "Thailand, Myanmar (tropical rainforest)",
        "adult_size": "5-6 inches",
        "growth_rate": "moderate",
        "type": "fossorial",
        "temperature_min": 78,
        "temperature_max": 88,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "12x8x8 inches",
        "substrate_depth": "6-8 inches",
        "substrate_type": "coco fiber, peat moss blend (holds tunnels)",
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
            "Cyriopagopus lividus (formerly Haplopelma lividum) is one of the most "
            "coveted tarantulas in the hobby for its stunning cobalt blue coloration — "
            "and also one of the most challenging to keep. They are deep, obligate "
            "burrowers who will spend virtually all of their time underground; do not "
            "expect to see this spider often. Provide 6-8 inches of moist, packable "
            "substrate (a peat-coco blend holds tunnel structure well). Keep the "
            "substrate consistently moist throughout — unlike many OW species, they "
            "prefer humid conditions matching their tropical forest habitat. They are "
            "notorious for explosive defensive behavior and will bite rapidly and "
            "without warning. Venom is medically significant. The cobalt blue coloration "
            "fades significantly in preservation and is best appreciated on living "
            "specimens. An impressive but demanding species strictly for advanced keepers."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2014/11/29/haplopelma-lividum-care-guide/",
    },

    {
        "scientific_name": "Selenocosmia crassipes",
        "scientific_name_lower": "selenocosmia crassipes",
        "common_names": ["Queensland Whistling Tarantula", "Barking Spider", "Australian Whistling Tarantula"],
        "genus": "Selenocosmia",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Highly defensive; stridulates loudly when threatened; fast and prone to biting",
        "native_region": "Queensland, Australia (semi-arid woodland and grassland)",
        "adult_size": "6-7 inches",
        "growth_rate": "slow",
        "type": "fossorial",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 50,
        "humidity_max": 65,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "8x8x5 inches",
        "enclosure_size_adult": "14x10x8 inches",
        "substrate_depth": "6-8 inches",
        "substrate_type": "red sandy clay, coco fiber blend",
        "feeding_frequency_sling": "weekly",
        "feeding_frequency_juvenile": "every 7-10 days",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "large",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Selenocosmia crassipes is Australia's largest tarantula and the source of "
            "the common name 'whistling spider' or 'barking spider' — they produce a "
            "clearly audible stridulation (rubbing of chelicerae against fangs) as a "
            "threat display. They are deep burrowers in semi-arid Queensland habitats. "
            "In captivity, provide 6-8 inches of firm, packable substrate — a blend "
            "of red sandy clay and coco fiber mimics their native soil and holds tunnel "
            "structure well. Keep conditions drier than most tarantulas with periodic "
            "deep watering to maintain moisture at the substrate base. Venom is "
            "documented to cause significant pain, nausea, and in some cases severe "
            "systemic symptoms. They are rarely available outside of Australia (strict "
            "export laws); most specimens in captivity outside AU are zoo animals. "
            "If encountered, ensure legal provenance before acquiring."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/selenocosmia-crassipes-care.302718/",
    },

    {
        "scientific_name": "Poecilotheria subfusca",
        "scientific_name_lower": "poecilotheria subfusca",
        "common_names": ["Ivory Ornamental Tarantula", "Highland Ornamental"],
        "genus": "Poecilotheria",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Fast and highly defensive; more flighty than other Poecilotheria",
        "native_region": "Sri Lanka (central highlands — cloud forest, above 5,000 ft)",
        "adult_size": "6-7 inches",
        "growth_rate": "moderate",
        "type": "arboreal",
        "temperature_min": 68,
        "temperature_max": 78,
        "humidity_min": 75,
        "humidity_max": 85,
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
            "Poecilotheria subfusca is a highland species from the cloud forests of "
            "central Sri Lanka at elevations above 5,000 feet — making it one of the "
            "more temperature-sensitive Poecilotheria. It prefers cooler, more humid "
            "conditions than most of its relatives; temperatures consistently above "
            "78-80°F are stressful and can be harmful long-term. This makes it a more "
            "challenging species to maintain correctly in warm climates without climate "
            "control. Provide a tall arboreal enclosure with flat cork bark retreats, "
            "frequent misting (every 1-2 days) with good cross-ventilation, and a water "
            "dish. Their ivory and grey patterning is more muted than flashier Poecilotheria "
            "but their highland origin makes them a unique challenge. As with all "
            "Poecilotheria: medically significant venom, extreme caution required, and "
            "CITES Appendix II listed — captive bred only."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2015/08/08/poecilotheria-subfusca-care/",
    },

    {
        "scientific_name": "Haplopelma vonwirthi",
        "scientific_name_lower": "haplopelma vonwirthi",
        "common_names": ["Burmese Chocolate Brown Tarantula", "Von Wirth's Earth Tiger"],
        "genus": "Haplopelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.ADVANCED,
        "temperament": "Aggressive and defensive; fast and prone to biting with little warning",
        "native_region": "Myanmar (tropical rainforest — lowland and mid-elevation)",
        "adult_size": "5-6 inches",
        "growth_rate": "moderate",
        "type": "fossorial",
        "temperature_min": 78,
        "temperature_max": 86,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "6x6x4 inches",
        "enclosure_size_adult": "10x8x8 inches",
        "substrate_depth": "6-8 inches",
        "substrate_type": "peat moss, coco fiber blend (moisture-retaining)",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 10-14 days",
        "prey_size": "medium",
        "water_dish_required": True,
        "webbing_amount": "minimal",
        "burrowing": True,
        "urticating_hairs": False,
        "medically_significant_venom": True,
        "is_verified": True,
        "care_guide": (
            "Haplopelma vonwirthi is an Asian fossorial from Myanmar's tropical forests. "
            "Like other Haplopelma, they are deep obligate burrowers rarely seen above "
            "ground. Provide 6-8 inches of moist, packable substrate throughout. Unlike "
            "arid OW species, this genus requires consistently humid substrate — keep "
            "it damp but not saturated. They are extremely defensive and will bite "
            "rapidly; always use long tongs and a catch cup for maintenance. Venom is "
            "medically significant. They are rarely available in the hobby; ensure "
            "specimens are legally sourced and captive bred when possible. Care is "
            "broadly similar to C. lividus."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/haplopelma-vonwirthi.315222/",
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
