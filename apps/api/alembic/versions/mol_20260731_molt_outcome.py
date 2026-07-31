"""Record whether a molt went well or badly.

Revision ID: mol_20260731_molt_outcome
Revises: dth_20260731_animal_death
Create Date: 2026-07-31

ADR-015 D6. Molting is the most dangerous thing a tarantula does and the most
common way one dies — and `molt_logs` had nowhere to say a molt went wrong. No
stuck-molt flag, no lost limb, no death during molt. Only free text, which means
the single most important husbandry signal in the hobby was unqueryable.

Herpetoverse already solved the analogous problem. `shed_logs` carries
`is_complete_shed` / `has_retained_shed` / `retained_shed_notes`, with the
rationale written into the model:

    "Husbandry-signal fields — the reason shed logs exist at all. A keeper
     logging 'incomplete shed + retained eye caps' is reporting a humidity
     problem, not just a timestamp."

That argument holds unchanged for molts; it was simply never ported across.

  outcome              20    successful | stuck | lost_limb | fatal
  complication_notes   Text  what actually happened

NULLABLE, WITH NO DEFAULT — deliberately.

Defaulting to 'successful' would make every one of the ~thousands of existing
molt rows assert an outcome nobody recorded. Most of those molts probably did go
fine, but "probably fine" and "the keeper said it was fine" are different claims,
and only one of them is ours to make. NULL means "not stated", which is the
truth for every historical row and for anyone who skips the field.

Same reasoning as the death columns in dth_20260731: no CHECK constraint. The
API validates; the database stays permissive so an unexpected value degrades to
"shown verbatim" rather than a 500 on write.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'mol_20260731_molt_outcome'
down_revision: Union[str, None] = 'dth_20260731_animal_death'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("molt_logs", sa.Column("outcome", sa.String(20), nullable=True))
    op.add_column("molt_logs", sa.Column("complication_notes", sa.Text(), nullable=True))
    # Indexed because the interesting query is "show me the bad ones" — for a
    # keeper reviewing a collection, and eventually for per-species mortality.
    op.create_index("ix_molt_logs_outcome", "molt_logs", ["outcome"])


def downgrade() -> None:
    op.drop_index("ix_molt_logs_outcome", table_name="molt_logs")
    op.drop_column("molt_logs", "complication_notes")
    op.drop_column("molt_logs", "outcome")
