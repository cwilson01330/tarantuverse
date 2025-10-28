"""
Update species records with image URLs for downloaded images
"""
import requests
import json

API_URL = "https://tarantuverse-api.onrender.com"

# Get auth token
print("=" * 60)
print("UPDATE SPECIES IMAGES")
print("=" * 60)
print("\nTo get your token:")
print("1. Go to https://www.tarantuverse.com/login")
print("2. Login with your account")
print("3. Open browser console (F12)")
print("4. Type: localStorage.getItem('token')")
print("5. Copy the token (without quotes)")
print()

TOKEN = input("Enter your auth token: ").strip()

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# Species to update with their image URLs
species_images = {
    "Grammostola rosea": "/species-images/grammostola_rosea.jpg",
    "Brachypelma hamorii": "/species-images/brachypelma_hamorii.jpg",
    "Aphonopelma chalcodes": "/species-images/aphonopelma_chalcodes.jpg",
    "Caribena versicolor": "/species-images/caribena_versicolor.jpg",
    "Tliltocatl albopilosus": "/species-images/tliltocatl_albopilosus.jpg",
}

def main():
    # Verify authentication
    print("\n🔐 Verifying authentication...")
    try:
        response = requests.get(f"{API_URL}/api/v1/auth/me", headers=headers)
        if response.status_code != 200:
            print("❌ Authentication failed. Please check your token.")
            return

        user = response.json()
        print(f"✅ Authenticated as: {user.get('username')}")
    except Exception as e:
        print(f"❌ Failed to authenticate: {e}")
        return

    # Get all species
    print("\n📊 Fetching current species...")
    try:
        response = requests.get(f"{API_URL}/api/v1/species/", headers=headers)
        all_species = response.json()
        print(f"✅ Found {len(all_species)} species in database")
    except Exception as e:
        print(f"❌ Failed to fetch species: {e}")
        return

    # Update each species with an image
    print(f"\n🖼️  Updating {len(species_images)} species with images...\n")

    success_count = 0
    for scientific_name, image_url in species_images.items():
        # Find the species in the database
        species = next((s for s in all_species if s['scientific_name'] == scientific_name), None)

        if not species:
            print(f"  ⏭️  {scientific_name} - Not found in database, skipping")
            continue

        species_id = species['id']

        # Check if already has image
        if species.get('image_url'):
            print(f"  ⏭️  {scientific_name} - Already has image: {species['image_url']}")
            continue

        # Update the species
        try:
            update_data = {**species, "image_url": image_url}
            response = requests.put(
                f"{API_URL}/api/v1/species/{species_id}",
                headers=headers,
                json=update_data
            )

            if response.status_code in [200, 201]:
                success_count += 1
                print(f"  ✅ {scientific_name}")
            else:
                print(f"  ❌ {scientific_name} - Failed: {response.status_code}")
                print(f"     Response: {response.text[:100]}")
        except Exception as e:
            print(f"  ❌ {scientific_name} - Error: {e}")

    print(f"\n{'=' * 60}")
    print(f"✅ Successfully updated {success_count}/{len(species_images)} species!")
    print(f"{'=' * 60}\n")

if __name__ == "__main__":
    if TOKEN:
        main()
    else:
        print("❌ No token provided. Exiting.")
