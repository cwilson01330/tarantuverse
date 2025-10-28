"""
Simple database update for species images - no model imports
Run this on Render or locally with database access
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ DATABASE_URL environment variable not set")
    exit(1)

# Create engine and session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

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
        print("UPDATING SPECIES IMAGES (Direct SQL)")
        print("=" * 60)

        success_count = 0

        for scientific_name, image_url in species_images.items():
            # Check if species exists and doesn't have an image
            result = db.execute(
                text("SELECT id, image_url FROM species WHERE scientific_name = :name"),
                {"name": scientific_name}
            ).fetchone()

            if not result:
                print(f"  ⏭️  {scientific_name} - Not found")
                continue

            species_id, current_image = result

            if current_image:
                print(f"  ⏭️  {scientific_name} - Already has image: {current_image}")
                continue

            # Update image_url
            db.execute(
                text("UPDATE species SET image_url = :image_url WHERE id = :id"),
                {"image_url": image_url, "id": species_id}
            )
            success_count += 1
            print(f"  ✅ {scientific_name} → {image_url}")

        # Commit all changes
        db.commit()

        print("\n" + "=" * 60)
        print(f"✅ Successfully updated {success_count}/{len(species_images)} species!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_images()
