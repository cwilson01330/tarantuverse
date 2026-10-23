"""
Expense tracking - what a keeper spends on the hobby (spec 2026-10-22).

An `Expense` is one purchase (a bag of substrate, a vet visit). It can be left
whole (`split_mode='none'`) or divided across animals / colonies, in which case
one `ExpenseShare` row per target records that target's cut. Shares always sum
to the expense amount; the split service owns that arithmetic.

Design notes:
* `owner_id` is the collection OWNER, also when a co-keeper logs the expense
  (`created_by` records who). Premium is the owner's plan.
* Category / split mode / app are VARCHAR + CHECK, never PG enums (the
  enum-double-create memory). The tuples below are the source of truth; the
  CHECK predicates in the model and in migration `exp_20261022_expenses` are
  built from the same literals and must stay in lockstep.
* A share targets AT MOST one of invert / colony / animal. All three NULL is a
  share whose animal was deleted ("removed animal"): the FKs are
  ON DELETE SET NULL so purchase totals still add up.
* `position` is the 0-based order within the expense so the extra pennies land
  on the same shares on every re-divide.
"""
import uuid

from sqlalchemy import (
    CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer,
    Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


EXPENSE_CATEGORIES = (
    "feeders",
    "substrate_decor",
    "enclosures_equipment",
    "heat_lighting",
    "health_vet",
    "shipping",
    "other",
)
EXPENSE_SPLIT_MODES = ("none", "animals", "location", "collection")
EXPENSE_APPS = ("tarantuverse", "herpetoverse")
MAX_EXPENSE_SHARES = 500


def _in_list(column: str, values) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint(_in_list("app", EXPENSE_APPS), name="expenses_app_check"),
        CheckConstraint(
            _in_list("category", EXPENSE_CATEGORIES), name="expenses_category_check"
        ),
        CheckConstraint(
            _in_list("split_mode", EXPENSE_SPLIT_MODES), name="expenses_split_mode_check"
        ),
        CheckConstraint(
            "amount > 0 AND amount <= 100000", name="expenses_amount_check"
        ),
        Index(
            "ix_expenses_owner_app_spent_on",
            "owner_id", "app", text("spent_on DESC"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    app = Column(String(20), nullable=False)
    spent_on = Column(Date, nullable=False, index=True)
    description = Column(String(120), nullable=False)
    category = Column(String(30), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    notes = Column(Text, nullable=True)
    split_mode = Column(String(20), nullable=False, default="none", server_default="none")
    # Canonical location name when split_mode='location', else NULL.
    split_label = Column(String(40), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    shares = relationship(
        "ExpenseShare",
        back_populates="expense",
        cascade="all, delete-orphan",
        order_by="ExpenseShare.position",
    )

    def __repr__(self):
        return f"<Expense {self.category} {self.amount} on {self.spent_on}>"


class ExpenseShare(Base):
    __tablename__ = "expense_shares"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(invert_id, colony_id, animal_id) <= 1",
            name="expense_shares_one_target_check",
        ),
        CheckConstraint("amount >= 0", name="expense_shares_amount_check"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(
        UUID(as_uuid=True),
        ForeignKey("expenses.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    # TV animal / TV colony / HV animal. SET NULL keeps the share (and so the
    # expense's totals) when the target is deleted.
    invert_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inverts.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    colony_id = Column(
        UUID(as_uuid=True),
        ForeignKey("colonies.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    animal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("animals.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    amount = Column(Numeric(10, 2), nullable=False)
    position = Column(Integer, nullable=False)

    expense = relationship("Expense", back_populates="shares")

    def __repr__(self):
        return f"<ExpenseShare {self.amount} @ {self.position}>"
