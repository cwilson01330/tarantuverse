"""Data export carries the keeper's expenses (expense tracking, Task 5).

JSON: `expenses`, each with its `shares` nested. CSV zip and full zip:
`expenses.csv` + `expense_shares.csv` (share rows carry `expense_id`). Both
apps' rows are exported, each with its `app`. Preview counts them.

Pure tests replace the gather step with plain data (like
test_export_tv_feeders); the DB-backed ones export real rows through the real
queries and the real preview route.
"""
import asyncio
import csv
import io
import json
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.expense import Expense, ExpenseShare
from app.services import export_service
from app.services.export_service import ExportService, build_full_zip

E1 = "e1e1e1e1-0000-0000-0000-000000000001"   # TV, split across two animals
E2 = "e2e2e2e2-0000-0000-0000-000000000002"   # HV, whole


def _data(expenses=True):
    keys = (
        "tarantulas", "inverts", "feeding_logs", "molt_logs", "substrate_changes", "care_logs",
        "photos", "enclosures", "pairings", "egg_sacs", "offspring", "animals",
        "animal_feeding_logs", "shed_logs", "weight_logs", "genotypes", "animal_photos",
        "reptile_pairings", "clutches", "reptile_offspring", "colonies", "colony_events",
        "hv_feeder_stocks", "hv_feeder_logs",
    )
    shares = [
        {"id": "s1", "expense_id": E1, "invert_id": "i1", "amount": 5.0, "position": 0},
        {"id": "s2", "expense_id": E1, "invert_id": "i2", "amount": 5.0, "position": 1},
    ]
    nested = [
        {"id": E1, "app": "tarantuverse", "description": "Substrate", "category": "substrate_decor",
         "amount": 10.0, "split_mode": "animals", "shares": shares},
        {"id": E2, "app": "herpetoverse", "description": "Mice", "category": "feeders",
         "amount": 20.0, "split_mode": "none", "shares": []},
    ]
    return {
        **{k: [] for k in keys},
        "profile": {"username": "k"},
        "expenses": nested if expenses else [],
        "expense_shares": shares if expenses else [],
    }


async def _fetch(url):
    return None


def _rows(zf, name):
    return list(csv.DictReader(io.StringIO(zf.read(name).decode())))


# ── shape (no database) ──────────────────────────────────────────────────────

def test_field_lists_match_the_models():
    assert set(export_service.EXPENSE_FIELDS) == set(Expense.__table__.columns.keys())
    assert set(export_service.EXPENSE_SHARE_FIELDS) == set(ExpenseShare.__table__.columns.keys())


def test_json_export_nests_shares_and_counts(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    env = json.loads(ExportService.export_json(None, None))
    assert [e["id"] for e in env["expenses"]] == [E1, E2]
    assert [s["id"] for s in env["expenses"][0]["shares"]] == ["s1", "s2"]
    assert env["expenses"][1]["shares"] == []
    assert {e["app"] for e in env["expenses"]} == {"tarantuverse", "herpetoverse"}
    assert env["counts"]["expenses"] == 2
    assert env["counts"]["expense_shares"] == 2


def test_csv_zip_has_both_expense_files_and_flat_shares(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    assert "expenses.csv" in zf.namelist() and "expense_shares.csv" in zf.namelist()
    expenses = _rows(zf, "expenses.csv")
    assert [r["id"] for r in expenses] == [E1, E2]
    assert list(expenses[0].keys()) == export_service.EXPENSE_FIELDS   # no nested column
    shares = _rows(zf, "expense_shares.csv")
    assert [r["expense_id"] for r in shares] == [E1, E1]
    assert list(shares[0].keys()) == export_service.EXPENSE_SHARE_FIELDS
    assert "expenses.csv" in zf.read("README.txt").decode()


def test_csv_zip_writes_empty_expense_files_for_a_keeper_with_none(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data(expenses=False)))
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    assert _rows(zf, "expenses.csv") == [] and _rows(zf, "expense_shares.csv") == []


def test_full_zip_has_expenses_json_and_both_csvs():
    zf = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(_data(), "k", fetch_photo=_fetch))))
    names = zf.namelist()
    assert "expenses.csv" in names and "expense_shares.csv" in names and "expenses.json" in names
    nested = json.loads(zf.read("expenses.json"))
    assert [len(e["shares"]) for e in nested] == [2, 0]
    assert [r["expense_id"] for r in _rows(zf, "expense_shares.csv")] == [E1, E1]
    assert "expenses.csv" in zf.read("README.txt").decode()


def test_full_zip_skips_expense_files_when_none():
    names = zipfile.ZipFile(
        io.BytesIO(asyncio.run(build_full_zip(_data(expenses=False), "k", fetch_photo=_fetch)))
    ).namelist()
    assert not {"expenses.json", "expenses.csv", "expense_shares.csv"} & set(names)


def test_older_hand_built_data_still_exports(monkeypatch):
    data = _data()
    del data["expenses"], data["expense_shares"]
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: data))
    env = json.loads(ExportService.export_json(None, None))
    assert env["expenses"] == [] and env["counts"]["expenses"] == 0
    zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    asyncio.run(build_full_zip(data, "k", fetch_photo=_fetch))


def test_gather_and_preview_include_expenses():
    import inspect
    from app.routers import import_export
    assert '"expenses"' in inspect.getsource(ExportService._gather)
    src = inspect.getsource(import_export.export_preview)
    assert '"expenses"' in src and '"expense_shares"' in src


# ── real rows, real queries ──────────────────────────────────────────────────



def _mk(db, owner, app, desc, amount, spent_on, created_by=None, shares=()):
    e = Expense(
        id=uuid.uuid4(), owner_id=owner.id, created_by=(created_by or owner).id, app=app,
        spent_on=spent_on, description=desc, category="feeders", amount=Decimal(amount),
        split_mode="animals" if shares else "none",
    )
    db.add(e)
    db.flush()
    for pos, (target, amt) in enumerate(shares):
        db.add(ExpenseShare(id=uuid.uuid4(), expense_id=e.id, invert_id=target.id,
                            amount=Decimal(amt), position=pos))
    db.commit()
    return e


@pytest.fixture()
def world(db_session):
    from tests.test_expenses import mk_invert, mk_user
    db = db_session
    owner, other, helper = mk_user(db, "owner"), mk_user(db, "other"), mk_user(db, "helper")
    a, b = mk_invert(db, owner, name="A"), mk_invert(db, owner, name="B")
    today = datetime.now(timezone.utc).date()
    old = _mk(db, owner, "tarantuverse", "Old bag", "4.00", today - timedelta(days=40))
    split = _mk(db, owner, "tarantuverse", "Substrate", "10.01", today - timedelta(days=2),
                created_by=helper, shares=[(a, "5.01"), (b, "5.00")])
    hv = _mk(db, owner, "herpetoverse", "Mice", "20.00", today)
    theirs = _mk(db, other, "tarantuverse", "Not yours", "99.00", today)
    return dict(db=db, owner=owner, other=other, helper=helper, old=old, split=split, hv=hv,
                theirs=theirs, a=a, b=b)


@pytest.mark.requires_postgres
def test_export_json_is_the_owners_expenses_newest_first_with_ordered_shares(world):
    env = json.loads(ExportService.export_json(world["db"], world["owner"]))
    got = env["expenses"]
    assert [e["description"] for e in got] == ["Mice", "Substrate", "Old bag"]   # newest first, both apps
    assert [e["app"] for e in got] == ["herpetoverse", "tarantuverse", "tarantuverse"]
    split = got[1]
    assert [s["amount"] for s in split["shares"]] == [5.01, 5.0]
    assert [s["position"] for s in split["shares"]] == [0, 1]
    assert {s["expense_id"] for s in split["shares"]} == {str(world["split"].id)}
    assert split["amount"] == 10.01 and split["created_by"] == str(world["helper"].id)
    assert got[0]["shares"] == [] and got[2]["shares"] == []
    assert "Not yours" not in json.dumps(env)
    assert env["counts"]["expenses"] == 3 and env["counts"]["expense_shares"] == 2


@pytest.mark.requires_postgres
def test_a_co_keepers_own_export_does_not_carry_the_owners_expenses(world):
    # `helper` logged the Substrate expense, but it belongs to the owner.
    env = json.loads(ExportService.export_json(world["db"], world["helper"]))
    assert env["expenses"] == [] and env["counts"]["expense_shares"] == 0


@pytest.mark.requires_postgres
def test_export_zips_from_real_rows(world):
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(world["db"], world["owner"])))
    assert [r["description"] for r in _rows(zf, "expenses.csv")] == ["Mice", "Substrate", "Old bag"]
    shares = _rows(zf, "expense_shares.csv")
    assert [r["expense_id"] for r in shares] == [str(world["split"].id)] * 2
    assert [r["invert_id"] for r in shares] == [str(world["a"].id), str(world["b"].id)]
    full = zipfile.ZipFile(io.BytesIO(asyncio.run(
        ExportService.export_full_zip(world["db"], world["owner"], fetch_photo=_fetch)
    )))
    assert {"expenses.json", "expenses.csv", "expense_shares.csv"} <= set(full.namelist())
    assert "Not yours" not in full.read("expenses.json").decode()


@pytest.mark.requires_postgres
def test_preview_counts_expenses_and_shares(client, world):
    from app.utils.auth import create_access_token
    h = {"Authorization": f"Bearer {create_access_token(data={'sub': str(world['owner'].id)})}"}
    r = client.get("/api/v1/export/preview", headers=h)
    assert r.status_code == 200, r.text
    counts = r.json()["counts"]
    assert counts["expenses"] == 3 and counts["expense_shares"] == 2
    h2 = {"Authorization": f"Bearer {create_access_token(data={'sub': str(world['other'].id)})}"}
    assert client.get("/api/v1/export/preview", headers=h2).json()["counts"]["expenses"] == 1
