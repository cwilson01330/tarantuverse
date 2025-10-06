"""add community features

Revision ID: d1e2f3g4h5i6
Revises: c3d4e5f6g7h8
Create Date: 2025-10-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd1e2f3g4h5i6'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None


def upgrade():
    # Add profile fields to users
    op.add_column('users', sa.Column('profile_bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('profile_location', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('profile_experience_level', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('profile_years_keeping', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('profile_specialties', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('users', sa.Column('social_links', postgresql.JSONB(), nullable=True))
    op.add_column('users', sa.Column('collection_visibility', sa.String(20), server_default='private', nullable=False))
    
    # Add visibility to tarantulas
    op.add_column('tarantulas', sa.Column('visibility', sa.String(20), server_default='private', nullable=False))


def downgrade():
    op.drop_column('tarantulas', 'visibility')
    op.drop_column('users', 'collection_visibility')
    op.drop_column('users', 'social_links')
    op.drop_column('users', 'profile_specialties')
    op.drop_column('users', 'profile_years_keeping')
    op.drop_column('users', 'profile_experience_level')
    op.drop_column('users', 'profile_location')
    op.drop_column('users', 'profile_bio')
