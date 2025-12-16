"""add enclosures for communal tracking

Revision ID: s0t1u2v3w4x5
Revises: r9s0t1u2v3w4
Create Date: 2024-12-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 's0t1u2v3w4x5'
down_revision = 'r9s0t1u2v3w4'
branch_labels = None
depends_on = None


def upgrade():
    # Create enclosures table
    op.create_table(
        'enclosures',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),

        # Communal settings
        sa.Column('is_communal', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('species_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('population_count', sa.Integer(), nullable=True),

        # Enclosure properties
        sa.Column('enclosure_type', sa.String(50), nullable=True),
        sa.Column('enclosure_size', sa.String(50), nullable=True),
        sa.Column('substrate_type', sa.String(100), nullable=True),
        sa.Column('substrate_depth', sa.String(50), nullable=True),
        sa.Column('last_substrate_change', sa.Date(), nullable=True),
        sa.Column('target_temp_min', sa.Numeric(5, 2), nullable=True),
        sa.Column('target_temp_max', sa.Numeric(5, 2), nullable=True),
        sa.Column('target_humidity_min', sa.Numeric(5, 2), nullable=True),
        sa.Column('target_humidity_max', sa.Numeric(5, 2), nullable=True),
        sa.Column('water_dish', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('misting_schedule', sa.String(100), nullable=True),
        sa.Column('last_enclosure_cleaning', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.String(500), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),

        # Primary key and foreign keys
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['species_id'], ['species.id'], ondelete='SET NULL'),
    )

    # Create index for user lookups
    op.create_index('ix_enclosures_user_id', 'enclosures', ['user_id'])

    # Add enclosure_id to tarantulas
    op.add_column('tarantulas', sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_tarantulas_enclosure_id',
        'tarantulas', 'enclosures',
        ['enclosure_id'], ['id'],
        ondelete='SET NULL'
    )

    # Update feeding_logs: make tarantula_id nullable, add enclosure_id and quantity
    op.alter_column('feeding_logs', 'tarantula_id', nullable=True)
    op.add_column('feeding_logs', sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('feeding_logs', sa.Column('quantity', sa.Integer(), server_default='1', nullable=False))
    op.create_foreign_key(
        'fk_feeding_logs_enclosure_id',
        'feeding_logs', 'enclosures',
        ['enclosure_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_check_constraint(
        'feeding_log_must_have_parent',
        'feeding_logs',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL'
    )

    # Update molt_logs: make tarantula_id nullable, add enclosure_id and is_unidentified
    op.alter_column('molt_logs', 'tarantula_id', nullable=True)
    op.add_column('molt_logs', sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('molt_logs', sa.Column('is_unidentified', sa.Boolean(), server_default='false', nullable=False))
    op.create_foreign_key(
        'fk_molt_logs_enclosure_id',
        'molt_logs', 'enclosures',
        ['enclosure_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_check_constraint(
        'molt_log_must_have_parent',
        'molt_logs',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL'
    )

    # Update substrate_changes: make tarantula_id nullable, add enclosure_id
    op.alter_column('substrate_changes', 'tarantula_id', nullable=True)
    op.add_column('substrate_changes', sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_substrate_changes_enclosure_id',
        'substrate_changes', 'enclosures',
        ['enclosure_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_check_constraint(
        'substrate_change_must_have_parent',
        'substrate_changes',
        'tarantula_id IS NOT NULL OR enclosure_id IS NOT NULL'
    )


def downgrade():
    # Remove check constraints first
    op.drop_constraint('substrate_change_must_have_parent', 'substrate_changes', type_='check')
    op.drop_constraint('molt_log_must_have_parent', 'molt_logs', type_='check')
    op.drop_constraint('feeding_log_must_have_parent', 'feeding_logs', type_='check')

    # Remove foreign keys and columns from substrate_changes
    op.drop_constraint('fk_substrate_changes_enclosure_id', 'substrate_changes', type_='foreignkey')
    op.drop_column('substrate_changes', 'enclosure_id')
    op.alter_column('substrate_changes', 'tarantula_id', nullable=False)

    # Remove foreign keys and columns from molt_logs
    op.drop_constraint('fk_molt_logs_enclosure_id', 'molt_logs', type_='foreignkey')
    op.drop_column('molt_logs', 'is_unidentified')
    op.drop_column('molt_logs', 'enclosure_id')
    op.alter_column('molt_logs', 'tarantula_id', nullable=False)

    # Remove foreign keys and columns from feeding_logs
    op.drop_constraint('fk_feeding_logs_enclosure_id', 'feeding_logs', type_='foreignkey')
    op.drop_column('feeding_logs', 'quantity')
    op.drop_column('feeding_logs', 'enclosure_id')
    op.alter_column('feeding_logs', 'tarantula_id', nullable=False)

    # Remove enclosure_id from tarantulas
    op.drop_constraint('fk_tarantulas_enclosure_id', 'tarantulas', type_='foreignkey')
    op.drop_column('tarantulas', 'enclosure_id')

    # Drop enclosures table
    op.drop_index('ix_enclosures_user_id', table_name='enclosures')
    op.drop_table('enclosures')
