"""
Seed Pricing Data
Add realistic pricing data to common tarantula species

Run with: python3 seed_pricing_data.py
"""
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.species import Species
from decimal import Decimal


PRICING_DATA = {
    "Grammostola rosea": {
        "sling_low": 15,
        "sling_high": 25,
        "juvenile_low": 30,
        "juvenile_high": 50,
        "subadult_female_low": 50,
        "subadult_female_high": 75,
        "subadult_male_low": 25,
        "subadult_male_high": 40,
        "adult_female_low": 60,
        "adult_female_high": 100,
        "adult_male_low": 15,
        "adult_male_high": 30,
        "rarity_multiplier": 0.8,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Very common beginner species, prices are low"
    },
    "Brachypelma hamorii": {
        "sling_low": 30,
        "sling_high": 50,
        "juvenile_low": 60,
        "juvenile_high": 90,
        "subadult_female_low": 90,
        "subadult_female_high": 140,
        "subadult_male_low": 40,
        "subadult_male_high": 60,
        "adult_female_low": 120,
        "adult_female_high": 180,
        "adult_male_low": 25,
        "adult_male_high": 45,
        "rarity_multiplier": 1.2,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Iconic species, CITES listed, prices higher due to popularity"
    },
    "Aphonopelma chalcodes": {
        "sling_low": 20,
        "sling_high": 35,
        "juvenile_low": 35,
        "juvenile_high": 55,
        "subadult_female_low": 50,
        "subadult_female_high": 80,
        "subadult_male_low": 25,
        "subadult_male_high": 40,
        "adult_female_low": 70,
        "adult_female_high": 110,
        "adult_male_low": 15,
        "adult_male_high": 30,
        "rarity_multiplier": 0.9,
        "data_source": "manual",
        "last_updated": "2024-12-15"
    },
    "Caribena versicolor": {
        "sling_low": 25,
        "sling_high": 40,
        "juvenile_low": 40,
        "juvenile_high": 65,
        "subadult_female_low": 60,
        "subadult_female_high": 95,
        "subadult_male_low": 30,
        "subadult_male_high": 50,
        "adult_female_low": 80,
        "adult_female_high": 130,
        "adult_male_low": 20,
        "adult_male_high": 40,
        "rarity_multiplier": 1.0,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Popular arboreal, beautiful color changes"
    },
    "Tliltocatl albopilosus": {
        "sling_low": 18,
        "sling_high": 30,
        "juvenile_low": 30,
        "juvenile_high": 50,
        "subadult_female_low": 45,
        "subadult_female_high": 70,
        "subadult_male_low": 25,
        "subadult_male_high": 40,
        "adult_female_low": 60,
        "adult_female_high": 90,
        "adult_male_low": 15,
        "adult_male_high": 30,
        "rarity_multiplier": 0.9,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Very common, great beginner species"
    },
    "Grammostola pulchra": {
        "sling_low": 50,
        "sling_high": 80,
        "juvenile_low": 100,
        "juvenile_high": 150,
        "subadult_female_low": 150,
        "subadult_female_high": 220,
        "subadult_male_low": 60,
        "subadult_male_high": 90,
        "adult_female_low": 200,
        "adult_female_high": 300,
        "adult_male_low": 40,
        "adult_male_high": 70,
        "rarity_multiplier": 1.5,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Premium species, slow growing, highly sought after"
    },
    "Chromatopelma cyaneopubescens": {
        "sling_low": 30,
        "sling_high": 50,
        "juvenile_low": 50,
        "juvenile_high": 80,
        "subadult_female_low": 75,
        "subadult_female_high": 120,
        "subadult_male_low": 35,
        "subadult_male_high": 55,
        "adult_female_low": 90,
        "adult_female_high": 140,
        "adult_male_low": 25,
        "adult_male_high": 45,
        "rarity_multiplier": 1.1,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Popular display species, stunning colors"
    },
    "Lasiodora parahybana": {
        "sling_low": 20,
        "sling_high": 35,
        "juvenile_low": 40,
        "juvenile_high": 65,
        "subadult_female_low": 60,
        "subadult_female_high": 95,
        "subadult_male_low": 30,
        "subadult_male_high": 50,
        "adult_female_low": 80,
        "adult_female_high": 130,
        "adult_male_low": 20,
        "adult_male_high": 35,
        "rarity_multiplier": 1.0,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Fast growing, large species, popular intermediate"
    },
    "Poecilotheria metallica": {
        "sling_low": 80,
        "sling_high": 130,
        "juvenile_low": 150,
        "juvenile_high": 220,
        "subadult_female_low": 250,
        "subadult_female_high": 350,
        "subadult_male_low": 100,
        "subadult_male_high": 150,
        "adult_female_low": 300,
        "adult_female_high": 500,
        "adult_male_low": 60,
        "adult_male_high": 100,
        "rarity_multiplier": 2.0,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Critically endangered, CITES II, extremely rare and expensive"
    },
    "Pterinochilus murinus": {
        "sling_low": 20,
        "sling_high": 35,
        "juvenile_low": 35,
        "juvenile_high": 55,
        "subadult_female_low": 50,
        "subadult_female_high": 80,
        "subadult_male_low": 25,
        "subadult_male_high": 40,
        "adult_female_low": 65,
        "adult_female_high": 100,
        "adult_male_low": 20,
        "adult_male_high": 35,
        "rarity_multiplier": 0.9,
        "data_source": "manual",
        "last_updated": "2024-12-15",
        "notes": "Common old world, aggressive but popular"
    },
}


def seed_pricing():
    """Seed pricing data for common species"""
    db = SessionLocal()

    try:
        print("Seeding pricing data for common species...\n")

        updated_count = 0
        skipped_count = 0

        for scientific_name, pricing_data in PRICING_DATA.items():
            # Find species by scientific name (case-insensitive)
            species = db.query(Species).filter(
                Species.scientific_name_lower == scientific_name.lower()
            ).first()

            if not species:
                print(f"  ⏭️  Skipping {scientific_name} (species not found in database)")
                skipped_count += 1
                continue

            # Update pricing_data
            species.pricing_data = pricing_data
            updated_count += 1

            # Show price range for sling and adult female
            sling_range = f"${pricing_data['sling_low']}-${pricing_data['sling_high']}"
            adult_female_range = f"${pricing_data['adult_female_low']}-${pricing_data['adult_female_high']}"
            print(f"  ✅ {scientific_name}")
            print(f"     Sling: {sling_range} | Adult Female: {adult_female_range}")

        db.commit()

        print(f"\n🎉 Successfully updated pricing for {updated_count} species!")
        if skipped_count > 0:
            print(f"⏭️  Skipped {skipped_count} species (not found in database)")

        print("\n💡 Tip: Run seed_species.py first if you haven't already!")

    except Exception as e:
        print(f"\n❌ Error seeding pricing data: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed_pricing()
