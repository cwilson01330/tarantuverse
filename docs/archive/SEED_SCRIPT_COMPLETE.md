# Complete Seed Script for Render

Due to file encoding issues on Windows, here's the complete seed script to upload to Render.

## How to use:

1. Go to Render dashboard → Shell
2. Create the file: `nano seed_species_simple.py`
3. Copy/paste the entire script below
4. Save: Ctrl+O, Enter, Ctrl+X
5. Run: `python seed_species_simple.py`
6. When prompted, type: `add`

## Complete Script:

```python
from app.database import SessionLocal
from app.models.species import Species
import uuid
import time
import sys

def seed():
    print('🔌 Connecting to database...')
    max_retries = 3
    retry_delay = 10
    
    for attempt in range(max_retries):
        try:
            db = SessionLocal()
            count = db.query(Species).count()
            print(f'✅ Connected! Current species in database: {count}')
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f'⚠️  Connection attempt {attempt + 1} failed: {str(e)[:100]}')
                print(f'⏳ Waiting {retry_delay} seconds for database to wake up...')
                time.sleep(retry_delay)
            else:
                print(f'\\n❌ Failed to connect after {max_retries} attempts.')
                print(f'\\nFull error: {e}')
                sys.exit(1)
    
    try:
        count = db.query(Species).count()
        print(f'Current species in database: {count}')
        
        if count > 0:
            response = input('Species exist. Add more or skip? (add/skip): ')
            if response.lower() != 'add':
                print('Skipping.')
                return
            print(f'Adding to existing {count} species...')
        
        species_data = [
            {
                "scientific_name": "Grammostola rosea",
                "common_names": ["Chilean Rose Hair"],
                "genus": "Grammostola",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Chile",
                "temperature_min": 70,
                "temperature_max": 79,
                "humidity_min": 60,
                "humidity_max": 70,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "2-3 inches",
                "enclosure_size_adult": "10x10x10\\" or 5 gallon",
                "adult_size": "5.5 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 15000,
                "community_rating": 4.8,
            },
            {
                "scientific_name": "Brachypelma hamorii",
                "common_names": ["Mexican Red Knee"],
                "genus": "Brachypelma",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Mexico",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 65,
                "humidity_max": 75,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "3 inches",
                "enclosure_size_adult": "10x10x10\\" or 5-10 gallon",
                "adult_size": "6 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 20000,
                "community_rating": 4.9,
            },
            {
                "scientific_name": "Brachypelma albopilosum",
                "common_names": ["Curly Hair Tarantula", "Honduran Curly Hair"],
                "genus": "Brachypelma",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Honduras",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "3 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "5 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 12000,
                "community_rating": 4.7,
            },
            {
                "scientific_name": "Aphonopelma chalcodes",
                "common_names": ["Desert Blonde"],
                "genus": "Aphonopelma",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "United States (Arizona)",
                "temperature_min": 70,
                "temperature_max": 84,
                "humidity_min": 50,
                "humidity_max": 60,
                "substrate_type": "Sand/coco fiber mix",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "5 inches",
                "growth_rate": "slow",
                "temperament": "calm",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 5000,
                "community_rating": 4.6,
            },
            {
                "scientific_name": "Grammostola pulchra",
                "common_names": ["Brazilian Black"],
                "genus": "Grammostola",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Brazil",
                "temperature_min": 72,
                "temperature_max": 79,
                "humidity_min": 65,
                "humidity_max": 75,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "3 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "6.5 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 8000,
                "community_rating": 4.9,
            },
            {
                "scientific_name": "Avicularia avicularia",
                "common_names": ["Pink Toe Tarantula"],
                "genus": "Avicularia",
                "family": "Theraphosidae",
                "care_level": "intermediate",
                "type": "arboreal",
                "native_region": "South America",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 75,
                "humidity_max": 85,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth": "2-3 inches",
                "enclosure_size_adult": "12x12x18\\" arboreal",
                "adult_size": "5 inches",
                "growth_rate": "medium",
                "temperament": "docile",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 10000,
                "community_rating": 4.5,
            },
            {
                "scientific_name": "Chromatopelma cyaneopubescens",
                "common_names": ["Green Bottle Blue", "GBB"],
                "genus": "Chromatopelma",
                "family": "Theraphosidae",
                "care_level": "intermediate",
                "type": "terrestrial",
                "native_region": "Venezuela",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 65,
                "humidity_max": 75,
                "substrate_type": "Dry coconut fiber",
                "substrate_depth": "3 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "5.5 inches",
                "growth_rate": "fast",
                "temperament": "skittish",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "webbing_amount": "heavy",
                "is_verified": True,
                "times_kept": 7000,
                "community_rating": 4.8,
            },
            {
                "scientific_name": "Tliltocatl albopilosus",
                "common_names": ["Curly Hair Tarantula", "Honduran Curly Hair", "Nicaraguan Curly Hair"],
                "genus": "Tliltocatl",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Central America (Honduras, Nicaragua, Costa Rica)",
                "temperature_min": 68,
                "temperature_max": 81,
                "humidity_min": 65,
                "humidity_max": 75,
                "substrate_type": "Coco fiber, bark, topsoil",
                "substrate_depth": "5 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "6.7 inches",
                "growth_rate": "medium",
                "temperament": "docile",
                "feeding_frequency_adult": "Every 7-14 days",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 8000,
                "community_rating": 4.7,
            },
            {
                "scientific_name": "Lasiodora parahybana",
                "common_names": ["Brazilian Salmon Pink", "LP"],
                "genus": "Lasiodora",
                "family": "Theraphosidae",
                "care_level": "intermediate",
                "type": "terrestrial",
                "native_region": "Brazil",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "12x12x12\\" or larger",
                "adult_size": "9 inches",
                "growth_rate": "very fast",
                "temperament": "calm",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 9000,
                "community_rating": 4.7,
            },
            {
                "scientific_name": "Nhandu chromatus",
                "common_names": ["Brazilian Red and White"],
                "genus": "Nhandu",
                "family": "Theraphosidae",
                "care_level": "intermediate",
                "type": "terrestrial",
                "native_region": "Brazil",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coconut fiber",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "12x12x12\\"",
                "adult_size": "7 inches",
                "growth_rate": "fast",
                "temperament": "defensive",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 4000,
                "community_rating": 4.5,
            },
            {
                "scientific_name": "Poecilotheria metallica",
                "common_names": ["Gooty Sapphire"],
                "genus": "Poecilotheria",
                "family": "Theraphosidae",
                "care_level": "advanced",
                "type": "arboreal",
                "native_region": "India",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 75,
                "humidity_max": 85,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth": "2-3 inches",
                "enclosure_size_adult": "12x12x18\\" arboreal",
                "adult_size": "7 inches",
                "growth_rate": "fast",
                "temperament": "defensive",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 3000,
                "community_rating": 4.9,
            },
            {
                "scientific_name": "Pterinochilus murinus",
                "common_names": ["Orange Baboon Tarantula", "OBT"],
                "genus": "Pterinochilus",
                "family": "Theraphosidae",
                "care_level": "advanced",
                "type": "terrestrial",
                "native_region": "Africa",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 60,
                "humidity_max": 70,
                "substrate_type": "Coconut fiber (dry)",
                "substrate_depth": "6 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "5 inches",
                "growth_rate": "fast",
                "temperament": "aggressive",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 5000,
                "community_rating": 4.6,
            },
            {
                "scientific_name": "Heteroscodra maculata",
                "common_names": ["Togo Starburst"],
                "genus": "Heteroscodra",
                "family": "Theraphosidae",
                "care_level": "advanced",
                "type": "arboreal",
                "native_region": "Africa",
                "temperature_min": 75,
                "temperature_max": 82,
                "humidity_min": 75,
                "humidity_max": 85,
                "substrate_type": "Coconut fiber (moist)",
                "substrate_depth": "2-3 inches",
                "enclosure_size_adult": "12x12x18\\" arboreal",
                "adult_size": "5 inches",
                "growth_rate": "fast",
                "temperament": "defensive",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "is_verified": True,
                "times_kept": 2000,
                "community_rating": 4.7,
            },
            {
                "scientific_name": "Caribena versicolor",
                "common_names": ["Antilles Pink Toe", "Martinique Pink Toe", "Martinique Red Tree Spider"],
                "genus": "Caribena",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "arboreal",
                "native_region": "Caribbean (Martinique, Lesser Antilles)",
                "temperature_min": 70,
                "temperature_max": 79,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coco fiber (moist), sphagnum moss",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "12x12x18\\" arboreal",
                "adult_size": "6 inches",
                "growth_rate": "medium",
                "temperament": "docile",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "webbing_amount": "heavy",
                "is_verified": True,
                "times_kept": 11000,
                "community_rating": 4.8,
            },
            {
                "scientific_name": "Psalmopoeus irminia",
                "common_names": ["Venezuelan Sun Tiger", "Suntiger Tarantula"],
                "genus": "Psalmopoeus",
                "family": "Theraphosidae",
                "care_level": "intermediate",
                "type": "arboreal",
                "native_region": "Venezuela, Guyana",
                "temperature_min": 75,
                "temperature_max": 81,
                "humidity_min": 75,
                "humidity_max": 85,
                "substrate_type": "Coco fiber (moist)",
                "substrate_depth": "3 inches",
                "enclosure_size_adult": "12x12x18\\" arboreal",
                "adult_size": "5.5 inches",
                "growth_rate": "fast",
                "temperament": "defensive",
                "feeding_frequency_adult": "Twice per week",
                "water_dish_required": True,
                "burrowing": False,
                "webbing_amount": "heavy",
                "is_verified": True,
                "times_kept": 6500,
                "community_rating": 4.7,
            },
            {
                "scientific_name": "Brachypelma emilia",
                "common_names": ["Mexican Red Leg"],
                "genus": "Brachypelma",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Mexico (Pacific coast)",
                "temperature_min": 70,
                "temperature_max": 79,
                "humidity_min": 65,
                "humidity_max": 75,
                "substrate_type": "Coco fiber, peat moss, potting soil",
                "substrate_depth": "5 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "6 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 9000,
                "community_rating": 4.8,
            },
            {
                "scientific_name": "Grammostola pulchripes",
                "common_names": ["Chaco Golden Knee"],
                "genus": "Grammostola",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Argentina, Paraguay",
                "temperature_min": 68,
                "temperature_max": 75,
                "humidity_min": 60,
                "humidity_max": 70,
                "substrate_type": "Coco fiber, peat moss",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "10x10x10\\" or larger",
                "adult_size": "7 inches",
                "growth_rate": "slow",
                "temperament": "docile",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 7500,
                "community_rating": 4.9,
            },
            {
                "scientific_name": "Davus fasciatus",
                "common_names": ["Costa Rican Tiger Rump"],
                "genus": "Davus",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Costa Rica",
                "temperature_min": 70,
                "temperature_max": 81,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coco fiber, peat moss, dirt",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "10x10x10\\"",
                "adult_size": "4.5 inches",
                "growth_rate": "medium",
                "temperament": "skittish",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": True,
                "webbing_amount": "heavy",
                "is_verified": True,
                "times_kept": 4500,
                "community_rating": 4.6,
            },
            {
                "scientific_name": "Acanthoscurria geniculata",
                "common_names": ["Brazilian Giant White Knee", "Brazilian White Knee"],
                "genus": "Acanthoscurria",
                "family": "Theraphosidae",
                "care_level": "beginner",
                "type": "terrestrial",
                "native_region": "Brazil (Northern forests)",
                "temperature_min": 72,
                "temperature_max": 79,
                "humidity_min": 70,
                "humidity_max": 80,
                "substrate_type": "Coco fiber, peat moss",
                "substrate_depth": "4 inches",
                "enclosure_size_adult": "12x12x12\\" or larger",
                "adult_size": "8.5 inches",
                "growth_rate": "fast",
                "temperament": "defensive",
                "feeding_frequency_adult": "Once per week",
                "water_dish_required": True,
                "burrowing": True,
                "is_verified": True,
                "times_kept": 8500,
                "community_rating": 4.8,
            },
        ]
        
        print(f'\\n🌱 Adding {len(species_data)} species...\\n')
        added = 0
        skipped = 0
        
        for data in species_data:
            existing = db.query(Species).filter(Species.scientific_name == data['scientific_name']).first()
            if existing:
                skipped += 1
                print(f'  ⏭️  {data["scientific_name"]} (already exists)')
                continue
            
            species = Species(
                id=uuid.uuid4(),
                scientific_name_lower=data['scientific_name'].lower(),
                **data
            )
            db.add(species)
            added += 1
            level = {'beginner': '🟢', 'intermediate': '🟡', 'advanced': '🔴'}.get(data['care_level'], '⚪')
            print(f'  {level} {data["scientific_name"]} ({data["common_names"][0]})')
        
        db.commit()
        print(f'\\n✅ Successfully added {added} species!')
        if skipped > 0:
            print(f'⏭️  Skipped {skipped} existing species')
        
        total = db.query(Species).count()
        print(f'\\n📊 Total species in database: {total}')
        
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    seed()
```

## Expected Output:

```
🔌 Connecting to database...
✅ Connected! Current species in database: 10
Species exist. Add more or skip? (add/skip): add
Adding to existing 10 species...

🌱 Adding 19 species...

  ⏭️  Grammostola rosea (already exists)
  ⏭️  Brachypelma hamorii (already exists)
  ...
  🟢 Caribena versicolor (Antilles Pink Toe)
  🟡 Psalmopoeus irminia (Venezuelan Sun Tiger)
  🟢 Brachypelma emilia (Mexican Red Leg)
  🟢 Grammostola pulchripes (Chaco Golden Knee)
  🟢 Davus fasciatus (Costa Rican Tiger Rump)
  🟢 Acanthoscurria geniculata (Brazilian Giant White Knee)

✅ Successfully added 9 species!
⏭️  Skipped 10 existing species

📊 Total species in database: 19
```
