"""One-off support fix (2026-10-05): set a keeper's huntsman to Holconia murrayensis.

The keeper asked (Instagram DM) to change her huntsman's species to Holconia
murrayensis. The mobile species picker couldn't save a name that wasn't in the
catalog (fixed in the app separately), and the species has since been added by
seed_care_holconia_murrayensis.py.

Changes ONE animal ("Grim", account 47djndy8dr) and only while it still reads
Heteropoda venatoria, so it is safe to re-run. Her common name ("Huntsman Spider")
is left as she wrote it.

Run on the Render shell, from apps/api:
    python3 fix_courtney_huntsman_20261005.py           # dry run
    python3 fix_courtney_huntsman_20261005.py --apply
"""
import sys

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.user import User

INVERT_ID = "792e9f3b-347a-433f-8358-726cd87f014d"
USERNAME = "47djndy8dr"
OLD_NAME = "Heteropoda venatoria"
NEW_NAME = "Holconia murrayensis"


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    try:
        species = db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == NEW_NAME.lower()).first()
        if species is None:
            print(f"{NEW_NAME} is not in the catalog yet — run seed_care_holconia_murrayensis.py first.")
            return 1
        animal = (
            db.query(Invert).join(User, User.id == Invert.user_id)
            .filter(Invert.id == INVERT_ID, User.username == USERNAME).first()
        )
        if animal is None:
            print("Animal not found for that account — nothing changed.")
            return 1
        if animal.scientific_name == NEW_NAME and animal.species_id == species.id:
            print(f"Already {NEW_NAME} — nothing to do.")
            return 0
        if animal.scientific_name != OLD_NAME:
            print(f"Species is now '{animal.scientific_name}', not {OLD_NAME} — she may have changed it herself. Nothing changed.")
            return 1
        print(f"{animal.name or animal.id}: {animal.scientific_name} -> {NEW_NAME} (linked to the care sheet)")
        if apply:
            animal.scientific_name = NEW_NAME
            animal.species_id = species.id
            db.commit()
            print("Done.")
        else:
            print("Dry run — nothing written. Add --apply to save.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
