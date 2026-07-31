"""Let colonies own molt logs.

Revision ID: cml_20260730_colony_molts
Revises: prc_20260728_pricing_private
Create Date: 2026-07-30

cph_20260729 gave colonies photos and feedings. Molts were deferred on the
assumption that a molt log is inherently an individual record — you weigh the
animal, you measure the legspan, you know whose it is.

That assumption is backwards for communals. Finding a molt is often the ONLY
observation a communal keeper gets: the animals are hidden, they can't be
handled without tearing the enclosure apart, and a shed skin in the web is the
one piece of hard evidence that surfaces on its own. It's also how sexing
happens in a communal — you sex the molt, not the spider. A keeper tracking a
balfouri group logs "found one molt, confirmed female" three times over two
months and that IS their growth and sex data.

So molts matter MORE for a colony than for a solitary animal, not less.

The columns already anticipated this: `is_unidentified` was added with the
comment "For communals: found a molt but don't know who". The parent column was
the only thing missing.

CONSTRAINT SHAPE
----------------
Unlike photos and feeding_logs, molt_logs only ever carried an at-least-one
parent CHECK, not exactly-one:

    tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL
    OR scorpion_id IS NOT NULL OR invert_id IS NOT NULL

Verified against production before writing — the SQLAlchemy model declares a
stale version omitting invert_id, so the model is not a reliable source here.

Adding colony_id to that OR is enough. We do NOT tighten to exactly-one in this
migration: dual-write rows legitimately carry both tarantula_id and invert_id,
so a stricter predicate would invalidate existing rows, and that cleanup belongs
with the ADR-005 read cutover rather than bolted onto a feature migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'cml_20260730_colony_molts'
down_revision: Union[str, None] = 'prc_20260728_pricing_private'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "molt_log_must_have_parent"

WITHOUT_COLONY = (
    "tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL "
    "OR scorpion_id IS NOT NULL OR invert_id IS NOT NULL"
)
WITH_COLONY = WITHOUT_COLONY + " OR colony_id IS NOT NULL"


def upgrade() -> None:
    op.add_column(
        "molt_logs",
        sa.Column(
            "colony_id",
            UUID(as_uuid=True),
            sa.ForeignKey("colonies.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_molt_logs_colony_id", "molt_logs", ["colony_id"])

    op.drop_constraint(CONSTRAINT, "molt_logs", type_="check")
    op.create_check_constraint(CONSTRAINT, "molt_logs", WITH_COLONY)


def downgrade() -> None:
    # Colony-owned rows would violate the narrowed constraint. Destructive, but
    # the alternative is a downgrade that cannot run.
    op.execute("DELETE FROM molt_logs WHERE colony_id IS NOT NULL")
    op.drop_constraint(CONSTRAINT, "molt_logs", type_="check")
    op.create_check_constraint(CONSTRAINT, "molt_logs", WITHOUT_COLONY)
    op.drop_index("ix_molt_logs_colony_id", table_name="molt_logs")
    op.drop_column("molt_logs", "colony_id")
