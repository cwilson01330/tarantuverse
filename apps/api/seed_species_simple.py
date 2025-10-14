"""
Simple seed script for tarantula species
Run with: python seed_species_simple.py
"""
from app.database import SessionLocal
from app.models.species import Species
import uuid

def seed():
    db = SessionLocal()
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
        
        # 13 popular species
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
                   genus="Tliltocatl", species="albopilosus", common_names=["Nicaraguan Curly Hair"],
                   type="terrestrial", native_region="Nicaragua", care_level="beginner",
                   min_temperature=24.0, max_temperature=28.0, min_humidity=70.0, max_humidity=80.0,
                   substrate_type="Coconut fiber", substrate_depth_cm=7.0, enclosure_type="Terrestrial",
                   adult_size_cm=15.0, growth_rate="medium", lifespan_years_min=8, lifespan_years_max=10,
                   temperament="docile", urticating_hairs=True,
                   defensive_behavior="Calm, good for beginners.", feeding_frequency_days=5,
                   typical_diet="Crickets, roaches", is_verified=True, times_kept=6000, average_rating=4.6),
            
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
