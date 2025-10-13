"""
Seed forum categories based on popular tarantula community boards
Inspired by Arachnoboards, TarantulasWorld, and other exotic pet forums
"""
import sys
import os

# Add the parent directory to the path so we can import from app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.forum import ForumCategory

def seed_categories():
    """Seed forum categories based on popular tarantula boards"""
    db = SessionLocal()
    
    try:
        # Check if categories already exist
        existing_count = db.query(ForumCategory).count()
        if existing_count > 0:
            print(f"⚠️  Found {existing_count} existing categories.")
            response = input("Do you want to delete and recreate all categories? (yes/no): ")
            if response.lower() != 'yes':
                print("Aborted. No changes made.")
                return
            
            # Delete existing categories (cascade will handle threads/posts)
            db.query(ForumCategory).delete()
            db.commit()
            print("✅ Deleted existing categories")
        
        categories = [
            # Beginner & General Discussion
            {
                "name": "New to Tarantulas",
                "slug": "new-to-tarantulas",
                "description": "First time keeper? Start here! Ask questions, get advice, and learn the basics of tarantula care.",
                "icon": "🎓",
                "display_order": 1
            },
            {
                "name": "General Discussion",
                "slug": "general-discussion",
                "description": "Talk about anything tarantula-related. Share stories, photos, and connect with other keepers.",
                "icon": "💬",
                "display_order": 2
            },
            
            # Species-Specific
            {
                "name": "New World Species",
                "slug": "new-world-species",
                "description": "Discussion about New World tarantulas (Americas). Includes Brachypelma, Aphonopelma, Grammostola, and more.",
                "icon": "🌎",
                "display_order": 3
            },
            {
                "name": "Old World Species",
                "slug": "old-world-species",
                "description": "Discussion about Old World tarantulas (Africa, Asia, Europe). Includes Poecilotheria, Pterinochilus, Haplopelma, and more.",
                "icon": "🌍",
                "display_order": 4
            },
            {
                "name": "Arboreal Species",
                "slug": "arboreal-species",
                "description": "Tree-dwelling tarantulas like Avicularia, Poecilotheria, and Psalmopoeus. Discuss care, enclosures, and behavior.",
                "icon": "🌳",
                "display_order": 5
            },
            {
                "name": "Terrestrial & Fossorial Species",
                "slug": "terrestrial-fossorial",
                "description": "Ground-dwelling and burrowing tarantulas. Discuss substrate, hides, and species-specific care.",
                "icon": "⛰️",
                "display_order": 6
            },
            
            # Care & Husbandry
            {
                "name": "Enclosures & Setup",
                "slug": "enclosures-setup",
                "description": "Discuss enclosure types, sizes, substrate, decorations, and creating the perfect habitat.",
                "icon": "🏠",
                "display_order": 7
            },
            {
                "name": "Feeding & Nutrition",
                "slug": "feeding-nutrition",
                "description": "Feeding schedules, prey types, feeding refusals, and nutritional advice.",
                "icon": "🦗",
                "display_order": 8
            },
            {
                "name": "Health & Medical",
                "slug": "health-medical",
                "description": "Health concerns, molting issues, injuries, and emergency care. Seek advice from experienced keepers.",
                "icon": "🏥",
                "display_order": 9
            },
            {
                "name": "Molting & Growth",
                "slug": "molting-growth",
                "description": "Pre-molt signs, molt observations, growth rates, and tracking your T's development.",
                "icon": "📏",
                "display_order": 10
            },
            
            # Breeding & Advanced
            {
                "name": "Breeding & Reproduction",
                "slug": "breeding-reproduction",
                "description": "Pairing, egg sacs, raising slings, and breeding projects. For experienced keepers.",
                "icon": "🥚",
                "display_order": 11
            },
            {
                "name": "Sling Care",
                "slug": "sling-care",
                "description": "Raising spiderlings from 1st instar to juvenile. Discuss feeding, housing, and growth.",
                "icon": "🕷️",
                "display_order": 12
            },
            
            # Behavior & Science
            {
                "name": "Behavior & Temperament",
                "slug": "behavior-temperament",
                "description": "Discuss defensive displays, personality differences, handling (or not), and species behavior patterns.",
                "icon": "🧠",
                "display_order": 13
            },
            {
                "name": "Taxonomy & Identification",
                "slug": "taxonomy-identification",
                "description": "Species identification help, taxonomic changes, and scientific classification discussions.",
                "icon": "🔬",
                "display_order": 14
            },
            
            # Community & Collection
            {
                "name": "Photo Gallery",
                "slug": "photo-gallery",
                "description": "Show off your collection! Share photos and videos of your tarantulas, enclosures, and feeding.",
                "icon": "📸",
                "display_order": 15
            },
            {
                "name": "Collection Goals & Wishlist",
                "slug": "collection-goals",
                "description": "Discuss your dream species, collection planning, and future acquisition goals.",
                "icon": "📋",
                "display_order": 16
            },
            {
                "name": "DIY & Projects",
                "slug": "diy-projects",
                "description": "Build your own enclosures, create decorations, and share DIY projects for your tarantula setup.",
                "icon": "🔨",
                "display_order": 17
            },
            
            # Buying & Selling (Marketplace)
            {
                "name": "Marketplace - Buying",
                "slug": "marketplace-buying",
                "description": "Looking to buy? Post ISO (in search of) requests and ask for vendor recommendations.",
                "icon": "🛒",
                "display_order": 18
            },
            {
                "name": "Marketplace - Selling",
                "slug": "marketplace-selling",
                "description": "Breeders and sellers can advertise available tarantulas and supplies. Follow local laws.",
                "icon": "💰",
                "display_order": 19
            },
            {
                "name": "Vendor Reviews",
                "slug": "vendor-reviews",
                "description": "Share experiences with breeders, sellers, and suppliers. Help the community make informed purchases.",
                "icon": "⭐",
                "display_order": 20
            },
            
            # Events & Community
            {
                "name": "Expos & Events",
                "slug": "expos-events",
                "description": "Discuss reptile expos, spider shows, meetups, and community events.",
                "icon": "🎪",
                "display_order": 21
            },
            {
                "name": "Local Keeper Groups",
                "slug": "local-groups",
                "description": "Connect with keepers in your area. Organize meetups and share local resources.",
                "icon": "🌐",
                "display_order": 22
            },
            
            # Other Inverts
            {
                "name": "Scorpions",
                "slug": "scorpions",
                "description": "Discuss scorpion keeping, care, and species. Share experiences with these fascinating arachnids.",
                "icon": "🦂",
                "display_order": 23
            },
            {
                "name": "Other Invertebrates",
                "slug": "other-invertebrates",
                "description": "Centipedes, millipedes, beetles, mantids, and other inverts. Discuss care and share photos.",
                "icon": "🐛",
                "display_order": 24
            },
            
            # Off-Topic
            {
                "name": "Off-Topic Lounge",
                "slug": "off-topic",
                "description": "Non-tarantula discussions. Chat about anything: life, hobbies, news, and random topics.",
                "icon": "☕",
                "display_order": 25
            },
            
            # Help & Support
            {
                "name": "Site Feedback & Support",
                "slug": "site-feedback",
                "description": "Report bugs, suggest features, and get help using Tarantuverse. We're always improving!",
                "icon": "🛠️",
                "display_order": 26
            },
        ]
        
        # Create categories
        created_count = 0
        for cat_data in categories:
            category = ForumCategory(**cat_data)
            db.add(category)
            created_count += 1
        
        db.commit()
        print(f"✅ Successfully created {created_count} forum categories!")
        print("\nCategories created:")
        print("-" * 80)
        
        # Display created categories
        all_categories = db.query(ForumCategory).order_by(ForumCategory.display_order).all()
        for cat in all_categories:
            print(f"{cat.icon}  {cat.name:40} ({cat.slug})")
        
        print("-" * 80)
        print(f"\n🎉 Forum is ready! Visit /community/forums to see all {created_count} categories.")
        
    except Exception as e:
        print(f"❌ Error seeding categories: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding forum categories...")
    print("=" * 80)
    seed_categories()
