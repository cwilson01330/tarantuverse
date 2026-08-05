"""Clear the references that don't clean themselves up when an animal is deleted.

WHY THIS EXISTS
---------------
Some tables point at an animal without an ON DELETE rule that covers them —
either because the constraint was added after the table existed, or because the
desired behaviour isn't what a cascade would do. Breeding pairings should go
when one of the pair goes; a pricing submission and an offspring record should
SURVIVE with a null pointer, because they carry their own history and hard
deleting them would destroy data the animal merely referenced.

The legacy tarantula delete has always done this by hand. `DELETE /inverts/{id}`
did not — it deleted both rows and trusted cascades. For a tarantula that had
ever been bred, `pairings.male_id` / `female_id` still pointed at the legacy row,
so the delete raised IntegrityError and 500'd. The animal deleted fine from the
old web page and not from the merged detail screen, which is the kind of
inconsistency that reads as the app being broken at random.

Keyed on the shared primary key, so one call covers both rows of the ADR-005
dual-write pair. Safe to call for any taxon — an id that isn't referenced simply
matches nothing.
"""
from typing import Any
from uuid import UUID


def clear_dependent_references(db: Any, animal_id: UUID | str) -> None:
    """Null or remove everything pointing at this animal that a cascade won't.

    Call BEFORE deleting the animal rows. Does not commit.
    """
    from app.models.offspring import Offspring
    from app.models.pairing import Pairing
    from app.models.pricing_submission import PricingSubmission

    # Preserved with a null pointer — these records outlive the animal.
    db.query(PricingSubmission).filter(
        PricingSubmission.tarantula_id == animal_id
    ).update({PricingSubmission.tarantula_id: None}, synchronize_session=False)

    # Offspring carries BOTH pointers during the dual-write window.
    db.query(Offspring).filter(Offspring.tarantula_id == animal_id).update(
        {Offspring.tarantula_id: None}, synchronize_session=False
    )
    db.query(Offspring).filter(Offspring.invert_id == animal_id).update(
        {Offspring.invert_id: None}, synchronize_session=False
    )

    # Removed outright — a pairing is meaningless once half of it is gone.
    # Four columns, not two: `pairings` gained invert-side ids under ADR-005 and
    # the legacy delete path still only clears the legacy pair, so deleting a
    # bred animal there can leave dangling invert references behind.
    db.query(Pairing).filter(
        (Pairing.male_id == animal_id)
        | (Pairing.female_id == animal_id)
        | (Pairing.male_invert_id == animal_id)
        | (Pairing.female_invert_id == animal_id)
    ).delete(synchronize_session="fetch")
