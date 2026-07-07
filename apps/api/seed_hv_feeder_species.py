"""
Seed the Herpetoverse feeder catalog (ADR-012).

Reptile/aquatic/amphibian feeders — rodents, chicks, fish, and reptile-relevant
insects — separate from TV's invert feeder catalog. Honesty-first: care/handling
notes are grounded in published sources.

Sources:
  - Frozen feeder mouse size ladder + weight ranges:
    RodentPro size guide (rodentpro.com/informationcenter) and Loxahatchee
    Rodents frozen-mice size chart. Pinky ~1.5-3 g, fuzzy ~3-7 g, hopper/small
    ~7-13 g, weaned ~13-19 g, adult ~20-29 g, jumbo 30 g+.
  - Safe thawing (fridge overnight or lukewarm water ~1 hr for smalls; warm to
    ~95-105F before offering; NEVER microwave; avoid long counter-thaws in the
    40-140F bacterial danger zone): Petco frozen-thawed feeding guide, Polar
    Rodents thawing guide, The Breeding Lab.

Idempotent (checks by scientific_name). Run on the Render shell:
    cd apps/api && python seed_hv_feeder_species.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.hv_feeder import HvFeederSpecies


_THAW = (
    "Thaw frozen feeders in the fridge overnight, or seal in a bag and place in "
    "lukewarm (not hot) water — ~1 hr for smalls, longer for large rats. Warm the "
    "surface to ~95-105F right before offering so it reads as live prey. NEVER "
    "microwave (internal hot spots / rupture) and don't leave prey counter-thawing "
    "for hours (40-140F bacterial danger zone)."
)

MOUSE_SIZES = ["pinky", "fuzzy", "hopper", "weanling", "adult", "jumbo"]
RAT_SIZES = ["pinky", "fuzzy", "pup", "weaned", "small", "medium", "large", "jumbo"]

# category | care_level meaningful for LIVE feeders only.
SPECIES = [
    {
        "scientific_name": "Mus musculus",
        "common_names": ["House mouse", "Feeder mouse"],
        "category": "rodent", "care_level": "easy",
        "supports_sizes": True, "typical_sizes": MOUSE_SIZES,
        "prey_size_notes": (
            "Match prey width to the animal's widest point. By weight: pinky "
            "~1.5-3 g, fuzzy ~3-7 g, hopper/small ~7-13 g, weaned ~13-19 g, "
            "adult ~20-29 g, jumbo 30 g+."
        ),
        "handling_notes": _THAW,
        "care_notes": (
            "Most keepers buy frozen. If breeding live: 68-79F, dry bedding, "
            "unlimited rodent block + water, separate by sex to control numbers."
        ),
    },
    {
        "scientific_name": "Rattus norvegicus",
        "common_names": ["Rat", "Feeder rat"],
        "category": "rodent", "care_level": "easy",
        "supports_sizes": True, "typical_sizes": RAT_SIZES,
        "prey_size_notes": (
            "Rat sizes run pinky -> fuzzy -> pup -> weaned -> small -> medium -> "
            "large -> jumbo. Step up as the animal grows; prey no wider than the "
            "widest part of the body."
        ),
        "handling_notes": _THAW,
        "care_notes": "Usually fed frozen/thawed. Live breeding needs more space and handling than mice.",
    },
    {
        "scientific_name": "Mastomys natalensis",
        "common_names": ["African soft-furred rat", "ASF"],
        "category": "rodent", "care_level": "moderate",
        "supports_sizes": True, "typical_sizes": ["pinky", "fuzzy", "small", "medium", "large"],
        "prey_size_notes": "Small-bodied; popular for picky colubrids (e.g. some kingsnakes/rat snakes) and as a mouse alternative.",
        "handling_notes": _THAW,
        "care_notes": "Prolific live breeders; fast, agile — secure enclosures. Fed live or frozen.",
    },
    {
        "scientific_name": "Gallus gallus domesticus",
        "common_names": ["Day-old chick", "Feeder chick"],
        "category": "chick", "care_level": None,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "Occasional feeder for large monitors, tegus, and big snakes. High fat — use as variety, not a staple.",
        "handling_notes": _THAW + " Sold frozen; not typically bred by keepers.",
        "care_notes": None,
    },
    {
        "scientific_name": "Coturnix japonica",
        "common_names": ["Coturnix quail", "Jumbo quail"],
        "category": "chick", "care_level": "moderate",
        "supports_sizes": True, "typical_sizes": ["chick", "adult"],
        "prey_size_notes": "Whole-prey bird option for larger reptiles; good calcium/whole-prey nutrition.",
        "handling_notes": _THAW,
        "care_notes": "Can be raised live (quail keeping) or bought frozen.",
    },
    {
        "scientific_name": "Pimephales promelas",
        "common_names": ["Rosy red minnow", "Fathead minnow"],
        "category": "fish", "care_level": "easy",
        "temperature_min": 50, "temperature_max": 78,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "For aquatic/semi-aquatic feeders (some turtles, aquatic amphibians). Use sparingly.",
        "handling_notes": (
            "Honesty note: feeder fish like rosy reds/goldfish contain thiaminase "
            "(destroys vitamin B1) and can carry parasites — offer occasionally, "
            "not as a staple. Gut-load/quarantine live feeders when possible."
        ),
        "care_notes": "Hardy coldwater fish; if kept live, dechlorinated water, filtration, cool temps.",
    },
    {
        "scientific_name": "Poecilia reticulata",
        "common_names": ["Guppy", "Feeder guppy"],
        "category": "fish", "care_level": "easy",
        "temperature_min": 72, "temperature_max": 82,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "Small live fish for aquatic turtles and amphibians; livebearer, easy to culture.",
        "handling_notes": "Livebearer — easy to breed a feeder colony. Quarantine store-bought fish before offering.",
        "care_notes": "Tropical; dechlorinated water 72-82F, gentle filtration, some plants for fry cover.",
    },
    {
        "scientific_name": "Blaptica dubia",
        "common_names": ["Dubia roach"],
        "category": "insect", "care_level": "easy",
        "temperature_min": 77, "temperature_max": 95, "humidity_min": 40, "humidity_max": 60,
        "supports_sizes": True, "typical_sizes": ["nymph", "medium", "adult"],
        "typical_adult_size_mm": 45,
        "prey_size_notes": "Staple feeder for many reptiles/amphibians. Won't climb smooth walls or infest.",
        "handling_notes": None,
        "care_notes": "Warm bin 80-95F, egg-flat harborage, gut-load on veg + grain. Slow, easy to keep.",
    },
    {
        "scientific_name": "Acheta domesticus",
        "common_names": ["House cricket"],
        "category": "insect", "care_level": "easy",
        "temperature_min": 75, "temperature_max": 90, "humidity_min": 30, "humidity_max": 50,
        "supports_sizes": True, "typical_sizes": ["pinhead", "1/4 inch", "adult"],
        "typical_adult_size_mm": 25,
        "prey_size_notes": "Classic staple; sized by life stage for the animal's mouth. Gut-load before feeding.",
        "handling_notes": None,
        "care_notes": "Ventilated bin, egg-flats, dry food + a water gel. Odor-prone if overcrowded/dirty.",
    },
    {
        "scientific_name": "Manduca sexta",
        "common_names": ["Hornworm", "Goliath worm"],
        "category": "insect", "care_level": "moderate",
        "temperature_min": 75, "temperature_max": 85,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "Soft, high-moisture treat feeder that grows fast; great hydration/enrichment. Not a sole staple.",
        "handling_notes": None,
        "care_notes": "Kept on commercial hornworm chow in a cup; grow quickly at room temp — feed off before they pupate.",
    },
    {
        "scientific_name": "Zophobas morio",
        "common_names": ["Superworm"],
        "category": "insect", "care_level": "easy",
        "temperature_min": 70, "temperature_max": 85,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "High-fat treat feeder for larger reptiles; more chitin than crickets — feed in moderation.",
        "handling_notes": None,
        "care_notes": "Keep on bran/oat substrate with veg for moisture; won't refrigerate (unlike mealworms).",
    },
    {
        "scientific_name": "Hermetia illucens",
        "common_names": ["Black soldier fly larvae", "BSFL", "Calci-worm", "Phoenix worm"],
        "category": "insect", "care_level": "easy",
        "temperature_min": 75, "temperature_max": 95,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "Naturally high in calcium — one of the few feeders with a favorable Ca:P ratio. Excellent staple/supplement.",
        "handling_notes": None,
        "care_notes": "Low-maintenance; kept in the shipping medium at room temp, no gut-loading needed for calcium.",
    },
    {
        "scientific_name": "Lumbricus terrestris",
        "common_names": ["Nightcrawler", "Earthworm"],
        "category": "other", "care_level": "easy",
        "temperature_min": 45, "temperature_max": 65,
        "supports_sizes": False, "typical_sizes": None,
        "prey_size_notes": "Staple for many amphibians (salamanders, larger frogs) and aquatic turtles. Soft, nutritious, well-accepted.",
        "handling_notes": None,
        "care_notes": "Store cool (fridge ~45-55F) in moist bedding; rinse before feeding. Buy bait-shop worms not treated with additives.",
    },
]


def seed():
    db = SessionLocal()
    created = 0
    try:
        for row in SPECIES:
            sci = row["scientific_name"]
            if db.query(HvFeederSpecies).filter(
                HvFeederSpecies.scientific_name == sci
            ).first():
                continue
            db.add(HvFeederSpecies(
                scientific_name=sci,
                scientific_name_lower=sci.lower(),
                common_names=row.get("common_names"),
                category=row["category"],
                care_level=row.get("care_level"),
                temperature_min=row.get("temperature_min"),
                temperature_max=row.get("temperature_max"),
                humidity_min=row.get("humidity_min"),
                humidity_max=row.get("humidity_max"),
                supports_sizes=row.get("supports_sizes", False),
                typical_sizes=row.get("typical_sizes"),
                typical_adult_size_mm=row.get("typical_adult_size_mm"),
                prey_size_notes=row.get("prey_size_notes"),
                care_notes=row.get("care_notes"),
                handling_notes=row.get("handling_notes"),
                is_verified=True,
            ))
            created += 1
        db.commit()
        print(f"🎉 HV feeder catalog: created {created} species ({len(SPECIES) - created} already present).")
    except Exception as e:
        print(f"❌ Error seeding HV feeder species: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding Herpetoverse feeder catalog...")
    seed()
