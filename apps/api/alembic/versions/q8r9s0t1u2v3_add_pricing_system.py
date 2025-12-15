"""add pricing system

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2024-12-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'q8r9s0t1u2v3'
down_revision = 'p7q8r9s0t1u2'
branch_labels = None
depends_on = None


def upgrade():
    # Add pricing_data JSONB column to species table
    op.add_column('species', sa.Column('pricing_data', postgresql.JSONB(), nullable=True))

    # Create pricing_submissions table for community-submitted pricing data
    op.create_table(
        'pricing_submissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('species_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('tarantula_id', postgresql.UUID(as_uuid=True), nullable=True),

        # Size/age information
        sa.Column('size_category', sa.String(20), nullable=False),  # sling, juvenile, subadult, adult
        sa.Column('approximate_size', sa.String(50), nullable=True),  # e.g., "0.25 inches", "3 inches"

        # Price and purchase details
        sa.Column('price_paid', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='USD'),
        sa.Column('purchase_date', sa.Date(), nullable=True),
        sa.Column('sex', sa.String(10), nullable=True),  # male, female, unknown

        # Vendor/source information
        sa.Column('vendor_name', sa.String(255), nullable=True),
        sa.Column('vendor_type', sa.String(50), nullable=True),  # breeder, dealer, expo, online, local
        sa.Column('location', sa.String(100), nullable=True),  # City, State or Country

        # Quality/condition
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),

        # Moderation
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verified_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('flagged_as_outlier', sa.Boolean(), nullable=False, server_default='false'),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['species_id'], ['species.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tarantula_id'], ['tarantulas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id'], ondelete='SET NULL'),
    )

    # Create indexes for efficient queries
    op.create_index('ix_pricing_submissions_species_id', 'pricing_submissions', ['species_id'])
    op.create_index('ix_pricing_submissions_size_category', 'pricing_submissions', ['size_category'])
    op.create_index('ix_pricing_submissions_user_id', 'pricing_submissions', ['user_id'])
    op.create_index('ix_pricing_submissions_purchase_date', 'pricing_submissions', ['purchase_date'])
    op.create_index('ix_pricing_submissions_is_verified', 'pricing_submissions', ['is_verified'])

    # Create composite index for common queries
    op.create_index(
        'ix_pricing_submissions_species_size',
        'pricing_submissions',
        ['species_id', 'size_category', 'sex']
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_pricing_submissions_species_size', table_name='pricing_submissions')
    op.drop_index('ix_pricing_submissions_is_verified', table_name='pricing_submissions')
    op.drop_index('ix_pricing_submissions_purchase_date', table_name='pricing_submissions')
    op.drop_index('ix_pricing_submissions_user_id', table_name='pricing_submissions')
    op.drop_index('ix_pricing_submissions_size_category', table_name='pricing_submissions')
    op.drop_index('ix_pricing_submissions_species_id', table_name='pricing_submissions')

    # Drop table
    op.drop_table('pricing_submissions')

    # Remove pricing_data column from species
    op.drop_column('species', 'pricing_data')
