"""How an animal eats, for deciding whether it has a feeding cadence at all.

`feeding_mode` lives on the species catalog (`invert_species.feeding_mode`),
not on the animal. Every caller used to read it from the linked species only,
so a millipede, isopod or roach with NO species linked fell through to the
generic 7-day default and was flagged overdue -- on Feeding Day, the web
dashboard, the feeding-status list and the daily push -- while the mobile
collection (which decides by taxon) showed nothing. Same animal, two answers.

This module is the one place that answers the question. The taxon defaults
mirror `feedingMode` in the mobile registry (`apps/mobile/src/lib/inverts.ts`,
`INVERT_TAXA`); `tests/test_feeding_mode_fallback.py` fails if they drift.
"""
from typing import Any, Optional

PREDATOR = "predator"
DETRITIVORE = "detritivore"
OMNIVORE = "omnivore"

# Taxa that graze standing food rather than taking live prey on a cadence.
# Every taxon not listed here is a predator by default.
TAXON_FEEDING_MODE = {
    "millipede": DETRITIVORE,
    "isopod": DETRITIVORE,
    "roach": OMNIVORE,
}


def effective_feeding_mode(taxon: Optional[str], species: Any = None) -> str:
    """The feeding mode to act on for one animal.

    A linked species that says it grazes (detritivore / omnivore) wins. Without
    one -- or when the species carries the column's 'predator' default -- the
    animal's taxon decides. A grazing taxon is never turned back into a
    predator by a species row: the catalog column is NOT NULL with a
    'predator' server default, so 'predator' on a millipede species is far
    more likely to be an unset value than a claim.
    """
    species_mode = (getattr(species, "feeding_mode", None) or "").strip().lower() if species is not None else ""
    if species_mode in (DETRITIVORE, OMNIVORE):
        return species_mode
    return TAXON_FEEDING_MODE.get((taxon or "").strip().lower(), PREDATOR)


def has_feeding_cadence(taxon: Optional[str], species: Any = None) -> bool:
    """True when "days since fed" means something for this animal, i.e. it
    takes live prey on a schedule. Grazers are never marked overdue, never
    counted in the digest, and never get a recommended interval -- unless the
    keeper sets one themselves (that check belongs to the caller)."""
    return effective_feeding_mode(taxon, species) == PREDATOR
