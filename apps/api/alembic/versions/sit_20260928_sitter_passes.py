"""Sitter passes, sitter guides, and per-animal sitter notes.

Revision ID: sit_20260928_sitter_passes
Revises: spx_20260922_taxon_care
Create Date: 2026-09-28

PRD-shared-keeping, Phase 1 (rung 1 — the free, read-only sitter link with
care cards). The rung-2 columns on keeper_passes (can_log, pin_hash,
pin_failures, locked_at) are created now, inert, so Phase 2 needs no second
migration on this table.

Purely additive. Every new column is nullable or has a server default;
nothing existing is rewritten, so this is safe to run on a live database
and trivially reversible.

SECURITY invariants enforced in the DB, not just the API:
  - keeper_passes.token_hash only — the raw token is never stored
  - expires_at NOT NULL, > starts_at, and <= starts_at + 30 days
  - can_log cannot be true without a pin_hash
  - keeper_pass_animals has exactly one parent (invert / colony / animal)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'sit_20260928_sitter_passes'
down_revision = 'spx_20260922_taxon_care'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Per-animal sitter notes — separate from the private `notes` fields.
    for table in ('inverts', 'colonies', 'animals'):
        op.add_column(table, sa.Column('sitter_note', sa.Text(), nullable=True))

    op.create_table(
        'keeper_passes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'owner_user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('app', sa.String(20), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('token_prefix', sa.String(8), nullable=False),
        sa.Column('label', sa.String(80), nullable=True),
        sa.Column('can_log', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('pin_hash', sa.String(255), nullable=True),
        sa.Column('pin_failures', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_under_premium', sa.Boolean(), nullable=False, server_default=sa.text('false')
        ),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('open_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "app IN ('tarantuverse', 'herpetoverse')", name='keeper_passes_app_check'
        ),
        sa.CheckConstraint('expires_at > starts_at', name='keeper_passes_window_positive'),
        sa.CheckConstraint(
            "expires_at <= starts_at + interval '30 days'", name='keeper_passes_window_max'
        ),
        sa.CheckConstraint(
            'NOT can_log OR pin_hash IS NOT NULL', name='keeper_passes_logging_requires_pin'
        ),
    )
    op.create_index('ix_keeper_passes_owner_user_id', 'keeper_passes', ['owner_user_id'])
    op.create_index(
        'ix_keeper_passes_token_hash', 'keeper_passes', ['token_hash'], unique=True
    )

    op.create_table(
        'keeper_pass_animals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'pass_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('keeper_passes.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'invert_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('inverts.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column(
            'colony_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('colonies.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column(
            'animal_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('animals.id', ondelete='CASCADE'),
            nullable=True,
        ),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint(
            'num_nonnulls(invert_id, colony_id, animal_id) = 1',
            name='keeper_pass_animals_exactly_one_parent',
        ),
        sa.UniqueConstraint('pass_id', 'invert_id', name='keeper_pass_animals_invert_uq'),
        sa.UniqueConstraint('pass_id', 'colony_id', name='keeper_pass_animals_colony_uq'),
        sa.UniqueConstraint('pass_id', 'animal_id', name='keeper_pass_animals_animal_uq'),
    )
    op.create_index('ix_keeper_pass_animals_pass_id', 'keeper_pass_animals', ['pass_id'])

    op.create_table(
        'sitter_guides',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'owner_user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('app', sa.String(20), nullable=False),
        sa.Column(
            'routine_steps',
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column('emergency_text', sa.Text(), nullable=True),
        sa.Column('contact_line', sa.String(200), nullable=True),
        sa.Column('vet_contact', sa.String(200), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('owner_user_id', 'app', name='sitter_guides_owner_app_uq'),
        sa.CheckConstraint(
            "app IN ('tarantuverse', 'herpetoverse')", name='sitter_guides_app_check'
        ),
    )
    op.create_index('ix_sitter_guides_owner_user_id', 'sitter_guides', ['owner_user_id'])


def downgrade() -> None:
    op.drop_index('ix_sitter_guides_owner_user_id', table_name='sitter_guides')
    op.drop_table('sitter_guides')
    op.drop_index('ix_keeper_pass_animals_pass_id', table_name='keeper_pass_animals')
    op.drop_table('keeper_pass_animals')
    op.drop_index('ix_keeper_passes_token_hash', table_name='keeper_passes')
    op.drop_index('ix_keeper_passes_owner_user_id', table_name='keeper_passes')
    op.drop_table('keeper_passes')
    for table in ('animals', 'colonies', 'inverts'):
        op.drop_column(table, 'sitter_note')
