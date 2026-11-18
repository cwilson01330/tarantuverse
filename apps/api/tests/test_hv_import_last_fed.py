"""HV day one, Task 3: the Herpetoverse importer takes a "last fed" column.

Spec §6 "Importer": optional `last_fed` for HV animals (exact synonyms only,
like TV), written as ONE accepted feeding at 12:00 UTC of that date;
unparseable or future -> a row error, the other rows still import. It is never
written onto the animal itself. Mirrors tests/test_import_last_fed.py (TV).
Real Postgres through the TestClient.
"""
import io
import json
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest

from app.models.animal import Animal
from app.models.feeding_log import FeedingLog
from app.models.user import User
from app.services import import_service
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

COMMIT = "/api/v1/import/commit"
ANALYZE = "/api/v1/import/analyze"

MAP = {"Name": "name", "Species": "scientific_name", "Last fed": "last_fed"}


def _utc_today():
    return datetime.now(timezone.utc).date()


def mk_user(db):
    tag = uuid.uuid4().hex[:8]
    u = User(id=uuid.uuid4(), email=f"hvimp-{tag}@test.local", username=f"hvimp_{tag}",
             is_active=True, is_verified=True)
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(keeper.id)})}"}


def commit(client, headers, csv_text, mapping, **form):
    data = {"mapping": json.dumps(mapping), "default_taxon": "snake", "target": "animal", **form}
    r = client.post(
        COMMIT, headers=headers, data=data,
        files={"file": ("animals.csv", io.BytesIO(csv_text.strip().encode()), "text/csv")},
    )
    assert r.status_code == 200, r.text
    return r.json()


def animal_and_logs(db, user, name):
    db.expire_all()
    a = db.query(Animal).filter(Animal.user_id == user.id, Animal.name == name).one()
    logs = db.query(FeedingLog).filter(FeedingLog.animal_id == a.id).order_by(FeedingLog.fed_at).all()
    return a, logs


def noon(day):
    return datetime.combine(day, time(12, 0), tzinfo=timezone.utc)


# ── creating ────────────────────────────────────────────────────────────────

def test_hv_import_last_fed_creates_one_accepted_feeding_at_noon_utc(client, db_session, keeper, h):
    day = _utc_today() - timedelta(days=3)
    out = commit(
        client, h,
        f"Name,Species,Last fed\nMonty,Python regius,{day.isoformat()}\nNever,Python regius,\n",
        MAP,
    )
    assert out["imported"] == 2 and out["error_rows"] == 0, out

    a, logs = animal_and_logs(db_session, keeper, "Monty")
    assert len(logs) == 1
    log = logs[0]
    assert log.accepted is True
    assert log.fed_at == noon(day)
    assert log.logged_by_user_id == keeper.id
    assert log.invert_id is None and log.tarantula_id is None
    assert a.last_fed_at == noon(day)
    assert "last_fed" not in (a.notes or "") and "Last fed" not in (a.notes or "")

    never, never_logs = animal_and_logs(db_session, keeper, "Never")
    assert never_logs == [] and never.last_fed_at is None

    r = client.get("/api/v1/animals/feeding-status", headers=h)
    assert r.status_code == 200, r.text
    row = next(i for i in r.json() if i["id"] == str(a.id))
    assert row["last_feeding_date"] is not None


def test_hv_import_last_fed_resumes_a_paused_animal_in_update_mode(client, db_session, keeper, h):
    commit(client, h, "Name,Species\nPaused,Python regius\n", {"Name": "name", "Species": "scientific_name"})
    a, _ = animal_and_logs(db_session, keeper, "Paused")
    a.feeding_paused_reason = "keeper"
    db_session.commit()

    day = _utc_today() - timedelta(days=1)
    out = commit(client, h, f"Name,Species,Last fed\nPaused,Python regius,{day.isoformat()}\n",
                 MAP, duplicate_mode="update")
    assert out["updated"] == 1
    a, logs = animal_and_logs(db_session, keeper, "Paused")
    assert a.feeding_paused_reason is None
    assert len(logs) == 1


# ── update mode ─────────────────────────────────────────────────────────────

def test_hv_import_last_fed_update_mode_adds_only_if_newer(client, db_session, keeper, h):
    old = _utc_today() - timedelta(days=10)
    older = _utc_today() - timedelta(days=20)
    new = _utc_today() - timedelta(days=2)

    commit(client, h, f"Name,Species,Last fed\nDup,Python regius,{old.isoformat()}\n", MAP)
    _a, logs = animal_and_logs(db_session, keeper, "Dup")
    assert len(logs) == 1

    for day in (older, old):
        out = commit(client, h, f"Name,Species,Last fed\nDup,Python regius,{day.isoformat()}\n",
                     MAP, duplicate_mode="update")
        assert out["updated"] == 1
        a, logs = animal_and_logs(db_session, keeper, "Dup")
        assert len(logs) == 1
        assert a.last_fed_at == noon(old)  # never moved backwards

    commit(client, h, f"Name,Species,Last fed\nDup,Python regius,{new.isoformat()}\n",
           MAP, duplicate_mode="update")
    a, logs = animal_and_logs(db_session, keeper, "Dup")
    assert [l.fed_at.date() for l in logs] == [old, new]
    assert a.last_fed_at == noon(new)

    out = commit(client, h, f"Name,Species,Last fed\nDup,Python regius,{_utc_today().isoformat()}\n",
                 MAP, duplicate_mode="skip")
    assert out["skipped_duplicates"] == 1
    _a, logs = animal_and_logs(db_session, keeper, "Dup")
    assert len(logs) == 2


def test_hv_import_update_mode_ignores_refusals(client, db_session, keeper, h):
    commit(client, h, "Name,Species\nPicky,Python regius\n", {"Name": "name", "Species": "scientific_name"})
    a, _ = animal_and_logs(db_session, keeper, "Picky")
    r = client.post(f"/api/v1/animals/{a.id}/feedings",
                    json={"fed_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
                          "accepted": False},
                    headers=h)
    assert r.status_code == 201, r.text

    day = _utc_today() - timedelta(days=5)
    commit(client, h, f"Name,Species,Last fed\nPicky,Python regius,{day.isoformat()}\n",
           MAP, duplicate_mode="update")
    _a, logs = animal_and_logs(db_session, keeper, "Picky")
    assert sorted(l.accepted for l in logs) == [False, True]


@pytest.mark.parametrize("closing", ["died_at", "transferred_out_at"])
def test_hv_import_update_mode_skips_the_feeding_on_a_closed_animal(client, db_session, keeper, h, closing):
    commit(client, h, "Name,Species\nGone,Python regius\n", {"Name": "name", "Species": "scientific_name"})
    a, _ = animal_and_logs(db_session, keeper, "Gone")
    setattr(a, closing, datetime.now(timezone.utc) - timedelta(days=30))
    a.feeding_paused_reason = "keeper"
    db_session.commit()

    day = _utc_today() - timedelta(days=1)
    out = commit(client, h, f"Name,Species,Last fed\nGone,Python regius,{day.isoformat()}\n",
                 MAP, duplicate_mode="update")
    assert out["updated"] == 1 and out["error_rows"] == 0, out
    a, logs = animal_and_logs(db_session, keeper, "Gone")
    assert logs == []
    assert a.last_fed_at is None
    assert a.feeding_paused_reason == "keeper"  # not resumed


# ── bad input ───────────────────────────────────────────────────────────────

def test_hv_import_last_fed_invalid_and_future_are_row_errors(client, db_session, keeper, h):
    good = _utc_today() - timedelta(days=1)
    far = _utc_today() + timedelta(days=30)
    out = commit(
        client, h,
        "Name,Species,Last fed\n"
        "Garbled,Python regius,not a date\n"
        f"Future,Python regius,{far.isoformat()}\n"
        f"Fine,Python regius,{good.isoformat()}\n",
        MAP,
    )
    assert out["imported"] == 1 and out["error_rows"] == 2, out
    joined = " | ".join(out["errors"])
    assert "Garbled" in joined and "Last fed: couldn't read that as a date" in joined
    assert "Future" in joined and "Last fed can't be in the future" in joined

    names = {a.name for a in db_session.query(Animal).filter(Animal.user_id == keeper.id).all()}
    assert names == {"Fine"}
    mine = (
        db_session.query(FeedingLog)
        .join(Animal, Animal.id == FeedingLog.animal_id)
        .filter(Animal.user_id == keeper.id)
        .count()
    )
    assert mine == 1


def test_hv_import_last_fed_tomorrow_utc_is_allowed(client, db_session, keeper, h):
    tomorrow = _utc_today() + timedelta(days=1)
    day_after = _utc_today() + timedelta(days=2)
    out = commit(
        client, h,
        f"Name,Species,Last fed\nEast,Python regius,{tomorrow.isoformat()}\n"
        f"TooFar,Python regius,{day_after.isoformat()}\n",
        MAP,
    )
    assert out["imported"] == 1 and out["error_rows"] == 1
    assert "TooFar" in out["errors"][0]


def test_normalize_animal_row_last_fed_errors_and_blanks():
    row = import_service.normalize_animal_row(
        None, {"Name": "x", "Last fed": "soon"}, {"Name": "name", "Last fed": "last_fed"}, "snake"
    )
    assert any(e.startswith("Last fed") for e in row["errors"])
    for cell in ("", "   ", None):
        row = import_service.normalize_animal_row(
            None, {"Name": "x", "Last fed": cell}, {"Name": "name", "Last fed": "last_fed"}, "snake"
        )
        assert row["errors"] == [], (cell, row["errors"])
        assert "last_fed" not in row["payload"]


# ── analyze / mapping ───────────────────────────────────────────────────────

def test_hv_analyze_maps_fed_headers_and_lists_the_field(client, h):
    for header in ("Fed", "Last feeding", "Last fed", "last_fed", "Last Fed Date", "Date of last feeding"):
        r = client.post(
            ANALYZE, headers=h, data={"default_taxon": "snake", "target": "animal"},
            files={"file": ("a.csv", io.BytesIO(f"Name,{header}\nA,2026-01-02\n".encode()), "text/csv")},
        )
        assert r.status_code == 200, r.text
        cols = {c["header"]: c["suggested_field"] for c in r.json()["columns"]}
        assert cols[header] == "last_fed", (header, cols)
        assert any(f["field"] == "last_fed" and f["label"] == "Last fed" and f["type"] == "date"
                   for f in r.json()["fields"])


def test_last_feeding_header_no_longer_maps_to_feeding_schedule():
    rows = [{"Name": "A", "Last feeding": "2026-01-02"}]
    out = import_service.suggest_animal_mapping(["Name", "Last feeding"], rows)
    assert out["Last feeding"]["field"] == "last_fed" and out["Last feeding"]["confidence"] == "high"


@pytest.mark.parametrize("header", ["Feeding", "Feeding schedule", "Diet", "Feeding notes", "Feedings"])
def test_plain_feeding_headers_still_map_to_schedule_never_last_fed(header):
    out = import_service.suggest_animal_mapping(
        ["Name", header], [{"Name": "A", header: "weekly"}, {"Name": "B", header: "f/t mice"}]
    )
    assert out[header]["field"] == "feeding_schedule", out


def test_last_fed_is_never_loose_matched():
    for header in ("Last", "Fed by", "Last meal fed"):
        out = import_service.suggest_animal_mapping(["Name", header], [{"Name": "A", header: "x"}])
        assert out[header]["field"] != "last_fed", (header, out)


def test_hv_last_fed_field_sits_after_date_acquired():
    names = [f["field"] for f in import_service.ANIMAL_IMPORT_FIELDS]
    assert names.index("last_fed") == names.index("date_acquired") + 1
    assert import_service.ANIMAL_HEADER_SYNONYMS["date"] == "date_acquired"
    assert import_service.ANIMAL_HEADER_SYNONYMS["feeding"] == "feeding_schedule"
