"""HV taxon flexibility — animal_taxon enum -> VARCHAR + herp_species.taxon (ADR-011)

Revision ID: htx_20260703_animal_taxon
Revises: col_20260702_colonies
Create Date: 2026-07-03

Converts the rigid 3-value `animal_taxon` Postgres enum into a flexible VARCHAR
discriminator (+ widen-able CHECK), mirroring the proven `inverts.taxon`
pattern, so HV can cover many herp groups at launch without per-taxon enum
migrations. Also adds a `taxon` group column to the `herp_species` catalog so
species can be grouped/filtered.

Launch taxa: snake, lizard, turtle, tortoise, frog, salamander, other.
Only `animals.taxon` + `reptile_pairings.taxon` use the enum (verified against
prod 2026-07-03), so both are converted before the type is dropped.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "htx_20260703_animal_taxon"
down_revision: Union[str, None] = "col_20260702_colonies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TAXA = ("snake", "lizard", "turtle", "tortoise", "frog", "salamander", "other")
_IN = ", ".join(f"'{t}'" for t in _TAXA)


def upgrade() -> None:
    # 1) animals.taxon: enum -> varchar(20) + CHECK
    op.execute("ALTER TABLE animals ALTER COLUMN taxon TYPE varchar(20) USING taxon::text")
    op.create_check_constraint("animals_taxon_check", "animals", f"taxon IN ({_IN})")

    # 2) reptile_pairings.taxon: enum -> varchar(20) + CHECK (denormalized copy)
    op.execute("ALTER TABLE reptile_pairings ALTER COLUMN taxon TYPE varchar(20) USING taxon::text")
    op.create_check_constraint("reptile_pairings_taxon_check", "reptile_pairings", f"taxon IN ({_IN})")

    # 3) herp_species.taxon: new group column (nullable; backfilled later on the
    #    species-research track). CHECK allows NULL until backfilled.
    op.add_column("herp_species", sa.Column("taxon", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        "herp_species_taxon_check", "herp_species", f"taxon IS NULL OR taxon IN ({_IN})"
    )
    op.create_index("ix_herp_species_taxon", "herp_species", ["taxon"])

    # 4) the animal_taxon enum type is now unused -> drop it
    op.execute("DROP TYPE IF EXISTS animal_taxon")


def downgrade() -> None:
    # Recreate the enum + cast back. Only valid while every row is in the
    # original 3-value set (snake/lizard/frog); rows added under new taxa would
    # block the cast — acceptable for a down-migration.
    op.execute("CREATE TYPE animal_taxon AS ENUM ('snake', 'lizard', 'frog')")

    op.drop_index("ix_herp_species_taxon", table_name="herp_species")
    op.drop_constraint("herp_species_taxon_check", "herp_species", type_="check")
    op.drop_column("herp_species", "taxon")

    op.drop_constraint("reptile_pairings_taxon_check", "reptile_pairings", type_="check")
    op.execute(
        "ALTER TABLE reptile_pairings ALTER COLUMN taxon TYPE animal_taxon USING taxon::animal_taxon"
    )

    op.drop_constraint("animals_taxon_check", "animals", type_="check")
    op.execute("ALTER TABLE animals ALTER COLUMN taxon TYPE animal_taxon USING taxon::animal_taxon")
