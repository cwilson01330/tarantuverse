"""QR upload sessions for colonies

Revision ID: cqr_20261006_colony_qr_sessions
Revises: pin_20260930_premium_intro
Create Date: 2026-10-06

A colony is a first-class collection entry (ADR-010) but had no QR label, no
phone-photo upload and no public page (audit item B1). The upload session is the
credential for the phone-upload half, so it needs a colony parent.

* Adds nullable `colony_id` (FK colonies.id, ON DELETE CASCADE, indexed).
* Widens `qr_upload_sessions_must_have_exactly_one_parent` the same way
  `photos_must_have_exactly_one_parent` already is (cph_20260729): a session is
  either one legacy parent (tarantula / animal / scorpion, optionally with its
  `invert_id` twin) and NO colony, or no legacy parent and exactly one of
  invert_id / colony_id.

Downgrade restores the cip_20260527 predicate and drops the column. It deletes
colony sessions first (they are 20-minute tokens, so nothing of value) because
the restored constraint would reject them.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'cqr_20261006_colony_qr_sessions'
down_revision = 'pin_20260930_premium_intro'
branch_labels = None
depends_on = None

CONSTRAINT = 'qr_upload_sessions_must_have_exactly_one_parent'
TABLE = 'qr_upload_sessions'

NEW_PREDICATE = (
    "(num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1 "
    "AND colony_id IS NULL) "
    "OR (num_nonnulls(tarantula_id, animal_id, scorpion_id) = 0 "
    "AND num_nonnulls(invert_id, colony_id) = 1)"
)

# The predicate cip_20260527 left in place.
OLD_PREDICATE = (
    "(num_nonnulls(tarantula_id, animal_id, scorpion_id) = 1) "
    "OR (num_nonnulls(tarantula_id, animal_id, scorpion_id) = 0 "
    "AND invert_id IS NOT NULL)"
)


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column(
            'colony_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('colonies.id', ondelete='CASCADE'),
            nullable=True,
        ),
    )
    op.create_index('ix_qr_upload_sessions_colony_id', TABLE, ['colony_id'])

    op.drop_constraint(CONSTRAINT, TABLE, type_='check')
    op.create_check_constraint(CONSTRAINT, TABLE, NEW_PREDICATE)


def downgrade() -> None:
    op.execute("DELETE FROM qr_upload_sessions WHERE colony_id IS NOT NULL")
    op.drop_constraint(CONSTRAINT, TABLE, type_='check')
    op.create_check_constraint(CONSTRAINT, TABLE, OLD_PREDICATE)
    op.drop_index('ix_qr_upload_sessions_colony_id', table_name=TABLE)
    op.drop_column(TABLE, 'colony_id')
