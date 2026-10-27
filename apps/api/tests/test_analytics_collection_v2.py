"""Analytics redesign, Task 1: the "right now" fields on GET /analytics/collection
and the new GET /analytics/molts.

New on `CollectionAnalytics`: feeding_due_today, feeding_overdue, longest_gap,
last_molt, priced_count, molts_per_animal (cap 10), total_animals and
average_months_in_collection (aliases kept for one release).

Due/overdue come from `services.feeding_status.compute_feeding_status`, the rule
Feeding Day already uses (extracted from `/inverts/feeding-status`): paused,
never-fed and cadence-less (detritivore) animals are never due. Real Postgres
through the TestClient; animals and logs are made through the public routes.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import User
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

COLLECTION = "/api/v1/analytics/collection"
MOLTS = "/api/v1/analytics/molts"
STATUS = "/api/v1/inverts/feeding-status"


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db, tag):
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


def animal(client, headers, name, *, taxon="tarantula", sex=None, interval=None, **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if sex:
        body["sex"] = sex
    if interval is not None:
        body["feeding_interval_days"] = interval
    r = client.post("/api/v1/inverts/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def feed(client, headers, animal_id, days_ago, accepted=True):
    # +1h keeps the whole-day count unambiguous (server `now` is a hair later).
    when = _now() - timedelta(days=days_ago, hours=1)
    r = client.post(
        f"/api/v1/inverts/{animal_id}/feedings",
        json={"fed_at": when.isoformat(), "food_type": "cricket", "accepted": accepted},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def pause(client, headers, animal_id):
    # Pause AFTER the feeding: an accepted feeding ends a pause (resume_if_accepted).
    r = client.put(
        f"/api/v1/inverts/{animal_id}",
        json={"feeding_paused_reason": "travelling"},
        headers=headers,
    )
    assert r.status_code == 200, r.text


def molt(client, headers, animal_id, days_ago):
    when = _now() - timedelta(days=days_ago)
    r = client.post(
        f"/api/v1/inverts/{animal_id}/molts",
        json={"molted_at": when.isoformat()},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return when


def get(client, headers, url=COLLECTION, **params):
    r = client.get(url, headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session, "analytics2")


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


@pytest.fixture()
def trio(client, h):
    """A (male, 7 d ago), B (female, 9 d ago), C (2 d ago); cadence pinned at 7."""
    a = animal(client, h, "A", sex="male", interval=7)
    b = animal(client, h, "B", sex="female", interval=7)
    c = animal(client, h, "C", interval=7)
    feed(client, h, a["id"], 7)
    feed(client, h, b["id"], 9)
    feed(client, h, c["id"], 2)
    return a, b, c


# ── due / overdue ────────────────────────────────────────────────────────────

def test_due_and_overdue_counts(client, h, trio):
    out = get(client, h)
    assert out["feeding_due_today"] == 2   # A (day 7, == interval) and B (day 9)
    assert out["feeding_overdue"] == 1     # only B is strictly past it


def test_due_excludes_never_fed_and_paused(client, h):
    animal(client, h, "Never", interval=7)
    paused = animal(client, h, "Paused", interval=7)
    feed(client, h, paused["id"], 30)
    pause(client, h, paused["id"])
    out = get(client, h)
    assert out["feeding_due_today"] == 0
    assert out["feeding_overdue"] == 0
    assert out["longest_gap"] is None


def test_detritivores_never_due(client, h):
    m = animal(client, h, "Millie", taxon="millipede")   # no cadence at all
    feed(client, h, m["id"], 40)
    out = get(client, h)
    assert out["feeding_due_today"] == 0
    assert out["feeding_overdue"] == 0
    assert out["longest_gap"] is None


def test_longest_gap_fields(client, h, trio):
    _, b, _ = trio
    assert get(client, h)["longest_gap"] == {
        "tarantula_id": b["id"],
        "name": "B",
        "sex": "female",
        "days": 9,
        "usual_interval_days": 7,
    }


def test_first_due_names_the_due_animal_not_the_longest_gap(client, h):
    slow = animal(client, h, "Slow", interval=30)   # 20 days, not due yet
    hungry = animal(client, h, "Hungry", interval=7)  # 8 days, due
    feed(client, h, slow["id"], 20)
    feed(client, h, hungry["id"], 8)
    out = get(client, h)
    assert out["longest_gap"]["name"] == "Slow"
    assert out["first_due"]["tarantula_id"] == hungry["id"]
    assert out["first_due"]["name"] == "Hungry"
    assert out["first_due"]["days"] == 8
    assert out["first_due"]["usual_interval_days"] == 7


def test_first_due_is_none_when_nothing_is_due(client, h):
    a = animal(client, h, "Fresh", interval=7)
    feed(client, h, a["id"], 2)
    assert get(client, h)["first_due"] is None


def test_longest_gap_ignores_animals_without_a_cadence(client, h, trio):
    # A millipede fed 40 days ago must not outrank B's 9.
    m = animal(client, h, "Millie", taxon="millipede")
    feed(client, h, m["id"], 40)
    assert get(client, h)["longest_gap"]["name"] == "B"


def test_longest_gap_tie_breaks_on_name(client, h):
    z = animal(client, h, "Zed", interval=7)
    a = animal(client, h, "Abe", interval=7)
    feed(client, h, z["id"], 5)
    feed(client, h, a["id"], 5)
    assert get(client, h)["longest_gap"]["name"] == "Abe"


def test_tz_offset_minutes_reaches_the_feeding_rule(client, h, trio, monkeypatch):
    import app.routers.analytics as analytics_router

    seen = []
    real = analytics_router.compute_feeding_status

    def spy(db, inverts, tz_offset_minutes):
        seen.append(tz_offset_minutes)
        return real(db, inverts, tz_offset_minutes)

    monkeypatch.setattr(analytics_router, "compute_feeding_status", spy)
    get(client, h, tz_offset_minutes=240)
    get(client, h)
    assert seen == [240, None]


def test_feeding_status_route_unchanged(client, h):
    """The refactor moved the body of /inverts/feeding-status into a service;
    ids, flags and order must be exactly what the route returned before."""
    a = animal(client, h, "A", interval=7)
    b = animal(client, h, "B", interval=7)
    c = animal(client, h, "C", interval=7)
    n = animal(client, h, "Never", interval=7)
    p = animal(client, h, "Paused", interval=7)
    feed(client, h, a["id"], 7)
    feed(client, h, b["id"], 9)
    feed(client, h, c["id"], 2)
    feed(client, h, p["id"], 30)
    pause(client, h, p["id"])

    rows = get(client, h, STATUS)
    # Never-fed first, then longest since fed.
    assert [r["id"] for r in rows] == [n["id"], p["id"], b["id"], a["id"], c["id"]]
    flags = {r["id"]: (r["is_overdue"], r["days_since_last_feeding"], r["is_feeding_paused"],
                       r["interval_days"], r["interval_source"]) for r in rows}
    assert flags[n["id"]] == (False, None, False, 7, "keeper")
    assert flags[p["id"]] == (False, 30, True, 7, "keeper")
    assert flags[b["id"]] == (True, 9, False, 7, "keeper")
    assert flags[a["id"]] == (True, 7, False, 7, "keeper")
    assert flags[c["id"]] == (False, 2, False, 7, "keeper")


# ── molts ────────────────────────────────────────────────────────────────────

def test_last_molt_number_and_interval(client, h):
    a = animal(client, h, "A", sex="male")
    molt(client, h, a["id"], 100)
    molt(client, h, a["id"], 40)
    newest = molt(client, h, a["id"], 10)
    other = animal(client, h, "Other")
    molt(client, h, other["id"], 200)   # older, so A still owns the newest molt
    lm = get(client, h)["last_molt"]
    assert lm["tarantula_id"] == a["id"]
    assert lm["name"] == "A" and lm["sex"] == "male"
    assert lm["molt_number"] == 3
    assert lm["avg_interval_days"] == 45          # (60 + 30) / 2
    assert lm["date"] == newest.date().isoformat()


def test_last_molt_interval_is_null_with_one_molt(client, h):
    a = animal(client, h, "A")
    molt(client, h, a["id"], 5)
    lm = get(client, h)["last_molt"]
    assert lm["molt_number"] == 1 and lm["avg_interval_days"] is None


def test_no_molts_means_no_last_molt(client, h, trio):
    out = get(client, h)
    assert out["last_molt"] is None
    # ... and the rows still list every animal with a zero.
    assert [r["count"] for r in out["molts_per_animal"]] == [0, 0, 0]


def test_molts_rows_include_zero_and_sort(client, h):
    a = animal(client, h, "A")
    b = animal(client, h, "B")
    c = animal(client, h, "C")
    whens = [molt(client, h, a["id"], d) for d in (90, 60, 30)]
    molt(client, h, c["id"], 15)
    rows = get(client, h)["molts_per_animal"]
    assert [(r["name"], r["count"]) for r in rows] == [("A", 3), ("C", 1), ("B", 0)]
    assert rows[0]["tarantula_id"] == a["id"]
    # Compare with the timestamp that was posted, not a fresh now(): no race at UTC midnight.
    assert rows[0]["last_date"] == whens[-1].date().isoformat()
    assert rows[2]["last_date"] is None and rows[2]["last_molted_at"] is None
    assert set(rows[0]) == {"tarantula_id", "name", "sex", "count", "last_date", "last_molted_at"}


# Molt instants and the keeper's local day. tz_offset_minutes uses the JS
# getTimezoneOffset() sign that /inverts/feeding-status uses: positive WEST of
# UTC (EDT = 240), negative east (AEST = -600); local time = UTC - offset.

def molt_at(client, headers, animal_id, iso):
    r = client.post(
        f"/api/v1/inverts/{animal_id}/molts", json={"molted_at": iso}, headers=headers
    )
    assert r.status_code == 201, r.text


def parse_utc(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert dt.tzinfo is not None and dt.utcoffset() == timedelta(0)
    return dt


def test_molted_at_is_returned_as_a_utc_instant(client, h):
    a = animal(client, h, "A")
    when = molt(client, h, a["id"], 3)
    lm = get(client, h)["last_molt"]
    row = get(client, h, MOLTS)[0]
    assert parse_utc(lm["molted_at"]) == when
    assert parse_utc(row["last_molted_at"]) == when
    row_c = get(client, h)["molts_per_animal"][0]
    assert parse_utc(row_c["last_molted_at"]) == when


def test_no_offset_keeps_the_utc_date(client, h):
    a = animal(client, h, "A")
    molt_at(client, h, a["id"], "2026-03-10T02:30:00+00:00")
    assert get(client, h)["last_molt"]["date"] == "2026-03-10"
    assert get(client, h, MOLTS)[0]["last_date"] == "2026-03-10"


def test_local_date_west_of_utc_is_the_previous_day(client, h):
    """02:30Z on Mar 10 is 22:30 on Mar 9 in UTC-4 (offset 240)."""
    a = animal(client, h, "A")
    molt_at(client, h, a["id"], "2026-03-10T02:30:00+00:00")
    out = get(client, h, tz_offset_minutes=240)
    assert out["last_molt"]["date"] == "2026-03-09"
    assert out["molts_per_animal"][0]["last_date"] == "2026-03-09"
    assert get(client, h, MOLTS, tz_offset_minutes=240)[0]["last_date"] == "2026-03-09"
    # The instant itself never moves.
    assert parse_utc(out["last_molt"]["molted_at"]) == datetime(2026, 3, 10, 2, 30, tzinfo=timezone.utc)


def test_local_date_east_of_utc_is_the_next_day(client, h):
    """20:00Z on Mar 10 is 06:00 on Mar 11 in UTC+10 (offset -600)."""
    a = animal(client, h, "A")
    molt_at(client, h, a["id"], "2026-03-10T20:00:00+00:00")
    out = get(client, h, tz_offset_minutes=-600)
    assert out["last_molt"]["date"] == "2026-03-11"
    assert out["molts_per_animal"][0]["last_date"] == "2026-03-11"
    assert get(client, h, MOLTS, tz_offset_minutes=-600)[0]["last_date"] == "2026-03-11"
    assert parse_utc(out["last_molt"]["molted_at"]) == datetime(2026, 3, 10, 20, 0, tzinfo=timezone.utc)


def test_molt_rows_tie_break_on_last_date_then_name(client, h):
    x = animal(client, h, "X")
    y = animal(client, h, "Y")
    z = animal(client, h, "Z")
    w = animal(client, h, "W")
    molt(client, h, x["id"], 20)        # one each; Y is the most recent
    molt(client, h, y["id"], 3)
    molt(client, h, z["id"], 20)
    # W has none
    names = [r["name"] for r in get(client, h)["molts_per_animal"]]
    assert names == ["Y", "X", "Z", "W"]


def test_collection_caps_rows_at_ten_and_molts_returns_all(client, h):
    ids = [animal(client, h, f"Spider {i:02d}")["id"] for i in range(12)]
    molt(client, h, ids[11], 5)
    capped = get(client, h)["molts_per_animal"]
    assert len(capped) == 10
    assert capped[0]["name"] == "Spider 11"
    everyone = get(client, h, MOLTS)
    assert len(everyone) == 12
    assert everyone[0]["name"] == "Spider 11"
    assert {r["tarantula_id"] for r in everyone} == set(ids)


def test_molts_endpoint_is_one_grouped_query_not_n_plus_one(client, h, db_session):
    """Every active animal's count comes from a single grouped molt query."""
    from sqlalchemy import event

    for i in range(6):
        a = animal(client, h, f"S{i}")
        molt(client, h, a["id"], 10 + i)
    molt_selects = []

    def spy(conn, cursor, statement, params, context, executemany):
        s = statement.lower()
        if s.lstrip().startswith("select") and "molt_logs" in s:
            molt_selects.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", spy)
    try:
        rows = get(client, h, MOLTS)
    finally:
        event.remove(engine, "before_cursor_execute", spy)
    assert len(rows) == 6
    assert len(molt_selects) == 1, molt_selects
    assert "group by" in molt_selects[0].lower()


def test_molts_ignores_closed_animals(client, h, keeper, db_session):
    from app.models.invert import Invert

    live = animal(client, h, "Live")
    gone = animal(client, h, "Gone")
    molt(client, h, gone["id"], 5)
    db_session.query(Invert).filter(Invert.id == uuid.UUID(gone["id"])).update(
        {"died_at": _now()}
    )
    db_session.commit()
    rows = get(client, h, MOLTS)
    assert [r["tarantula_id"] for r in rows] == [live["id"]]
    assert get(client, h)["last_molt"] is None


def test_molts_list_owner_only(client, h, db_session):
    a = animal(client, h, "Mine")
    molt(client, h, a["id"], 5)
    stranger = mk_user(db_session, "stranger")
    assert get(client, hdr(stranger), MOLTS) == []
    assert get(client, h, MOLTS)[0]["name"] == "Mine"
    assert client.get(MOLTS).status_code in (401, 403)


def test_unnamed_animal_falls_back_in_rows(client, h):
    r = client.post("/api/v1/inverts/", json={"taxon": "tarantula", "scientific_name": "Grammostola rosea"}, headers=h)
    assert r.status_code == 201, r.text
    assert get(client, h, MOLTS)[0]["name"] == "Grammostola rosea"


# ── totals and aliases ───────────────────────────────────────────────────────

def test_priced_count_and_aliases(client, h):
    animal(client, h, "P1", price_paid="45.00", date_acquired=(_now() - timedelta(days=60)).date().isoformat())
    animal(client, h, "P2", price_paid="0")          # a real price of zero is still priced
    animal(client, h, "P3")
    out = get(client, h)
    assert out["priced_count"] == 2
    assert out["total_animals"] == out["total_tarantulas"] == 3
    assert out["average_months_in_collection"] == out["average_age_months"]
    assert out["average_months_in_collection"] > 0


def test_empty_collection_still_returns_the_new_fields(client, h):
    out = get(client, h)
    assert out["total_animals"] == 0
    assert out["feeding_due_today"] == 0 and out["feeding_overdue"] == 0
    assert out["longest_gap"] is None and out["last_molt"] is None
    assert out["priced_count"] == 0
    assert out["molts_per_animal"] == []
    assert out["average_months_in_collection"] == 0.0


def test_one_animal_no_logs_has_no_nans(client, h):
    animal(client, h, "Solo")
    out = get(client, h)
    assert out["total_animals"] == 1
    assert out["feeding_due_today"] == 0 and out["feeding_overdue"] == 0
    assert out["longest_gap"] is None and out["last_molt"] is None
    assert [(r["name"], r["count"], r["last_date"]) for r in out["molts_per_animal"]] == [("Solo", 0, None)]


def test_other_keepers_animals_never_leak(client, h, db_session, trio):
    other = mk_user(db_session, "other")
    oh = hdr(other)
    o = animal(client, oh, "Theirs", interval=7)
    feed(client, oh, o["id"], 50)
    molt(client, oh, o["id"], 3)
    mine = get(client, h)
    assert mine["feeding_overdue"] == 1 and mine["longest_gap"]["name"] == "B"
    assert mine["last_molt"] is None
    assert all(r["name"] != "Theirs" for r in mine["molts_per_animal"])


# ── recent_activity is the keeper's local day (M7) ───────────────────────────

def feed_at(client, headers, animal_id, iso):
    r = client.post(
        f"/api/v1/inverts/{animal_id}/feedings",
        json={"fed_at": iso, "food_type": "cricket", "accepted": True},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def activity(out):
    return [(i["type"], i["date"]) for i in out["recent_activity"]]


def test_recent_activity_dates_are_utc_without_an_offset(client, h):
    a = animal(client, h, "A")
    feed_at(client, h, a["id"], "2026-03-10T02:30:00+00:00")
    molt_at(client, h, a["id"], "2026-03-10T20:00:00+00:00")
    assert sorted(activity(get(client, h))) == [("feeding", "2026-03-10"), ("molt", "2026-03-10")]


def test_recent_activity_west_of_utc_is_the_previous_day(client, h):
    """02:30Z on Mar 10 is 22:30 on Mar 9 in UTC-4 (offset 240)."""
    a = animal(client, h, "A")
    feed_at(client, h, a["id"], "2026-03-10T02:30:00+00:00")
    molt_at(client, h, a["id"], "2026-03-10T03:00:00+00:00")
    out = get(client, h, tz_offset_minutes=240)
    assert sorted(activity(out)) == [("feeding", "2026-03-09"), ("molt", "2026-03-09")]
    # It agrees with the molt tile, which uses the same helper.
    assert out["last_molt"]["date"] == "2026-03-09"


def test_recent_activity_east_of_utc_is_the_next_day(client, h):
    """20:00Z on Mar 10 is 06:00 on Mar 11 in UTC+10 (offset -600)."""
    a = animal(client, h, "A")
    feed_at(client, h, a["id"], "2026-03-10T20:00:00+00:00")
    molt_at(client, h, a["id"], "2026-03-10T21:00:00+00:00")
    out = get(client, h, tz_offset_minutes=-600)
    assert sorted(activity(out)) == [("feeding", "2026-03-11"), ("molt", "2026-03-11")]


def test_same_day_activity_sorts_newest_first_by_time(client, h):
    """A molt later the same day comes ahead of the feeding (Insights reads item 0)."""
    a = animal(client, h, "A")
    feed_at(client, h, a["id"], "2026-03-10T08:00:00+00:00")
    molt_at(client, h, a["id"], "2026-03-10T18:00:00+00:00")
    assert activity(get(client, h))[0] == ("molt", "2026-03-10")
    # ...and the other way round when the feeding is later.
    b = animal(client, h, "B")
    molt_at(client, h, b["id"], "2026-03-11T06:00:00+00:00")
    feed_at(client, h, b["id"], "2026-03-11T19:00:00+00:00")
    assert activity(get(client, h))[0] == ("feeding", "2026-03-11")


def test_same_local_day_order_survives_an_offset(client, h):
    """Both fall on Mar 9 local (offset 240); the later instant still leads."""
    a = animal(client, h, "A")
    feed_at(client, h, a["id"], "2026-03-10T01:00:00+00:00")
    molt_at(client, h, a["id"], "2026-03-10T03:00:00+00:00")
    out = get(client, h, tz_offset_minutes=240)
    assert activity(out)[:2] == [("molt", "2026-03-09"), ("feeding", "2026-03-09")]
