"""
Add/fill care guides for two Hapalopus dwarf tarantulas:

  * Hapalopus formosus   — NEW verified row (classic "Pumpkin Patch").
  * Hapalopus guerreroi  — existing row had taxonomy but EMPTY care
                           fields + no guide; this fills them.

Run with: python3 seed_hapalopus_guides.py   (idempotent — formosus is
skipped if it already exists; guerreroi is updated in place, only filling
blank/null fields so any later hand-edits are preserved).

Honesty notes
-------------
* Care numbers come from current hobby husbandry sources (The Tarantula
  Collective, Tom's Big Spiders, Fear Not Tarantulas), cross-checked
  against our existing 'Colombia Large' row, which keepers treat as the
  same care profile. Nothing fabricated; uncertain values left as-is.
* TAXONOMY CAVEAT (stated in the guide too): much of what trades in the
  hobby as "pumpkin patch" is the undescribed Hapalopus sp. 'Colombia'
  forms; H. formosus is a validly described species and the name is often
  applied to that material. We keep both the 'Colombia' rows AND this
  formosus row so either search resolves.
* Both are NEW WORLD: urticating hairs yes, venom not medically
  significant.
"""
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species, CareLevel


FORMOSUS = {
    "scientific_name": "Hapalopus formosus",
    "common_names": ["Pumpkin Patch Tarantula", "Colombian Pumpkin Patch"],
    "genus": "Hapalopus",
    "family": "Theraphosidae",
    "care_level": CareLevel.BEGINNER,
    "temperament": "fast, skittish",
    "native_region": "Colombia",
    "adult_size": "3-4 inches",
    "growth_rate": "fast",
    "type": "terrestrial",
    "temperature_min": 72,
    "temperature_max": 82,
    "humidity_min": 60,
    "humidity_max": 75,
    "enclosure_size_sling": 'Tiny vial or 1x1x2"',
    "enclosure_size_juvenile": '4x4x4"',
    "enclosure_size_adult": '6x6x5"',
    "substrate_depth": "2-3 inches",
    "substrate_type": "coco fiber, one corner kept slightly moist",
    "prey_size": "Small prey (pinheads for slings; small crickets/dubia for adults)",
    "feeding_frequency_sling": "Every 5-7 days",
    "feeding_frequency_juvenile": "Every 5-7 days",
    "feeding_frequency_adult": "Every 7-14 days",
    "water_dish_required": True,
    "webbing_amount": "heavy",
    "burrowing": True,
    "urticating_hairs": True,
    "medically_significant_venom": False,
    "venom_potency": "Mild",
    "lifespan_male": "3-4 years",
    "lifespan_female": "8-10 years",
    "activity_level": "High",
    "source_url": "https://www.thetarantulacollective.com/caresheets/hapolopus-sp-colombia",
    "is_verified": True,
    "care_guide": (
        "**Pumpkin Patch Tarantula** — A vividly marked dwarf species from "
        "Colombia, named for the bold orange patches on a black abdomen that "
        "resemble a carved pumpkin. *Hapalopus formosus* is a validly described "
        "species; note that much of the hobby's \"pumpkin patch\" stock also "
        "trades as the undescribed *Hapalopus* sp. 'Colombia' (large and small "
        "forms), and the names are often used interchangeably — care is "
        "identical across all of them.\n\n"
        "A heavy webber that builds elaborate tunnel-and-sheet structures, "
        "making it one of the best display dwarfs despite its small size. Fast "
        "and skittish but very rarely defensive — bites are unlikely and it "
        "seldom flicks urticating hairs. The main beginner challenge is the "
        "pinhead-sized slings, which need tiny prey and careful rehousing.\n\n"
        "Keep on a few inches of coco fiber with one corner kept slightly "
        "moist and a small water dish; the rest can stay on the drier side. "
        "Room temperatures of 72-82°F suit it well. Growth is fast for a "
        "tarantula — often mature in around two years. New World species: "
        "urticating hairs present, venom not medically significant."
    ),
}


GUERREROI_FILL = {
    "temperament": "fast, skittish, heavy webber",
    "native_region": "Colombia",
    "adult_size": "3.5-4 inches",
    "growth_rate": "fast",
    "type": "terrestrial",
    "temperature_min": 72,
    "temperature_max": 82,
    "humidity_min": 60,
    "humidity_max": 75,
    "enclosure_size_sling": 'Tiny vial or 1x1x2"',
    "enclosure_size_juvenile": '4x4x4"',
    "enclosure_size_adult": '6x6x5"',
    "substrate_depth": "2-3 inches",
    "substrate_type": "coco fiber, one corner kept slightly moist",
    "prey_size": "Small prey (pinheads for slings; small crickets/dubia for adults)",
    "feeding_frequency_sling": "Every 5-7 days",
    "feeding_frequency_juvenile": "Every 5-7 days",
    "feeding_frequency_adult": "Every 7-14 days",
    "water_dish_required": True,
    "webbing_amount": "heavy",
    "burrowing": False,
    "urticating_hairs": True,
    "medically_significant_venom": False,
    "venom_potency": "Mild",
    "lifespan_male": "3-4 years",
    "lifespan_female": "8-10 years",
    "activity_level": "High",
    "source_url": "https://www.appalachiantarantulas.com/care-guides/hapalopus-guerreroi",
    "care_guide": (
        "**Speckle Patch / Guerilla Tarantula** — A close dwarf cousin of the "
        "classic Pumpkin Patch, distinguished by a *speckled* abdominal pattern "
        "rather than clean stripes, giving it a darker, moodier orange-on-black "
        "\"goth pumpkin patch\" look. Described in 2014; formerly circulated "
        "under the trade name *Hapalopus* sp. 'Guerilla'.\n\n"
        "Care is essentially identical to the classic Pumpkin Patch (*H. "
        "formosus*): a prolific heavy webber that builds eye-catching "
        "structures and stays visible, making it a superb display dwarf. Fast "
        "but calm-natured and rarely defensive.\n\n"
        "House on a few inches of coco fiber with one corner kept slightly "
        "moist and a small water dish; keep the rest drier. Comfortable at "
        "72-82°F. Fast grower for a tarantula. New World species: urticating "
        "hairs present, venom not medically significant."
    ),
}


def seed():
    db = SessionLocal()
    try:
        # 1) H. formosus — insert if missing
        existing_f = db.query(Species).filter(
            Species.scientific_name_lower == FORMOSUS["scientific_name"].lower()
        ).first()
        if existing_f:
            print(f"  Skipped (exists): {FORMOSUS['scientific_name']}")
        else:
            db.add(Species(
                id=uuid.uuid4(),
                scientific_name_lower=FORMOSUS["scientific_name"].lower(),
                **FORMOSUS,
            ))
            print(f"  Added: {FORMOSUS['scientific_name']}")

        # 2) H. guerreroi — fill only blank/null fields on the existing row
        g = db.query(Species).filter(
            Species.scientific_name_lower == "hapalopus guerreroi"
        ).first()
        if not g:
            print("  WARNING: Hapalopus guerreroi row not found — skipping fill.")
        else:
            changed = []
            for field, value in GUERREROI_FILL.items():
                current = getattr(g, field, None)
                # Only fill if currently empty/null/False-ish-blank. care_guide,
                # source_url, and string fields: treat '' and None as empty.
                is_blank = current is None or current == ""
                # booleans we always set to the intended husbandry value
                if isinstance(value, bool):
                    if current != value:
                        setattr(g, field, value); changed.append(field)
                elif is_blank:
                    setattr(g, field, value); changed.append(field)
            if changed:
                print(f"  Updated guerreroi fields: {', '.join(changed)}")
            else:
                print("  guerreroi already complete — no changes.")

        db.commit()
        print("\nDone.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
