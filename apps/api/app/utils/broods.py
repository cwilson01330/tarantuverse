"""Egg sacs, oothecae and broods: which animals have them, and who may touch one.

Kept in lockstep with the egg_sacs CHECKs (migration brd_20261113_egg_sac_groups)
and, from Task 3, with the client registries (tests/test_taxon_lists_in_sync.py).
"""
from typing import Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.egg_sac import EggSac
from app.utils.access import Access, access_helper, load_invert, require

# Taxa whose females lay sacs/oothecae or bear broods the keeper groups.
BROOD_TAXA: tuple = ("true_spider", "mantis", "tarantula", "scorpion")

# The colony bucket a hatched group starts in.
BROOD_BUCKET = {
    "true_spider": "slings",
    "tarantula": "slings",
    "mantis": "nymphs",
    "scorpion": "scorplings",
}

# NULL = still waiting.
EGG_SAC_OUTCOMES = ("hatched", "failed")


@access_helper
def load_egg_sac(db: Session, user, egg_sac_id: UUID, need: str) -> Tuple[EggSac, Access]:
    """A sac with its access check.

    With a mother, access follows the mother (owner plus co-keepers at `need`).
    Without one (a pairing-only sac) it stays owner-only; anyone else gets 404.
    """
    sac = db.query(EggSac).filter(EggSac.id == egg_sac_id).first()
    if sac is None:
        raise HTTPException(status_code=404, detail="Egg sac not found")
    if sac.mother_invert_id is not None:
        _mother, access = load_invert(db, user, sac.mother_invert_id, need, not_found="Egg sac not found")
        return sac, access
    if sac.user_id != user.id:
        raise HTTPException(status_code=404, detail="Egg sac not found")
    return sac, require(db, user, user.id, "tarantuverse", need, not_found="Egg sac not found")
