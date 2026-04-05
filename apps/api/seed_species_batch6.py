"""
Seed script - Batch 6: Final push to 100 species
Run from apps/api directory: python3 seed_species_batch6.py
Skips any species already in the database by checking scientific_name_lower.
"""

import os
import sys
import uuid
from datetime import datetime, UTC

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

    {
        "scientific_name": "Tliltocatl kahlenbergi",
        "scientific_name_lower": "tliltocatl kahlenbergi",
        "common_names": ["Mexican Black Velvet Tarantula", "Kahlenberg's Tarantula"],
        "genus": "Tliltocatl",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Calm and slow-moving; less defensive than T. vagans, rarely kicks hairs",
        "native_region": "Mexico (Jalisco, Colima — dry Pacific slope forest)",
        "adult_size": "5-6 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 72,
        "temperature_max": 82,
        "humidity_min": 55,
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
            "Tliltocatl kahlenbergi (formerly Brachypelma kahlenbergi) is a striking "
            "all-black Mexican tarantula with deep velvet coloration and faint reddish "
            "highlights on the setae when viewed in direct light. It is one of the "
            "calmer Tliltocatl species and is rarely defensive compared to T. vagans, "
            "making it a good candidate for keepers who want a display-worthy dark "
            "species with beginner-friendly temperament. Grow slowly like all "
            "Mexican species. Provide a dry substrate with a slightly moist deep "
            "layer, a hide, and a constant water dish. Urticating hairs are present "
            "but rarely deployed. CITES Appendix II listed as with all Brachypelma/"
            "Tliltocatl — captive bred only."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/tliltocatl-kahlenbergi-care.322015/",
    },

    {
        "scientific_name": "Xenesthis intermedia",
        "scientific_name_lower": "xenesthis intermedia",
        "common_names": ["Purple Bloom Bird Eater", "Colombian Purple Bloom"],
        "genus": "Xenesthis",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Defensive and skittish; kicks urticating hairs readily; not for handling",
        "native_region": "Colombia, Venezuela (tropical rainforest)",
        "adult_size": "7-8 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 75,
        "temperature_max": 84,
        "humidity_min": 70,
        "humidity_max": 80,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "8x8x5 inches",
        "enclosure_size_adult": "16x12x8 inches",
        "substrate_depth": "4-5 inches",
        "substrate_type": "coco fiber, topsoil, peat moss blend",
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
            "Xenesthis intermedia is arguably the most visually stunning New World "
            "tarantula in the hobby, displaying brilliant iridescent purple-pink "
            "flashes across the abdomen and femurs when light hits at the right "
            "angle — a phenomenon caused by structural coloration in the setae. "
            "The effect is most pronounced on freshly molted adults and must be "
            "seen in person to be fully appreciated. They are closely related to "
            "X. immanis and share similar care requirements: tropical humidity, "
            "warm temperatures, moist substrate with good drainage, and a large "
            "water dish. They are defensive and will kick urticating hairs without "
            "much provocation — do not handle. Provide a spacious enclosure with "
            "ample substrate for burrowing and a hide. They are rewarding display "
            "animals whose coloration improves with each molt. Captive breeding "
            "is establishing, but they remain less common than X. immanis."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/xenesthis-intermedia-purple-bloom.295442/",
    },

    {
        "scientific_name": "Davus pentaloris",
        "scientific_name_lower": "davus pentaloris",
        "common_names": ["Guatemalan Tiger Rump", "Tiger Rump Tarantula"],
        "genus": "Davus",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "Skittish and fast; bolts readily but rarely bites; kicks urticating hairs",
        "native_region": "Guatemala, Mexico (Chiapas — tropical highland forest)",
        "adult_size": "3-4 inches",
        "growth_rate": "moderate",
        "type": "terrestrial",
        "temperature_min": 72,
        "temperature_max": 80,
        "humidity_min": 65,
        "humidity_max": 78,
        "enclosure_size_sling": "2x2x2 inches",
        "enclosure_size_juvenile": "5x5x4 inches",
        "enclosure_size_adult": "10x8x5 inches",
        "substrate_depth": "3 inches",
        "substrate_type": "coco fiber, topsoil mix",
        "feeding_frequency_sling": "2x per week",
        "feeding_frequency_juvenile": "weekly",
        "feeding_frequency_adult": "every 7-10 days",
        "prey_size": "small",
        "water_dish_required": True,
        "webbing_amount": "moderate to heavy",
        "burrowing": True,
        "urticating_hairs": True,
        "medically_significant_venom": False,
        "is_verified": True,
        "care_guide": (
            "Davus pentaloris (formerly Cyclosternum fasciatum) is a small, brilliantly "
            "patterned tarantula from Guatemala with vivid orange and black tiger-stripe "
            "banding on its abdomen — one of the most eye-catching patterns in the "
            "hobby on a species that stays under 4 inches. They are classified as "
            "beginner-friendly in terms of care requirements, though their speed and "
            "skittishness require a calm, patient approach during maintenance. "
            "They prefer slightly cooler, more humid conditions than many NW terrestrials, "
            "reflecting their highland forest origin. Keep the substrate moderately "
            "moist with a water dish always present. They are prolific webbers and "
            "will line their burrows and surrounding area with silk. A great species "
            "for keepers who want striking coloration in a smaller, manageable package."
        ),
        "image_url": None,
        "source_url": "https://tomsbigspiders.com/2016/09/03/cyclosternum-fasciatum-guatemalan-tiger-rump/",
    },

    {
        "scientific_name": "Phormictopus sp. 'Green'",
        "scientific_name_lower": "phormictopus sp. 'green'",
        "common_names": ["Cuban Green Tarantula", "Phormictopus Green"],
        "genus": "Phormictopus",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and defensive; more bold than P. cancerides; urticating hairs present",
        "native_region": "Cuba (undescribed species — trade name)",
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
            "Phormictopus sp. 'Green' is an undescribed Cuban species traded under "
            "the name 'Green' for the metallic green iridescence visible across its "
            "carapace and legs — particularly vivid on freshly molted specimens. "
            "Like P. auratus (the Cuban Gold), it grows quickly and reaches adult "
            "size in 3-4 years. It is noticeably more defensive than P. cancerides "
            "and will bolt or take a threat posture readily during maintenance — "
            "always use a catch cup and long tongs. Urticating hairs are present. "
            "Care is identical to other Cuban Phormictopus: moderate humidity, "
            "burrowing substrate, constant water dish, and regular feeding. Cuba's "
            "strict wildlife export laws mean all specimens in the hobby are captive "
            "bred — always verify provenance. An increasingly popular species as "
            "captive breeding projects mature."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/phormictopus-sp-green-care.318804/",
    },

    {
        "scientific_name": "Psalmopoeus ecclesiasticus",
        "scientific_name_lower": "psalmopoeus ecclesiasticus",
        "common_names": ["Ecuadorian Suntiger Tarantula", "Ecuador Suntiger"],
        "genus": "Psalmopoeus",
        "family": "Theraphosidae",
        "care_level": CareLevel.INTERMEDIATE,
        "temperament": "Fast and defensive; bites readily; no urticating hairs despite being New World",
        "native_region": "Ecuador, Colombia (tropical rainforest — western Andes slope)",
        "adult_size": "5-6 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 75,
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
            "Psalmopoeus ecclesiasticus is a striking arboreal from Ecuador with "
            "vivid orange and black patterning — among the most colorful in the "
            "genus. Like all Psalmopoeus, it lacks urticating hairs and defends "
            "itself entirely through speed and biting, earning the genus its "
            "'New World Old World' reputation. It is extremely fast and will "
            "strike without much warning, so approach all maintenance with care "
            "and always have a catch cup ready. Provide a tall arboreal enclosure "
            "with cork bark or hollow tube anchors near the top. Mist one wall "
            "lightly every 2-3 days and keep a ground-level water dish. They "
            "are prolific webbers who create elaborate retreats. Fast growth "
            "rate means slings reach adult size quickly. A rewarding species "
            "for intermediate keepers who appreciate the Psalmopoeus genus "
            "and want vivid coloration alongside the challenge."
        ),
        "image_url": None,
        "source_url": "https://arachnoboards.com/threads/psalmopoeus-ecclesiasticus-care.307193/",
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
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(species)
    print(f"  Added: {data['scientific_name']}")
    added += 1

db.commit()
new_total = db.query(Species).count()
print(f"\nDone! Added {added}, skipped {skipped} (already existed).")
print(f"New total: {new_total} species")
db.close()
