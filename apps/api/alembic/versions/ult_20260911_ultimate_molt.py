"""Mark the molt that matured an animal.

Revision ID: ult_20260911_ultimate_molt
Revises: cwc_20260910_colony_care
Create Date: 2026-09-11

The ultimate molt is the most consequential event in a male tarantula's life
and the app had no way to record it. He grows hooks and emboli, he will NEVER
MOLT AGAIN, and he is on a clock measured in months rather than years.

WHAT WAS ACTUALLY BROKEN
------------------------
`predict_premolt` checks neither sex nor maturity. For a matured male with
molt history it keeps computing `molt_interval_progress`, and branch 3 — past
110% of the average interval and more than 30 days since the last molt — fires
on its own with no refusals needed. So the app tells a keeper his mature male
is "likely in premolt", and keeps telling him that forever, about an animal
that is biologically incapable of molting again.

Measured 2026-09-11: 16 live male tarantulas with molt history, test account
excluded. Every one of them walks into this the moment they mature.

WHY IT'S A FLAG ON THE MOLT, NOT A FIELD ON THE ANIMAL
------------------------------------------------------
Terminal molts are not a tarantula-male peculiarity:

  * tarantulas  — males only; females molt for life
  * mantids     — BOTH sexes; the adult molt is terminal
  * true spiders— males terminal, many females effectively so
  * scorpions   — generally stop after maturity
  * whip spiders— keep molting as adults
  * isopods     — molt for life

Taxon- and sex-dependent in a way that isn't worth inferring, so the keeper
sets it and it rides on the event it describes. `molt_logs` is already
polymorphic across every parent type, so this generalises for free.

NO COUNTDOWN
------------
This records that maturity happened and when. It must never be used to
display time REMAINING. `species.lifespan_male` is populated on 3 of 197
rows, so a "4 months left" figure would be invented for 98% of the catalog —
precisely the fabricated number ADR-014 exists to refuse. Elapsed since
maturity is an observation; remaining is a guess wearing a number.

Default false, nullable=False. No existing molt asserts anything new.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "ult_20260911_ultimate_molt"
down_revision: Union[str, None] = "cwc_20260910_colony_care"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "molt_logs",
        sa.Column(
            "is_ultimate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Every read is "does this animal have an ultimate molt, and when" — a
    # partial index because the true rows are a tiny minority and always will
    # be: at most one per animal, and most animals never mature in our care.
    op.create_index(
        "ix_molt_logs_ultimate",
        "molt_logs",
        ["invert_id", "molted_at"],
        postgresql_where=sa.text("is_ultimate"),
    )


def downgrade() -> None:
    op.drop_index("ix_molt_logs_ultimate", table_name="molt_logs")
    op.drop_column("molt_logs", "is_ultimate")
