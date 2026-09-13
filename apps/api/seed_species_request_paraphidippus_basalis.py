"""
Seed Paraphidippus basalis (Agave Jumping Spider) into `invert_species`.

Run with: python3 seed_species_request_paraphidippus_basalis.py  (idempotent)

Requested by a keeper via DM 2026-09-13 — she'd filed it under "other" because
it wasn't in the catalog, which she described as making her OCD go crazy. That
is a real signal about the catalog, not a quirk: an animal filed under a
catch-all is an animal whose care sheet, cadence and species stats all go
missing.

The catalog already holds 17 Salticidae, so the genus-level husbandry here is
consistent with those entries rather than newly invented: small arboreal
ambush hunter, vertical enclosure, daily light, flying prey.

WHAT IS DELIBERATELY THIN
-------------------------
P. basalis is far less commonly kept than Phidippus regius or audax and there
is correspondingly less husbandry written about it. Temperature and humidity
are given as the genus range the other entries use; nothing species-specific
is asserted that I couldn't support. Lifespan is omitted rather than guessed —
Salticidae are typically annual, but the figures in circulation for this
species specifically are not worth publishing as fact.
"""
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


SPECIES_DATA = [
    {
        "taxon": "true_spider",
        "scientific_name": "Paraphidippus basalis",
        "common_names": ["Agave Jumping Spider", "Agave Jumper"],
        "genus": "Paraphidippus", "family": "Salticidae", "order_name": "Araneae",
        "care_level": "beginner",
        "temperament": "bold, visual, non-defensive",
        "native_region": "Southwestern United States and Mexico",
        "adult_size": "0.4-0.6 inches",
        "growth_rate": "fast",
        "type": "arboreal",
        "burrowing": "none",
        "temperature_min": 70, "temperature_max": 85,
        "humidity_min": 50, "humidity_max": 70,
        "enclosure_size_adult": "tall rather than wide; roughly 4x4x6 inches or more",
        "substrate_depth": "1 inch",
        "substrate_type": "coco fiber; the substrate matters far less than vertical structure",
        "feeding_mode": "predator",
        "prey_size": "flies, small crickets, roach nymphs",
        "feeding_frequency_adult": "every 2-3 days",
        "water_dish_required": False,
        "communal_suitable": False,
        "urticating_hairs": False,
        "medically_significant_venom": False,
        "venom_severity": "mild",
        "webbing_amount": "retreat webbing only",
        "care_guide": (
            "A southwestern US jumping spider associated with agave and yucca, "
            "less commonly kept than the Phidippus species but cared for the "
            "same way. "
            "Jumping spiders are visual, diurnal hunters and that drives "
            "everything about the enclosure: height over floor space so they can "
            "climb and build a retreat near the top, plenty of anchor points, and "
            "a bright day cycle — they hunt by sight and a dark enclosure means a "
            "spider that won't eat. Ventilation should be generous; they do not "
            "want a humid box. "
            "Feed flying prey where possible; they take flies enthusiastically and "
            "small crickets or roach nymphs readily. They drink from misted "
            "droplets rather than a dish, so a light mist on the webbing a few "
            "times a week is enough — standing water is a drowning risk at this "
            "size. "
            "Harmless. The bite is medically insignificant and these are among "
            "the least defensive spiders in the hobby; the bold, head-turning "
            "curiosity people describe is genuine, not anthropomorphism — they "
            "have the best eyesight of any spider and will watch you back."
        ),
    },
]


def seed():
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(
                InvertSpecies.scientific_name_lower == name.lower()
            ).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(),
                taxon=taxon,
                scientific_name_lower=name.lower(),
                slug=_slugify(name),
                **row,
            ))
            added += 1
            print(f"  Added [{taxon}]: {name}")
        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
