""""""

Seed popular tarantula species with comprehensive care dataSeed script to populate species database with common tarantula species

Run this script to populate the database with 13 popular speciesRun with: python3 seed_species.py

""""""

import sysimport asyncio

import osfrom sqlalchemy.orm import Session

from app.database import SessionLocal

# Add the app directory to the Python pathfrom app.models.species import Species, CareLevel

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Common beginner-friendly species

from sqlalchemy import Column, String, Text, Boolean, DateTime, Integer, Float, ForeignKeySPECIES_DATA = [

from sqlalchemy.dialects.postgresql import UUID, ARRAY    {

from sqlalchemy.sql import func        "scientific_name": "Grammostola rosea",

from app.database import SessionLocal, Base        "scientific_name_lower": "grammostola rosea",

import uuid        "common_names": ["Chilean Rose Hair", "Rose Hair Tarantula"],

        "genus": "Grammostola",

        "family": "Theraphosidae",

# Define minimal Species model to avoid circular imports        "care_level": CareLevel.BEGINNER,

class Species(Base):        "temperament": "docile",

    __tablename__ = "species"        "native_region": "Chile, Bolivia, Argentina",

        "adult_size": "5-6 inches",

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)        "growth_rate": "slow",

    scientific_name = Column(String(255), unique=True, nullable=False)        "type": "terrestrial",

    scientific_name_lower = Column(String(255), nullable=False)        "temperature_min": 65,

    genus = Column(String(100), nullable=False)        "temperature_max": 80,

    species = Column(String(100), nullable=False)        "humidity_min": 60,

    common_names = Column(ARRAY(String))        "humidity_max": 70,

    type = Column(String(50))        "enclosure_size_sling": "Small vial or 2x2x3\"",

    native_region = Column(String(255))        "enclosure_size_juvenile": "5x5x5\" or similar",

    habitat_description = Column(Text)        "enclosure_size_adult": "10x10x10\" or 5-10 gallon tank",

            "substrate_depth": "3-4 inches",

    # Care requirements        "substrate_type": "coco fiber, peat moss, or potting soil",

    care_level = Column(String(50))        "prey_size": "Appropriately sized prey (1/2 to 2/3 body length)",

    min_temperature = Column(Float)        "feeding_frequency_sling": "Every 2-3 days",

    max_temperature = Column(Float)        "feeding_frequency_juvenile": "Twice per week",

    min_humidity = Column(Float)        "feeding_frequency_adult": "Once per week",

    max_humidity = Column(Float)        "water_dish_required": True,

    substrate_type = Column(String(255))        "webbing_amount": "moderate",

    substrate_depth_cm = Column(Float)        "burrowing": False,

    enclosure_type = Column(String(100))        "care_guide": "**Chilean Rose Hair** - One of the most popular pet tarantulas. Very hardy and forgiving of beginner mistakes. Can go months without eating (not uncommon). Very slow growth rate means slings take years to reach adult size. Generally docile but can be unpredictable.",

            "is_verified": True,

    # Physical characteristics    },

    adult_size_cm = Column(Float)    {

    growth_rate = Column(String(50))        "scientific_name": "Brachypelma hamorii",

    lifespan_years_min = Column(Integer)        "scientific_name_lower": "brachypelma hamorii",

    lifespan_years_max = Column(Integer)        "common_names": ["Mexican Red Knee", "Mexican Redknee Tarantula"],

            "genus": "Brachypelma",

    # Behavior        "family": "Theraphosidae",

    temperament = Column(String(50))        "care_level": CareLevel.BEGINNER,

    urticating_hairs = Column(Boolean, default=True)        "temperament": "docile",

    defensive_behavior = Column(Text)        "native_region": "Mexico",

            "adult_size": "5-6 inches",

    # Feeding        "growth_rate": "slow",

    feeding_frequency_days = Column(Integer)        "type": "terrestrial",

    typical_diet = Column(Text)        "temperature_min": 70,

            "temperature_max": 85,

    # Breeding (optional)        "humidity_min": 60,

    breeding_difficulty = Column(String(50))        "humidity_max": 70,

    egg_sac_size = Column(Integer)        "enclosure_size_adult": "10x10x10\" or 5-10 gallon tank",

            "substrate_depth": "3-4 inches",

    # Community features        "substrate_type": "coco fiber or peat moss",

    is_verified = Column(Boolean, default=False)        "prey_size": "Appropriately sized crickets, roaches, or mealworms",

    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)        "feeding_frequency_adult": "Once per week",

    verification_notes = Column(Text)        "water_dish_required": True,

    times_kept = Column(Integer, default=0)        "webbing_amount": "light",

    average_rating = Column(Float, default=0.0)        "burrowing": True,

            "care_guide": "**Mexican Red Knee** - Iconic species with beautiful red/orange markings. Very docile and easy to care for. Slow growing but worth the wait. Great display species. Threatened in the wild, most in the hobby are captive bred.",

    created_at = Column(DateTime(timezone=True), server_default=func.now())        "is_verified": True,

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())    },

    {

        "scientific_name": "Aphonopelma chalcodes",

def seed_species():        "scientific_name_lower": "aphonopelma chalcodes",

    db = SessionLocal()        "common_names": ["Desert Blonde", "Arizona Blonde"],

            "genus": "Aphonopelma",

    try:        "family": "Theraphosidae",

        # Check if species already exist        "care_level": CareLevel.BEGINNER,

        existing = db.query(Species).count()        "temperament": "docile",

        if existing > 0:        "native_region": "Southwestern United States, Mexico",

            print(f"Species already exist ({existing} species found).")        "adult_size": "5-6 inches",

            response = input("Do you want to clear and re-seed? (yes/no): ")        "growth_rate": "slow",

            if response.lower() != 'yes':        "type": "terrestrial",

                print("Skipping seed.")        "temperature_min": 70,

                return        "temperature_max": 85,

            # Clear existing species        "humidity_min": 50,

            db.query(Species).delete()        "humidity_max": 65,

            db.commit()        "substrate_depth": "3-4 inches",

            print("✓ Cleared existing species")        "substrate_type": "dry coco fiber or sand mix",

                "water_dish_required": True,

        species_data = [        "webbing_amount": "light",

            # BEGINNER SPECIES (5)        "burrowing": True,

            {        "care_guide": "**Desert Blonde** - Hardy desert species. Tolerates dry conditions well. Very docile and rarely flicks hairs. Slow growing but very low maintenance.",

                "scientific_name": "Grammostola rosea",        "is_verified": True,

                "genus": "Grammostola",    },

                "species": "rosea",    {

                "common_names": ["Chilean Rose Hair", "Rose Hair Tarantula"],        "scientific_name": "Caribena versicolor",

                "type": "terrestrial",        "scientific_name_lower": "caribena versicolor",

                "native_region": "Chile",        "common_names": ["Antilles Pinktoe", "Martinique Pinktoe"],

                "habitat_description": "Arid scrublands and deserts. Found in burrows or under rocks.",        "genus": "Caribena",

                "care_level": "beginner",        "family": "Theraphosidae",

                "min_temperature": 21.0,        "care_level": CareLevel.BEGINNER,

                "max_temperature": 26.0,        "temperament": "docile, skittish",

                "min_humidity": 60.0,        "native_region": "Martinique, Guadeloupe",

                "max_humidity": 70.0,        "adult_size": "5-6 inches",

                "substrate_type": "Coconut fiber or peat moss",        "growth_rate": "fast",

                "substrate_depth_cm": 5.0,        "type": "arboreal",

                "enclosure_type": "Terrestrial",        "temperature_min": 75,

                "adult_size_cm": 14.0,        "temperature_max": 85,

                "growth_rate": "slow",        "humidity_min": 75,

                "lifespan_years_min": 15,        "humidity_max": 85,

                "lifespan_years_max": 20,        "enclosure_size_adult": "12x12x18\" or similar vertical enclosure",

                "temperament": "docile",        "substrate_depth": "2-3 inches",

                "urticating_hairs": True,        "substrate_type": "coco fiber",

                "defensive_behavior": "Very calm, rarely defensive. May kick hairs if threatened but bites are extremely rare.",        "prey_size": "Appropriately sized flying insects preferred",

                "feeding_frequency_days": 7,        "feeding_frequency_sling": "Every 2-3 days",

                "typical_diet": "Crickets, roaches, mealworms",        "feeding_frequency_adult": "Once or twice per week",

                "breeding_difficulty": "moderate",        "water_dish_required": True,

                "egg_sac_size": 500,        "webbing_amount": "heavy",

                "is_verified": True,        "burrowing": False,

                "times_kept": 15000,        "care_guide": "**Antilles Pinktoe** - Beautiful color changes from blue sling to pink/purple adult. Arboreal species that creates impressive webbing. Fast growing. Skittish but not aggressive. Requires higher humidity.",

                "average_rating": 4.8,        "is_verified": True,

            },    },

            {    {

                "scientific_name": "Brachypelma hamorii",        "scientific_name": "Tliltocatl albopilosus",

                "genus": "Brachypelma",        "scientific_name_lower": "tliltocatl albopilosus",

                "species": "hamorii",        "common_names": ["Curly Hair Tarantula", "Honduran Curly Hair"],

                "common_names": ["Mexican Red Knee"],        "genus": "Tliltocatl",

                "type": "terrestrial",        "family": "Theraphosidae",

                "native_region": "Mexico",        "care_level": CareLevel.BEGINNER,

                "habitat_description": "Semi-arid scrublands. Burrows under rocks.",        "temperament": "docile",

                "care_level": "beginner",        "native_region": "Central America",

                "min_temperature": 24.0,        "adult_size": "5-6 inches",

                "max_temperature": 28.0,        "growth_rate": "medium",

                "min_humidity": 65.0,        "type": "terrestrial",

                "max_humidity": 75.0,        "temperature_min": 70,

                "substrate_type": "Coconut fiber",        "temperature_max": 80,

                "substrate_depth_cm": 7.0,        "humidity_min": 65,

                "enclosure_type": "Terrestrial",        "humidity_max": 75,

                "adult_size_cm": 15.0,        "substrate_depth": "3-4 inches",

                "growth_rate": "slow",        "substrate_type": "coco fiber",

                "lifespan_years_min": 20,        "water_dish_required": True,

                "lifespan_years_max": 30,        "webbing_amount": "moderate",

                "temperament": "docile",        "burrowing": True,

                "urticating_hairs": True,        "care_guide": "**Curly Hair** - Named for distinctive curly setae. Very hardy and forgiving species. Good eater with medium growth rate. Great beginner tarantula.",

                "defensive_behavior": "Calm and predictable. Prefers to flick hairs rather than bite.",        "is_verified": True,

                "feeding_frequency_days": 7,    },

                "typical_diet": "Crickets, roaches",]

                "breeding_difficulty": "moderate",

                "egg_sac_size": 400,

                "is_verified": True,def seed_species():

                "times_kept": 20000,    """Seed the database with common species"""

                "average_rating": 4.9,    db = SessionLocal()

            },

            {    try:

                "scientific_name": "Brachypelma albopilosum",        print("Seeding species database...")

                "genus": "Brachypelma",

                "species": "albopilosum",        for species_data in SPECIES_DATA:

                "common_names": ["Curly Hair Tarantula"],            # Check if species already exists

                "type": "terrestrial",            existing = db.query(Species).filter(

                "native_region": "Honduras",                Species.scientific_name_lower == species_data["scientific_name_lower"]

                "habitat_description": "Tropical forests. Found in burrows.",            ).first()

                "care_level": "beginner",

                "min_temperature": 24.0,            if existing:

                "max_temperature": 28.0,                print(f"  ⏭️  Skipping {species_data['scientific_name']} (already exists)")

                "min_humidity": 70.0,                continue

                "max_humidity": 80.0,

                "substrate_type": "Coconut fiber",            # Create new species

                "substrate_depth_cm": 7.0,            species = Species(**species_data)

                "enclosure_type": "Terrestrial",            db.add(species)

                "adult_size_cm": 13.0,            print(f"  ✅ Added {species_data['scientific_name']}")

                "growth_rate": "slow",

                "lifespan_years_min": 8,        db.commit()

                "lifespan_years_max": 10,        print(f"\n🎉 Successfully seeded {len(SPECIES_DATA)} species!")

                "temperament": "docile",

                "urticating_hairs": True,    except Exception as e:

                "defensive_behavior": "Very calm and hardy. Great eater.",        print(f"\n❌ Error seeding database: {e}")

                "feeding_frequency_days": 5,        db.rollback()

                "typical_diet": "Crickets, roaches",    finally:

                "breeding_difficulty": "easy",        db.close()

                "egg_sac_size": 600,

                "is_verified": True,

                "times_kept": 12000,if __name__ == "__main__":

                "average_rating": 4.7,    seed_species()

            },
            {
                "scientific_name": "Aphonopelma chalcodes",
                "genus": "Aphonopelma",
                "species": "chalcodes",
                "common_names": ["Desert Blonde", "Arizona Blonde"],
                "type": "terrestrial",
                "native_region": "United States",
                "habitat_description": "Desert scrublands. Burrows in sandy soil.",
                "care_level": "beginner",
                "min_temperature": 21.0,
                "max_temperature": 29.0,
                "min_humidity": 50.0,
                "max_humidity": 60.0,
                "substrate_type": "Sand/coco fiber mix",
                "substrate_depth_cm": 10.0,
                "enclosure_type": "Terrestrial",
                "adult_size_cm": 13.0,
                "growth_rate": "slow",
                "lifespan_years_min": 20,
                "lifespan_years_max": 30,
                "temperament": "calm",
                "urticating_hairs": True,
                "defensive_behavior": "Very docile. Prefers to retreat.",
                "feeding_frequency_days": 7,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 300,
                "is_verified": True,
                "times_kept": 5000,
                "average_rating": 4.6,
            },
            {
                "scientific_name": "Grammostola pulchra",
                "genus": "Grammostola",
                "species": "pulchra",
                "common_names": ["Brazilian Black"],
                "type": "terrestrial",
                "native_region": "Brazil",
                "habitat_description": "Grasslands. Hides under rocks.",
                "care_level": "beginner",
                "min_temperature": 22.0,
                "max_temperature": 26.0,
                "min_humidity": 65.0,
                "max_humidity": 75.0,
                "substrate_type": "Coconut fiber",
                "substrate_depth_cm": 7.0,
                "enclosure_type": "Terrestrial",
                "adult_size_cm": 16.0,
                "growth_rate": "slow",
                "lifespan_years_min": 20,
                "lifespan_years_max": 30,
                "temperament": "docile",
                "urticating_hairs": True,
                "defensive_behavior": "Extremely calm. One of the best pet species.",
                "feeding_frequency_days": 7,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 400,
                "is_verified": True,
                "times_kept": 8000,
                "average_rating": 4.9,
            },

            # INTERMEDIATE SPECIES (5)
            {
                "scientific_name": "Avicularia avicularia",
                "genus": "Avicularia",
                "species": "avicularia",
                "common_names": ["Pink Toe Tarantula"],
                "type": "arboreal",
                "native_region": "South America",
                "habitat_description": "Tropical rainforests. Lives in trees.",
                "care_level": "intermediate",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 75.0,
                "max_humidity": 85.0,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth_cm": 5.0,
                "enclosure_type": "Arboreal (vertical)",
                "adult_size_cm": 13.0,
                "growth_rate": "medium",
                "lifespan_years_min": 8,
                "lifespan_years_max": 12,
                "temperament": "docile",
                "urticating_hairs": False,
                "defensive_behavior": "Skittish but not aggressive. May jump.",
                "feeding_frequency_days": 5,
                "typical_diet": "Flying insects, crickets",
                "breeding_difficulty": "easy",
                "egg_sac_size": 100,
                "is_verified": True,
                "times_kept": 10000,
                "average_rating": 4.5,
            },
            {
                "scientific_name": "Chromatopelma cyaneopubescens",
                "genus": "Chromatopelma",
                "species": "cyaneopubescens",
                "common_names": ["Green Bottle Blue", "GBB"],
                "type": "terrestrial",
                "native_region": "Venezuela",
                "habitat_description": "Arid scrublands. Creates extensive webbing.",
                "care_level": "intermediate",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 65.0,
                "max_humidity": 75.0,
                "substrate_type": "Dry coconut fiber",
                "substrate_depth_cm": 7.0,
                "enclosure_type": "Terrestrial with height",
                "adult_size_cm": 14.0,
                "growth_rate": "fast",
                "lifespan_years_min": 12,
                "lifespan_years_max": 14,
                "temperament": "skittish",
                "urticating_hairs": True,
                "defensive_behavior": "Fast and defensive. Not for handling.",
                "feeding_frequency_days": 5,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 100,
                "is_verified": True,
                "times_kept": 7000,
                "average_rating": 4.8,
            },
            {
                "scientific_name": "Tliltocatl albopilosus",
                "genus": "Tliltocatl",
                "species": "albopilosus",
                "common_names": ["Nicaraguan Curly Hair"],
                "type": "terrestrial",
                "native_region": "Nicaragua",
                "habitat_description": "Tropical forests. Ground dweller.",
                "care_level": "beginner",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 70.0,
                "max_humidity": 80.0,
                "substrate_type": "Coconut fiber",
                "substrate_depth_cm": 7.0,
                "enclosure_type": "Terrestrial",
                "adult_size_cm": 15.0,
                "growth_rate": "medium",
                "lifespan_years_min": 8,
                "lifespan_years_max": 10,
                "temperament": "docile",
                "urticating_hairs": True,
                "defensive_behavior": "Calm, good for beginners.",
                "feeding_frequency_days": 5,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "easy",
                "egg_sac_size": 500,
                "is_verified": True,
                "times_kept": 6000,
                "average_rating": 4.6,
            },
            {
                "scientific_name": "Lasiodora parahybana",
                "genus": "Lasiodora",
                "species": "parahybana",
                "common_names": ["Brazilian Salmon Pink", "LP"],
                "type": "terrestrial",
                "native_region": "Brazil",
                "habitat_description": "Forest floors. Opportunistic burrower.",
                "care_level": "intermediate",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 70.0,
                "max_humidity": 80.0,
                "substrate_type": "Coconut fiber",
                "substrate_depth_cm": 10.0,
                "enclosure_type": "Terrestrial (large)",
                "adult_size_cm": 23.0,
                "growth_rate": "very fast",
                "lifespan_years_min": 12,
                "lifespan_years_max": 15,
                "temperament": "calm",
                "urticating_hairs": True,
                "defensive_behavior": "Generally calm but can be defensive. Fast.",
                "feeding_frequency_days": 5,
                "typical_diet": "Large crickets, roaches",
                "breeding_difficulty": "easy",
                "egg_sac_size": 1200,
                "is_verified": True,
                "times_kept": 9000,
                "average_rating": 4.7,
            },
            {
                "scientific_name": "Nhandu chromatus",
                "genus": "Nhandu",
                "species": "chromatus",
                "common_names": ["Brazilian Red and White"],
                "type": "terrestrial",
                "native_region": "Brazil",
                "habitat_description": "Tropical forests. Opportunistic burrower.",
                "care_level": "intermediate",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 70.0,
                "max_humidity": 80.0,
                "substrate_type": "Coconut fiber",
                "substrate_depth_cm": 10.0,
                "enclosure_type": "Terrestrial",
                "adult_size_cm": 18.0,
                "growth_rate": "fast",
                "lifespan_years_min": 12,
                "lifespan_years_max": 15,
                "temperament": "defensive",
                "urticating_hairs": True,
                "defensive_behavior": "Can be defensive and fast. Flicks hairs readily.",
                "feeding_frequency_days": 5,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 800,
                "is_verified": True,
                "times_kept": 4000,
                "average_rating": 4.5,
            },

            # ADVANCED SPECIES (3)
            {
                "scientific_name": "Poecilotheria metallica",
                "genus": "Poecilotheria",
                "species": "metallica",
                "common_names": ["Gooty Sapphire", "Peacock Parachute Spider"],
                "type": "arboreal",
                "native_region": "India",
                "habitat_description": "Tropical forests. Lives in tree hollows.",
                "care_level": "advanced",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 75.0,
                "max_humidity": 85.0,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth_cm": 5.0,
                "enclosure_type": "Arboreal (tall)",
                "adult_size_cm": 18.0,
                "growth_rate": "fast",
                "lifespan_years_min": 12,
                "lifespan_years_max": 15,
                "temperament": "defensive",
                "urticating_hairs": False,
                "defensive_behavior": "EXTREMELY fast and defensive. Medically significant venom. Experts only.",
                "feeding_frequency_days": 5,
                "typical_diet": "Large crickets, roaches",
                "breeding_difficulty": "difficult",
                "egg_sac_size": 100,
                "is_verified": True,
                "times_kept": 3000,
                "average_rating": 4.9,
            },
            {
                "scientific_name": "Pterinochilus murinus",
                "genus": "Pterinochilus",
                "species": "murinus",
                "common_names": ["Orange Baboon Tarantula", "OBT"],
                "type": "terrestrial",
                "native_region": "Africa",
                "habitat_description": "Arid scrublands. Obligate burrower.",
                "care_level": "advanced",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 60.0,
                "max_humidity": 70.0,
                "substrate_type": "Coconut fiber (dry)",
                "substrate_depth_cm": 15.0,
                "enclosure_type": "Terrestrial (deep substrate)",
                "adult_size_cm": 13.0,
                "growth_rate": "fast",
                "lifespan_years_min": 12,
                "lifespan_years_max": 15,
                "temperament": "aggressive",
                "urticating_hairs": False,
                "defensive_behavior": "HIGHLY aggressive. Will bite without provocation. Experts only.",
                "feeding_frequency_days": 5,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 150,
                "is_verified": True,
                "times_kept": 5000,
                "average_rating": 4.6,
            },
            {
                "scientific_name": "Heteroscodra maculata",
                "genus": "Heteroscodra",
                "species": "maculata",
                "common_names": ["Togo Starburst", "Ornamental Baboon"],
                "type": "arboreal",
                "native_region": "Africa",
                "habitat_description": "Tropical forests. Lives in tree bark.",
                "care_level": "advanced",
                "min_temperature": 24.0,
                "max_temperature": 28.0,
                "min_humidity": 75.0,
                "max_humidity": 85.0,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth_cm": 5.0,
                "enclosure_type": "Arboreal (tall)",
                "adult_size_cm": 13.0,
                "growth_rate": "fast",
                "lifespan_years_min": 10,
                "lifespan_years_max": 12,
                "temperament": "defensive",
                "urticating_hairs": False,
                "defensive_behavior": "Fast and defensive. Will bite if threatened.",
                "feeding_frequency_days": 5,
                "typical_diet": "Crickets, roaches",
                "breeding_difficulty": "moderate",
                "egg_sac_size": 100,
                "is_verified": True,
                "times_kept": 2000,
                "average_rating": 4.7,
            },
        ]
        
        print(f"\n🌱 Seeding {len(species_data)} species...\n")
        
        for data in species_data:
            species = Species(
                id=uuid.uuid4(),
                scientific_name_lower=data["scientific_name"].lower(),
                **data
            )
            db.add(species)
            level_emoji = {"beginner": "🟢", "intermediate": "🟡", "advanced": "🔴"}.get(data['care_level'], "⚪")
            print(f"  {level_emoji} {data['scientific_name']} ({data['common_names'][0]})")
        
        db.commit()
        
        print(f"\n✅ Successfully seeded {len(species_data)} species!")
        print("\n📊 Breakdown:")
        beginner = sum(1 for s in species_data if s['care_level'] == 'beginner')
        intermediate = sum(1 for s in species_data if s['care_level'] == 'intermediate')
        advanced = sum(1 for s in species_data if s['care_level'] == 'advanced')
        print(f"  🟢 Beginner: {beginner}")
        print(f"  🟡 Intermediate: {intermediate}")
        print(f"  🔴 Advanced: {advanced}")
        print(f"\n🕷️  Total: {len(species_data)} species ready to browse!")
        
    except Exception as e:
        print(f"\n❌ Error seeding species: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_species()
