"""Tarantula life-stage enum

Adds `tarantula.life_stage` so feeding-cadence predictions can pick the
right interval bucket on the species (sling vs juvenile vs adult).

  life_stage  tarantula_life_stage  NULL allowed

Nullable on purpose — keepers shouldn't be forced to classify their
spiders just to use the rest of the app. When set, the
/tarantulas/{id}/feeding-stats endpoint will compute a
species-recommended next-feeding date using
`species.feeding_interval_*_days_<life_stage>`. When null, the
endpoint omits the prediction (UI hides the tile, same as today).

Enum naming: NEW enum, not reusing one of the legacy uppercase types
(sex/source/carelevel). Lowercase values to match the recent
`reptile_pairing_type` / `reptile_offspring_status` convention from
rbr_20260429. The Python enum's `.value` is the same string, so
`values_callable=lambda x: [e.value for e in x]` keeps DB + ORM aligned
without having to think about it.

Revision ID: lst_20260501_add_tarantula_life_stage
Revises: fcd_20260501_add_species_feeding_intervals
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "lst_20260501_add_tarantula_life_stage"
down_revision = "fcd_20260501_add_species_feeding_intervals"
branch_labels = None
depends_on = None


_LIFE_STAGE_VALUES = ("sling", "juvenile", "adult")


def upgrade() -> None:
    life_stage = postgresql.ENUM(
        *_LIFE_STAGE_VALUES,
        name="tarantula_life_stage",
        create_type=True,
    )
    life_stage.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "tarantulas",
        sa.Column(
            "life_stage",
            postgresql.ENUM(
                *_LIFE_STAGE_VALUES,
                name="tarantula_life_stage",
                create_type=False,
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tarantulas", "life_stage")

    life_stage = postgresql.ENUM(
        *_LIFE_STAGE_VALUES,
        name="tarantula_life_stage",
        create_type=False,
    )
    life_stage.drop(op.get_bind(), checkfirst=True)
