"""Exports include Tarantuverse feeder colonies (2026-10-08).

`feeder_colonies` / `feeder_care_logs` (the TV feeder module: crickets,
roaches, ...) were missing from every export format — the HV twin was fixed
in test_export_hv_feeders. Same approach: no database; the gather step is
replaced with plain data, and owner-scoping is checked by compiling filters.
"""
import asyncio
import inspect
import io
import json
import zipfile

from sqlalchemy.dialects import postgresql

from app.models.feeder_care_log import FeederCareLog
from app.models.feeder_colony import FeederColony
from app.services import export_service
from app.services.export_service import ExportService, build_full_zip

C1 = "cccccccc-0000-0000-0000-000000000001"   # dubia, life stages
C2 = "dddddddd-0000-0000-0000-000000000002"   # crickets, archived


def _data():
    keys = (
        "tarantulas", "inverts", "feeding_logs", "molt_logs", "substrate_changes", "care_logs",
        "photos", "enclosures", "pairings", "egg_sacs", "offspring", "animals",
        "animal_feeding_logs", "shed_logs", "weight_logs", "genotypes", "animal_photos",
        "reptile_pairings", "clutches", "reptile_offspring", "colonies", "colony_events",
        "hv_feeder_stocks", "hv_feeder_logs",
    )
    return {
        **{k: [] for k in keys},
        "profile": {"username": "k"},
        "feeder_colonies": [
            {"id": C1, "name": "Dubia bin", "inventory_mode": "life_stage",
             "life_stage_counts": {"adults": 30, "nymphs": 150},
             "species_scientific_name": "Blaptica dubia", "is_active": True},
            {"id": C2, "name": "Crickets", "inventory_mode": "count", "count": 200, "is_active": False},
        ],
        "feeder_care_logs": [
            {"id": "f1", "feeder_colony_id": C1, "log_type": "restock", "count_delta": 50},
            {"id": "f2", "feeder_colony_id": C1, "log_type": "cleaning"},
            {"id": "f3", "feeder_colony_id": C2, "log_type": "count_update", "count_delta": -20},
        ],
    }


async def _fetch(url):
    return None


def test_field_lists_match_the_models():
    colony_cols = set(FeederColony.__table__.columns.keys())
    derived = {"species_scientific_name"}
    assert set(export_service.FEEDER_COLONY_FIELDS) - derived <= colony_cols
    assert colony_cols <= set(export_service.FEEDER_COLONY_FIELDS)
    assert set(export_service.FEEDER_CARE_LOG_FIELDS) == set(FeederCareLog.__table__.columns.keys())


def test_json_export_carries_colonies_logs_and_counts(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    env = json.loads(ExportService.export_json(None, None))
    assert [c["id"] for c in env["feeders"]["colonies"]] == [C1, C2]
    assert [lg["id"] for lg in env["feeders"]["care_logs"]] == ["f1", "f2", "f3"]
    assert env["counts"]["feeder_colonies"] == 2
    assert env["counts"]["feeder_care_logs"] == 3


def test_csv_export_writes_feeder_files(monkeypatch):
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: _data()))
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    colonies = zf.read("feeder_colonies.csv").decode()
    assert "Dubia bin" in colonies and "Crickets" in colonies and "Blaptica dubia" in colonies
    assert colonies.splitlines()[0].split(",") == export_service.FEEDER_COLONY_FIELDS
    assert zf.read("feeder_care_logs.csv").decode().count("\n") == 4  # header + 3


def test_csv_export_skips_feeder_files_when_none(monkeypatch):
    data = {**_data(), "feeder_colonies": [], "feeder_care_logs": []}
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: data))
    names = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None))).namelist()
    assert "feeder_colonies.csv" not in names


def test_full_zip_has_each_colony_with_its_logs():
    zf = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(_data(), "k", fetch_photo=_fetch))))
    feeders = {c["id"]: c for c in json.loads(zf.read("feeders.json"))}
    assert [lg["id"] for lg in feeders[C1]["care_logs"]] == ["f1", "f2"]
    assert [lg["id"] for lg in feeders[C2]["care_logs"]] == ["f3"]
    assert feeders[C1]["life_stage_counts"] == {"adults": 30, "nymphs": 150}
    assert "all_feeder_colonies.csv" in zf.namelist()
    assert "all_feeder_care_logs.csv" in zf.namelist()


def test_older_hand_built_data_still_exports(monkeypatch):
    data = _data()
    del data["feeder_colonies"], data["feeder_care_logs"]
    names = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(data, "k", fetch_photo=_fetch)))).namelist()
    assert "feeders.json" not in names
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: data))
    env = json.loads(ExportService.export_json(None, None))
    assert env["feeders"] == {"colonies": [], "care_logs": []}


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
    export_service._get_feeder_colonies(db, uid)
    export_service._get_feeder_care_logs(db, uid)
    (m1, q1), (m2, q2) = db.queries
    assert m1 is FeederColony and f"feeder_colonies.user_id = '{uid}'" in _sql(q1)
    # Logs are read through the owner's colonies, never by a bare id list.
    sql = _sql(q2)
    assert m2 is FeederCareLog
    assert "feeder_care_logs.feeder_colony_id IN (SELECT feeder_colonies.id" in sql
    assert f"feeder_colonies.user_id = '{uid}'" in sql


def test_gather_includes_feeders():
    src = inspect.getsource(ExportService._gather)
    assert '"feeder_colonies"' in src and '"feeder_care_logs"' in src


def test_preview_counts_feeders():
    from app.routers import import_export
    src = inspect.getsource(import_export.export_preview)
    assert '"feeder_colonies"' in src and '"feeder_care_logs"' in src
