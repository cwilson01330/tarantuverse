"""share cards: card_links table + users.share_defaults

Revision ID: shc_20260930_share_cards
Revises: cka_20260929_log_attribution
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "shc_20260930_share_cards"
down_revision = "cka_20260929_log_attribution"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("app", sa.String(20), nullable=False),
        sa.Column("animal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="card_links_app_check"),
        sa.CheckConstraint("kind IN ('molt', 'profile')", name="card_links_kind_check"),
    )
    op.create_index("ix_card_links_code", "card_links", ["code"], unique=True)
    op.create_index("ix_card_links_animal_id", "card_links", ["animal_id"])
    op.create_index("ix_card_links_created_by", "card_links", ["created_by"])
    op.create_index("ix_card_links_owner_id", "card_links", ["owner_id"])
    op.add_column("users", sa.Column("share_defaults", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("users", "share_defaults")
    op.drop_index("ix_card_links_owner_id", table_name="card_links")
    op.drop_index("ix_card_links_created_by", table_name="card_links")
    op.drop_index("ix_card_links_animal_id", table_name="card_links")
    op.drop_index("ix_card_links_code", table_name="card_links")
    op.drop_table("card_links")
