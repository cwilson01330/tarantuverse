"""Exports include Herpetoverse feeder stock (audit-2 M11, 2026-10-08).

`hv_feeder_stocks` / `hv_feeder_logs` (ADR-012) were missing from every
export format, so a feeder keeper's GDPR export was incomplete. These tests
need no database: the gather step is replaced with plain data, and the
owner-scoping of the queries is checked by compiling their filters.
"""
import asyncio
import io
import json
import zipfile

from sqlalchemy.dialects import postgresql

from app.models.hv_feeder import HvFeederLog, HvFeederStock
from app.services import export_service
from app.services.export_service import ExportService, build_full_zip

S1 = "aaaaaaaa-0000-0000-0000-000000000001"   # frozen mice
S2 = "bbbbbbbb-0000-0000-0000-000000000002"   # live roaches, archived


def _data():
    keys = (
        "tarantulas", "inverts", "feeding_logs", "molt_logs", "substrate_changes", "care_logs",
        "photos", "enclosures", "pairings", "egg_sacs", "offspring", "animals",
        "animal_feeding_logs", "shed_logs", "weight_logs", "genotypes", "animal_photos",
        "reptile_pairings", "clutches", "reptile_offspring", "colonies", "colony_events",
    )
    return {
        **{k: [] for k in keys},
        "profile": {"username": "k"},
        "hv_feeder_stocks": [
            {"id": S1, "name": "Frozen mice", "form": "frozen", "inventory_mode": "sized",
             "sized_counts": {"pinky": 20, "hopper": 8}, "species_scientific_name": "Mus musculus",
             "is_active": True},
            {"id": S2, "name": "Dubia bin", "form": "live", "inventory_mode": "count",
             "count": 300, "is_active": False},
        ],
        "hv_feeder_logs": [
            {"id": "l1", "hv_feeder_stock_id": S1, "log_type": "restock", "size": "pinky", "count_delta": 20},
            {"id": "l2", "hv_feeder_stock_id": S1, "log_type": "used", "size": "pinky", "count_delta": -2},
            {"id": "l3", "hv_feeder_stock_id": S2, "log_type": "cleaned"},
        ],
    }


async def _fetch(url):
    return None


def test_field_lists_match_the_models():
    stock_cols = set(HvFeederStock.__table__.columns.keys())
    derived = {"species_scientific_name"}
    assert set(export_service.HV_FEEDER_STOCK_FIELDS) - derived <= stock_cols
    # Everything the keeper entered on a stock is exported.
    assert stock_cols <= set(export_service.HV_FEEDER_STOCK_FIELDS)
    assert set(export_service.HV_FEEDER_LOG_FIELDS) == set(HvFeederLog.__table__.columns.keys())


def test_json_export_carries_stocks_logs_and_counts(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    env = json.loads(ExportService.export_json(None, None))
    assert [s["id"] for s in env["hv_feeders"]["stocks"]] == [S1, S2]
    assert [lg["id"] for lg in env["hv_feeders"]["logs"]] == ["l1", "l2", "l3"]
    assert env["counts"]["hv_feeder_stocks"] == 2
    assert env["counts"]["hv_feeder_logs"] == 3


def test_csv_export_writes_feeder_files(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    stocks = zf.read("hv_feeder_stocks.csv").decode()
    assert "Frozen mice" in stocks and "Dubia bin" in stocks and "Mus musculus" in stocks
    assert stocks.splitlines()[0].split(",") == export_service.HV_FEEDER_STOCK_FIELDS
    assert zf.read("hv_feeder_logs.csv").decode().count("\n") == 4  # header + 3


def test_csv_export_skips_feeder_files_when_none(monkeypatch):
    data = {**_data(), "hv_feeder_stocks": [], "hv_feeder_logs": []}
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: data))
    names = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None))).namelist()
    assert "hv_feeder_stocks.csv" not in names


def test_full_zip_has_each_stock_with_its_logs():
    zf = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(_data(), "k", fetch_photo=_fetch))))
    feeders = {s["id"]: s for s in json.loads(zf.read("hv_feeders.json"))}
    assert [lg["id"] for lg in feeders[S1]["logs"]] == ["l1", "l2"]
    assert [lg["id"] for lg in feeders[S2]["logs"]] == ["l3"]
    assert feeders[S1]["sized_counts"] == {"pinky": 20, "hopper": 8}
    assert "all_hv_feeder_stocks.csv" in zf.namelist()
    assert "all_hv_feeder_logs.csv" in zf.namelist()


def test_full_zip_without_feeder_keys_still_builds():
    data = _data()
    del data["hv_feeder_stocks"], data["hv_feeder_logs"]
    names = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(data, "k", fetch_photo=_fetch)))).namelist()
    assert "hv_feeders.json" not in names


class _FakeQuery:
    def __init__(self):
        self.criteria = []

    def filter(self, *c):
        self.criteria.extend(c)
        return self

    def order_by(self, *a):
        return self

    def all(self):
        return []


class _FakeDB:
    def __init__(self):
        self.queries = []

    def query(self, model):
        q = _FakeQuery()
        self.queries.append((model, q))
        return q


def _sql(q):
    return " ".join(
        str(c.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        for c in q.criteria
    )


def test_queries_are_scoped_to_the_owner():
    uid = "12345678-1234-1234-1234-123456789012"
    db = _FakeDB()
    export_service._get_hv_feeder_stocks(db, uid)
    export_service._get_hv_feeder_logs(db, uid)
    (m1, q1), (m2, q2) = db.queries
    assert m1 is HvFeederStock and f"hv_feeder_stocks.user_id = '{uid}'" in _sql(q1)
    # Logs are read through the owner's stocks, never by a bare stock id list.
    sql = _sql(q2)
    assert m2 is HvFeederLog
    assert "hv_feeder_logs.hv_feeder_stock_id IN (SELECT hv_feeder_stocks.id" in sql
    assert f"hv_feeder_stocks.user_id = '{uid}'" in sql


def test_preview_counts_feeders():
    import inspect
    from app.routers import import_export
    src = inspect.getsource(import_export.export_preview)
    assert '"hv_feeder_stocks"' in src and '"hv_feeder_logs"' in src
