"""add breeding module

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2025-10-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'k2l3m4n5o6p7'
down_revision = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None


def upgrade():
    # Create enum types - use raw SQL to avoid issues with checkfirst
    connection = op.get_bind()

    # Create enums only if they don't exist
    connection.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE pairingoutcome AS ENUM ('successful', 'unsuccessful', 'unknown', 'in_progress');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    connection.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE pairingtype AS ENUM ('natural', 'assisted', 'forced');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    connection.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE offspringstatus AS ENUM ('kept', 'sold', 'traded', 'given_away', 'died', 'unknown');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    # Define the enum types for SQLAlchemy to reference
    pairing_outcome_enum = postgresql.ENUM('successful', 'unsuccessful', 'unknown', 'in_progress', name='pairingoutcome', create_type=False)
    pairing_type_enum = postgresql.ENUM('natural', 'assisted', 'forced', name='pairingtype', create_type=False)
    offspring_status_enum = postgresql.ENUM('kept', 'sold', 'traded', 'given_away', 'died', 'unknown', name='offspringstatus', create_type=False)

    # Create pairings table
    op.create_table('pairings',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('male_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('female_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('paired_date', sa.Date(), nullable=False),
        sa.Column('separated_date', sa.Date(), nullable=True),
        sa.Column('pairing_type', pairing_type_enum, nullable=False),
        sa.Column('outcome', pairing_outcome_enum, nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(['female_id'], ['tarantulas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['male_id'], ['tarantulas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pairings_female_id'), 'pairings', ['female_id'], unique=False)
    op.create_index(op.f('ix_pairings_male_id'), 'pairings', ['male_id'], unique=False)
    op.create_index(op.f('ix_pairings_paired_date'), 'pairings', ['paired_date'], unique=False)
    op.create_index(op.f('ix_pairings_user_id'), 'pairings', ['user_id'], unique=False)

    # Create egg_sacs table
    op.create_table('egg_sacs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('pairing_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('laid_date', sa.Date(), nullable=False),
        sa.Column('pulled_date', sa.Date(), nullable=True),
        sa.Column('hatch_date', sa.Date(), nullable=True),
        sa.Column('incubation_temp_min', sa.Integer(), nullable=True),
        sa.Column('incubation_temp_max', sa.Integer(), nullable=True),
        sa.Column('incubation_humidity_min', sa.Integer(), nullable=True),
        sa.Column('incubation_humidity_max', sa.Integer(), nullable=True),
        sa.Column('spiderling_count', sa.Integer(), nullable=True),
        sa.Column('viable_count', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(['pairing_id'], ['pairings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_egg_sacs_laid_date'), 'egg_sacs', ['laid_date'], unique=False)
    op.create_index(op.f('ix_egg_sacs_pairing_id'), 'egg_sacs', ['pairing_id'], unique=False)
    op.create_index(op.f('ix_egg_sacs_user_id'), 'egg_sacs', ['user_id'], unique=False)

    # Create offspring table
    op.create_table('offspring',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('egg_sac_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tarantula_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', offspring_status_enum, nullable=False),
        sa.Column('status_date', sa.Date(), nullable=True),
        sa.Column('buyer_info', sa.Text(), nullable=True),
        sa.Column('price_sold', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(['egg_sac_id'], ['egg_sacs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tarantula_id'], ['tarantulas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_offspring_egg_sac_id'), 'offspring', ['egg_sac_id'], unique=False)
    op.create_index(op.f('ix_offspring_tarantula_id'), 'offspring', ['tarantula_id'], unique=False)
    op.create_index(op.f('ix_offspring_user_id'), 'offspring', ['user_id'], unique=False)


def downgrade():
    # Drop tables
    op.drop_index(op.f('ix_offspring_user_id'), table_name='offspring')
    op.drop_index(op.f('ix_offspring_tarantula_id'), table_name='offspring')
    op.drop_index(op.f('ix_offspring_egg_sac_id'), table_name='offspring')
    op.drop_table('offspring')

    op.drop_index(op.f('ix_egg_sacs_user_id'), table_name='egg_sacs')
    op.drop_index(op.f('ix_egg_sacs_pairing_id'), table_name='egg_sacs')
    op.drop_index(op.f('ix_egg_sacs_laid_date'), table_name='egg_sacs')
    op.drop_table('egg_sacs')

    op.drop_index(op.f('ix_pairings_user_id'), table_name='pairings')
    op.drop_index(op.f('ix_pairings_paired_date'), table_name='pairings')
    op.drop_index(op.f('ix_pairings_male_id'), table_name='pairings')
    op.drop_index(op.f('ix_pairings_female_id'), table_name='pairings')
    op.drop_table('pairings')

    # Drop enum types
    sa.Enum(name='offspringstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='pairingtype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='pairingoutcome').drop(op.get_bind(), checkfirst=True)
