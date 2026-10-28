"""Day one, Task 3: a spreadsheet import can carry a "last fed" date, and the
activation report runs.

`Last fed` becomes ONE accepted feeding log at 12:00 UTC of that day (the import
path has no keeper time zone). It is never written onto the animal itself:
`last_fed` is popped from the payload before InvertCreate / the update loop.
Real Postgres through the TestClient.
"""
import io
import json
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.user import User
from app.services import import_service
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

COMMIT = "/api/v1/import/commit"
ANALYZE = "/api/v1/import/analyze"
STATUS = "/api/v1/inverts/feeding-status"


def _utc_today():
    return datetime.now(timezone.utc).date()


def mk_user(db, tag="impfed"):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


def commit(client, headers, csv_text, mapping, **form):
    data = {"mapping": json.dumps(mapping), "default_taxon": "tarantula", **form}
    r = client.post(
        COMMIT,
        headers=headers,
        data=data,
        files={"file": ("animals.csv", io.BytesIO(csv_text.strip().encode()), "text/csv")},
    )
    assert r.status_code == 200, r.text
    return r.json()


MAP = {"Name": "name", "Species": "scientific_name", "Last fed": "last_fed"}


def logs_for(db, user, name):
    inv = db.query(Invert).filter(Invert.user_id == user.id, Invert.name == name).one()
    db.refresh(inv)
    rows = db.query(FeedingLog).filter(FeedingLog.invert_id == inv.id).order_by(FeedingLog.fed_at).all()
    return inv, rows


def status_item(client, headers, animal_id):
    r = client.get(STATUS, headers=headers)
    assert r.status_code == 200, r.text
    return next(i for i in r.json() if i["id"] == str(animal_id))


# ── creating ────────────────────────────────────────────────────────────────

def test_import_last_fed_creates_feeding(client, db_session, keeper, h):
    day = _utc_today() - timedelta(days=3)
    out = commit(
        client, h,
        f"Name,Species,Last fed\nFed One,Grammostola rosea,{day.isoformat()}\nNever Fed,Grammostola rosea,\n",
        MAP,
    )
    assert out["imported"] == 2 and out["error_rows"] == 0

    inv, logs = logs_for(db_session, keeper, "Fed One")
    assert len(logs) == 1
    log = logs[0]
    assert log.accepted is True
    assert log.fed_at == datetime.combine(day, time(12, 0), tzinfo=timezone.utc)
    assert log.logged_by_user_id == keeper.id
    # tarantula twin parent is set too (invert_log_fields), like the feeding route
    assert log.invert_id == inv.id

    # last_fed never lands on the animal row / notes
    assert "last_fed" not in (inv.notes or "")

    assert status_item(client, h, inv.id)["needs_first_feeding"] is False
    never, never_logs = logs_for(db_session, keeper, "Never Fed")
    assert never_logs == []
    assert status_item(client, h, never.id)["needs_first_feeding"] is True


def test_import_last_fed_resumes_a_paused_animal_in_update_mode(client, db_session, keeper, h):
    """An accepted import feeding ends a pause, same as the feeding route."""
    commit(client, h, "Name,Species\nPaused One,Grammostola rosea\n", {"Name": "name", "Species": "scientific_name"})
    inv = db_session.query(Invert).filter(Invert.user_id == keeper.id, Invert.name == "Paused One").one()
    inv.feeding_paused_reason = "premolt"
    db_session.commit()

    day = _utc_today() - timedelta(days=1)
    out = commit(
        client, h,
        f"Name,Species,Last fed\nPaused One,Grammostola rosea,{day.isoformat()}\n",
        MAP, duplicate_mode="update",
    )
    assert out["updated"] == 1
    db_session.expire_all()
    inv = db_session.query(Invert).filter(Invert.id == inv.id).one()
    assert inv.feeding_paused_reason is None


# ── update mode ─────────────────────────────────────────────────────────────

def test_import_last_fed_update_mode_adds_only_if_newer(client, db_session, keeper, h):
    old = _utc_today() - timedelta(days=10)
    new = _utc_today() - timedelta(days=2)
    older = _utc_today() - timedelta(days=20)

    commit(client, h, f"Name,Species,Last fed\nDup,Grammostola rosea,{old.isoformat()}\n", MAP)
    _inv, logs = logs_for(db_session, keeper, "Dup")
    assert len(logs) == 1

    # An older date: an accepted feeding on/after it already exists -> no new log.
    out = commit(
        client, h, f"Name,Species,Last fed\nDup,Grammostola rosea,{older.isoformat()}\n",
        MAP, duplicate_mode="update",
    )
    assert out["updated"] == 1
    _inv, logs = logs_for(db_session, keeper, "Dup")
    assert len(logs) == 1

    # The same date again: still nothing new (not double-logged).
    commit(
        client, h, f"Name,Species,Last fed\nDup,Grammostola rosea,{old.isoformat()}\n",
        MAP, duplicate_mode="update",
    )
    _inv, logs = logs_for(db_session, keeper, "Dup")
    assert len(logs) == 1

    # A newer date: adds one.
    commit(
        client, h, f"Name,Species,Last fed\nDup,Grammostola rosea,{new.isoformat()}\n",
        MAP, duplicate_mode="update",
    )
    _inv, logs = logs_for(db_session, keeper, "Dup")
    assert [l.fed_at.date() for l in logs] == [old, new]

    # Skip mode never writes a feeding for a duplicate.
    newest = _utc_today() - timedelta(days=1)
    out = commit(
        client, h, f"Name,Species,Last fed\nDup,Grammostola rosea,{newest.isoformat()}\n",
        MAP, duplicate_mode="skip",
    )
    assert out["skipped_duplicates"] == 1
    _inv, logs = logs_for(db_session, keeper, "Dup")
    assert len(logs) == 2


def test_import_last_fed_update_mode_ignores_refusals(client, db_session, keeper, h):
    """A later REFUSAL does not count as "already fed on/after that date"."""
    day = _utc_today() - timedelta(days=5)
    commit(client, h, "Name,Species\nPicky,Grammostola rosea\n", {"Name": "name", "Species": "scientific_name"})
    inv = db_session.query(Invert).filter(Invert.user_id == keeper.id, Invert.name == "Picky").one()
    r = client.post(
        f"/api/v1/inverts/{inv.id}/feedings",
        json={"fed_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
              "food_type": "cricket", "accepted": False},
        headers=h,
    )
    assert r.status_code == 201, r.text

    commit(
        client, h, f"Name,Species,Last fed\nPicky,Grammostola rosea,{day.isoformat()}\n",
        MAP, duplicate_mode="update",
    )
    _inv, logs = logs_for(db_session, keeper, "Picky")
    assert sorted(l.accepted for l in logs) == [False, True]


# ── bad input ───────────────────────────────────────────────────────────────

def test_import_last_fed_invalid_and_future(client, db_session, keeper, h):
    good = _utc_today() - timedelta(days=1)
    far_future = _utc_today() + timedelta(days=30)
    out = commit(
        client, h,
        "Name,Species,Last fed\n"
        "Garbled,Grammostola rosea,not a date\n"
        f"Future,Grammostola rosea,{far_future.isoformat()}\n"
        f"Fine,Grammostola rosea,{good.isoformat()}\n",
        MAP,
    )
    assert out["imported"] == 1
    assert out["error_rows"] == 2
    joined = " | ".join(out["errors"])
    assert "Garbled" in joined and "Last fed" in joined
    assert "Future" in joined and "Last fed can't be in the future" in joined

    names = {i.name for i in db_session.query(Invert).filter(Invert.user_id == keeper.id).all()}
    assert names == {"Fine"}
    fine, logs = logs_for(db_session, keeper, "Fine")
    assert len(logs) == 1
    # no feeding exists for anything but the one good row
    mine = (
        db_session.query(FeedingLog)
        .join(Invert, Invert.id == FeedingLog.invert_id)
        .filter(Invert.user_id == keeper.id)
        .count()
    )
    assert mine == 1
    assert fine.name == "Fine"


def test_import_last_fed_tomorrow_utc_is_allowed(client, db_session, keeper, h):
    """A keeper ahead of UTC may legitimately type their local "today" = UTC tomorrow."""
    tomorrow = _utc_today() + timedelta(days=1)
    day_after = _utc_today() + timedelta(days=2)
    out = commit(
        client, h,
        f"Name,Species,Last fed\nEast,Grammostola rosea,{tomorrow.isoformat()}\n"
        f"TooFar,Grammostola rosea,{day_after.isoformat()}\n",
        MAP,
    )
    assert out["imported"] == 1 and out["error_rows"] == 1
    assert "TooFar" in out["errors"][0]


def test_normalize_row_last_fed_errors_are_unit_visible():
    row = import_service.normalize_row(
        None, {"Name": "x", "Last fed": "soon"}, {"Name": "name", "Last fed": "last_fed"}, "tarantula"
    )
    assert any(e.startswith("Last fed") for e in row["errors"])


# ── analyze ─────────────────────────────────────────────────────────────────

def test_analyze_maps_fed_header(client, h):
    for header in ("Fed", "Last feeding", "Last fed", "last_fed", "Last Fed Date"):
        r = client.post(
            ANALYZE,
            headers=h,
            data={"default_taxon": "tarantula"},
            files={"file": ("a.csv", io.BytesIO(f"Name,{header}\nA,2026-01-02\n".encode()), "text/csv")},
        )
        assert r.status_code == 200, r.text
        cols = {c["header"]: c["suggested_field"] for c in r.json()["columns"]}
        assert cols[header] == "last_fed", (header, cols)
        assert any(f["field"] == "last_fed" and f["label"] == "Last fed" and f["type"] == "date"
                   for f in r.json()["fields"])


@pytest.mark.parametrize("header", ["Feeding", "Feeding schedule", "Feeding notes", "Feedings"])
def test_plain_feeding_header_is_never_loose_matched_to_last_fed(header):
    out = import_service.suggest_mapping(
        ["Name", header], [{"Name": "A", header: "weekly"}, {"Name": "B", header: "crickets"}]
    )
    assert out[header]["field"] != "last_fed", out


@pytest.mark.parametrize(
    "header",
    ["Last Feeding Date", "Date Last Fed", "Last fed on", "Date of last feeding", "last_feeding_date"],
)
def test_dated_last_fed_headers_map_to_last_fed_not_date_acquired(header):
    rows = [{"Name": "A", header: "2026-01-02"}]
    out = import_service.suggest_mapping(["Name", header], rows)
    assert out[header]["field"] == "last_fed" and out[header]["confidence"] == "high", out


def test_feeding_then_last_fed_maps_the_exact_header_to_last_fed():
    rows = [{"Name": "A", "Feeding": "weekly", "Last Fed": "2026-01-02"}]
    out = import_service.suggest_mapping(["Name", "Feeding", "Last Fed"], rows)
    assert out["Last Fed"]["field"] == "last_fed" and out["Last Fed"]["confidence"] == "high"
    assert out["Feeding"]["field"] != "last_fed"


def test_normalize_row_ignores_blank_and_whitespace_last_fed():
    for cell in ("", "   ", " \t ", None):
        row = import_service.normalize_row(
            None, {"Name": "x", "Last fed": cell}, {"Name": "name", "Last fed": "last_fed"}, "tarantula"
        )
        assert row["errors"] == [], (cell, row["errors"])
        assert "last_fed" not in row["payload"]


def test_last_fed_field_sits_after_date_acquired():
    names = [f["field"] for f in import_service.IMPORT_FIELDS]
    assert names.index("last_fed") == names.index("date_acquired") + 1


def test_date_still_maps_to_date_acquired():
    assert import_service.HEADER_SYNONYMS["date"] == "date_acquired"


# ── activation report ───────────────────────────────────────────────────────

def test_report_activation_counts_real_cohort_only(client, db_session):
    import report_activation

    now = datetime.now(timezone.utc)
    wk = report_activation._week_start(now).isoformat()

    def week_row():
        return next(r for r in report_activation.build_rows(db_session, now) if r["signup_week"] == wk)

    before = int(week_row()["signups"])

    fed = mk_user(db_session, "act")       # animal + accepted feeding at signup
    bare = mk_user(db_session, "actbare")  # nothing
    robot = mk_user(db_session, "actbot")
    robot.email = f"r{uuid.uuid4().hex[:6]}@cloudtestlabaccounts.com"
    merged = mk_user(db_session, "actmerged")
    merged.email = f"m{uuid.uuid4().hex[:6]}@merged.invalid"
    gone = mk_user(db_session, "actgone")
    gone.is_active = False
    db_session.commit()

    r = client.post("/api/v1/inverts/", json={"taxon": "tarantula", "name": "Act"}, headers=hdr(fed))
    assert r.status_code == 201, r.text
    r = client.post(
        f"/api/v1/inverts/{r.json()['id']}/feedings",
        json={"fed_at": now.isoformat(), "food_type": "cricket", "accepted": True},
        headers=hdr(fed),
    )
    assert r.status_code == 201, r.text

    row = week_row()
    # robot, merged and inactive accounts are not counted; the two real ones are.
    assert int(row["signups"]) == before + 2
    # Cohort percentages are of all real signups that week, so just check shape/bounds.
    for col in ("animal_1d_pct", "fed_7d_pct", "reminders_pct"):
        assert row[col] == "" or 0 <= float(row[col]) <= 100
    assert float(row["animal_1d_pct"]) > 0 and float(row["fed_7d_pct"]) > 0
    assert row["active_30d_pct"] == ""  # this week's cohort is far younger than 60 days
    assert bare.id != fed.id


def test_report_activation_runs(db_session, capsys):
    import report_activation

    assert report_activation.main(["--csv"]) == 0
    out = capsys.readouterr().out
    first = out.strip().splitlines()[0]
    assert first.startswith("signup_week,signups,")
