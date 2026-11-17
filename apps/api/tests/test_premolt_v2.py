"""Premolt v2, Task 2: the prediction on the unified Invert row.

Spec docs/superpowers/specs/2026-11-17-premolt-v2-design.md §4.

- Every predator taxon gets a prediction (`predict_premolt` loads `Invert`).
- Eligible = active, has a feeding cadence (`utils/feeding_mode`), not matured
  (an ultimate molt, or an adult of a taxon whose adults don't molt).
  Ineligible animals get `is_premolt_likely False` + `ineligible_reason`,
  never an error, and stay out of `/premolt/dashboard`.
- New fasting branch: days since the last accepted meal vs the animal's own
  usual gap (median over 180 days, >= 4 meals, else the feeding-status
  interval); gated by the post-molt window and by the keeper still logging.
- Server-built `reason` sentence and a `show_alert` flag (not paused for
  premolt, not snoozed).
- Old routes (`/premolt/tarantulas/{id}/prediction`, `/premolt/dashboard`)
  keep every old field for old app versions.

Pure helpers run without a database; route tests need Postgres.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.models.collection_member import CollectionMember
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.premolt_episode import PremoltEpisode
from app.models.user import User
from app.services.premolt_service import (
    FAST_MIN_DAYS,
    FAST_MULTIPLIER,
    RULE_VERSION,
    USUAL_GAP_MIN_MEALS,
    USUAL_GAP_WINDOW_DAYS,
    evaluate_premolt,
    evaluate_premolt_likely,
    fasting_fires,
    is_matured,
    premolt_reason,
    usual_meal_gap,
)
from app.utils.auth import create_access_token

TODAY = date(2026, 11, 17)


# ── pure helpers ─────────────────────────────────────────────────────────────

def test_constants_match_the_plan():
    assert FAST_MULTIPLIER == 2.5
    assert FAST_MIN_DAYS == 14
    assert USUAL_GAP_WINDOW_DAYS == 180
    assert USUAL_GAP_MIN_MEALS == 4
    assert RULE_VERSION == "2026-11-v2"


def test_usual_meal_gap_median_and_minimum_meals():
    days = lambda *ago: [TODAY - timedelta(days=d) for d in ago]  # noqa: E731
    # Four meals, every five days.
    assert usual_meal_gap(days(2, 7, 12, 17), TODAY) == 5
    # Three meals is not enough.
    assert usual_meal_gap(days(2, 7, 12), TODAY) is None
    # Median, not mean: gaps 8, 2, 7, 3 -> 5.0.
    assert usual_meal_gap(days(0, 3, 10, 12, 20), TODAY) == 5.0
    # Meals older than the window don't count (only 3 inside it).
    assert usual_meal_gap(days(2, 7, 12, USUAL_GAP_WINDOW_DAYS + 5, 400), TODAY) is None
    # Order of the input doesn't matter.
    assert usual_meal_gap(days(17, 2, 12, 7), TODAY) == 5
    # Two logs on one day are one meal day.
    assert usual_meal_gap(days(2, 2, 7, 12), TODAY) is None
    assert usual_meal_gap([], TODAY) is None


def test_fasting_fires_threshold():
    assert fasting_fires(13, 5) is False
    assert fasting_fires(14, 5) is True
    assert fasting_fires(24, 10) is False
    assert fasting_fires(25, 10) is True
    assert fasting_fires(None, 5) is False
    assert fasting_fires(30, None) is False


def test_is_matured():
    for taxon in ("true_spider", "mantis", "scorpion", "vinegaroon"):
        assert is_matured(taxon, "adult", False) is True, taxon
    for taxon in ("tarantula", "centipede", "whip_spider", "other"):
        assert is_matured(taxon, "adult", False) is False, taxon
    for taxon in ("tarantula", "true_spider", "centipede", "mantis", "other"):
        assert is_matured(taxon, "juvenile", True) is True, taxon
        assert is_matured(taxon, None, False) is False, taxon
        assert is_matured(taxon, "juvenile", False) is False, taxon


def test_fasting_reason_copy_says_where_the_gap_came_from():
    kw = dict(branch="fasting", days_fasting=20, recent_refusal_streak=0, days_since_last_molt=60)
    assert premolt_reason(usual_gap=5, gap_is_observed=True, **kw) == \
        "No accepted meal in 20 days — usually eats every 5."
    assert premolt_reason(usual_gap=7, gap_is_observed=False, **kw) == \
        "No accepted meal in 20 days — its feeding interval is 7 days."
    # Half-up, not banker's rounding; never below 1.
    assert premolt_reason(usual_gap=4.5, gap_is_observed=True, **kw).endswith("usually eats every 5.")
    assert premolt_reason(usual_gap=2.5, gap_is_observed=True, **kw).endswith("usually eats every 3.")
    assert premolt_reason(usual_gap=4.4, gap_is_observed=False, **kw).endswith("interval is 4 days.")
    assert premolt_reason(usual_gap=0.4, gap_is_observed=True, **kw).endswith("usually eats every 1.")
    assert premolt_reason(usual_gap=0, gap_is_observed=False, **kw).endswith("interval is 1 day.")


def test_evaluate_premolt_branches_and_old_wrapper():
    # Existing branches first, unchanged.
    assert evaluate_premolt(recent_refusal_streak=3, molt_interval_progress=40,
                            days_since_last_molt=27) == (True, "refusals")
    assert evaluate_premolt(recent_refusal_streak=2, molt_interval_progress=60,
                            days_since_last_molt=45) == (True, "refusals_interval")
    assert evaluate_premolt(recent_refusal_streak=0, molt_interval_progress=110,
                            days_since_last_molt=31) == (True, "overdue")
    # Fasting, past the post-molt window.
    assert evaluate_premolt(recent_refusal_streak=0, molt_interval_progress=None,
                            days_since_last_molt=60, fasting=True) == (True, "fasting")
    # Fasting inside the post-molt window does not fire.
    assert evaluate_premolt(recent_refusal_streak=0, molt_interval_progress=None,
                            days_since_last_molt=5, fasting=True) == (False, "none")
    assert evaluate_premolt(recent_refusal_streak=0, molt_interval_progress=10,
                            days_since_last_molt=40, fasting=True) == (False, "none")
    # No molt history: nothing gates it.
    assert evaluate_premolt(recent_refusal_streak=0, molt_interval_progress=None,
                            days_since_last_molt=None, fasting=True) == (True, "fasting")
    # Ultimate molt overrides everything.
    assert evaluate_premolt(recent_refusal_streak=5, molt_interval_progress=200,
                            days_since_last_molt=99, has_ultimate_molt=True,
                            fasting=True) == (False, "none")
    # The old boolean wrapper keeps its exact signature and ignores fasting.
    assert evaluate_premolt_likely(recent_refusal_streak=0, molt_interval_progress=None,
                                   days_since_last_molt=60) is False
    assert evaluate_premolt_likely(recent_refusal_streak=3, molt_interval_progress=None,
                                   days_since_last_molt=None) is True


# ── route helpers (Postgres) ─────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def _today():
    return _now().date()  # no tz offset in these tests = UTC


def _noon(days_ago):
    return datetime.combine(_today() - timedelta(days=days_ago), time(12, 0), tzinfo=timezone.utc)


def mk_user(db, tag="pm2"):
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


def animal(client, headers, name, *, taxon="true_spider", life_stage="juvenile", interval=None, **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if life_stage is not None:
        body["life_stage"] = life_stage
    if interval is not None:
        body["feeding_interval_days"] = interval
    r = client.post("/api/v1/inverts/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def feed(client, headers, animal_id, days_ago, accepted=True):
    r = client.post(
        f"/api/v1/inverts/{animal_id}/feedings",
        json={"fed_at": _noon(days_ago).isoformat(), "food_type": "cricket", "accepted": accepted},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def molt(client, headers, animal_id, days_ago, **extra):
    r = client.post(
        f"/api/v1/inverts/{animal_id}/molts",
        json={"molted_at": _noon(days_ago).isoformat(), **extra},
        headers=headers,
    )
    assert r.status_code == 201, r.text


def fasting_jumper(client, headers, name="Jumper", taxon="true_spider"):
    """6 accepted meals every 5 days, then 20 days with none; molted 60 days ago."""
    a = animal(client, headers, name, taxon=taxon)
    molt(client, headers, a["id"], 60)
    for d in (45, 40, 35, 30, 25, 20):
        feed(client, headers, a["id"], d)
    return a


def predict(client, headers, animal_id):
    r = client.get(f"/api/v1/premolt/inverts/{animal_id}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def dashboard(client, headers, **params):
    r = client.get("/api/v1/premolt/dashboard", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def get_invert(db, animal_id):
    return db.query(Invert).filter(Invert.id == uuid.UUID(animal_id)).one()


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


# ── route tests ──────────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_jumper_gets_a_prediction(client, db_session, h):
    j = fasting_jumper(client, h)
    other = animal(client, h, "Other", taxon="tarantula")
    feed(client, h, other["id"], 1)  # the keeper logged yesterday

    p = predict(client, h, j["id"])
    assert p["eligible"] is True
    assert p["ineligible_reason"] is None
    assert p["is_premolt_likely"] is True
    assert p["branch"] == "fasting"
    assert p["days_fasting"] == 20
    assert p["usual_gap_days"] == 5
    assert p["show_alert"] is True
    assert p["confidence"] == "low"
    assert p["reason"] == "No accepted meal in 20 days — usually eats every 5."
    assert p["invert_id"] == j["id"] and p["tarantula_id"] == j["id"]
    assert p["taxon"] == "true_spider"
    assert p["tarantula_name"] == "Jumper"
    assert p["days_since_last_molt"] == 60
    assert p["keeper_answer"] is None
    assert p["premolt_snoozed_until"] is None
    assert p["paused_for_premolt"] is False


@pytest.mark.requires_postgres
def test_fasting_with_a_refusal_is_medium_confidence(client, db_session, h):
    j = fasting_jumper(client, h)
    feed(client, h, j["id"], 3, accepted=False)
    p = predict(client, h, j["id"])
    assert p["branch"] == "fasting"
    assert p["recent_refusal_streak"] == 1
    assert p["confidence"] == "medium"


@pytest.mark.requires_postgres
def test_fasting_falls_back_to_feeding_interval(client, db_session, h):
    # Two meals only: no usual gap of its own, so the keeper's interval (7)
    # decides: 20 days >= max(17.5, 14).
    a = animal(client, h, "FewLogs", interval=7)
    molt(client, h, a["id"], 60)
    feed(client, h, a["id"], 27)
    feed(client, h, a["id"], 20)
    p = predict(client, h, a["id"])
    assert p["usual_gap_days"] == 7
    assert p["branch"] == "fasting"
    assert p["reason"] == "No accepted meal in 20 days — its feeding interval is 7 days."


@pytest.mark.requires_postgres
def test_fasting_respects_post_molt_window(client, db_session, h):
    t = animal(client, h, "FreshMolt", taxon="tarantula")
    for d in (40, 36, 32, 28, 24, 20):
        feed(client, h, t["id"], d)
    molt(client, h, t["id"], 5)  # molted 5 days ago, not fed since

    p = predict(client, h, t["id"])
    assert p["eligible"] is True
    assert p["usual_gap_days"] == 4
    # The fasting clock hasn't started: it runs from the end of the post-molt
    # window (molt day + 14 for an unstaged tarantula), not the last meal.
    assert p["days_fasting"] == 0
    assert p["days_since_last_molt"] == 5
    assert p["is_premolt_likely"] is False
    assert p["branch"] == "none"
    assert p["show_alert"] is False
    assert p["reason"] is None


@pytest.mark.requires_postgres
def test_fasting_needs_keeper_still_logging(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    stamp = _now() - timedelta(days=8)
    for row in (
        db_session.query(FeedingLog)
        .join(Invert, Invert.id == FeedingLog.invert_id)
        .filter(Invert.user_id == keeper.id)
        .all()
    ):
        row.created_at = stamp
    db_session.commit()

    p = predict(client, h, j["id"])
    assert p["days_fasting"] == 20
    assert p["is_premolt_likely"] is False
    assert p["branch"] == "none"
    assert p["show_alert"] is False


@pytest.mark.requires_postgres
def test_grazer_and_matured_are_ineligible(client, db_session, h):
    milli = animal(client, h, "Milli", taxon="millipede", life_stage=None)
    mantis = animal(client, h, "Mantis", taxon="mantis", life_stage="adult")
    j = fasting_jumper(client, h)

    pm = predict(client, h, milli["id"])
    assert pm["eligible"] is False and pm["ineligible_reason"] == "grazer"
    assert pm["is_premolt_likely"] is False and pm["branch"] == "none" and pm["show_alert"] is False

    pa = predict(client, h, mantis["id"])
    assert pa["eligible"] is False and pa["ineligible_reason"] == "matured"
    assert pa["is_premolt_likely"] is False and pa["show_alert"] is False

    ids = {p["invert_id"] for p in dashboard(client, h)["predictions"]}
    assert j["id"] in ids
    assert milli["id"] not in ids and mantis["id"] not in ids


@pytest.mark.requires_postgres
def test_ultimate_molt_is_matured(client, db_session, h):
    t = animal(client, h, "MatureMale", taxon="tarantula", life_stage="adult")
    molt(client, h, t["id"], 90, is_ultimate=True)
    p = predict(client, h, t["id"])
    assert p["eligible"] is False and p["ineligible_reason"] == "matured"
    assert p["has_matured"] is True


@pytest.mark.requires_postgres
def test_paused_or_snoozed_hides_alert(client, db_session, h):
    j = fasting_jumper(client, h)
    inv = get_invert(db_session, j["id"])

    inv.feeding_paused_reason = "premolt"
    inv.feeding_paused_until = None
    db_session.commit()
    p = predict(client, h, j["id"])
    assert p["is_premolt_likely"] is True
    assert p["paused_for_premolt"] is True
    assert p["show_alert"] is False
    assert dashboard(client, h)["premolt_likely_count"] == 0

    inv.feeding_paused_reason = None
    inv.premolt_snoozed_until = _today() + timedelta(days=1)
    db_session.commit()
    p = predict(client, h, j["id"])
    assert p["paused_for_premolt"] is False
    assert p["premolt_snoozed_until"] == (_today() + timedelta(days=1)).isoformat()
    assert p["show_alert"] is False
    assert dashboard(client, h)["premolt_likely_count"] == 0

    inv.premolt_snoozed_until = _today() - timedelta(days=1)
    db_session.commit()
    assert predict(client, h, j["id"])["show_alert"] is True
    assert dashboard(client, h)["premolt_likely_count"] == 1


@pytest.mark.requires_postgres
def test_old_routes_keep_old_fields(client, db_session, h):
    j = fasting_jumper(client, h)
    t = animal(client, h, "Tarantula", taxon="tarantula")
    feed(client, h, t["id"], 2)

    d = dashboard(client, h)
    assert d["total_tarantulas"] == 2
    assert d["total_animals"] == 2
    assert d["premolt_likely_count"] == 1
    by_id = {p["tarantula_id"]: p for p in d["predictions"]}
    assert set(by_id) == {j["id"], t["id"]}
    assert by_id[j["id"]]["tarantula_name"] == "Jumper"
    # Likely animals sort first.
    assert d["predictions"][0]["tarantula_id"] == j["id"]
    for key in ("is_premolt_likely", "confidence", "recent_refusal_streak", "data_quality",
                "feeding_count", "molt_count", "has_matured"):
        assert key in by_id[j["id"]]

    old = client.get(f"/api/v1/premolt/tarantulas/{j['id']}/prediction", headers=h)
    assert old.status_code == 200, old.text
    assert old.json() == predict(client, h, j["id"])

    missing = client.get(f"/api/v1/premolt/tarantulas/{uuid.uuid4()}/prediction", headers=h)
    assert missing.status_code == 404


@pytest.mark.requires_postgres
def test_died_and_transferred_left_out_of_dashboard(client, db_session, h):
    alive = fasting_jumper(client, h, "Alive")
    died = fasting_jumper(client, h, "Died")
    gone = fasting_jumper(client, h, "Gone")
    get_invert(db_session, died["id"]).died_at = _today() - timedelta(days=1)
    get_invert(db_session, gone["id"]).transferred_out_at = _now() - timedelta(days=1)
    db_session.commit()

    d = dashboard(client, h)
    assert {p["invert_id"] for p in d["predictions"]} == {alive["id"]}
    assert d["premolt_likely_count"] == 1

    p = predict(client, h, died["id"])
    assert p["eligible"] is False and p["ineligible_reason"] == "closed"
    assert p["is_premolt_likely"] is False and p["show_alert"] is False


@pytest.mark.requires_postgres
def test_open_episode_keeps_animal_listed_with_its_answer(client, db_session, keeper, h):
    mantis = animal(client, h, "Mantis", taxon="mantis", life_stage="adult")
    db_session.add(PremoltEpisode(
        invert_id=uuid.UUID(mantis["id"]), user_id=keeper.id, opened_on=_today() - timedelta(days=3),
        branch="fasting", signals={}, rule_version=RULE_VERSION, keeper_answer="not_yet",
        answer_source="card",
    ))
    db_session.commit()

    d = dashboard(client, h)
    row = next(p for p in d["predictions"] if p["invert_id"] == mantis["id"])
    assert row["eligible"] is False
    assert row["keeper_answer"] == "not_yet"
    assert predict(client, h, mantis["id"])["keeper_answer"] == "not_yet"


@pytest.mark.requires_postgres
def test_batch_query_count_does_not_grow_with_the_collection(client, db_session, keeper, h):
    from sqlalchemy import event

    from app.services.premolt_service import predict_premolt_batch

    def count_queries():
        n = [0]

        def on_exec(*_args, **_kw):
            n[0] += 1

        conn = db_session.connection()
        event.listen(conn, "before_cursor_execute", on_exec)
        try:
            out = predict_premolt_batch(db_session, keeper.id)
        finally:
            event.remove(conn, "before_cursor_execute", on_exec)
        return n[0], out

    fasting_jumper(client, h, "One")
    one, out1 = count_queries()
    assert out1["total_animals"] == 1
    for i in range(4):
        fasting_jumper(client, h, f"More{i}")
    many, out5 = count_queries()
    assert out5["total_animals"] == 5
    assert many == one


@pytest.mark.requires_postgres
def test_viewer_can_read_stranger_404(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    viewer = mk_user(db_session, "viewer")
    db_session.add(CollectionMember(
        owner_user_id=keeper.id, member_user_id=viewer.id, app="tarantuverse", role="viewer",
        invited_email=viewer.email, status="active", accepted_at=_now(),
    ))
    db_session.commit()
    stranger = mk_user(db_session, "stranger")

    assert predict(client, hdr(viewer), j["id"])["show_alert"] is True
    d = dashboard(client, hdr(viewer), collection=str(keeper.id))
    assert [p["invert_id"] for p in d["predictions"]] == [j["id"]]

    for path in (f"/api/v1/premolt/inverts/{j['id']}", f"/api/v1/premolt/tarantulas/{j['id']}/prediction"):
        assert client.get(path, headers=hdr(stranger)).status_code == 404
    assert client.get(
        "/api/v1/premolt/dashboard", headers=hdr(stranger), params={"collection": str(keeper.id)}
    ).status_code == 404


# ── Fix round 1: the fasting clock starts after the post-molt window ─────────

def fed_every(client, headers, animal_id, newest_days_ago, gap=4, meals=5):
    for i in range(meals):
        feed(client, headers, animal_id, newest_days_ago + i * gap)


@pytest.mark.requires_postgres
def test_fasting_clock_skips_the_fast_before_a_molt(client, db_session, h):
    # Adult tarantula, usual gap 4, last meal 30 days ago, molted 14 days ago:
    # the post-molt window (14 days) has only just ended, so it isn't fasting.
    t = animal(client, h, "JustMolted", taxon="tarantula", life_stage="adult")
    fed_every(client, h, t["id"], 30)
    molt(client, h, t["id"], 14)
    p = predict(client, h, t["id"])
    assert p["usual_gap_days"] == 4
    assert p["days_fasting"] == 0
    assert p["is_premolt_likely"] is False and p["branch"] == "none"
    assert p["show_alert"] is False


@pytest.mark.requires_postgres
def test_fasting_counts_from_the_end_of_the_post_molt_window(client, db_session, h):
    # Same animal two weeks later: no meal since; 14 days counted from molt+14
    # = max(2.5 x 4, 14) -> fires. A day earlier it doesn't.
    t = animal(client, h, "Molt28", taxon="tarantula", life_stage="adult")
    fed_every(client, h, t["id"], 44)
    molt(client, h, t["id"], 28)
    p = predict(client, h, t["id"])
    assert p["days_fasting"] == 14
    assert p["is_premolt_likely"] is True and p["branch"] == "fasting"
    # The clock started at the molt's window, not the meal (final review I5).
    assert p["reason"] == "No accepted meal since its molt 28 days ago."

    early = animal(client, h, "Molt27", taxon="tarantula", life_stage="adult")
    fed_every(client, h, early["id"], 43)
    molt(client, h, early["id"], 27)
    p = predict(client, h, early["id"])
    assert p["days_fasting"] == 13
    assert p["is_premolt_likely"] is False and p["branch"] == "none"


@pytest.mark.requires_postgres
def test_keeper_set_pause_on_the_molt_overrides_the_default(client, db_session, h):
    # Keeper said 20 days: clock starts at molt+20, so 8 days of fasting.
    longer = animal(client, h, "Pause20", taxon="tarantula", life_stage="adult")
    fed_every(client, h, longer["id"], 44)
    molt(client, h, longer["id"], 28, feeding_pause_days=20)
    p = predict(client, h, longer["id"])
    assert p["days_fasting"] == 8
    assert p["is_premolt_likely"] is False

    # Keeper said 0 (no pause): the clock runs from molt day itself (the
    # default would have started it today).
    none = animal(client, h, "Pause0", taxon="tarantula", life_stage="adult")
    fed_every(client, h, none["id"], 30)
    molt(client, h, none["id"], 14, feeding_pause_days=0)
    p = predict(client, h, none["id"])
    assert p["days_fasting"] == 14
    assert p["is_premolt_likely"] is True and p["branch"] == "fasting"


@pytest.mark.requires_postgres
def test_jumper_fasting_fires_at_molt_plus_21_at_the_earliest(client, db_session, h):
    # true_spider window 7 + the 14-day minimum (usual gap 2 -> threshold 14).
    at20 = animal(client, h, "Jumper20", taxon="true_spider")
    fed_every(client, h, at20["id"], 22, gap=2)
    molt(client, h, at20["id"], 20)
    p = predict(client, h, at20["id"])
    assert p["usual_gap_days"] == 2
    assert p["days_fasting"] == 13
    assert p["is_premolt_likely"] is False

    at21 = animal(client, h, "Jumper21", taxon="true_spider")
    fed_every(client, h, at21["id"], 23, gap=2)
    molt(client, h, at21["id"], 21)
    p = predict(client, h, at21["id"])
    assert p["days_fasting"] == 14
    assert p["is_premolt_likely"] is True and p["branch"] == "fasting"


@pytest.mark.requires_postgres
def test_sitter_card_keeps_the_original_three_branches(client, db_session, h):
    from app.routers.sitter_passes import _premolt_likely

    # Fasting-only tarantula: the keeper's card may say "may be in premolt",
    # the sitter card says nothing.
    fasting = animal(client, h, "FastingT", taxon="tarantula", life_stage="adult")
    fed_every(client, h, fasting["id"], 44)
    molt(client, h, fasting["id"], 28)
    assert predict(client, h, fasting["id"])["branch"] == "fasting"
    assert _premolt_likely(db_session, get_invert(db_session, fasting["id"])) is False

    # Refusal streak: still "premolt" on the sitter card.
    refusing = animal(client, h, "RefusingT", taxon="tarantula", life_stage="adult")
    for d in (9, 6, 3):
        feed(client, h, refusing["id"], d, accepted=False)
    assert predict(client, h, refusing["id"])["branch"] == "refusals"
    assert _premolt_likely(db_session, get_invert(db_session, refusing["id"])) is True
