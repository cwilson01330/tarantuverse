"""
Simple seed script for tarantula species
Run with: python seed_species_simple.py

If you get connection errors with Neon:
1. Go to Neon dashboard and click "Wake up" on your project
2. Wait 30 seconds for database to activate
3. Run this script again
"""
from app.database import SessionLocal
from app.models.species import Species
import uuid
import time
import sys

def seed():
    print("🔌 Connecting to database...")
    
    # Try to connect with retries (Neon may need to wake up)
    max_retries = 3
    retry_delay = 10  # seconds
    
    for attempt in range(max_retries):
        try:
            db = SessionLocal()
            # Test connection
            count = db.query(Species).count()
            print(f"✅ Connected! Current species in database: {count}")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️  Connection attempt {attempt + 1} failed: {str(e)[:100]}")
                print(f"⏳ Waiting {retry_delay} seconds for database to wake up...")
                time.sleep(retry_delay)
            else:
                print(f"\n❌ Failed to connect after {max_retries} attempts.")
                print("\n🔧 Troubleshooting steps:")
                print("1. Go to https://console.neon.tech")
                print("2. Select your 'tarantuverse' project")
                print("3. Click the 'Wake up' button if project is suspended")
                print("4. Wait 30 seconds and run this script again")
                print(f"\nFull error: {e}")
                sys.exit(1)
    
    try:
        # Check existing
        count = db.query(Species).count()
        print(f"Current species in database: {count}")
        
        if count > 0:
            response = input("Species exist. Add more or skip? (add/skip): ")
            if response.lower() != 'add':
                print("Skipping.")
                return
            print(f"Adding to existing {count} species...")
        
        # 19 popular species (13 original + 6 new from Perplexity research)
        species = [
            Species(id=uuid.uuid4(), scientific_name="Grammostola rosea", scientific_name_lower="grammostola rosea",
                   genus="Grammostola", species="rosea", common_names=["Chilean Rose Hair"],
                   type="terrestrial", native_region="Chile", care_level="beginner",
                   min_temperature=21.0, max_temperature=26.0, min_humidity=60.0, max_humidity=70.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=5.0, enclosure_type="Terrestrial",
                   adult_size_cm=14.0, growth_rate="slow", lifespan_years_min=15, lifespan_years_max=20,
                   temperament="docile", urticating_hairs=True, 
                   defensive_behavior="Very calm, rarely defensive.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=15000, average_rating=4.8),
            
            Species(id=uuid.uuid4(), scientific_name="Brachypelma hamorii", scientific_name_lower="brachypelma hamorii",
                   genus="Brachypelma", species="hamorii", common_names=["Mexican Red Knee"],
                   type="terrestrial", native_region="Mexico", care_level="beginner",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=65.0, max_humidity=75.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=7.0, enclosure_type="Terrestrial",
                   adult_size_cm=15.0, growth_rate="slow", lifespan_years_min=20, lifespan_years_max=30,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Calm and predictable.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=20000, average_rating=4.9),
            
            Species(id=uuid.uuid4(), scientific_name="Brachypelma albopilosum", scientific_name_lower="brachypelma albopilosum",
                   genus="Brachypelma", species="albopilosum", common_names=["Curly Hair Tarantula"],
                   type="terrestrial", native_region="Honduras", care_level="beginner",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=7.0, enclosure_type="Terrestrial",
                   adult_size_cm=13.0, growth_rate="slow", lifespan_years_min=8, lifespan_years_max=10,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Very calm and hardy.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=12000, average_rating=4.7),
            
            Species(id=uuid.uuid4(), scientific_name="Aphonopelma chalcodes", scientific_name_lower="aphonopelma chalcodes",
                   genus="Aphonopelma", species="chalcodes", common_names=["Desert Blonde"],
                   type="terrestrial", native_region="United States", care_level="beginner",
                   min_temperature=21.0, max_temperature=29.0, min_humidity=50.0, max_humidity=60.0,
                   substrate_type="Sand/coco fiber mix", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=13.0, growth_rate="slow", lifespan_years_min=20, lifespan_years_max=30,
                   temperament="calm", urticating_hairs=True,
                   defensive_behavior="Very docile.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=5000, average_rating=4.6),
            
            Species(id=uuid.uuid4(), scientific_name="Grammostola pulchra", scientific_name_lower="grammostola pulchra",
                   genus="Grammostola", species="pulchra", common_names=["Brazilian Black"],
                   type="terrestrial", native_region="Brazil", care_level="beginner",
                   min_temperature=22.0, max_temperature=26.0, min_humidity=65.0, max_humidity=75.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=7.0, enclosure_type="Terrestrial",
                   adult_size_cm=16.0, growth_rate="slow", lifespan_years_min=20, lifespan_years_max=30,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Extremely calm.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=8000, average_rating=4.9),
            
            Species(id=uuid.uuid4(), scientific_name="Avicularia avicularia", scientific_name_lower="avicularia avicularia",
                   genus="Avicularia", species="avicularia", common_names=["Pink Toe Tarantula"],
                   type="arboreal", native_region="South America", care_level="intermediate",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=75.0, max_humidity=85.0,
                   substrate_type="Coconut fiber (moist)", substrate_depth_cm=5.0, enclosure_type="Arboreal",
                   adult_size_cm=13.0, growth_rate="medium", lifespan_years_min=8, lifespan_years_max=12,
                   temperament="docile", urticating_hairs=False,
                   defensive_behavior="Skittish but not aggressive.", feeding_frequency_days=5,
                   typical_diet="Flying insects, crickets", is_verified=True, times_kept=10000, average_rating=4.5),
            
            Species(id=uuid.uuid4(), scientific_name="Chromatopelma cyaneopubescens", scientific_name_lower="chromatopelma cyaneopubescens",
                   genus="Chromatopelma", species="cyaneopubescens", common_names=["Green Bottle Blue", "GBB"],
                   type="terrestrial", native_region="Venezuela", care_level="intermediate",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=65.0, max_humidity=75.0,
                   substrate_type="Dry coconut fiber", substrate_depth_cm=7.0, enclosure_type="Terrestrial",
                   adult_size_cm=14.0, growth_rate="fast", lifespan_years_min=12, lifespan_years_max=14,
                   temperament="skittish", urticating_hairs=True,
                   defensive_behavior="Fast and defensive.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=7000, average_rating=4.8),
            
            Species(id=uuid.uuid4(), scientific_name="Tliltocatl albopilosus", scientific_name_lower="tliltocatl albopilosus",
                   genus="Tliltocatl", species="albopilosus", common_names=["Curly Hair Tarantula", "Honduran Curly Hair", "Nicaraguan Curly Hair"],
                   type="terrestrial", native_region="Central America (Honduras, Nicaragua, Costa Rica)", care_level="beginner",
                   min_temperature=20.0, max_temperature=27.0, min_humidity=65.0, max_humidity=75.0,
                   substrate_type="Coco fiber, bark, topsoil", substrate_depth_cm=12.0, enclosure_type="Terrestrial",
                   adult_size_cm=17.0, growth_rate="medium", lifespan_years_min=10, lifespan_years_max=25,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Flicks urticating hairs when threatened, otherwise calm and tolerant.", feeding_frequency_days=10,
                   typical_diet="Crickets, roaches, locusts, mealworms", is_verified=True, times_kept=8000, average_rating=4.7),
            
            Species(id=uuid.uuid4(), scientific_name="Lasiodora parahybana", scientific_name_lower="lasiodora parahybana",
                   genus="Lasiodora", species="parahybana", common_names=["Brazilian Salmon Pink", "LP"],
                   type="terrestrial", native_region="Brazil", care_level="intermediate",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=23.0, growth_rate="very fast", lifespan_years_min=12, lifespan_years_max=15,
                   temperament="calm", urticating_hairs=True,
                   defensive_behavior="Generally calm but can be defensive.", feeding_frequency_days=5,
                   typical_diet="Large crickets, roaches", is_verified=True, times_kept=9000, average_rating=4.7),
            
            Species(id=uuid.uuid4(), scientific_name="Nhandu chromatus", scientific_name_lower="nhandu chromatus",
                   genus="Nhandu", species="chromatus", common_names=["Brazilian Red and White"],
                   type="terrestrial", native_region="Brazil", care_level="intermediate",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=18.0, growth_rate="fast", lifespan_years_min=12, lifespan_years_max=15,
                   temperament="defensive", urticating_hairs=True,
                   defensive_behavior="Can be defensive and fast.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=4000, average_rating=4.5),
            
            Species(id=uuid.uuid4(), scientific_name="Poecilotheria metallica", scientific_name_lower="poecilotheria metallica",
                   genus="Poecilotheria", species="metallica", common_names=["Gooty Sapphire"],
                   type="arboreal", native_region="India", care_level="advanced",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=75.0, max_humidity=85.0,
                   substrate_type="Coconut fiber (moist)", substrate_depth_cm=5.0, enclosure_type="Arboreal",
                   adult_size_cm=18.0, growth_rate="fast", lifespan_years_min=12, lifespan_years_max=15,
                   temperament="defensive", urticating_hairs=False,
                   defensive_behavior="EXTREMELY fast and defensive. Experts only.", feeding_frequency_days=5,
                   typical_diet="Large crickets, roaches", is_verified=True, times_kept=3000, average_rating=4.9),
            
            Species(id=uuid.uuid4(), scientific_name="Pterinochilus murinus", scientific_name_lower="pterinochilus murinus",
                   genus="Pterinochilus", species="murinus", common_names=["Orange Baboon Tarantula", "OBT"],
                   type="terrestrial", native_region="Africa", care_level="advanced",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=60.0, max_humidity=70.0,
                   substrate_type="Coconut fiber (dry)", substrate_depth_cm=15.0, enclosure_type="Terrestrial",
                   adult_size_cm=13.0, growth_rate="fast", lifespan_years_min=12, lifespan_years_max=15,
                   temperament="aggressive", urticating_hairs=False,
                   defensive_behavior="HIGHLY aggressive. Experts only.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=5000, average_rating=4.6),
            
            Species(id=uuid.uuid4(), scientific_name="Heteroscodra maculata", scientific_name_lower="heteroscodra maculata",
                   genus="Heteroscodra", species="maculata", common_names=["Togo Starburst"],
                   type="arboreal", native_region="Africa", care_level="advanced",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=75.0, max_humidity=85.0,
                   substrate_type="Coconut fiber (moist)", substrate_depth_cm=5.0, enclosure_type="Arboreal",
                   adult_size_cm=13.0, growth_rate="fast", lifespan_years_min=10, lifespan_years_max=12,
                   temperament="defensive", urticating_hairs=False,
                   defensive_behavior="Fast and defensive.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=2000, average_rating=4.7),
            
            # New species added via Perplexity research
            Species(id=uuid.uuid4(), scientific_name="Caribena versicolor", scientific_name_lower="caribena versicolor",
                   genus="Caribena", species="versicolor", common_names=["Antilles Pink Toe", "Martinique Pink Toe", "Martinique Red Tree Spider"],
                   type="arboreal", native_region="Caribbean (Martinique, Lesser Antilles)", care_level="beginner",
                   min_temperature=21.0, max_temperature=26.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coco fiber (moist), sphagnum moss", substrate_depth_cm=10.0, enclosure_type="Arboreal",
                   adult_size_cm=15.0, growth_rate="medium", lifespan_years_min=8, lifespan_years_max=12,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Skittish but not aggressive. May jump, flick hairs, or shoot feces when threatened.", feeding_frequency_days=5,
                   typical_diet="Flying insects, crickets, roaches", is_verified=True, times_kept=11000, average_rating=4.8),
            
            Species(id=uuid.uuid4(), scientific_name="Psalmopoeus irminia", scientific_name_lower="psalmopoeus irminia",
                   genus="Psalmopoeus", species="irminia", common_names=["Venezuelan Sun Tiger", "Suntiger Tarantula"],
                   type="arboreal", native_region="Venezuela, Guyana", care_level="intermediate",
                   min_temperature=24.0, max_temperature=27.0, min_humidity=75.0, max_humidity=85.0,
                   substrate_type="Coco fiber (moist)", substrate_depth_cm=7.0, enclosure_type="Arboreal",
                   adult_size_cm=14.0, growth_rate="fast", lifespan_years_min=10, lifespan_years_max=12,
                   temperament="defensive", urticating_hairs=False,
                   defensive_behavior="Lightning-fast and defensive. No urticating hairs but potent venom. Threat poses common.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches, horn worms", is_verified=True, times_kept=6500, average_rating=4.7),
            
            Species(id=uuid.uuid4(), scientific_name="Brachypelma emilia", scientific_name_lower="brachypelma emilia",
                   genus="Brachypelma", species="emilia", common_names=["Mexican Red Leg"],
                   type="terrestrial", native_region="Mexico (Pacific coast)", care_level="beginner",
                   min_temperature=21.0, max_temperature=26.0, min_humidity=65.0, max_humidity=75.0,
                   substrate_type="Coco fiber, peat moss, potting soil", substrate_depth_cm=12.0, enclosure_type="Terrestrial",
                   adult_size_cm=15.0, growth_rate="slow", lifespan_years_min=20, lifespan_years_max=30,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Very calm and docile. Distinguished by black triangle on carapace. Rarely kicks hairs.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches, mealworms", is_verified=True, times_kept=9000, average_rating=4.8),
            
            Species(id=uuid.uuid4(), scientific_name="Grammostola pulchripes", scientific_name_lower="grammostola pulchripes",
                   genus="Grammostola", species="pulchripes", common_names=["Chaco Golden Knee"],
                   type="terrestrial", native_region="Argentina, Paraguay", care_level="beginner",
                   min_temperature=20.0, max_temperature=24.0, min_humidity=60.0, max_humidity=70.0,
                   substrate_type="Coco fiber, peat moss", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=18.0, growth_rate="slow", lifespan_years_min=20, lifespan_years_max=30,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Extremely docile and calm. One of the best for handling. Rarely defensive.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=7500, average_rating=4.9),
            
            Species(id=uuid.uuid4(), scientific_name="Davus fasciatus", scientific_name_lower="davus fasciatus",
                   genus="Davus", species="fasciatus", common_names=["Costa Rican Tiger Rump"],
                   type="terrestrial", native_region="Costa Rica", care_level="beginner",
                   min_temperature=21.0, max_temperature=27.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coco fiber, peat moss, dirt", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=12.0, growth_rate="medium", lifespan_years_min=6, lifespan_years_max=10,
                   temperament="skittish", urticating_hairs=True,
                   defensive_behavior="Docile but skittish. Kicks hairs readily when disturbed. Prolific webber and burrower.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=4500, average_rating=4.6),
            
            Species(id=uuid.uuid4(), scientific_name="Acanthoscurria geniculata", scientific_name_lower="acanthoscurria geniculata",
                   genus="Acanthoscurria", species="geniculata", common_names=["Brazilian Giant White Knee", "Brazilian White Knee"],
                   type="terrestrial", native_region="Brazil (Northern forests)", care_level="beginner",
                   min_temperature=22.0, max_temperature=26.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coco fiber, peat moss", substrate_depth_cm=10.0, enclosure_type="Terrestrial",
                   adult_size_cm=21.0, growth_rate="fast", lifespan_years_min=12, lifespan_years_max=20,
                   temperament="defensive", urticating_hairs=True,
                   defensive_behavior="Bold but defensive. Readily kicks irritating hairs. Dramatic feeding response.", feeding_frequency_days=7,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=8500, average_rating=4.8),
        ]
        
        print(f"\n🌱 Adding {len(species)} species...\n")
        added = 0
        skipped = 0
        for s in species:
            # Check if species already exists
            existing = db.query(Species).filter(Species.scientific_name == s.scientific_name).first()
            if existing:
                skipped += 1
                print(f"  ⏭️  {s.scientific_name} (already exists)")
                continue
            
            db.add(s)
            added += 1
            level = {"beginner": "🟢", "intermediate": "🟡", "advanced": "🔴"}.get(s.care_level, "⚪")
            print(f"  {level} {s.scientific_name} ({s.common_names[0]})")
        
        db.commit()
        print(f"\n✅ Successfully added {added} species!")
        if skipped > 0:
            print(f"⏭️  Skipped {skipped} existing species")
        
        total = db.query(Species).count()
        print(f"\n� Total species in database: {total}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
