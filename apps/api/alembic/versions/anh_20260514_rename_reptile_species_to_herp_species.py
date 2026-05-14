"""Rename reptile_species -> herp_species

Revision ID: anh_20260514_rename_reptile_species_to_herp_species
Revises: anm_20260514_consolidate_to_animals
Create Date: 2026-05-14

Companion to anm_20260514 / ADR-003. The species catalog has always
been misnamed — it holds amphibians (frogs, as of F1) as well as
reptiles. "Herp" is the hobby-standard umbrella term for both. This
renames the table and the one surviving FK column (`animals` is the
only table that references it after the consolidation).

Postgres `ALTER TABLE ... RENAME` keeps FK *constraints* intact —
they're tracked by OID, not name. We still rename the constraint and
index identifiers so the schema reads consistently.

Pure rename, fully reversible.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'anh_20260514_rename_reptile_species_to_herp_species'
down_revision: Union[str, None] = 'anm_20260514_consolidate_to_animals'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Table rename — FK constraints follow automatically.
    op.execute('ALTER TABLE reptile_species RENAME TO herp_species')

    # The one surviving FK column lives on `animals` (snakes/lizards/
    # frogs were dropped in anm_20260514).
    op.execute(
        'ALTER TABLE animals RENAME COLUMN reptile_species_id TO herp_species_id'
    )

    # Rename the index. ALTER INDEX IF EXISTS guards against the
    # auto-generated name varying across environments.
    op.execute(
        'ALTER INDEX IF EXISTS ix_animals_reptile_species_id '
        'RENAME TO ix_animals_herp_species_id'
    )

    # Rename the FK constraint. Postgres has no `RENAME CONSTRAINT IF
    # EXISTS`, and the auto-generated name can vary (inline sa.ForeignKey
    # vs. named), so we look it up by the column it covers rather than
    # assuming the name. Constraint names don't auto-update when the
    # column is renamed, so it still matches the old "reptile_species"
    # pattern at this point.
    op.execute(
        """
        DO $$
        DECLARE con_name text;
        BEGIN
            SELECT conname INTO con_name
            FROM pg_constraint
            WHERE conrelid = 'animals'::regclass
              AND contype = 'f'
              AND conname LIKE '%reptile_species%';
            IF con_name IS NOT NULL THEN
                EXECUTE format(
                    'ALTER TABLE animals RENAME CONSTRAINT %I TO '
                    'animals_herp_species_id_fkey', con_name
                );
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE con_name text;
        BEGIN
            SELECT conname INTO con_name
            FROM pg_constraint
            WHERE conrelid = 'animals'::regclass
              AND contype = 'f'
              AND conname LIKE '%herp_species%';
            IF con_name IS NOT NULL THEN
                EXECUTE format(
                    'ALTER TABLE animals RENAME CONSTRAINT %I TO '
                    'animals_reptile_species_id_fkey', con_name
                );
            END IF;
        END $$;
        """
    )
    op.execute(
        'ALTER INDEX IF EXISTS ix_animals_herp_species_id '
        'RENAME TO ix_animals_reptile_species_id'
    )
    op.execute(
        'ALTER TABLE animals RENAME COLUMN herp_species_id TO reptile_species_id'
    )
    op.execute('ALTER TABLE herp_species RENAME TO reptile_species')
