"""
Seed species via API (works with Render deployment)
Requires valid authentication token
"""
import requests
import json

# Render API URL
API_URL = "https://tarantuverse-api.onrender.com"

# You'll need to get your auth token from the web app
# Go to: https://tarantuverse.vercel.app/login
# Login, then open browser console and type: localStorage.getItem('token')
TOKEN = input("Enter your auth token (from localStorage): ").strip()

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

species_data = [
    {
        "scientific_name": "Grammostola rosea",
        "genus": "Grammostola",
        "species": "rosea",
        "common_names": ["Chilean Rose Hair"],
        "type": "terrestrial",
        "native_region": "Chile",
        "care_level": "beginner",
        "min_temperature": 21.0,
        "max_temperature": 26.0,
        "min_humidity": 60.0,
        "max_humidity": 70.0,
        "substrate_type": "Coconut fiber",
        "substrate_depth_cm": 5.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 14.0,
        "growth_rate": "slow",
        "lifespan_years_min": 15,
        "lifespan_years_max": 20,
        "temperament": "docile",
        "urticating_hairs": True,
        "defensive_behavior": "Very calm, rarely defensive.",
        "feeding_frequency_days": 7,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Brachypelma hamorii",
        "genus": "Brachypelma",
        "species": "hamorii",
        "common_names": ["Mexican Red Knee"],
        "type": "terrestrial",
        "native_region": "Mexico",
        "care_level": "beginner",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 65.0,
        "max_humidity": 75.0,
        "substrate_type": "Coconut fiber",
        "substrate_depth_cm": 7.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 15.0,
        "growth_rate": "slow",
        "lifespan_years_min": 20,
        "lifespan_years_max": 30,
        "temperament": "docile",
        "urticating_hairs": True,
        "defensive_behavior": "Calm and predictable.",
        "feeding_frequency_days": 7,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Brachypelma albopilosum",
        "genus": "Brachypelma",
        "species": "albopilosum",
        "common_names": ["Curly Hair Tarantula"],
        "type": "terrestrial",
        "native_region": "Honduras",
        "care_level": "beginner",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 70.0,
        "max_humidity": 80.0,
        "substrate_type": "Coconut fiber",
        "substrate_depth_cm": 7.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 13.0,
        "growth_rate": "slow",
        "lifespan_years_min": 8,
        "lifespan_years_max": 10,
        "temperament": "docile",
        "urticating_hairs": True,
        "defensive_behavior": "Very calm and hardy.",
        "feeding_frequency_days": 5,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Aphonopelma chalcodes",
        "genus": "Aphonopelma",
        "species": "chalcodes",
        "common_names": ["Desert Blonde"],
        "type": "terrestrial",
        "native_region": "United States",
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
        "defensive_behavior": "Very docile.",
        "feeding_frequency_days": 7,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Grammostola pulchra",
        "genus": "Grammostola",
        "species": "pulchra",
        "common_names": ["Brazilian Black"],
        "type": "terrestrial",
        "native_region": "Brazil",
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
        "defensive_behavior": "Extremely calm.",
        "feeding_frequency_days": 7,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Avicularia avicularia",
        "genus": "Avicularia",
        "species": "avicularia",
        "common_names": ["Pink Toe Tarantula"],
        "type": "arboreal",
        "native_region": "South America",
        "care_level": "intermediate",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 75.0,
        "max_humidity": 85.0,
        "substrate_type": "Coconut fiber (moist)",
        "substrate_depth_cm": 5.0,
        "enclosure_type": "Arboreal",
        "adult_size_cm": 13.0,
        "growth_rate": "medium",
        "lifespan_years_min": 8,
        "lifespan_years_max": 12,
        "temperament": "docile",
        "urticating_hairs": False,
        "defensive_behavior": "Skittish but not aggressive.",
        "feeding_frequency_days": 5,
        "typical_diet": "Flying insects, crickets",
        "is_verified": True
    },
    {
        "scientific_name": "Chromatopelma cyaneopubescens",
        "genus": "Chromatopelma",
        "species": "cyaneopubescens",
        "common_names": ["Green Bottle Blue", "GBB"],
        "type": "terrestrial",
        "native_region": "Venezuela",
        "care_level": "intermediate",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 65.0,
        "max_humidity": 75.0,
        "substrate_type": "Dry coconut fiber",
        "substrate_depth_cm": 7.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 14.0,
        "growth_rate": "fast",
        "lifespan_years_min": 12,
        "lifespan_years_max": 14,
        "temperament": "skittish",
        "urticating_hairs": True,
        "defensive_behavior": "Fast and defensive.",
        "feeding_frequency_days": 5,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Tliltocatl albopilosus",
        "genus": "Tliltocatl",
        "species": "albopilosus",
        "common_names": ["Nicaraguan Curly Hair"],
        "type": "terrestrial",
        "native_region": "Nicaragua",
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
        "is_verified": True
    },
    {
        "scientific_name": "Lasiodora parahybana",
        "genus": "Lasiodora",
        "species": "parahybana",
        "common_names": ["Brazilian Salmon Pink", "LP"],
        "type": "terrestrial",
        "native_region": "Brazil",
        "care_level": "intermediate",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 70.0,
        "max_humidity": 80.0,
        "substrate_type": "Coconut fiber",
        "substrate_depth_cm": 10.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 23.0,
        "growth_rate": "very fast",
        "lifespan_years_min": 12,
        "lifespan_years_max": 15,
        "temperament": "calm",
        "urticating_hairs": True,
        "defensive_behavior": "Generally calm but can be defensive.",
        "feeding_frequency_days": 5,
        "typical_diet": "Large crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Nhandu chromatus",
        "genus": "Nhandu",
        "species": "chromatus",
        "common_names": ["Brazilian Red and White"],
        "type": "terrestrial",
        "native_region": "Brazil",
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
        "defensive_behavior": "Can be defensive and fast.",
        "feeding_frequency_days": 5,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Poecilotheria metallica",
        "genus": "Poecilotheria",
        "species": "metallica",
        "common_names": ["Gooty Sapphire"],
        "type": "arboreal",
        "native_region": "India",
        "care_level": "advanced",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 75.0,
        "max_humidity": 85.0,
        "substrate_type": "Coconut fiber (moist)",
        "substrate_depth_cm": 5.0,
        "enclosure_type": "Arboreal",
        "adult_size_cm": 18.0,
        "growth_rate": "fast",
        "lifespan_years_min": 12,
        "lifespan_years_max": 15,
        "temperament": "defensive",
        "urticating_hairs": False,
        "defensive_behavior": "EXTREMELY fast and defensive. Experts only.",
        "feeding_frequency_days": 5,
        "typical_diet": "Large crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Pterinochilus murinus",
        "genus": "Pterinochilus",
        "species": "murinus",
        "common_names": ["Orange Baboon Tarantula", "OBT"],
        "type": "terrestrial",
        "native_region": "Africa",
        "care_level": "advanced",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 60.0,
        "max_humidity": 70.0,
        "substrate_type": "Coconut fiber (dry)",
        "substrate_depth_cm": 15.0,
        "enclosure_type": "Terrestrial",
        "adult_size_cm": 13.0,
        "growth_rate": "fast",
        "lifespan_years_min": 12,
        "lifespan_years_max": 15,
        "temperament": "aggressive",
        "urticating_hairs": False,
        "defensive_behavior": "HIGHLY aggressive. Experts only.",
        "feeding_frequency_days": 5,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    },
    {
        "scientific_name": "Heteroscodra maculata",
        "genus": "Heteroscodra",
        "species": "maculata",
        "common_names": ["Togo Starburst"],
        "type": "arboreal",
        "native_region": "Africa",
        "care_level": "advanced",
        "min_temperature": 24.0,
        "max_temperature": 28.0,
        "min_humidity": 75.0,
        "max_humidity": 85.0,
        "substrate_type": "Coconut fiber (moist)",
        "substrate_depth_cm": 5.0,
        "enclosure_type": "Arboreal",
        "adult_size_cm": 13.0,
        "growth_rate": "fast",
        "lifespan_years_min": 10,
        "lifespan_years_max": 12,
        "temperament": "defensive",
        "urticating_hairs": False,
        "defensive_behavior": "Fast and defensive.",
        "feeding_frequency_days": 5,
        "typical_diet": "Crickets, roaches",
        "is_verified": True
    }
]

def seed():
    print(f"\n🌱 Seeding {len(species_data)} species via API...\n")
    
    # First check if authenticated
    try:
        response = requests.get(f"{API_URL}/api/v1/auth/me", headers=headers)
        if response.status_code != 200:
            print("❌ Authentication failed. Please check your token.")
            return
        
        user = response.json()
        print(f"✅ Authenticated as: {user.get('username')}\n")
    except Exception as e:
        print(f"❌ Failed to authenticate: {e}")
        return
    
    # Check existing species
    try:
        response = requests.get(f"{API_URL}/api/v1/species", headers=headers)
        existing = response.json()
        print(f"Current species in database: {len(existing)}\n")
    except Exception as e:
        print(f"Warning: Could not check existing species: {e}\n")
    
    # Seed each species
    success_count = 0
    for data in species_data:
        try:
            response = requests.post(
                f"{API_URL}/api/v1/species",
                headers=headers,
                json=data
            )
            
            if response.status_code in [200, 201]:
                success_count += 1
                level = {"beginner": "🟢", "intermediate": "🟡", "advanced": "🔴"}.get(data["care_level"], "⚪")
                print(f"  {level} {data['scientific_name']} ({data['common_names'][0]})")
            else:
                print(f"  ❌ Failed: {data['scientific_name']} - {response.status_code}: {response.text}")
        except Exception as e:
            print(f"  ❌ Error adding {data['scientific_name']}: {e}")
    
    print(f"\n✅ Successfully seeded {success_count}/{len(species_data)} species!")
    
    beginner = sum(1 for s in species_data if s["care_level"] == "beginner")
    intermediate = sum(1 for s in species_data if s["care_level"] == "intermediate")
    advanced = sum(1 for s in species_data if s["care_level"] == "advanced")
    
    print(f"\n📊 Breakdown:")
    print(f"  🟢 Beginner: {beginner}")
    print(f"  🟡 Intermediate: {intermediate}")
    print(f"  🔴 Advanced: {advanced}")

if __name__ == "__main__":
    if TOKEN:
        seed()
    else:
        print("❌ No token provided. Exiting.")
