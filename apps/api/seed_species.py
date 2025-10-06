"""
Seed script to populate species database with common tarantula species
Run with: python3 seed_species.py
"""
import asyncio
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.species import Species, CareLevel

# Common beginner-friendly species
SPECIES_DATA = [
    {
        "scientific_name": "Grammostola rosea",
        "scientific_name_lower": "grammostola rosea",
        "common_names": ["Chilean Rose Hair", "Rose Hair Tarantula"],
        "genus": "Grammostola",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "docile",
        "native_region": "Chile, Bolivia, Argentina",
        "adult_size": "5-6 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 65,
        "temperature_max": 80,
        "humidity_min": 60,
        "humidity_max": 70,
        "enclosure_size_sling": "Small vial or 2x2x3\"",
        "enclosure_size_juvenile": "5x5x5\" or similar",
        "enclosure_size_adult": "10x10x10\" or 5-10 gallon tank",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber, peat moss, or potting soil",
        "prey_size": "Appropriately sized prey (1/2 to 2/3 body length)",
        "feeding_frequency_sling": "Every 2-3 days",
        "feeding_frequency_juvenile": "Twice per week",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": False,
        "care_guide": "**Chilean Rose Hair** - One of the most popular pet tarantulas. Very hardy and forgiving of beginner mistakes. Can go months without eating (not uncommon). Very slow growth rate means slings take years to reach adult size. Generally docile but can be unpredictable.",
        "is_verified": True,
    },
    {
        "scientific_name": "Brachypelma hamorii",
        "scientific_name_lower": "brachypelma hamorii",
        "common_names": ["Mexican Red Knee", "Mexican Redknee Tarantula"],
        "genus": "Brachypelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "docile",
        "native_region": "Mexico",
        "adult_size": "5-6 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 85,
        "humidity_min": 60,
        "humidity_max": 70,
        "enclosure_size_adult": "10x10x10\" or 5-10 gallon tank",
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber or peat moss",
        "prey_size": "Appropriately sized crickets, roaches, or mealworms",
        "feeding_frequency_adult": "Once per week",
        "water_dish_required": True,
        "webbing_amount": "light",
        "burrowing": True,
        "care_guide": "**Mexican Red Knee** - Iconic species with beautiful red/orange markings. Very docile and easy to care for. Slow growing but worth the wait. Great display species. Threatened in the wild, most in the hobby are captive bred.",
        "is_verified": True,
    },
    {
        "scientific_name": "Aphonopelma chalcodes",
        "scientific_name_lower": "aphonopelma chalcodes",
        "common_names": ["Desert Blonde", "Arizona Blonde"],
        "genus": "Aphonopelma",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "docile",
        "native_region": "Southwestern United States, Mexico",
        "adult_size": "5-6 inches",
        "growth_rate": "slow",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 85,
        "humidity_min": 50,
        "humidity_max": 65,
        "substrate_depth": "3-4 inches",
        "substrate_type": "dry coco fiber or sand mix",
        "water_dish_required": True,
        "webbing_amount": "light",
        "burrowing": True,
        "care_guide": "**Desert Blonde** - Hardy desert species. Tolerates dry conditions well. Very docile and rarely flicks hairs. Slow growing but very low maintenance.",
        "is_verified": True,
    },
    {
        "scientific_name": "Caribena versicolor",
        "scientific_name_lower": "caribena versicolor",
        "common_names": ["Antilles Pinktoe", "Martinique Pinktoe"],
        "genus": "Caribena",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "docile, skittish",
        "native_region": "Martinique, Guadeloupe",
        "adult_size": "5-6 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "temperature_min": 75,
        "temperature_max": 85,
        "humidity_min": 75,
        "humidity_max": 85,
        "enclosure_size_adult": "12x12x18\" or similar vertical enclosure",
        "substrate_depth": "2-3 inches",
        "substrate_type": "coco fiber",
        "prey_size": "Appropriately sized flying insects preferred",
        "feeding_frequency_sling": "Every 2-3 days",
        "feeding_frequency_adult": "Once or twice per week",
        "water_dish_required": True,
        "webbing_amount": "heavy",
        "burrowing": False,
        "care_guide": "**Antilles Pinktoe** - Beautiful color changes from blue sling to pink/purple adult. Arboreal species that creates impressive webbing. Fast growing. Skittish but not aggressive. Requires higher humidity.",
        "is_verified": True,
    },
    {
        "scientific_name": "Tliltocatl albopilosus",
        "scientific_name_lower": "tliltocatl albopilosus",
        "common_names": ["Curly Hair Tarantula", "Honduran Curly Hair"],
        "genus": "Tliltocatl",
        "family": "Theraphosidae",
        "care_level": CareLevel.BEGINNER,
        "temperament": "docile",
        "native_region": "Central America",
        "adult_size": "5-6 inches",
        "growth_rate": "medium",
        "type": "terrestrial",
        "temperature_min": 70,
        "temperature_max": 80,
        "humidity_min": 65,
        "humidity_max": 75,
        "substrate_depth": "3-4 inches",
        "substrate_type": "coco fiber",
        "water_dish_required": True,
        "webbing_amount": "moderate",
        "burrowing": True,
        "care_guide": "**Curly Hair** - Named for distinctive curly setae. Very hardy and forgiving species. Good eater with medium growth rate. Great beginner tarantula.",
        "is_verified": True,
    },
]


def seed_species():
    """Seed the database with common species"""
    db = SessionLocal()

    try:
        print("Seeding species database...")

        for species_data in SPECIES_DATA:
            # Check if species already exists
            existing = db.query(Species).filter(
                Species.scientific_name_lower == species_data["scientific_name_lower"]
            ).first()

            if existing:
                print(f"  ⏭️  Skipping {species_data['scientific_name']} (already exists)")
                continue

            # Create new species
            species = Species(**species_data)
            db.add(species)
            print(f"  ✅ Added {species_data['scientific_name']}")

        db.commit()
        print(f"\n🎉 Successfully seeded {len(SPECIES_DATA)} species!")

    except Exception as e:
        print(f"\n❌ Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_species()
