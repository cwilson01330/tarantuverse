"""
Add the Mascara Giant Birdeater (Pamphobeteus sp. 'mascara') to the
legacy tarantula `species` table.

Run with: python3 seed_pamphobeteus_mascara.py  (idempotent — skips if
the row already exists).

Why: appalachiantarantulas.com (and TV) resolve care guides by scientific
name; this popular species was missing entirely, so /species/by-name/
404'd on every request. Scientific name is kept as
"Pamphobeteus sp. 'mascara'" (lowercase 'mascara') to match the slug the
storefront already links to.

Honesty notes
-------------
* Care numbers from current hobby husbandry sources (Grimoire Exotics,
  The Tarantula Collective genus guide, Arachnoboards). Uncertain values
  left null rather than fabricated.
* New World: urticating hairs yes, venom not medically significant.
* Temperament genuinely varies keeper-to-keeper (docile to defensive) —
  the guide says so rather than overclaiming docility.
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel


DATA = {
    "scientific_name": "Pamphobeteus sp. 'mascara'",
    "common_names": ["Mascara Giant Birdeater", "Mascara Giant Bird-eater"],
    "genus": "Pamphobeteus",
    "family": "Theraphosidae",
    "care_level": CareLevel.INTERMEDIATE,
    "temperament": "skittish",
    "native_region": "South America (Bolivia, Peru)",
    "adult_size": "7-9 inches",
    "growth_rate": "fast",
    "type": "terrestrial",
    "temperature_min": 75,
    "temperature_max": 85,
    "humidity_min": 60,
    "humidity_max": 80,
    "enclosure_size_sling": 'Small vial or 2x2x3"',
    "enclosure_size_juvenile": '6x6x6"',
    "enclosure_size_adult": '12x12x12" or 10+ gallon',
    "substrate_depth": "4-6 inches",
    "substrate_type": "coco fiber / peat moss mix; deep enough to burrow",
    "prey_size": "Appropriately sized prey (up to ~2/3 body length)",
    "feeding_frequency_sling": "Every 4-5 days",
    "feeding_frequency_juvenile": "Once per week",
    "feeding_frequency_adult": "Every 1-2 weeks",
    "water_dish_required": True,
    "webbing_amount": "light",
    "burrowing": True,
    "urticating_hairs": True,
    "medically_significant_venom": False,
    "venom_potency": "Mild",
    "lifespan_male": "3-4 years",
    "lifespan_female": "12-15 years",
    "activity_level": "Moderate",
    "source_url": "https://www.grimoireexotics.com/post/pamphobeteus-sp-mascara-mascara-giant-bird-eater-care-guide",
    "is_verified": True,
    "care_guide": (
        "**Mascara Giant Birdeater** — A large, fast-growing New World "
        "terrestrial from South America (Bolivia and Peru), introduced to the "
        "US hobby around 2019. Named for the rose/red 'mascara' blush behind "
        "the eyes and across the carapace against high-contrast black femurs. "
        "Unusually for the genus, mature males are the more colorful sex — deep "
        "purple with pink highlights — while females mature darker brown; the "
        "juvenile 'Christmas tree' abdominal marking often persists into "
        "adulthood.\n\n"
        "An intermediate keeper's species mainly because of its size, speed, "
        "and appetite rather than any special difficulty. Temperament varies "
        "noticeably between individuals: some settle into bold display animals, "
        "others stay skittish or defensive and will bolt or kick urticating "
        "hairs when disturbed — handling isn't recommended.\n\n"
        "Provide deep substrate (4-6 inches of coco fiber / peat) so it can "
        "burrow, a water dish, and room to grow into a 10+ gallon footprint. "
        "More forgiving of drier conditions than most Pamphobeteus — keep one "
        "corner damp and the water dish full rather than soaking the whole "
        "enclosure. Comfortable at 75-85°F. New World: urticating hairs "
        "present, venom not medically significant."
    ),
}


def seed():
    db = SessionLocal()
    try:
        existing = db.query(Species).filter(
            Species.scientific_name_lower == DATA["scientific_name"].lower()
        ).first()
        if existing:
            print(f"  Skipped (exists): {DATA['scientific_name']}")
            return
        db.add(Species(
            id=uuid.uuid4(),
            scientific_name_lower=DATA["scientific_name"].lower(),
            **DATA,
        ))
        db.commit()
        print(f"  Added: {DATA['scientific_name']}")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
