"""Premolt v2 final-review fix wave (2026-11-17).

1. A molt that becomes the animal's NEWEST molt ends a feeding pause whose
   reason is "premolt" (both columns, legacy twin too) on every per-animal
   molt-create route. A back-dated molt doesn't; other reasons are untouched.
2. An adult male tarantula is matured: no premolt prediction.
3. Fasting never fires while the animal is paused for any reason other than
   premolt; `paused_other` says so and the answer route refuses (400).
4. Staleness cap: no fasting fire past FAST_MAX_DAYS (120) days fasting.
5. When the fasting clock started at the molt + window, the reason says
   "No accepted meal since its molt N days ago."; "1 days" -> "1 day".

Spec docs/superpowers/specs/2026-11-17-premolt-v2-design.md (Build notes).
"""
import uuid
from datetime import timedelta

import pytest

from app.models.invert import Invert
from app.models.premolt_episode import PremoltEpisode
from app.models.scorpion import Scorpion
from app.models.tarantula import Sex, Tarantula
from app.services.premolt_service import (
    FAST_MAX_DAYS,
    fasting_fires,
    is_matured,
    premolt_reason,
)
from app.utils.feeding_pause import end_premolt_pause
from tests.test_premolt_v2 import (  # noqa: F401  (h, keeper: fixtures)
    _noon,
    h,
    keeper,
    _today,
    animal,
    fasting_jumper,
    fed_every,
    feed,
    get_invert,
    molt,
    predict,
)


# ── pure helpers ─────────────────────────────────────────────────────────────

def test_is_matured_adult_male_tarantula():
    assert is_matured("tarantula", "adult", False, sex="male") is True
    assert is_matured("tarantula", "adult", False, sex="MALE") is True
    assert is_matured("tarantula", "adult", False, sex=Sex.MALE) is True
    assert is_matured("tarantula", "Adult ", False, sex=" Male") is True
    # Females, unknown and unsexed adults keep molting.
    for sex in ("female", Sex.FEMALE, "unknown", Sex.UNKNOWN, None):
        assert is_matured("tarantula", "adult", False, sex=sex) is False, sex
    # A male that isn't adult yet is not matured.
    assert is_matured("tarantula", "juvenile", False, sex=Sex.MALE) is False
    assert is_matured("tarantula", None, False, sex=Sex.MALE) is False
    # Other taxa whose adults keep molting don't change with sex.
    assert is_matured("centipede", "adult", False, sex=Sex.MALE) is False
    assert is_matured("whip_spider", "adult", False, sex=Sex.MALE) is False
    # Sex is optional (old callers).
    assert is_matured("tarantula", "adult", False) is False


def test_fasting_staleness_cap():
    assert FAST_MAX_DAYS == 120
    assert fasting_fires(120, 5) is True
    assert fasting_fires(121, 5) is False
    assert fasting_fires(400, 5) is False
    # The replay passes its own thresholds; the cap still applies.
    assert fasting_fires(120, 40, multiplier=3.0, min_days=21) is True
    assert fasting_fires(121, 40, multiplier=3.0, min_days=21) is False
    assert fasting_fires(29, 10, multiplier=3.0, min_days=21) is False
    assert fasting_fires(30, 10, multiplier=3.0, min_days=21) is True


def test_reason_after_a_molt_and_day_grammar():
    kw = dict(branch="fasting", recent_refusal_streak=0)
    assert premolt_reason(
        days_fasting=14, usual_gap=4, days_since_last_molt=28, clock_from_molt=True, **kw
    ) == "No accepted meal since its molt 28 days ago."
    assert premolt_reason(
        days_fasting=14, usual_gap=4, days_since_last_molt=1, clock_from_molt=True, **kw
    ) == "No accepted meal since its molt 1 day ago."
    # The clock from the last meal keeps the two existing sentences.
    assert premolt_reason(
        days_fasting=20, usual_gap=5, days_since_last_molt=60, clock_from_molt=False, **kw
    ) == "No accepted meal in 20 days — usually eats every 5."
    # "1 days" -> "1 day" in both existing sentences.
    assert premolt_reason(
        days_fasting=1, usual_gap=0.2, days_since_last_molt=None, gap_is_observed=False, **kw
    ) == "No accepted meal in 1 day — its feeding interval is 1 day."
    assert premolt_reason(
        days_fasting=1, usual_gap=1, days_since_last_molt=None, gap_is_observed=True, **kw
    ) == "No accepted meal in 1 day — usually eats every 1."


# ── item 1: a molt ends a premolt pause ──────────────────────────────────────

def _pause(db, animal_id, reason="premolt", until=None):
    """Set the pause on the invert AND its legacy twin, as the answer route does."""
    aid = uuid.UUID(animal_id)
    for model in (Invert, Tarantula, Scorpion):
        row = db.query(model).filter(model.id == aid).first()
        if row is not None:
            row.feeding_paused_reason = reason
            row.feeding_paused_until = until
    db.commit()


def _paused(db, animal_id):
    """{model name: (reason, until)} for every row that exists."""
    aid = uuid.UUID(animal_id)
    out = {}
    for model in (Invert, Tarantula, Scorpion):
        db.expire_all()
        row = db.query(model).filter(model.id == aid).first()
        if row is not None:
            out[model.__name__] = (row.feeding_paused_reason, row.feeding_paused_until)
    return out


# (route prefix, taxon, twin model expected or None)
MOLT_ROUTES = [
    ("inverts", "true_spider", None),
    ("inverts", "tarantula", "Tarantula"),
    ("tarantulas", "tarantula", "Tarantula"),
    ("scorpions", "scorpion", "Scorpion"),
    ("centipedes", "centipede", None),
    ("whip-spiders", "whip_spider", None),
]


def _post_molt(client, headers, prefix, animal_id, days_ago):
    r = client.post(
        f"/api/v1/{prefix}/{animal_id}/molts",
        json={"molted_at": _noon(days_ago).isoformat()},
        headers=headers,
    )
    assert r.status_code == 201, r.text


@pytest.mark.requires_postgres
@pytest.mark.parametrize("prefix,taxon,twin", MOLT_ROUTES)
def test_newest_molt_ends_a_premolt_pause_on_every_route(client, db_session, h, prefix, taxon, twin):
    a = animal(client, h, f"P-{prefix}", taxon=taxon)
    if twin is not None:
        assert twin in _paused(db_session, a["id"]), f"{taxon} has no legacy {twin} row"
    _pause(db_session, a["id"], until=_today() + timedelta(days=30))

    _post_molt(client, h, prefix, a["id"], 0)

    state = _paused(db_session, a["id"])
    for name, value in state.items():
        assert value == (None, None), (name, value)


@pytest.mark.requires_postgres
@pytest.mark.parametrize("prefix,taxon,twin", MOLT_ROUTES)
def test_backdated_molt_keeps_the_premolt_pause(client, db_session, h, prefix, taxon, twin):
    a = animal(client, h, f"B-{prefix}", taxon=taxon)
    _post_molt(client, h, prefix, a["id"], 10)
    _pause(db_session, a["id"])

    _post_molt(client, h, prefix, a["id"], 40)  # older than the newest molt

    for name, value in _paused(db_session, a["id"]).items():
        assert value == ("premolt", None), (name, value)


@pytest.mark.requires_postgres
def test_molt_leaves_other_pause_reasons_alone(client, db_session, h):
    t = animal(client, h, "Rehoused", taxon="tarantula")
    _pause(db_session, t["id"], reason="rehoused")
    molt(client, h, t["id"], 0)
    for name, value in _paused(db_session, t["id"]).items():
        assert value == ("rehoused", None), (name, value)


@pytest.mark.requires_postgres
def test_answer_yes_then_molt_resumes_and_reminders_come_back(client, db_session, h):
    t = animal(client, h, "Rosie", taxon="tarantula")
    for d in (9, 6, 3):
        feed(client, h, t["id"], d, accepted=False)
    r = client.post(f"/api/v1/premolt/inverts/{t['id']}/answer", json={"answer": "yes"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["paused_for_premolt"] is True

    molt(client, h, t["id"], 0)

    p = predict(client, h, t["id"])
    assert p["paused_for_premolt"] is False
    assert _paused(db_session, t["id"]) == {"Invert": (None, None), "Tarantula": (None, None)}


@pytest.mark.requires_postgres
def test_same_day_molt_counts_as_newest(client, db_session, h):
    j = animal(client, h, "SameDay", taxon="true_spider")
    molt(client, h, j["id"], 5)
    _pause(db_session, j["id"])
    molt(client, h, j["id"], 5)  # same moment as the newest: on or after it
    assert _paused(db_session, j["id"])["Invert"] == (None, None)


def test_end_premolt_pause_helper_without_db():
    class Row:
        feeding_paused_reason = " Premolt "
        feeding_paused_until = None

    row = Row()
    assert end_premolt_pause(row) is True
    assert (row.feeding_paused_reason, row.feeding_paused_until) == (None, None)
    assert end_premolt_pause(row) is False

    other = Row()
    other.feeding_paused_reason = "rehoused"
    assert end_premolt_pause(other) is False
    assert other.feeding_paused_reason == "rehoused"


# ── item 2: adult male tarantula = matured ───────────────────────────────────

@pytest.mark.requires_postgres
def test_adult_male_tarantula_is_matured_everywhere(client, db_session, keeper, h):
    from app.services.premolt_episodes import run_premolt_episodes
    from tests.test_premolt_v2 import dashboard

    male = animal(client, h, "Mature male", taxon="tarantula", life_stage="adult", sex="male")
    female = animal(client, h, "Female", taxon="tarantula", life_stage="adult", sex="female")
    young = animal(client, h, "Young male", taxon="tarantula", life_stage="juvenile", sex="male")
    for a in (male, female, young):
        for d in (9, 6, 3):
            feed(client, h, a["id"], d, accepted=False)

    pm = predict(client, h, male["id"])
    assert pm["eligible"] is False and pm["ineligible_reason"] == "matured"
    assert pm["is_premolt_likely"] is False and pm["show_alert"] is False
    for a in (female, young):
        p = predict(client, h, a["id"])
        assert p["eligible"] is True and p["is_premolt_likely"] is True, a["name"]

    ids = {p["invert_id"] for p in dashboard(client, h)["predictions"]}
    assert male["id"] not in ids and female["id"] in ids and young["id"] in ids

    run_premolt_episodes(db_session, force=True, only_user_id=str(keeper.id))
    opened = {str(e.invert_id) for e in db_session.query(PremoltEpisode).filter(
        PremoltEpisode.user_id == keeper.id)}
    assert male["id"] not in opened
    assert {female["id"], young["id"]} <= opened

    r = client.post(f"/api/v1/premolt/inverts/{male['id']}/answer", json={"answer": "yes"}, headers=h)
    assert r.status_code == 400


# ── item 3: other pause reasons ──────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_fasting_does_not_fire_while_paused_for_another_reason(client, db_session, h):
    j = fasting_jumper(client, h)
    feed(client, h, animal(client, h, "Heartbeat", taxon="tarantula")["id"], 1)
    assert predict(client, h, j["id"])["branch"] == "fasting"

    _pause(db_session, j["id"], reason="rehoused")
    p = predict(client, h, j["id"])
    assert p["paused_other"] is True
    assert p["paused_for_premolt"] is False
    assert p["is_premolt_likely"] is False and p["branch"] == "none"
    assert p["show_alert"] is False

    # A lapsed pause is no pause.
    _pause(db_session, j["id"], reason="rehoused", until=_today() - timedelta(days=1))
    p = predict(client, h, j["id"])
    assert p["paused_other"] is False
    assert p["branch"] == "fasting"

    # A premolt pause is not "other".
    _pause(db_session, j["id"], reason="premolt")
    p = predict(client, h, j["id"])
    assert p["paused_other"] is False and p["paused_for_premolt"] is True


@pytest.mark.requires_postgres
def test_answers_refused_while_paused_for_another_reason(client, db_session, h):
    t = animal(client, h, "Refuser", taxon="tarantula")
    for d in (9, 6, 3):
        feed(client, h, t["id"], d, accepted=False)
    _pause(db_session, t["id"], reason="Breeding season")

    p = predict(client, h, t["id"])
    # Another branch may still fire; the keeper's reason must not be overwritten.
    assert p["branch"] == "refusals" and p["paused_other"] is True

    for value in ("yes", "not_yet"):
        r = client.post(f"/api/v1/premolt/inverts/{t['id']}/answer", json={"answer": value}, headers=h)
        assert r.status_code == 400, (value, r.text)
        assert r.json()["detail"] == "Premolt answers aren't available for this animal."
    inv = get_invert(db_session, t["id"])
    db_session.refresh(inv)
    assert inv.feeding_paused_reason == "Breeding season"
    assert inv.premolt_snoozed_until is None


# ── items 4 + 5 through the route ────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_staleness_cap_at_120_and_121_days(client, db_session, h):
    feed(client, h, animal(client, h, "Heartbeat", taxon="tarantula")["id"], 1)

    at120 = animal(client, h, "Fast120", taxon="true_spider", interval=7)
    feed(client, h, at120["id"], 127)
    feed(client, h, at120["id"], 120)
    p = predict(client, h, at120["id"])
    assert p["days_fasting"] == 120 and p["branch"] == "fasting"

    at121 = animal(client, h, "Fast121", taxon="true_spider", interval=7)
    feed(client, h, at121["id"], 128)
    feed(client, h, at121["id"], 121)
    p = predict(client, h, at121["id"])
    assert p["days_fasting"] == 121
    assert p["is_premolt_likely"] is False and p["branch"] == "none"


@pytest.mark.requires_postgres
def test_reason_names_the_molt_when_the_clock_started_there(client, db_session, h):
    feed(client, h, animal(client, h, "Heartbeat", taxon="tarantula")["id"], 1)
    # Adult tarantula, last meal 44 days ago, molted 28 days ago (+14 window):
    # 14 days fasting counted from the window, so the sentence names the molt.
    t = animal(client, h, "Molt28", taxon="tarantula", life_stage="adult")
    fed_every(client, h, t["id"], 44)
    molt(client, h, t["id"], 28)
    p = predict(client, h, t["id"])
    assert p["branch"] == "fasting" and p["days_fasting"] == 14
    assert p["reason"] == "No accepted meal since its molt 28 days ago."

    # Last meal after the window ended: the clock is the meal.
    j = fasting_jumper(client, h)
    assert predict(client, h, j["id"])["reason"] == "No accepted meal in 20 days — usually eats every 5."
