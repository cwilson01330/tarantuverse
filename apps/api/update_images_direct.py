"""
Direct database update for species images
Run this on Render or locally with database access
"""
from app.database import SessionLocal
from app.models.species import Species

species_images = {
    "Grammostola rosea": "/species-images/grammostola_rosea.jpg",
    "Brachypelma hamorii": "/species-images/brachypelma_hamorii.jpg",
    "Aphonopelma chalcodes": "/species-images/aphonopelma_chalcodes.jpg",
    "Caribena versicolor": "/species-images/caribena_versicolor.jpg",
    "Tliltocatl albopilosus": "/species-images/tliltocatl_albopilosus.jpg",
}

def update_images():
    db = SessionLocal()

    try:
        print("=" * 60)
        print("UPDATING SPECIES IMAGES (Direct Database)")
        print("=" * 60)

        success_count = 0

        for scientific_name, image_url in species_images.items():
            # Find species
            species = db.query(Species).filter(
                Species.scientific_name == scientific_name
            ).first()

            if not species:
                print(f"  ⏭️  {scientific_name} - Not found")
                continue

            if species.image_url:
                print(f"  ⏭️  {scientific_name} - Already has image: {species.image_url}")
                continue

            # Update image_url
            species.image_url = image_url
            success_count += 1
            print(f"  ✅ {scientific_name} → {image_url}")

        # Commit all changes
        db.commit()

        print("\n" + "=" * 60)
        print(f"✅ Successfully updated {success_count}/{len(species_images)} species!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_images()
