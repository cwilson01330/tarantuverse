"""report_premolt_accuracy.py: episode accuracy + fasting replay on a fixture, read-only."""
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

import report_premolt_accuracy as rpt
from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.molt_log import MoltLog
from app.models.premolt_episode import PremoltEpisode
from app.models.user import User

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
SINCE = date(2026, 9, 1)


def D(m, d):
    return date(2026, m, d)


def at(day):
    return datetime(day.year, day.month, day.day, 12, 0, tzinfo=timezone.utc)


def mk_user(db, tag, *, email=None, active=True):
    u = User(
        id=uuid.uuid4(), email=email or f"{tag}-{uuid.uuid4().hex[:6]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:6]}", hashed_password="x", is_active=active, is_verified=True,
    )
    db.add(u)
    db.flush()
    return u


def animal(db, user, taxon="tarantula", stage="adult", **kw):
    a = Invert(id=uuid.uuid4(), user_id=user.id, taxon=taxon, name="A", life_stage=stage, **kw)
    db.add(a)
    db.flush()
    return a


def meal(db, inv, day, accepted=True):
    db.add(FeedingLog(id=uuid.uuid4(), invert_id=inv.id, fed_at=at(day), accepted=accepted,
                      created_at=at(day)))


def molt(db, inv, day, ultimate=False):
    db.add(MoltLog(id=uuid.uuid4(), invert_id=inv.id, molted_at=at(day), is_ultimate=ultimate))


def episode(db, user, inv, opened, branch="fasting", rule="2026-11-v2", closed=None, reason=None,
            answer=None, source=None):
    db.add(PremoltEpisode(
        id=uuid.uuid4(), invert_id=inv.id, user_id=user.id, opened_on=opened, closed_on=closed,
        close_reason=reason, branch=branch, signals={}, rule_version=rule,
        keeper_answer=answer, answer_source=source,
    ))


def five_day_meals(db, inv):
    for d in (D(9, 1), D(9, 6), D(9, 11), D(9, 16), D(9, 21)):
        meal(db, inv, d)


@pytest.fixture()
def world(db_session):
    db = db_session
    k = mk_user(db, "k")
    merged = mk_user(db, "m", email="gone@merged.invalid")
    inactive = mk_user(db, "i", active=False)

    # Heartbeat: a millipede (no cadence, never replayed) fed every 3 days keeps
    # the "keeper still logging" guard true all autumn.
    h = animal(db, k, "millipede", "adult")
    d = D(8, 20)
    while d <= D(11, 19):
        meal(db, h, d)
        d += timedelta(days=3)

    # Episode animals (no meals logged).
    a1 = animal(db, k)
    a2 = animal(db, k)
    a3 = animal(db, k)
    a4 = animal(db, k, "true_spider", "juvenile")
    a5 = animal(db, k, "mantis", "juvenile")
    a6 = animal(db, k)
    molt(db, a1, D(8, 10))   # before the window: not counted
    molt(db, a1, D(10, 5))
    molt(db, a2, D(11, 5))
    molt(db, a4, D(10, 30))
    molt(db, a6, D(10, 20))  # no episode: a miss
    episode(db, k, a1, D(8, 1), closed=D(8, 10), reason="molted")  # before --since
    episode(db, k, a1, D(9, 20), closed=D(10, 5), reason="molted", answer="yes", source="card")
    episode(db, k, a2, D(9, 25), branch="refusals", closed=D(9, 27), reason="keeper_not_yet",
            answer="not_yet", source="card")
    episode(db, k, a3, D(9, 30), closed=D(10, 3), reason="ate")
    episode(db, k, a4, D(10, 2), rule="2026-10-v1", closed=D(10, 4), reason="cleared",
            answer="yes", source="pause")
    episode(db, k, a5, D(11, 10))  # open, too young to judge

    # Replay animals.
    r1 = animal(db, k)           # fasts 9-21 -> molts 10-10, then eats every 5 days
    five_day_meals(db, r1)
    molt(db, r1, D(10, 10))
    for d in (D(10, 26), D(10, 31), D(11, 5), D(11, 10), D(11, 15), D(11, 20)):
        meal(db, r1, d)
    r2 = animal(db, k)           # fasts 9-21 -> 11-01 with no molt: a false alarm
    five_day_meals(db, r2)
    for d in (D(11, 1), D(11, 6), D(11, 11), D(11, 16)):
        meal(db, r2, d)
    # Never replayed: matured (adult true spider) and dead animals.
    r3 = animal(db, k, "true_spider", "adult")
    five_day_meals(db, r3)
    meal(db, r3, D(11, 1))
    dead = animal(db, k, died_at=at(D(10, 20)))
    five_day_meals(db, dead)
    meal(db, dead, D(11, 1))

    # Excluded accounts: same shapes, must change nothing.
    for u in (merged, inactive):
        x = animal(db, u)
        five_day_meals(db, x)
        meal(db, x, D(11, 1))
        molt(db, x, D(10, 10))
        episode(db, u, x, D(10, 1), closed=D(10, 10), reason="molted", answer="yes", source="card")
    db.commit()
    return db


def rows(world):
    return dict(rpt.build_rows(world, since=SINCE, now=NOW))


def test_episode_counts_and_answers(world):
    r = rows(world)
    assert r["episodes_opened"] == "5"
    assert r["close_molted"] == "1"
    assert r["close_keeper_not_yet"] == "1"
    assert r["close_ate"] == "1"
    assert r["close_cleared"] == "1"
    assert r["close_stale"] == "0"
    assert r["close_animal_closed"] == "0"
    assert r["close_open"] == "1"
    assert (r["answer_yes"], r["answer_not_yet"], r["answer_none"]) == ("2", "1", "2")
    assert r["answer_yes_card"] == "1"
    assert r["answer_yes_pause"] == "1"
    assert r["answer_not_yet_card"] == "1"


def test_hit_rate_overall_and_groups(world):
    r = rows(world)
    assert r["episodes_pending"] == "1"
    assert r["hit_rate_overall"] == "3 of 4 (75.0%)"
    assert r["confirmed_hit_overall"] == "2 of 2 (100.0%)"
    assert r["hit_rate_taxon_tarantula"] == "2 of 3 (66.7%)"
    assert r["hit_rate_taxon_true_spider"] == "1 of 1 (100.0%)"
    assert r["hit_rate_taxon_mantis"] == "0 of 0"
    assert r["hit_rate_branch_fasting"] == "2 of 3 (66.7%)"
    assert r["hit_rate_branch_refusals"] == "1 of 1 (100.0%)"
    assert r["hit_rate_rule_2026-11-v2"] == "2 of 3 (66.7%)"
    assert r["hit_rate_rule_2026-10-v1"] == "1 of 1 (100.0%)"
    assert r["confirmed_hit_taxon_tarantula"] == "1 of 1 (100.0%)"


def test_lead_time(world):
    r = rows(world)
    assert r["lead_time_median_days"] == "28"
    assert r["lead_time_iqr_days"] == "21.5 to 34.5"


def test_misses_by_taxon(world):
    r = rows(world)
    # Window molts: a1 10-05, a2 11-05, a6 10-20, r1 10-10 (tarantula); a4 10-30 (true spider).
    assert r["misses_total"] == "2 of 5 (40.0%)"
    assert r["misses_taxon_tarantula"] == "2 of 4 (50.0%)"
    assert r["misses_taxon_true_spider"] == "0 of 1 (0.0%)"


def test_replay_default_thresholds(world):
    r = rows(world)
    # r1 fires 10-05 and molts 10-10 (hit); r2 fires 10-05 and never molts (false alarm);
    # the four episode-animal molts (no meals logged) are misses.
    assert r["fasting m=2.5 min=14"] == "1 hits / 1 false alarms / 4 misses (0 pending)"
    # Nothing fires before day 21 for r1, so its molt becomes a miss; r2's fire
    # on 10-12 is only 39 days old.
    assert r["fasting m=3.0 min=21"] == "0 hits / 0 false alarms / 5 misses (1 pending)"


def test_replay_has_one_row_per_combination(world):
    r = rows(world)
    combos = [k for k in r if k.startswith("fasting m=")]
    assert len(combos) == 9
    assert "fasting m=2.0 min=10" in r and "fasting m=3.0 min=14" in r


def test_replay_skips_silent_keepers(db_session):
    db = db_session
    k = mk_user(db, "quiet")
    r1 = animal(db, k)
    five_day_meals(db, r1)
    molt(db, r1, D(10, 10))
    db.commit()
    r = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    # No feeding was logged on any animal in the 7 days before the 10-05 fire, so
    # production would not have fired.
    assert r["fasting m=2.5 min=14"].startswith("0 hits / 0 false alarms / 1 misses")


def test_main_prints_csv(monkeypatch, capsys, world):
    class Sess:
        def __init__(self):
            self.log = []

        def execute(self, stmt):
            self.log.append(str(stmt))

        def rollback(self):
            self.log.append("rollback")

        def close(self):
            self.log.append("close")

    sess = Sess()
    import app.database as database
    monkeypatch.setattr(database, "SessionLocal", lambda: sess)
    monkeypatch.setattr(rpt, "build_rows", lambda db, since, now=None: [("a", "1")])
    assert rpt.main(["--csv", "--since", "2026-10-01"]) == 0
    assert 'a,"1"' in capsys.readouterr().out
    assert sess.log[0] == "SET TRANSACTION READ ONLY"
    assert sess.log[-2:] == ["rollback", "close"]


def test_report_is_read_only():
    src = inspect.getsource(rpt.main)
    assert "SET TRANSACTION READ ONLY" in src
    assert src.index("SET TRANSACTION READ ONLY") < src.index("build_rows")
    assert "commit(" not in inspect.getsource(rpt)


# ── Fix round 1 ──────────────────────────────────────────────────────────────

def heartbeat(db, user, start=D(8, 20), end=D(11, 19)):
    """A millipede fed every 3 days: keeps the still-logging guard true."""
    h = animal(db, user, "millipede", "adult")
    d = start
    while d <= end:
        meal(db, h, d)
        d += timedelta(days=3)


def meals_every_5(db, inv, start, end):
    d = start
    while d <= end:
        meal(db, inv, d)
        d += timedelta(days=5)


def gated_animal(db, k):
    """Adult tarantula, molts 2/1, 6/1, 10/1 (average 121 days: the gate opens
    at 25% = 30.25 days, i.e. 11/1). Last meal 10/15, usual gap 5, so the
    threshold (14 days) is reached 10/29, before the gate opens."""
    a = animal(db, k)
    meals_every_5(db, a, D(9, 5), D(10, 15))
    for m in (D(2, 1), D(6, 1), D(10, 1)):
        molt(db, a, m)
    return a


def test_replay_waits_for_post_molt_gate(db_session):
    db = db_session
    k = mk_user(db, "gate")
    heartbeat(db, k)
    gated_animal(db, k)
    db.commit()
    # since 10/30 excludes a 10/29 fire; the gated fire lands 11/1 (pending).
    r = dict(rpt.build_rows(db, since=D(10, 30), now=NOW))
    assert r["fasting m=2.5 min=14"] == "0 hits / 0 false alarms / 0 misses (1 pending)"


def test_replay_gate_fire_day_is_first_open_day(db_session):
    db = db_session
    k = mk_user(db, "gate2")
    heartbeat(db, k)
    a = gated_animal(db, k)
    db.commit()
    logged = sorted({D(9, 5) + timedelta(days=i) for i in range(0, 200)})
    molts = [D(2, 1), D(6, 1), D(10, 1)]
    fire = rpt._fire_day(D(10, 15), None, False, 5.0, 2.5, 14, logged, molts, D(11, 20))
    assert fire == D(11, 1)  # threshold day was 10/29; 25% of 121 days = 11/1
    assert not rpt._gate_open(molts, D(10, 31))
    assert rpt._gate_open(molts, D(11, 1))


def test_replay_no_fire_when_stretch_ends_before_gate_opens(db_session):
    db = db_session
    k = mk_user(db, "gate3")
    heartbeat(db, k)
    a = gated_animal(db, k)
    meals_every_5(db, a, D(10, 31), D(11, 19))  # eats again before the gate opens
    db.commit()
    r = dict(rpt.build_rows(db, since=D(10, 30), now=NOW))
    assert r["fasting m=2.5 min=14"] == "0 hits / 0 false alarms / 0 misses (0 pending)"


def test_episode_hit_window_boundary(db_session):
    db = db_session
    k = mk_user(db, "edge")
    a45, a46 = animal(db, k), animal(db, k)
    opened = D(9, 1)
    molt(db, a45, opened + timedelta(days=45))
    molt(db, a46, opened + timedelta(days=46))
    episode(db, k, a45, opened, closed=opened + timedelta(days=45), reason="molted")
    episode(db, k, a46, opened, closed=opened + timedelta(days=46), reason="molted")
    db.commit()
    r = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    assert r["hit_rate_overall"] == "1 of 2 (50.0%)"
    assert r["lead_time_median_days"] == "45"


def test_replay_molt_on_fire_day_is_a_hit(db_session):
    db = db_session
    k = mk_user(db, "fireday")
    heartbeat(db, k)
    a = animal(db, k)
    meals_every_5(db, a, D(9, 1), D(9, 21))  # usual gap 5 -> fires 9/21 + 14 = 10/5
    molt(db, a, D(10, 5))
    db.commit()
    r = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    # The later fire (10/19 + 14, no molt yet) is pending; the 10/5 one is the hit.
    assert r["fasting m=2.5 min=14"] == "1 hits / 0 false alarms / 0 misses (1 pending)"


def test_animal_closed_without_molt_is_excluded_from_hit_rate(db_session):
    db = db_session
    k = mk_user(db, "closed")
    a, b, c = animal(db, k), animal(db, k), animal(db, k)
    molt(db, b, D(9, 10))
    episode(db, k, a, D(9, 1), closed=D(9, 5), reason="animal_closed")
    episode(db, k, b, D(9, 1), closed=D(9, 10), reason="animal_closed")  # molted first: still a hit
    episode(db, k, c, D(9, 1), closed=D(10, 20), reason="cleared")        # resolved, no molt
    db.commit()
    r = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    assert r["episodes_opened"] == "3"
    assert r["episodes_animal_closed_no_molt"] == "1"
    assert r["hit_rate_overall"] == "1 of 2 (50.0%)"
    assert r["episodes_pending"] == "0"


def test_main_rolls_back_and_closes_when_build_rows_raises(monkeypatch):
    class Sess:
        def __init__(self):
            self.log = []

        def execute(self, stmt):
            self.log.append(str(stmt))

        def rollback(self):
            self.log.append("rollback")

        def close(self):
            self.log.append("close")

    sess = Sess()
    import app.database as database
    monkeypatch.setattr(database, "SessionLocal", lambda: sess)

    def boom(db, since, now=None):
        raise RuntimeError("boom")

    monkeypatch.setattr(rpt, "build_rows", boom)
    with pytest.raises(RuntimeError):
        rpt.main(["--since", "2026-10-01"])
    assert sess.log[0] == "SET TRANSACTION READ ONLY"
    assert sess.log[-2:] == ["rollback", "close"]


def test_cloudtestlab_accounts_are_excluded(db_session):
    db = db_session
    k = mk_user(db, "real")
    heartbeat(db, k)
    a = animal(db, k)
    meals_every_5(db, a, D(9, 1), D(9, 21))
    molt(db, a, D(10, 10))
    db.commit()
    before = dict(rpt.build_rows(db, since=SINCE, now=NOW))

    robot = mk_user(db, "robot", email=f"r{uuid.uuid4().hex[:6]}@cloudtestlabaccounts.com")
    heartbeat(db, robot)
    x = animal(db, robot)
    meals_every_5(db, x, D(9, 1), D(9, 21))
    molt(db, x, D(10, 10))
    molt(db, x, D(10, 20))
    episode(db, robot, x, D(9, 25), closed=D(10, 10), reason="molted", answer="yes", source="card")
    db.commit()
    assert dict(rpt.build_rows(db, since=SINCE, now=NOW)) == before


# ── Final-review fix wave: adult males and the 120-day cap ──────────────────

def test_replay_skips_adult_male_tarantulas(db_session):
    from app.models.tarantula import Sex

    db = db_session
    k = mk_user(db, "males")
    heartbeat(db, k)
    female = animal(db, k, sex=Sex.FEMALE)
    meals_every_5(db, female, D(9, 1), D(9, 21))
    molt(db, female, D(10, 10))
    db.commit()
    before = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    # Fires 10-05, molts 10-10 (hit); the post-molt stretch fires 11-07 (pending).
    assert before["fasting m=2.5 min=14"] == "1 hits / 0 false alarms / 0 misses (1 pending)"

    # Same shape on an adult male: matured, never replayed (its molt still
    # counts in misses_total, which covers every animal with a cadence).
    male = animal(db, k, sex=Sex.MALE)
    meals_every_5(db, male, D(9, 1), D(9, 21))
    db.commit()
    after = dict(rpt.build_rows(db, since=SINCE, now=NOW))
    assert after["fasting m=2.5 min=14"] == before["fasting m=2.5 min=14"]


def test_replay_fire_day_respects_the_120_day_cap():
    logged = [D(1, 1) + timedelta(days=i) for i in range(0, 330)]
    start = D(2, 1)
    # Threshold exactly 120 days (2.5 x 48): fires on day 120.
    assert rpt._fire_day(start, None, False, 48.0, 2.5, 14, logged, [], D(11, 20)) == start + timedelta(days=120)
    # Threshold 121 days (ceil(2.5 x 48.4)): past the cap, never fires.
    assert rpt._fire_day(start, None, False, 48.4, 2.5, 14, logged, [], D(11, 20)) is None
    # Gate shut past day 120: the cap stops the search instead of firing late.
    # Molts 1000, 500 and 1 day before the stretch: average interval 499.5,
    # the gate opens at 25% (125 days after the newest molt = day 124 of the
    # stretch); the threshold (2.5 x 40 = 100) is reached earlier.
    molts = [start - timedelta(days=n) for n in (1000, 500, 1)]
    assert rpt._fire_day(start, None, False, 40.0, 2.5, 14, logged, molts, D(11, 20)) is None
    # A gate that opens by day 120 still fires (molts 800, 400, 1: avg 399.5,
    # gate at 99.9 days -> day 99; threshold 100 -> fires on day 100).
    molts = [start - timedelta(days=n) for n in (800, 400, 1)]
    assert rpt._fire_day(start, None, False, 40.0, 2.5, 14, logged, molts, D(11, 20)) == start + timedelta(days=100)
