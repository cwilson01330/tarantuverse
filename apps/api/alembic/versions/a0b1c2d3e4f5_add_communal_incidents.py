"""add communal incidents

Revision ID: a0b1c2d3e4f5
Revises: z7a8b9c0d1e2
Create Date: 2026-04-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a0b1c2d3e4f5'
down_revision = 'z7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'communal_incidents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('enclosure_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('incident_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('occurred_at', sa.Date(), nullable=False),
        sa.Column('tarantula_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('outcome', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['enclosure_id'], ['enclosures.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tarantula_id'], ['tarantulas.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_communal_incidents_enclosure_id', 'communal_incidents', ['enclosure_id'])
    op.create_index('ix_communal_incidents_occurred_at', 'communal_incidents', ['occurred_at'])


def downgrade():
    op.drop_index('ix_communal_incidents_occurred_at', table_name='communal_incidents')
    op.drop_index('ix_communal_incidents_enclosure_id', table_name='communal_incidents')
    op.drop_table('communal_incidents')
