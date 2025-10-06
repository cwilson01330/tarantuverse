"""add husbandry fields and substrate changes

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2025-10-06 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enclosure_type enum
    enclosure_type_enum = postgresql.ENUM('terrestrial', 'arboreal', 'fossorial', name='enclosuretype', create_type=False)
    enclosure_type_enum.create(op.get_bind(), checkfirst=True)

    # Add new husbandry columns to tarantulas table
    op.add_column('tarantulas', sa.Column('enclosure_type', sa.Enum('terrestrial', 'arboreal', 'fossorial', name='enclosuretype'), nullable=True))
    op.add_column('tarantulas', sa.Column('substrate_depth', sa.String(length=50), nullable=True))
    op.add_column('tarantulas', sa.Column('last_substrate_change', sa.Date(), nullable=True))
    op.add_column('tarantulas', sa.Column('target_temp_min', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('tarantulas', sa.Column('target_temp_max', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('tarantulas', sa.Column('target_humidity_min', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('tarantulas', sa.Column('target_humidity_max', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('tarantulas', sa.Column('water_dish', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('tarantulas', sa.Column('misting_schedule', sa.String(length=100), nullable=True))
    op.add_column('tarantulas', sa.Column('last_enclosure_cleaning', sa.Date(), nullable=True))
    op.add_column('tarantulas', sa.Column('enclosure_notes', sa.Text(), nullable=True))

    # Create substrate_changes table
    op.create_table('substrate_changes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tarantula_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('changed_at', sa.Date(), nullable=False),
        sa.Column('substrate_type', sa.String(length=100), nullable=True),
        sa.Column('substrate_depth', sa.String(length=50), nullable=True),
        sa.Column('reason', sa.String(length=200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['tarantula_id'], ['tarantulas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    # Drop substrate_changes table
    op.drop_table('substrate_changes')

    # Remove husbandry columns from tarantulas table
    op.drop_column('tarantulas', 'enclosure_notes')
    op.drop_column('tarantulas', 'last_enclosure_cleaning')
    op.drop_column('tarantulas', 'misting_schedule')
    op.drop_column('tarantulas', 'water_dish')
    op.drop_column('tarantulas', 'target_humidity_max')
    op.drop_column('tarantulas', 'target_humidity_min')
    op.drop_column('tarantulas', 'target_temp_max')
    op.drop_column('tarantulas', 'target_temp_min')
    op.drop_column('tarantulas', 'last_substrate_change')
    op.drop_column('tarantulas', 'substrate_depth')
    op.drop_column('tarantulas', 'enclosure_type')

    # Drop enclosure_type enum
    sa.Enum(name='enclosuretype').drop(op.get_bind(), checkfirst=True)
