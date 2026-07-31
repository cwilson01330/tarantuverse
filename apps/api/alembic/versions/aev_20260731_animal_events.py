"""Per-animal event log.

Revision ID: aev_20260731_animal_events
Revises: mol_20260731_molt_outcome
Create Date: 2026-07-31

ADR-015 D5. Colonies have had an event log since ADR-010; individual animals had
nothing. Recording "she was injured on the 14th and recovered by the 20th", or
"escaped, found behind the shelf two days later", had literally nowhere to go
except the single overwritable `notes` blob on the animal.

ColonyEvent minus `count_delta` and `stage` — an individual has no population
and no buckets — plus a polymorphic parent so both products share one table.

The parent CHECK is EXACTLY-one, not at-least-one. The existing log tables can
only manage at-least-one because they carry legacy per-taxon FKs from before the
consolidation and dual-write rows legitimately populate two of them. This table
is new, so it gets to be strict from the start.

No CHECK on event_type or severity, matching colony_events and the death
columns: the API validates, the database stays permissive, and an unrecognised
value degrades to "shown verbatim" rather than a 500 on write.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'aev_20260731_animal_events'
down_revision: Union[str, None] = 'mol_20260731_molt_outcome'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "animal_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invert_id", UUID(as_uuid=True),
            sa.ForeignKey("inverts.id", ondelete="CASCADE"), nullable=True,
        ),
        sa.Column(
            "animal_id", UUID(as_uuid=True),
            sa.ForeignKey("animals.id", ondelete="CASCADE"), nullable=True,
        ),
        sa.Column(
            "user_id", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column(
            "occurred_at", sa.Date(), nullable=False,
            server_default=sa.func.current_date(),
        ),
        sa.Column("severity", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.CheckConstraint(
            "(invert_id IS NOT NULL AND animal_id IS NULL) OR "
            "(invert_id IS NULL AND animal_id IS NOT NULL)",
            name="animal_event_exactly_one_parent",
        ),
    )
    op.create_index("ix_animal_events_invert_id", "animal_events", ["invert_id"])
    op.create_index("ix_animal_events_animal_id", "animal_events", ["animal_id"])
    # The timeline is always read newest-first for one animal, so the useful
    # index is the parent + date pair rather than the date alone.
    op.create_index(
        "ix_animal_events_invert_occurred", "animal_events", ["invert_id", "occurred_at"]
    )
    op.create_index(
        "ix_animal_events_animal_occurred", "animal_events", ["animal_id", "occurred_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_animal_events_animal_occurred", table_name="animal_events")
    op.drop_index("ix_animal_events_invert_occurred", table_name="animal_events")
    op.drop_index("ix_animal_events_animal_id", table_name="animal_events")
    op.drop_index("ix_animal_events_invert_id", table_name="animal_events")
    op.drop_table("animal_events")
