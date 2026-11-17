"""Premolt v2, Task 3: episodes, keeper answers, export.

Spec docs/superpowers/specs/2026-11-17-premolt-v2-design.md §5.

- `services/premolt_episodes.run_premolt_episodes` is the once-a-day pass
  (guarded by the `premolt.episodes_last_run_on` setting, read and written
  straight through the row — the settings cache is 5 minutes). It opens an
  episode when an eligible animal turns likely, and closes open ones as
  molted / ate / animal_closed / cleared / stale. A manual premolt pause counts
  as a keeper "yes" (answer_source "pause").
- `POST /premolt/inverts/{id}/answer` {"answer": "yes" | "not_yet"}: yes turns
  on the open-ended premolt feeding pause (mirrored onto a tarantula's legacy
  row), not_yet snoozes the alert 14 days and closes the episode.
- The digest cron runs the pass after the digest; a failure in the pass never
  breaks the digest.
- Episodes go into the owner's own export only, never onto public routes.
"""
import asyncio
import csv
import io
import json
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

import pytest

from app.models.collection_member import CollectionMember
from app.models.invert import Invert
from app.models.premolt_episode import PremoltEpisode
from app.models.system_setting import SystemSetting
from app.models.tarantula import Tarantula
from app.services import export_service
from app.services.export_service import ExportService, build_full_zip
from app.services.premolt_service import RULE_VERSION, SNOOZE_DAYS, STALE_YES_DAYS
from tests.test_expenses import make_premium
from tests.test_premolt_v2 import (
    _now,
    _today,
    animal,
    fasting_jumper,
    feed,
    get_invert,
    hdr,
    mk_user,
    molt,
    predict,
)

GUARD_KEY = "premolt.episodes_last_run_on"
SIGNAL_KEYS = {
    "recent_refusal_streak", "days_fasting", "usual_gap_days", "molt_interval_progress",
    "confidence", "taxon", "life_stage",
}


def run_pass(db, **kw):
    from app.services.premolt_episodes import run_premolt_episodes
    return run_premolt_episodes(db, **kw)


def run_for(db, user):
    return run_pass(db, force=True, only_user_id=str(user.id))


def episodes(db, animal_id):
    return (
        db.query(PremoltEpisode)
        .filter(PremoltEpisode.invert_id == uuid.UUID(animal_id))
        .order_by(PremoltEpisode.created_at, PremoltEpisode.opened_on)
        .all()
    )


def open_episode(db, animal_id):
    return (
        db.query(PremoltEpisode)
        .filter(PremoltEpisode.invert_id == uuid.UUID(animal_id), PremoltEpisode.closed_on.is_(None))
        .one_or_none()
    )


def answer(client, headers, animal_id, value):
    return client.post(
        f"/api/v1/premolt/inverts/{animal_id}/answer", json={"answer": value}, headers=headers,
    )


def join(db, owner, member, role):
    db.add(CollectionMember(
        owner_user_id=owner.id, member_user_id=member.id, app="tarantuverse", role=role,
        invited_email=member.email, status="active", accepted_at=_now(),
    ))
    db.commit()


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session, "pme")


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


# ── the daily pass ───────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_pass_opens_and_is_once_a_day(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    milli = animal(client, h, "Milli", taxon="millipede", life_stage=None)
    calm = animal(client, h, "Calm", taxon="tarantula")
    feed(client, h, calm["id"], 1)
    guard = db_session.query(SystemSetting).filter(SystemSetting.key == GUARD_KEY).one()
    guard.value = ""
    db_session.commit()

    out = run_pass(db_session)
    assert out["skipped"] is False
    assert out["opened"] >= 1

    ep = open_episode(db_session, j["id"])
    assert ep is not None
    assert ep.user_id == keeper.id
    assert ep.opened_on == _today()
    assert ep.branch == "fasting"
    assert ep.rule_version == RULE_VERSION
    assert set(ep.signals) == SIGNAL_KEYS
    assert ep.signals["days_fasting"] == 20 and ep.signals["usual_gap_days"] == 5
    assert ep.signals["taxon"] == "true_spider" and ep.signals["life_stage"] == "juvenile"
    assert ep.signals["confidence"] == "low"
    assert ep.keeper_answer is None and ep.close_reason is None
    assert episodes(db_session, milli["id"]) == [] and episodes(db_session, calm["id"]) == []

    db_session.refresh(guard)
    assert guard.value == datetime.now(timezone.utc).date().isoformat()

    # Same UTC day: skipped, whatever the in-process settings cache holds.
    # Prime the 5-minute settings cache with YESTERDAY, then write today
    # straight to the row (no settings_service.update, so the cache is NOT
    # invalidated): the guard must read the row, not the cache.
    from app.services import settings_service
    today_iso = datetime.now(timezone.utc).date().isoformat()
    yesterday_iso = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    try:
        guard.value = yesterday_iso
        db_session.commit()
        settings_service.invalidate_cache()
        assert settings_service.get(db_session, GUARD_KEY) == yesterday_iso     # cache primed, old date
        db_session.query(SystemSetting).filter(SystemSetting.key == GUARD_KEY).update(
            {"value": today_iso}, synchronize_session=False,
        )
        db_session.commit()
        assert settings_service.get(db_session, GUARD_KEY) == yesterday_iso     # cache still stale
        again = run_pass(db_session)
        assert again["skipped"] is True
    finally:
        settings_service.invalidate_cache()

    # force runs, but never opens a second episode for the same animal.
    j2 = fasting_jumper(client, h, "Second")
    forced = run_pass(db_session, force=True)
    assert forced["skipped"] is False and forced["opened"] == 1
    assert len(episodes(db_session, j["id"])) == 1
    assert open_episode(db_session, j2["id"]) is not None


@pytest.mark.requires_postgres
def test_guard_refreshes_a_row_already_in_the_session(client, db_session, keeper, h):
    """The guard's locked read must reload the row: a SystemSetting already in
    the session's identity map (holding an old value) would otherwise be
    returned as-is and the pass would run twice in one day."""
    from sqlalchemy import text

    fasting_jumper(client, h)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    guard = db_session.query(SystemSetting).filter(SystemSetting.key == GUARD_KEY).one()
    guard.value = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    db_session.commit()
    guard = db_session.query(SystemSetting).filter(SystemSetting.key == GUARD_KEY).one()
    assert guard.value != today_iso                     # loaded, old value in the identity map
    # Another worker already ran today (written behind the ORM's back).
    db_session.execute(text("UPDATE system_settings SET value = :v WHERE key = :k"),
                       {"v": today_iso, "k": GUARD_KEY})
    out = run_pass(db_session)
    assert out["skipped"] is True
    assert out.get("opened", 0) == 0


@pytest.mark.requires_postgres
def test_invert_locks_are_no_key_update(client, db_session, keeper, h):
    """Row locks on inverts are FOR NO KEY UPDATE: a plain FOR UPDATE would
    block every feeding/molt insert (their FK check takes KEY SHARE) for the
    whole pass."""
    from sqlalchemy import event

    j = fasting_jumper(client, h)
    seen = []

    def grab(conn, cursor, statement, params, context, executemany):
        seen.append(" ".join(statement.split()))

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", grab)
    try:
        run_for(db_session, keeper)
        assert answer(client, h, j["id"], "yes").status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", grab)

    locks = [s for s in seen if " FOR " in s and "FROM inverts" in s]
    assert len(locks) >= 2, seen                        # the pass and the answer
    for s in locks:
        assert "FOR NO KEY UPDATE" in s, s


@pytest.mark.requires_postgres
def test_one_keeper_failing_does_not_stop_the_others(client, db_session, keeper, h, monkeypatch):
    from app.services import premolt_episodes

    other = mk_user(db_session, "pme-other")
    mine = fasting_jumper(client, h, "Mine")
    theirs = fasting_jumper(client, hdr(other), "Theirs")
    real = premolt_episodes._run_for_owner

    def flaky(db, owner_id):
        if owner_id == keeper.id:
            real(db, owner_id)            # writes, then fails: its writes roll back
            raise RuntimeError("one bad keeper")
        return real(db, owner_id)

    monkeypatch.setattr(premolt_episodes, "_run_for_owner", flaky)
    out = run_pass(db_session, force=True)
    assert out["failed"] == 1
    assert open_episode(db_session, mine["id"]) is None
    assert open_episode(db_session, theirs["id"]) is not None


@pytest.mark.requires_postgres
def test_pass_skips_inactive_merged_and_test_accounts(client, db_session, h):
    owners = {}
    for tag, email in (("inactive", None), ("merged", "merged-x@merged.invalid"),
                       ("robot", "robot@cloudtestlabaccounts.com")):
        u = mk_user(db_session, tag)
        if email:
            u.email = email.replace("x", uuid.uuid4().hex[:6]) if tag == "merged" else email
        owners[tag] = (u, fasting_jumper(client, hdr(u), tag))
    owners["inactive"][0].is_active = False
    db_session.commit()
    run_pass(db_session, force=True)
    for tag, (_u, a) in owners.items():
        assert episodes(db_session, a["id"]) == [], tag


@pytest.mark.requires_postgres
def test_pass_closes_on_molt_meal_and_cleared(client, db_session, keeper, h):
    a = fasting_jumper(client, h, "Molts")
    b = fasting_jumper(client, h, "Eats")
    c = fasting_jumper(client, h, "Grows up")
    d = fasting_jumper(client, h, "Dies")
    e = fasting_jumper(client, h, "Refuses")
    assert run_for(db_session, keeper)["opened"] == 5

    molt(client, h, a["id"], 0)
    feed(client, h, b["id"], 0)
    get_invert(db_session, c["id"]).life_stage = "adult"     # a true-spider adult: matured, no longer likely
    get_invert(db_session, d["id"]).died_at = _today()
    db_session.commit()
    feed(client, h, e["id"], 0, accepted=False)              # a refusal is not a meal

    out = run_for(db_session, keeper)
    assert out["closed"] == 4 and out["opened"] == 0
    for row, reason in ((a, "molted"), (b, "ate"), (c, "cleared"), (d, "animal_closed")):
        [ep] = episodes(db_session, row["id"])
        assert ep.close_reason == reason, row["name"]
        assert ep.closed_on == _today(), row["name"]
    assert open_episode(db_session, e["id"]) is not None

    # Closed today: the pass doesn't reopen anything on a second run.
    again = run_for(db_session, keeper)
    assert again["opened"] == 0 and again["closed"] == 0


@pytest.mark.requires_postgres
def test_yes_episode_not_cleared_and_goes_stale_after_120_days(client, db_session, keeper, h):
    # Refusals only: no accepted meal and no molt, so nothing else closes it
    # when opened_on is moved into the past.
    j = animal(client, h, "Refuser", taxon="tarantula")
    for d in (9, 6, 3):
        feed(client, h, j["id"], d, accepted=False)
    assert answer(client, h, j["id"], "yes").status_code == 200
    # The refusals that flagged it are gone (deleted as entered by mistake):
    # no rule fires any more, but the keeper's "yes" stands.
    from app.models.feeding_log import FeedingLog
    for row in db_session.query(FeedingLog).filter(FeedingLog.invert_id == uuid.UUID(j["id"])).all():
        db_session.delete(row)
    db_session.commit()
    assert predict(client, h, j["id"])["is_premolt_likely"] is False

    run_for(db_session, keeper)
    ep = open_episode(db_session, j["id"])
    assert ep is not None and ep.keeper_answer == "yes"

    ep.opened_on = _today() - timedelta(days=STALE_YES_DAYS - 1)
    db_session.commit()
    run_for(db_session, keeper)
    assert open_episode(db_session, j["id"]) is not None

    ep.opened_on = _today() - timedelta(days=STALE_YES_DAYS)
    db_session.commit()
    out = run_for(db_session, keeper)
    assert out["closed"] == 1
    db_session.refresh(ep)
    assert ep.close_reason == "stale" and ep.closed_on == _today()
    assert open_episode(db_session, j["id"]) is None

    # The premolt pause is still set, but it is the SAME pause (no meal or
    # molt since that episode opened): it never gets a second "yes" label.
    assert get_invert(db_session, j["id"]).feeding_paused_reason == "premolt"
    again = run_for(db_session, keeper)
    assert again["opened"] == 0 and again["answered_from_pause"] == 0
    assert open_episode(db_session, j["id"]) is None
    assert len(episodes(db_session, j["id"])) == 1


@pytest.mark.requires_postgres
def test_manual_premolt_pause_counts_as_yes(client, db_session, keeper, h):
    # Paused by hand, not flagged by any rule: opens a "yes" episode.
    quiet = animal(client, h, "Quiet")
    feed(client, h, quiet["id"], 2)
    # Flagged and open, then paused by hand: the open episode gets the answer.
    flagged = fasting_jumper(client, h, "Flagged")
    run_for(db_session, keeper)
    first = open_episode(db_session, flagged["id"])
    assert first is not None and first.keeper_answer is None
    # A premolt pause left over from before a molt (molted, not fed since)
    # isn't a premolt answer.
    leftover = animal(client, h, "Leftover", taxon="tarantula")
    feed(client, h, leftover["id"], 20)
    molt(client, h, leftover["id"], 10)

    for row in (quiet, flagged, leftover):
        inv = get_invert(db_session, row["id"])
        inv.feeding_paused_reason = "premolt"
        inv.feeding_paused_until = None
    db_session.commit()

    out = run_for(db_session, keeper)
    assert out["answered_from_pause"] == 2

    ep = open_episode(db_session, quiet["id"])
    assert ep is not None
    assert (ep.keeper_answer, ep.answer_source) == ("yes", "pause")
    assert ep.answered_at is not None and ep.answered_by is None
    assert ep.branch == "none" and set(ep.signals) == SIGNAL_KEYS

    ep = open_episode(db_session, flagged["id"])
    assert ep.id == first.id
    assert (ep.keeper_answer, ep.answer_source) == ("yes", "pause")
    assert episodes(db_session, leftover["id"]) == []

    # Already answered: nothing more to record.
    assert run_for(db_session, keeper)["answered_from_pause"] == 0


@pytest.mark.requires_postgres
def test_one_pause_label_per_pause(client, db_session, keeper, h):
    """A premolt pause gets at most one "yes"/"pause" episode. A pause is the
    span since the animal's last accepted meal or molt; an earlier episode
    that opened inside that span already labelled it (e.g. one closed
    keeper_not_yet, or a "yes" closed stale), so the pass doesn't reopen."""
    j = fasting_jumper(client, h)          # last meal 20 days ago, molt 60 days ago
    inv = get_invert(db_session, j["id"])
    inv.feeding_paused_reason = "premolt"
    inv.feeding_paused_until = None
    inv.premolt_snoozed_until = _today() - timedelta(days=1)   # snooze over
    # A "Not yet" on this pause (an episode opened after the last meal).
    db_session.add(PremoltEpisode(
        invert_id=inv.id, user_id=keeper.id, opened_on=_today() - timedelta(days=15),
        branch="fasting", rule_version=RULE_VERSION, signals={},
        keeper_answer="not_yet", answer_source="card", answered_by=keeper.id, answered_at=_now(),
        closed_on=_today() - timedelta(days=15), close_reason="keeper_not_yet",
    ))
    db_session.commit()

    out = run_for(db_session, keeper)
    assert out["opened"] == 0 and out["answered_from_pause"] == 0
    assert open_episode(db_session, j["id"]) is None

    # An earlier episode from BEFORE the last meal doesn't count: that was
    # another pause. A meal ends the pause; a new pause set after it is new.
    feed(client, h, j["id"], 0)
    assert get_invert(db_session, j["id"]).feeding_paused_reason is None   # the meal ended it
    inv = get_invert(db_session, j["id"])
    inv.feeding_paused_reason = "premolt"
    db_session.commit()
    out = run_for(db_session, keeper)
    assert out["opened"] == 1 and out["answered_from_pause"] == 1
    ep = open_episode(db_session, j["id"])
    assert (ep.keeper_answer, ep.answer_source) == ("yes", "pause")


@pytest.mark.requires_postgres
def test_overdue_episode_is_not_closed_by_meals(client, db_session, keeper, h):
    """The overdue branch fires with no refusals (some animals eat straight
    through premolt), so a meal doesn't end it: one episode stays open while
    the animal keeps eating, and closes when the molt is logged."""
    t = animal(client, h, "Eater", taxon="tarantula")
    for d in (130, 100, 70):               # 3 molts (the average needs 3): every 30 days,
        molt(client, h, t["id"], d)        # 70 days since = 233% of the average
    feed(client, h, t["id"], 8)
    run_for(db_session, keeper)
    ep = open_episode(db_session, t["id"])
    assert ep is not None and ep.branch == "overdue"
    ep.opened_on = _today() - timedelta(days=6)
    db_session.commit()

    for d in (5, 3, 1, 0):
        feed(client, h, t["id"], d)
        out = run_for(db_session, keeper)
        assert out["closed"] == 0 and out["opened"] == 0, d
        assert open_episode(db_session, t["id"]).id == ep.id, d
    assert len(episodes(db_session, t["id"])) == 1

    molt(client, h, t["id"], 0)
    out = run_for(db_session, keeper)
    assert out["closed"] == 1
    db_session.refresh(ep)
    assert ep.close_reason == "molted" and ep.closed_on == _today()

    # A keeper "yes" on an overdue episode is a feeding pause, which a meal
    # ends: that one still closes as 'ate'.
    y = animal(client, h, "Yes-eater", taxon="tarantula")
    for d in (130, 100, 70):
        molt(client, h, y["id"], d)
    feed(client, h, y["id"], 8)
    run_for(db_session, keeper)
    assert open_episode(db_session, y["id"]).branch == "overdue"
    assert answer(client, h, y["id"], "yes").status_code == 200
    feed(client, h, y["id"], 0)
    run_for(db_session, keeper)
    [closed] = episodes(db_session, y["id"])
    assert closed.close_reason == "ate"


# ── the answer route ─────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_answer_yes_pauses_feeding(client, db_session, keeper, h):
    t = animal(client, h, "Rosie", taxon="tarantula")
    for d in (9, 6, 3):
        feed(client, h, t["id"], d, accepted=False)
    assert predict(client, h, t["id"])["show_alert"] is True

    r = answer(client, h, t["id"], "yes")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_premolt_likely"] is True
    assert body["paused_for_premolt"] is True
    assert body["show_alert"] is False
    assert body["keeper_answer"] == "yes"
    assert body["tarantula_id"] == t["id"]

    inv = get_invert(db_session, t["id"])
    assert inv.feeding_paused_reason == "premolt" and inv.feeding_paused_until is None
    legacy = db_session.query(Tarantula).filter(Tarantula.id == uuid.UUID(t["id"])).one()
    assert legacy.feeding_paused_reason == "premolt" and legacy.feeding_paused_until is None

    ep = open_episode(db_session, t["id"])
    assert (ep.keeper_answer, ep.answer_source) == ("yes", "card")
    assert ep.answered_by == keeper.id and ep.answered_at is not None
    assert ep.branch == "refusals" and ep.signals["recent_refusal_streak"] == 3
    assert ep.user_id == keeper.id and ep.rule_version == RULE_VERSION


@pytest.mark.requires_postgres
def test_not_yet_snoozes_and_pass_does_not_reopen(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    run_for(db_session, keeper)
    first = open_episode(db_session, j["id"])
    assert first is not None

    r = answer(client, h, j["id"], "not_yet")
    assert r.status_code == 200, r.text
    body = r.json()
    until = _today() + timedelta(days=SNOOZE_DAYS)
    assert body["premolt_snoozed_until"] == until.isoformat()
    assert body["is_premolt_likely"] is True and body["show_alert"] is False
    assert body["keeper_answer"] is None          # no open episode any more
    assert get_invert(db_session, j["id"]).premolt_snoozed_until == until
    assert get_invert(db_session, j["id"]).feeding_paused_reason is None

    db_session.refresh(first)
    assert first.closed_on == _today() and first.close_reason == "keeper_not_yet"
    assert (first.keeper_answer, first.answer_source) == ("not_yet", "card")
    assert first.answered_by == keeper.id

    # The signal keeps firing; the pass doesn't reopen while snoozed.
    assert run_for(db_session, keeper)["opened"] == 0
    inv = get_invert(db_session, j["id"])
    inv.premolt_snoozed_until = _today()            # last snoozed day
    db_session.commit()
    assert run_for(db_session, keeper)["opened"] == 0
    assert open_episode(db_session, j["id"]) is None

    # Snooze over: the next pass may open a new episode.
    inv.premolt_snoozed_until = _today() - timedelta(days=1)
    db_session.commit()
    assert run_for(db_session, keeper)["opened"] == 1
    second = open_episode(db_session, j["id"])
    assert second is not None and second.id != first.id


@pytest.mark.requires_postgres
def test_later_yes_after_not_yet_is_a_new_episode(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    assert answer(client, h, j["id"], "not_yet").status_code == 200
    r = answer(client, h, j["id"], "yes")
    assert r.status_code == 200, r.text
    assert r.json()["paused_for_premolt"] is True
    rows = episodes(db_session, j["id"])
    assert {(e.keeper_answer, e.close_reason) for e in rows} == {("not_yet", "keeper_not_yet"), ("yes", None)}
    assert len(rows) == 2


@pytest.mark.requires_postgres
def test_answer_roles(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    make_premium(db_session, keeper)          # co-keeper roles above viewer need the owner's premium
    members = {}
    for role in ("keeper", "logger", "viewer"):
        members[role] = mk_user(db_session, role)
        join(db_session, keeper, members[role], role)
    stranger = mk_user(db_session, "stranger")

    assert answer(client, hdr(members["logger"]), j["id"], "yes").status_code == 403
    assert answer(client, hdr(members["viewer"]), j["id"], "yes").status_code == 403
    assert answer(client, hdr(stranger), j["id"], "yes").status_code == 404
    assert answer(client, h, str(uuid.uuid4()), "yes").status_code == 404
    assert episodes(db_session, j["id"]) == []

    r = answer(client, hdr(members["keeper"]), j["id"], "yes")
    assert r.status_code == 200, r.text
    ep = open_episode(db_session, j["id"])
    assert ep.answered_by == members["keeper"].id
    assert ep.user_id == keeper.id        # always the collection owner

    died = fasting_jumper(client, h, "Died")
    get_invert(db_session, died["id"]).died_at = _today()
    db_session.commit()
    assert answer(client, h, died["id"], "yes").status_code == 409
    assert answer(client, h, died["id"], "not_yet").status_code == 409

    assert answer(client, h, j["id"], "maybe").status_code == 422


@pytest.mark.requires_postgres
def test_not_yet_while_paused_for_premolt_is_a_no_op(client, db_session, keeper, h):
    """Un-pausing goes through the pause controls. "Not yet" on an animal
    already paused for premolt changes nothing and returns the prediction."""
    j = fasting_jumper(client, h)
    assert answer(client, h, j["id"], "yes").status_code == 200
    ep = open_episode(db_session, j["id"])
    stamp = ep.answered_at

    r = answer(client, h, j["id"], "not_yet")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["paused_for_premolt"] is True and body["keeper_answer"] == "yes"
    assert body["premolt_snoozed_until"] is None
    db_session.refresh(ep)
    assert ep.closed_on is None and ep.close_reason is None
    assert (ep.keeper_answer, ep.answer_source, ep.answered_at) == ("yes", "card", stamp)
    inv = get_invert(db_session, j["id"])
    assert inv.premolt_snoozed_until is None and inv.feeding_paused_reason == "premolt"
    assert len(episodes(db_session, j["id"])) == 1

    # A pause set by hand (no episode yet): still nothing recorded.
    other = fasting_jumper(client, h, "Hand-paused")
    inv = get_invert(db_session, other["id"])
    inv.feeding_paused_reason = "premolt"
    inv.feeding_paused_until = None
    db_session.commit()
    r = answer(client, h, other["id"], "not_yet")
    assert r.status_code == 200, r.text
    assert r.json()["paused_for_premolt"] is True
    assert episodes(db_session, other["id"]) == []
    assert get_invert(db_session, other["id"]).premolt_snoozed_until is None


@pytest.mark.requires_postgres
def test_answer_refused_for_ineligible_animals(client, db_session, keeper, h):
    detail = "Premolt answers aren't available for this animal."
    grazer = animal(client, h, "Milli", taxon="millipede", life_stage=None)
    adult = fasting_jumper(client, h, "Adult jumper")
    get_invert(db_session, adult["id"]).life_stage = "adult"     # a true-spider adult: matured
    closed_grazer = animal(client, h, "Gone", taxon="millipede", life_stage=None)
    get_invert(db_session, closed_grazer["id"]).died_at = _today()
    db_session.commit()

    for row in (grazer, adult):
        for value in ("yes", "not_yet"):
            r = answer(client, h, row["id"], value)
            assert r.status_code == 400, (row["name"], value, r.text)
            assert r.json() == {"detail": detail}
        assert episodes(db_session, row["id"]) == []
        inv = get_invert(db_session, row["id"])
        assert inv.feeding_paused_reason is None and inv.premolt_snoozed_until is None

    # Closed animals still get the 409 first.
    assert answer(client, h, closed_grazer["id"], "yes").status_code == 409


@pytest.mark.requires_postgres
def test_answer_idempotent(client, db_session, keeper, h):
    j = fasting_jumper(client, h)
    assert answer(client, h, j["id"], "yes").status_code == 200
    ep = open_episode(db_session, j["id"])
    stamp = ep.answered_at
    r = answer(client, h, j["id"], "yes")
    assert r.status_code == 200
    assert len(episodes(db_session, j["id"])) == 1
    db_session.refresh(ep)
    assert ep.answered_at == stamp

    other = fasting_jumper(client, h, "Other")
    assert answer(client, h, other["id"], "not_yet").status_code == 200
    snoozed = get_invert(db_session, other["id"]).premolt_snoozed_until
    assert answer(client, h, other["id"], "not_yet").status_code == 200
    rows = episodes(db_session, other["id"])
    assert len(rows) == 1 and rows[0].close_reason == "keeper_not_yet"
    assert get_invert(db_session, other["id"]).premolt_snoozed_until == snoozed


# ── the digest cron ──────────────────────────────────────────────────────────

@pytest.mark.requires_postgres
def test_digest_cron_runs_the_pass(client, db_session, keeper, h, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    j = fasting_jumper(client, h)
    r = client.post(
        "/api/v1/notifications/run-digests",
        params={"test_user_id": str(keeper.id), "ignore_schedule": "true"},
        headers={"X-Cron-Secret": "s3cret"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["premolt_episodes"]["opened"] == 1
    assert open_episode(db_session, j["id"]) is not None


@pytest.mark.requires_postgres
def test_digest_cron_runs_the_pass_off_the_event_loop(client, db_session, keeper, monkeypatch):
    """The pass is synchronous DB work: it runs in the threadpool so the single
    uvicorn worker keeps serving requests while it works."""
    from app.routers import notifications
    from app.services import premolt_episodes

    monkeypatch.setenv("CRON_SECRET", "s3cret")
    calls = []
    real = notifications.run_in_threadpool

    async def spy(func, *args, **kwargs):
        calls.append((func, kwargs))
        return await real(func, *args, **kwargs)

    monkeypatch.setattr(notifications, "run_in_threadpool", spy)
    r = client.post(
        "/api/v1/notifications/run-digests",
        params={"test_user_id": str(keeper.id), "ignore_schedule": "true"},
        headers={"X-Cron-Secret": "s3cret"},
    )
    assert r.status_code == 200, r.text
    assert [c[0] for c in calls] == [premolt_episodes.run_premolt_episodes]
    assert calls[0][1] == {"force": True, "only_user_id": str(keeper.id)}
    assert set(r.json()["premolt_episodes"]) >= {"skipped", "opened", "closed", "answered_from_pause"}


@pytest.mark.requires_postgres
def test_episode_pass_failure_does_not_break_digest(client, db_session, keeper, monkeypatch):
    from app.services import premolt_episodes

    def boom(*_a, **_kw):
        raise RuntimeError("pass exploded")

    monkeypatch.setattr(premolt_episodes, "run_premolt_episodes", boom)
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    r = client.post(
        "/api/v1/notifications/run-digests",
        params={"test_user_id": str(keeper.id), "ignore_schedule": "true"},
        headers={"X-Cron-Secret": "s3cret"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("checked", "sent", "emails_sent"):
        assert key in body
    assert body["premolt_episodes"] == {"error": True}


# ── export ───────────────────────────────────────────────────────────────────

def _episode(db, owner, animal_id, **kw):
    ep = PremoltEpisode(
        invert_id=uuid.UUID(animal_id), user_id=owner.id, opened_on=_today() - timedelta(days=3),
        branch="fasting", rule_version=RULE_VERSION,
        signals={"days_fasting": 20, "usual_gap_days": 5.0, "taxon": "true_spider"},
        **kw,
    )
    db.add(ep)
    db.commit()
    return ep


@pytest.mark.requires_postgres
def test_export_includes_episodes(client, db_session, keeper, h):
    assert set(export_service.PREMOLT_EPISODE_FIELDS) == set(PremoltEpisode.__table__.columns.keys())
    j = fasting_jumper(client, h)
    closed = _episode(db_session, keeper, j["id"], closed_on=_today() - timedelta(days=1),
                      close_reason="keeper_not_yet", keeper_answer="not_yet", answer_source="card",
                      answered_by=keeper.id, answered_at=_now())
    opened = _episode(db_session, keeper, j["id"])
    # Another keeper's episode never appears.
    other = mk_user(db_session, "other")
    o = fasting_jumper(client, hdr(other), "NotMine")
    _episode(db_session, other, o["id"])

    env = json.loads(ExportService.export_json(db_session, keeper))
    rows = env["premolt_episodes"]
    assert {r["id"] for r in rows} == {str(closed.id), str(opened.id)}
    assert env["counts"]["premolt_episodes"] == 2
    by_id = {r["id"]: r for r in rows}
    assert by_id[str(opened.id)]["signals"] == {"days_fasting": 20, "usual_gap_days": 5.0, "taxon": "true_spider"}
    assert by_id[str(closed.id)]["close_reason"] == "keeper_not_yet"

    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(db_session, keeper)))
    csv_rows = list(csv.DictReader(io.StringIO(zf.read("premolt_episodes.csv").decode())))
    assert {r["id"] for r in csv_rows} == {str(closed.id), str(opened.id)}
    assert list(csv_rows[0].keys()) == export_service.PREMOLT_EPISODE_FIELDS
    assert json.loads(csv_rows[0]["signals"])["days_fasting"] == 20     # JSON text, not a Python repr
    assert "premolt_episodes.csv" in zf.read("README.txt").decode()

    data = ExportService._gather(db_session, keeper)

    async def no_fetch(url):
        return None

    full = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(data, keeper.username, fetch_photo=no_fetch))))
    assert "premolt_episodes.json" in full.namelist() and "premolt_episodes.csv" in full.namelist()
    assert len(json.loads(full.read("premolt_episodes.json"))) == 2
    assert "premolt_episodes.csv" in full.read("README.txt").decode()

    r = client.get("/api/v1/export/preview", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["counts"]["premolt_episodes"] == 2


def test_export_without_episodes_still_works(monkeypatch):
    """Callers that build `data` by hand may predate episodes."""
    data = {k: [] for k in (
        "tarantulas", "inverts", "feeding_logs", "molt_logs", "substrate_changes", "care_logs",
        "photos", "enclosures", "pairings", "egg_sacs", "offspring", "animals",
        "animal_feeding_logs", "shed_logs", "weight_logs", "genotypes", "animal_photos",
        "reptile_pairings", "clutches", "reptile_offspring", "colonies", "colony_events",
        "hv_feeder_stocks", "hv_feeder_logs",
    )}
    data["profile"] = {"username": "k"}
    monkeypatch.setattr(ExportService, "_gather", staticmethod(lambda db, user: data))
    env = json.loads(ExportService.export_json(None, None))
    assert env["premolt_episodes"] == [] and env["counts"]["premolt_episodes"] == 0
    zf = zipfile.ZipFile(io.BytesIO(ExportService.export_csv_zip(None, None)))
    assert list(csv.DictReader(io.StringIO(zf.read("premolt_episodes.csv").decode()))) == []

    async def no_fetch(url):
        return None

    names = zipfile.ZipFile(io.BytesIO(asyncio.run(build_full_zip(data, "k", fetch_photo=no_fetch)))).namelist()
    assert "premolt_episodes.json" not in names


# ── privacy ──────────────────────────────────────────────────────────────────

SENTINEL = "SENTINEL-PREMOLT-EPISODE-4c1"


@pytest.mark.requires_postgres
def test_episodes_not_on_public_routes(client, db_session, keeper, h):
    keeper.collection_visibility = "public"
    db_session.commit()
    t = animal(client, h, "Rosie-pe4", taxon="tarantula", visibility="public")
    _episode(db_session, keeper, t["id"], keeper_answer="yes", answer_source="card",
             answered_by=keeper.id, answered_at=_now())
    ep = open_episode(db_session, t["id"])
    ep.signals = {**ep.signals, "note": SENTINEL}
    ep.branch = SENTINEL[:30]
    db_session.commit()

    def clean(label, text):
        assert "Rosie-pe4" in text, f"{label}: expected the animal's name (vacuous test?)"
        assert SENTINEL[:30] not in text, f"{label} leaked a premolt episode"
        assert "premolt_episode" not in text and "keeper_answer" not in text, label

    for headers in ({}, h):
        who = "owner" if headers else "visitor"
        for path in (f"/api/v1/i/{t['id']}", f"/api/v1/t/{t['id']}",
                     f"/api/v1/keepers/{keeper.username}/collection/"):
            r = client.get(path, headers=headers)
            assert r.status_code == 200, (path, r.text)
            clean(f"{path} ({who})", r.text)

    made = client.post("/api/v1/share-cards/", headers=h, json={
        "app": "tarantuverse", "kind": "profile", "animal_id": t["id"],
        "fields": ["photo", "name", "species", "sex", "in_care", "molts", "size"], "link": True,
    })
    assert made.status_code == 201, made.text
    token = made.json()["image_url"].rsplit("/", 1)[-1]
    data = client.get(f"/api/v1/share-cards/{token}/data")
    assert data.status_code == 200, data.text
    clean("share-card data", data.text)
    link = client.get(f"/api/v1/card-links/{made.json()['code']}")
    assert link.status_code == 200, link.text
    clean("card link", link.text)


PUBLIC_BUILDERS = (
    "routers/share_cards.py", "routers/sitter_passes.py", "routers/care_sheets.py",
    "routers/keepers.py", "routers/transfers.py", "routers/qr.py",
    "services/share_card.py", "services/sitter_card.py",
)


@pytest.mark.parametrize("rel", PUBLIC_BUILDERS)
def test_public_builders_never_read_episodes(rel):
    from pathlib import Path
    src = (Path(__file__).resolve().parents[1] / "app" / rel).read_text(encoding="utf-8")
    assert "premolt_episode" not in src.lower() and "PremoltEpisode" not in src
