"""
Resolve breeding parents once, on the server.

THE PROBLEM THIS REPLACES
-------------------------
`PairingResponse` returned bare ids, so every client resolved parent names by
fetching the WHOLE tarantula list and building a lookup map. There are four
copies of that hack (mobile breeding hub + pairing detail, web breeding hub +
pairing detail), and each one is wrong in the same way: a non-tarantula pairing
leaves `male_id`/`female_id` NULL, so `map.get(null)` misses and the parent
renders blank. A keeper sees a pairing with no animals in it.

Fixing that client-side means fixing it four times and then again for every
future taxon. Resolving it here fixes it everywhere, once, and means enabling a
new taxon needs no read-path changes at all — which is the whole point of the
ADR-005 unified surface.

The shape is lifted from `routers/transfers.py::_parent_sci`, which already got
this right for the pedigree snapshot: prefer the generic invert FK, fall back to
the legacy tarantula relation. This generalises that from one string to a full
summary, and does it in one query per side instead of per row.

WHY A SUMMARY AND NOT JUST A NAME
---------------------------------
The hubs want to show what a keeper would recognise — nickname, species, sex,
photo. Returning `taxon` too lets the client pick the right vocabulary
(egg sac vs ootheca vs brood; see taxon-modules.ts) without a second lookup.
"""
from __future__ import annotations

from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.invert import Invert
from app.models.pairing import Pairing
from app.models.tarantula import Tarantula


def _summary(
    *,
    animal_id: UUID,
    name: Optional[str],
    common_name: Optional[str],
    scientific_name: Optional[str],
    sex: Optional[object],
    taxon: str,
    photo_url: Optional[str],
) -> dict:
    """One parent, in the shape the clients render.

    `display_name` is computed here rather than in each client so the four
    surfaces can't disagree about what to call an unnamed animal. Falls back
    through nickname → common name → scientific name → a taxon-neutral
    placeholder; never an empty string, which is what rendered as a blank row.
    """
    display = name or common_name or scientific_name or "Unnamed"
    # sex is a plain VARCHAR holding UPPERCASE enum names in prod (the shared DB
    # convention), so normalise for display rather than trusting the column.
    sex_value = getattr(sex, "value", sex)
    return {
        "id": str(animal_id),
        "display_name": display,
        "name": name,
        "common_name": common_name,
        "scientific_name": scientific_name,
        "sex": sex_value.lower() if isinstance(sex_value, str) else None,
        "taxon": taxon,
        "photo_url": photo_url,
    }


def resolve_parents(db: Session, pairings: Iterable[Pairing]) -> dict[UUID, dict]:
    """Map pairing id -> {"male": summary|None, "female": summary|None}.

    Batched deliberately: the per-row version of this was an N+1 that got worse
    with every pairing a breeder recorded. Two queries total regardless of how
    many pairings come in.

    A parent that can't be resolved yields None rather than a partial dict —
    the animal may genuinely have been deleted, and inventing a placeholder
    would misrepresent the record. Clients render None as "Unknown animal",
    which is true, instead of a blank space, which looks like a bug.
    """
    pairings = list(pairings)
    if not pairings:
        return {}

    invert_ids: set[UUID] = set()
    tarantula_ids: set[UUID] = set()
    for p in pairings:
        for invert_fk, legacy_fk in (
            (p.male_invert_id, p.male_id),
            (p.female_invert_id, p.female_id),
        ):
            if invert_fk:
                invert_ids.add(invert_fk)
            elif legacy_fk:
                # Only chase the legacy table when there's no invert FK. Under
                # dual-write both are set for tarantulas and the inverts row is
                # the canonical one.
                tarantula_ids.add(legacy_fk)

    inverts: dict[UUID, Invert] = {}
    if invert_ids:
        inverts = {
            i.id: i
            for i in db.query(Invert).filter(Invert.id.in_(invert_ids)).all()
        }

    tarantulas: dict[UUID, Tarantula] = {}
    if tarantula_ids:
        tarantulas = {
            t.id: t
            for t in db.query(Tarantula).filter(Tarantula.id.in_(tarantula_ids)).all()
        }

    def one(invert_fk: Optional[UUID], legacy_fk: Optional[UUID]) -> Optional[dict]:
        if invert_fk and invert_fk in inverts:
            i = inverts[invert_fk]
            return _summary(
                animal_id=i.id,
                name=i.name,
                common_name=i.common_name,
                scientific_name=i.scientific_name,
                sex=i.sex,
                taxon=i.taxon,
                photo_url=i.photo_url,
            )
        if legacy_fk and legacy_fk in tarantulas:
            t = tarantulas[legacy_fk]
            return _summary(
                animal_id=t.id,
                name=t.name,
                common_name=t.common_name,
                scientific_name=t.scientific_name,
                sex=t.sex,
                # A row reachable only through `tarantulas` is by definition a
                # tarantula; the legacy table has no taxon column.
                taxon="tarantula",
                photo_url=t.photo_url,
            )
        return None

    return {
        p.id: {
            "male": one(p.male_invert_id, p.male_id),
            "female": one(p.female_invert_id, p.female_id),
        }
        for p in pairings
    }


def attach_parents(db: Session, pairings: Iterable[Pairing]) -> list[Pairing]:
    """Hang resolved parents on the ORM objects for Pydantic to pick up.

    NAMED `male_parent`/`female_parent`, NOT `male`/`female`. Those two are
    real SQLAlchemy relationships to `Tarantula` (models/pairing.py:70-71);
    assigning a dict over a mapped relationship marks the instance dirty and
    the next flush tries to persist it. Anything unmapped is safe — these are.
    """
    pairings = list(pairings)
    resolved = resolve_parents(db, pairings)
    for p in pairings:
        pair = resolved.get(p.id, {})
        setattr(p, "male_parent", pair.get("male"))
        setattr(p, "female_parent", pair.get("female"))
    return pairings
