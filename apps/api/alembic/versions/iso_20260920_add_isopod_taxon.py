"""Add isopod taxon

Revision ID: iso_20260920_add_isopod_taxon
Revises: ult_20260911_ultimate_molt
Create Date: 2026-09-20

Context
-------
Isopods were being kept under `other`, which meant an isopod keeper picked
"🐾 Other invertebrate" and got generic everything: no husbandry framing, no
vocabulary, a size label reading "Size (mm)". Nine species were already
seeded that way (Armadillidium, Cubaris, Porcellio, Porcellionides,
Trichorhina), and colony mode — the feature isopod keepers actually want — was
labelling their broods "clutches".

They're also the one group where the app can be useful to someone who keeps no
spiders at all, which is the point of giving them a real taxon rather than a
catch-all.

THREE constraints, not two
--------------------------
The earlier taxon migrations (itx_20260605, rch_20260610) widened `inverts`
and `invert_species`. `colonies` gained its own taxon CHECK later with
ADR-010 and carries the same value list — miss it and creating an isopod
COLONY fails, which is precisely the thing isopod keepers do first. Verified
against production 2026-09-20: all three currently hold the same ten values.

Code that must stay in lockstep with this value set (the ADR-006 422 trap):
schemas/invert.py::TAXON_PATTERN, schemas/invert_species.py,
models/invert.py::INVERT_TAXON_VALUES, models/invert_species.py,
models/colony.py, routers/inverts.py list_inverts Query pattern,
routers/invert_species.py, and the INVERT_TAXA registries in
apps/mobile/src/lib/inverts.ts + apps/web/src/lib/inverts.ts.

Data
----
The nine existing isopod species are moved off `other` in the same
transaction, so the catalog is never in a state where isopods exist as a
taxon but no species carry it. Matched on genus, which is unambiguous for
these — they are all Oniscidea and no other invert genus shares those names.
Any user COLONY or INVERT already holding one of those species is moved too,
otherwise a keeper's existing isopods stay filed as "other" forever.

Safety
------
* Widening a CHECK is non-destructive (the old set is a subset of the new).
* The data moves are scoped by genus / species FK, so nothing else is touched.
* downgrade() moves isopod rows back to `other` BEFORE narrowing the CHECKs,
  so it doesn't strand rows that would violate the restored constraint.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'iso_20260920_add_isopod_taxon'
down_revision: Union[str, None] = 'ult_20260911_ultimate_molt'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_WITH_ISOPOD = (
    "'tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'roach', 'isopod', 'other'"
)
_WITHOUT_ISOPOD = (
    "'tarantula', 'scorpion', 'centipede', "
    "'whip_spider', 'vinegaroon', 'true_spider', "
    "'millipede', 'mantis', 'roach', 'other'"
)

# Oniscidean genera in the catalog. Unambiguous: no other invert genus here
# shares a name with these. Matched with TRIM because seeded genus values have
# picked up trailing whitespace before (see Nemo's common_name).
_ISOPOD_GENERA = (
    "'Armadillidium', 'Cubaris', 'Porcellio', 'Porcellionides', "
    "'Trichorhina', 'Merulanella', 'Nesodillo', 'Venezillo'"
)

_CHECKS = (
    ('inverts', 'inverts_taxon_check'),
    ('invert_species', 'invert_species_taxon_check'),
    ('colonies', 'colonies_taxon_check'),
)


def _swap_checks(values: str) -> None:
    for table, name in _CHECKS:
        op.drop_constraint(name, table, type_='check')
        op.create_check_constraint(name, table, f"taxon IN ({values})")


def upgrade() -> None:
    _swap_checks(_WITH_ISOPOD)

    # Catalog first, so the FK-following updates below can key off it.
    op.execute(
        f"""
        UPDATE invert_species
           SET taxon = 'isopod'
         WHERE taxon = 'other'
           AND (TRIM(genus) IN ({_ISOPOD_GENERA}) OR family ILIKE '%oniscid%')
        """
    )
    # Anything a keeper already recorded against one of those species.
    op.execute(
        """
        UPDATE colonies SET taxon = 'isopod'
         WHERE taxon = 'other'
           AND species_id IN (SELECT id FROM invert_species WHERE taxon = 'isopod')
        """
    )
    op.execute(
        """
        UPDATE inverts SET taxon = 'isopod'
         WHERE taxon = 'other'
           AND species_id IN (SELECT id FROM invert_species WHERE taxon = 'isopod')
        """
    )


def downgrade() -> None:
    # Move rows back BEFORE narrowing, or the restored CHECK would be violated
    # by the very rows this migration created.
    op.execute("UPDATE inverts SET taxon = 'other' WHERE taxon = 'isopod'")
    op.execute("UPDATE colonies SET taxon = 'other' WHERE taxon = 'isopod'")
    op.execute("UPDATE invert_species SET taxon = 'other' WHERE taxon = 'isopod'")
    _swap_checks(_WITHOUT_ISOPOD)
