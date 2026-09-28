"""
Sitter passes (PRD-shared-keeping, rungs 1–2).

A keeper creates a pass to hand off feeding for a trip. The sitter opens a
link (or scans a QR) and sees a care card per animal — no account, no login.

SECURITY SHAPE (see the PRD's threat table)
-------------------------------------------
- The raw token is shown to the keeper ONCE and never stored. Only its
  SHA-256 hash lives here, plus a 6-char prefix for display ("…a1b2c3").
  A database leak or backup therefore yields no usable links. (The older
  qr_upload_sessions store tokens in plaintext; fine at 20 minutes, not at
  a multi-day pass.)
- `expires_at` is NOT NULL and bounded by a CHECK: no pass can outlive
  30 days from its start. Expiry is a security control, not a tier limit.
- A pass can only ever cover animals in ONE app; the API enforces that the
  parents match `app`, and `keeper_pass_animals` holds exactly one parent.
- `can_log` (rung 2) cannot be true without a PIN hash — enforced in the DB
  so no code path can create a write-capable pass that a forwarded link
  alone can use.
"""
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

PASS_APPS = ("tarantuverse", "herpetoverse")
PASS_MAX_DAYS = 30


class KeeperPass(Base):
    __tablename__ = "keeper_passes"
    __table_args__ = (
        CheckConstraint(
            "app IN ('tarantuverse', 'herpetoverse')", name="keeper_passes_app_check"
        ),
        CheckConstraint("expires_at > starts_at", name="keeper_passes_window_positive"),
        CheckConstraint(
            f"expires_at <= starts_at + interval '{PASS_MAX_DAYS} days'",
            name="keeper_passes_window_max",
        ),
        CheckConstraint(
            "NOT can_log OR pin_hash IS NOT NULL",
            name="keeper_passes_logging_requires_pin",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    app = Column(String(20), nullable=False)

    # SHA-256 hex of the raw token. The raw token is never persisted.
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_prefix = Column(String(8), nullable=False)

    # Shown to the keeper, and to the sitter as "Hi {label}". Optional.
    label = Column(String(80), nullable=True)

    # Rung 2 — logging back. Off in Phase 1; columns exist so Phase 2 needs
    # no second migration.
    can_log = Column(Boolean, nullable=False, default=False, server_default="false")
    pin_hash = Column(String(255), nullable=True)
    pin_failures = Column(Integer, nullable=False, default=0, server_default="0")
    locked_at = Column(DateTime(timezone=True), nullable=True)

    starts_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # Welfare rule: a pass made under premium keeps its powers until expiry
    # even if the subscription lapses mid-trip.
    created_under_premium = Column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    last_used_at = Column(DateTime(timezone=True), nullable=True)
    open_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner = relationship("User")
    animals = relationship(
        "KeeperPassAnimal",
        back_populates="keeper_pass",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<KeeperPass …{self.token_prefix} app={self.app}>"


class KeeperPassAnimal(Base):
    """Which animals a pass covers. Exactly one parent per row.

    Sitter notes live on the animal, not here, so they persist between trips.
    """

    __tablename__ = "keeper_pass_animals"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(invert_id, colony_id, animal_id) = 1",
            name="keeper_pass_animals_exactly_one_parent",
        ),
        UniqueConstraint("pass_id", "invert_id", name="keeper_pass_animals_invert_uq"),
        UniqueConstraint("pass_id", "colony_id", name="keeper_pass_animals_colony_uq"),
        UniqueConstraint("pass_id", "animal_id", name="keeper_pass_animals_animal_uq"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pass_id = Column(
        UUID(as_uuid=True),
        ForeignKey("keeper_passes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invert_id = Column(
        UUID(as_uuid=True), ForeignKey("inverts.id", ondelete="CASCADE"), nullable=True
    )
    colony_id = Column(
        UUID(as_uuid=True), ForeignKey("colonies.id", ondelete="CASCADE"), nullable=True
    )
    animal_id = Column(
        UUID(as_uuid=True), ForeignKey("animals.id", ondelete="CASCADE"), nullable=True
    )
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")

    keeper_pass = relationship("KeeperPass", back_populates="animals")
    invert = relationship("Invert")
    colony = relationship("Colony")
    animal = relationship("Animal")


class SitterGuide(Base):
    """The keeper's reusable routine + emergency info, one per app."""

    __tablename__ = "sitter_guides"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "app", name="sitter_guides_owner_app_uq"),
        CheckConstraint(
            "app IN ('tarantuverse', 'herpetoverse')", name="sitter_guides_app_check"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    app = Column(String(20), nullable=False)
    # Ordered list of short strings: "Feeders are in the garage bin", …
    routine_steps = Column(JSONB, nullable=False, default=list, server_default="[]")
    # NULL means "use the built-in defaults" — distinct from an empty string,
    # which means the keeper deliberately cleared them.
    emergency_text = Column(Text, nullable=True)
    contact_line = Column(String(200), nullable=True)
    vet_contact = Column(String(200), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
