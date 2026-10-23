"""Expense tracking - tables and models (Task 1).

Pins the vocabularies the rest of the feature builds on, and the database
CHECK / FK behaviour the spec relies on:
  * bad amounts, categories, apps, split modes and double-target shares are
    refused by the DATABASE, not just the schema layer;
  * deleting an animal keeps its share (all three targets NULL) so purchase
    totals still add up.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.expense import (
    EXPENSE_APPS,
    EXPENSE_CATEGORIES,
    EXPENSE_SPLIT_MODES,
    MAX_EXPENSE_SHARES,
    Expense,
    ExpenseShare,
)


def test_constants_match_spec():
    assert EXPENSE_CATEGORIES == (
        "feeders",
        "substrate_decor",
        "enclosures_equipment",
        "heat_lighting",
        "health_vet",
        "shipping",
        "other",
    )
    assert EXPENSE_SPLIT_MODES == ("none", "animals", "location", "collection")
    assert EXPENSE_APPS == ("tarantuverse", "herpetoverse")
    assert MAX_EXPENSE_SHARES == 500


def test_models_are_exported_from_the_package():
    from app import models

    assert models.Expense is Expense
    assert models.ExpenseShare is ExpenseShare


def _expense(owner_id, **overrides):
    values = dict(
        id=uuid.uuid4(),
        owner_id=owner_id,
        app="tarantuverse",
        spent_on=date(2026, 10, 22),
        description="Crickets",
        category="feeders",
        amount=Decimal("12.50"),
        split_mode="none",
    )
    values.update(overrides)
    return Expense(**values)


@pytest.mark.requires_postgres
def test_valid_expense_round_trips(db_session, test_user):
    user, _ = test_user
    expense = _expense(user.id)
    expense.shares.append(ExpenseShare(amount=Decimal("5.00"), position=0))
    expense.shares.append(ExpenseShare(amount=Decimal("7.50"), position=1))
    db_session.add(expense)
    db_session.flush()
    db_session.expire_all()

    loaded = db_session.get(Expense, expense.id)
    assert loaded.amount == Decimal("12.50")
    assert loaded.split_mode == "none"
    assert [s.position for s in loaded.shares] == [0, 1]
    assert loaded.created_at is not None


@pytest.mark.requires_postgres
@pytest.mark.parametrize(
    "overrides, constraint",
    [
        ({"amount": Decimal("0")}, "expenses_amount_check"),
        ({"amount": Decimal("-1.00")}, "expenses_amount_check"),
        ({"amount": Decimal("100000.01")}, "expenses_amount_check"),
        ({"category": "animals"}, "expenses_category_check"),
        ({"app": "both"}, "expenses_app_check"),
        ({"split_mode": "rack"}, "expenses_split_mode_check"),
    ],
    ids=["amount_zero", "amount_negative", "amount_too_big", "category", "app", "split_mode"],
)
def test_check_constraints_on_expenses(db_session, test_user, overrides, constraint):
    user, _ = test_user
    db_session.add(_expense(user.id, **overrides))
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert constraint in str(exc_info.value)
    db_session.rollback()


@pytest.mark.requires_postgres
def test_share_cannot_target_two_things(db_session, test_user):
    from app.models.colony import Colony
    from app.models.invert import Invert

    user, _ = test_user
    invert = Invert(id=uuid.uuid4(), user_id=user.id, taxon="tarantula", name="T")
    colony = Colony(id=uuid.uuid4(), user_id=user.id, taxon="isopod", name="C")
    expense = _expense(user.id)
    db_session.add_all([invert, colony, expense])
    db_session.flush()

    db_session.add(
        ExpenseShare(
            expense_id=expense.id,
            invert_id=invert.id,
            colony_id=colony.id,
            amount=Decimal("1.00"),
            position=0,
        )
    )
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert "expense_shares_one_target_check" in str(exc_info.value)
    db_session.rollback()


@pytest.mark.requires_postgres
def test_share_amount_cannot_be_negative(db_session, test_user):
    user, _ = test_user
    expense = _expense(user.id)
    db_session.add(expense)
    db_session.flush()
    db_session.add(
        ExpenseShare(expense_id=expense.id, amount=Decimal("-0.01"), position=0)
    )
    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()
    assert "expense_shares_amount_check" in str(exc_info.value)
    db_session.rollback()


@pytest.mark.requires_postgres
def test_deleting_an_invert_keeps_its_share(db_session, test_user):
    from app.models.invert import Invert

    user, _ = test_user
    invert = Invert(id=uuid.uuid4(), user_id=user.id, taxon="tarantula", name="T")
    expense = _expense(user.id, split_mode="animals")
    db_session.add_all([invert, expense])
    db_session.flush()
    share = ExpenseShare(
        expense_id=expense.id, invert_id=invert.id, amount=Decimal("12.50"), position=0
    )
    db_session.add(share)
    db_session.flush()
    share_id = share.id

    db_session.delete(invert)
    db_session.flush()
    db_session.expire_all()

    kept = db_session.get(ExpenseShare, share_id)
    assert kept is not None
    assert kept.invert_id is None
    assert kept.colony_id is None
    assert kept.animal_id is None
    assert kept.amount == Decimal("12.50")


@pytest.mark.requires_postgres
def test_deleting_an_expense_removes_its_shares(db_session, test_user):
    user, _ = test_user
    expense = _expense(user.id)
    expense.shares.append(ExpenseShare(amount=Decimal("1.00"), position=0))
    db_session.add(expense)
    db_session.flush()
    share_id = expense.shares[0].id

    db_session.delete(expense)
    db_session.flush()
    db_session.expire_all()
    assert db_session.get(ExpenseShare, share_id) is None
