"""One-off support fix (2026-10-05): link two of a keeper's spiders to new care sheets.

Run AFTER seed_care_velvet_and_wolf_spiders.py. Each animal is only touched
while it still belongs to the account and still reads the same species
(ignoring capitalisation), so it is safe to re-run. Common names are left as
she wrote them; only the scientific name's capitalisation is tidied.

Run on the Render shell, from apps/api:
    python3 fix_courtney_spiders_20261005.py           # dry run
    python3 fix_courtney_spiders_20261005.py --apply
"""
import sys

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.user import User

USERNAME = "47djndy8dr"
ANIMALS = {
    # invert id: canonical species name (matches what she typed, case-insensitively)
    "67832353-acc5-45f6-848e-b4253bcd5d23": "Stegodyphus lineatus",  # Horus
    "ddea8813-0d27-40e9-bfed-2ce25c09ec90": "Hogna maderiana",       # Astel
}


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    failures = 0
    try:
        for invert_id, name in ANIMALS.items():
            species = db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first()
            if species is None:
                print(f"  ! {name} is not in the catalog yet — run seed_care_velvet_and_wolf_spiders.py first.")
                failures += 1
                continue
            animal = (
                db.query(Invert).join(User, User.id == Invert.user_id)
                .filter(Invert.id == invert_id, User.username == USERNAME).first()
            )
            if animal is None:
                print(f"  ! {invert_id}: not found for that account — skipped.")
                failures += 1
                continue
            label = animal.name or invert_id
            if animal.species_id == species.id and animal.scientific_name == name:
                print(f"  = {label}: already linked to {name}.")
                continue
            if (animal.scientific_name or "").strip().lower() != name.lower():
                print(f"  ! {label}: species is now '{animal.scientific_name}' — she may have changed it. Skipped.")
                failures += 1
                continue
            print(f"  {'✓' if apply else '·'} {label}: '{animal.scientific_name}' -> {name} (linked to the care sheet)")
            if apply:
                animal.scientific_name = name
                animal.species_id = species.id
        if apply:
            db.commit()
        print("Done." if apply else "Dry run — nothing written. Add --apply to save.")
        return 1 if failures else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
