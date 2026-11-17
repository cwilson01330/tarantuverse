"""READ-ONLY report (2026-11-17, Premolt v2): how often were premolt alerts
right, and which fasting thresholds would have done best?

Real accounts only (active, not a Google Play robot account via
`real_user_clause`, not a retired `@merged.invalid` duplicate).

EPISODES (opened on or after --since, from `premolt_episodes`)
  episodes_opened, close_<reason>, close_open     how they ended
  answer_yes / answer_not_yet / answer_none       keeper answers, and
  answer_<answer>_<card|pause>                    where each came from
  hit_rate_<group>        episodes followed by a logged molt within
                          HIT_WINDOW_DAYS (45) of `opened_on`, as n of d.
                          d counts only RESOLVED episodes: a hit, or one whose
                          45 days are over. Younger ones are `episodes_pending`.
  confirmed_hit_<group>   the same, among episodes the keeper answered "yes"
  groups: overall, taxon_*, branch_*, rule_* (rule_version)
  lead_time_*             days from `opened_on` to the molt, hits only
                          (median, and first to third quartile)
  episodes_animal_closed_no_molt
                          episodes closed `animal_closed` with no molt: the
                          animal died or left, so the alert can't be judged.
                          Excluded from every hit rate and from pending.
  misses_*                molts logged in the window on animals that could have
                          had an episode, with none opened in the 45 days
                          before the molt (total and by taxon). POPULATION
                          NOTE: `misses_total` counts every real-user animal
                          with a feeding cadence, dead or matured included;
                          the replay's misses (below) count only active,
                          not-matured animals. They are different populations
                          and are not meant to match.

THRESHOLD REPLAY ("suggested thresholds", needs no episodes)
For every active, eligible, not-matured animal the fasting clock is replayed
over its whole history with the production rules: the clock starts at the later
of the last accepted meal and the newest molt plus its post-molt window; the
usual gap is `premolt_service._usual_gap_with_fallback` as of the stretch's
start; a keeper must have logged a feeding (by `created_at`) in the 7 days
before. Production's post-molt gate is applied on every candidate day: with
the molts dated before that day (>= 3 for an average interval) the days since
the newest molt and the progress through the average interval go to
`premolt_service.evaluate_premolt(..., fasting=True)`, which must answer
branch "fasting" — so a day production would label "overdue" (>110% of the
average interval, >30 days since the molt) never fires in this replay, which
measures the fasting thresholds only. No stretch fires past FAST_MAX_DAYS
(120) days fasting, and adult male tarantulas are matured (not replayed).
Feeding pauses aren't replayed (only the current pause is stored). If the gate is shut on the first threshold day the fire
moves to the first later day of the same stretch where threshold, guard and
gate all hold (or never). A stretch ended by a molt may still fire on that
molt's day (the alert comes before the molt is logged; hit window inclusive).
For each FAST_MULTIPLIER (2.0 / 2.5 / 3.0) x FAST_MIN_DAYS (10 / 14 /
21) a stretch "fires" on start + max(multiplier x usual gap, min days) if the
animal is still unfed (and no molt) that day.
  hit          a fire in the window followed by a molt within 45 days
  false alarm  a fire in the window, 45 days passed, no molt
  miss         a molt in the window with no fire in the 45 days before it
  pending      a fire in the window, no molt yet, 45 days not over (counted
               in neither hits nor false alarms)
Shown as `fasting m=2.5 min=14`. It changes nothing.

Run on the Render shell, from apps/api:
    python3 report_premolt_accuracy.py --since 2026-12-01
    python3 report_premolt_accuracy.py --csv        # last 30 days, for a sheet
"""
import argparse
import math
import statistics
import sys
from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, or_, text

MULTIPLIERS = (2.0, 2.5, 3.0)
MIN_DAYS = (10, 14, 21)
DEFAULT_SINCE_DAYS = 30


def _share(n: int, d: int) -> str:
    return f"{n} of {d} ({100 * n / d:.1f}%)" if d else "0 of 0"


def _num(v: float) -> str:
    return f"{v:g}"


def _utc_date(moment: datetime) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).date()


# ── Replay ───────────────────────────────────────────────────────────────────

def _stretches(inv, species, meals: List[date], molts: List[Tuple[date, int]]):
    """Fasting stretches for one animal: [(start, end_or_None, end_is_meal, usual_gap)].

    One stretch begins at every event day (a meal or a molt) that has a meal on
    or before it. `start` is the production clock: the later of that last meal
    and the newest molt on or before the day plus its post-molt window. `end` is
    the next event day (a meal or a molt resets the clock); None = still
    running today. A stretch whose window ends at or after `end` can't fire.
    """
    from app.services.premolt_service import _usual_gap_with_fallback

    meal_set = set(meals)
    events = sorted(meal_set | {m for m, _ in molts})
    out = []
    for i, e in enumerate(events):
        last_meal = max((m for m in meals if m <= e), default=None)
        if last_meal is None:
            continue
        start = last_meal
        prior = [(m, w) for m, w in molts if m <= e]
        if prior:
            m, w = max(prior)
            start = max(start, m + timedelta(days=w))
        end = events[i + 1] if i + 1 < len(events) else None
        if end is not None and start >= end:
            continue
        end_is_meal = end is not None and end in meal_set
        gap, _ = _usual_gap_with_fallback(inv, species, [m for m in meals if m <= e], e)
        if gap is None:
            continue
        out.append((start, end, end_is_meal, gap))
    return out


def _gate_open(molt_days: List[date], d: date) -> bool:
    """Production's post-molt gate on day `d`: the molts dated before `d` give
    days since the newest and the average interval (>= 3 molts, as in
    `_build_prediction`); `evaluate_premolt` must say branch "fasting"."""
    from app.services.premolt_service import evaluate_premolt

    prior = [m for m in molt_days if m < d]
    days = (d - prior[-1]).days if prior else None
    progress = None
    if len(prior) >= 3:
        intervals = [(b - a).days for a, b in zip(prior, prior[1:]) if (b - a).days > 0]
        if intervals and days is not None:
            progress = days / (sum(intervals) / len(intervals)) * 100
    return evaluate_premolt(
        recent_refusal_streak=0, molt_interval_progress=progress,
        days_since_last_molt=days, has_ultimate_molt=False, fasting=True,
    )[1] == "fasting"


def _fire_day(start, end, end_is_meal, gap, mult, min_days, logged, molt_days, today) -> Optional[date]:
    """First day the fasting rule fires for a stretch: the threshold is reached
    (and the stretch is not past FAST_MAX_DAYS, via
    `premolt_service.fasting_fires`), a feeding was created in the 7 days up to
    that day (still-logging guard) and the post-molt gate is open. None if the
    stretch ends (or today comes, or the cap passes) first."""
    from app.services.premolt_service import STILL_LOGGING_DAYS, fasting_fires

    d = start + timedelta(days=math.ceil(max(mult * gap, min_days)))
    last = today
    if end is not None:
        last = min(last, end - timedelta(days=1) if end_is_meal else end)
    while d <= last:
        # Production's rule with this combination's thresholds, incl. the
        # FAST_MAX_DAYS cap: days only grow, so past the cap it never fires.
        if not fasting_fires((d - start).days, gap, multiplier=mult, min_days=min_days):
            return None
        i = bisect_left(logged, d - timedelta(days=STILL_LOGGING_DAYS))
        if i >= len(logged):
            return None
        if logged[i] > d:
            d = logged[i]
            continue
        if _gate_open(molt_days, d):
            return d
        d += timedelta(days=1)
    return None


def _replay_rows(animals, since: date, today_of) -> List[Tuple[str, str]]:
    """animals: [(inv, species, meals, molts[(date, window)], owner_logged[date])]."""
    from app.services.premolt_service import HIT_WINDOW_DAYS

    prepared = []
    for inv, species, meals, molts, logged in animals:
        today = today_of(inv.user_id)
        prepared.append((today, _stretches(inv, species, meals, molts), sorted(m for m, _ in molts), logged))

    rows = []
    for mult in MULTIPLIERS:
        for mn in MIN_DAYS:
            hits = false_alarms = misses = pending = 0
            for today, stretches, molt_days, logged in prepared:
                fires = []
                for start, end, end_is_meal, gap in stretches:
                    d = _fire_day(start, end, end_is_meal, gap, mult, mn, logged, molt_days, today)
                    if d is not None:
                        fires.append(d)
                for d in fires:
                    if not since <= d <= today:
                        continue
                    if any(d <= m <= d + timedelta(days=HIT_WINDOW_DAYS) for m in molt_days):
                        hits += 1
                    elif d + timedelta(days=HIT_WINDOW_DAYS) > today:
                        pending += 1
                    else:
                        false_alarms += 1
                for m in molt_days:
                    if since <= m <= today and not any(
                        timedelta(0) <= m - d <= timedelta(days=HIT_WINDOW_DAYS) for d in fires
                    ):
                        misses += 1
            rows.append((
                f"fasting m={mult:.1f} min={mn}",
                f"{hits} hits / {false_alarms} false alarms / {misses} misses ({pending} pending)",
            ))
    return rows


# ── Report ───────────────────────────────────────────────────────────────────

def build_rows(db, *, since: date, now: Optional[datetime] = None) -> List[Tuple[str, str]]:
    from app.models.feeding_log import FeedingLog
    from app.models.invert import Invert
    from app.models.invert_species import InvertSpecies
    from app.models.molt_log import MoltLog
    from app.models.notification_preferences import NotificationPreferences as NP
    from app.models.premolt_episode import CLOSE_REASONS, PremoltEpisode
    from app.models.user import User
    from app.services.feeding_status import _local_date
    from app.services.premolt_service import (
        HIT_WINDOW_DAYS, RULE_VERSION, _post_molt_window_days, is_matured,
    )
    from app.utils.feeding_mode import has_feeding_cadence
    from app.utils.test_accounts import real_user_clause

    now = now or datetime.now(timezone.utc)
    window = timedelta(days=HIT_WINDOW_DAYS)

    real_ids = {
        uid for (uid,) in db.query(User.id).filter(
            User.is_active.is_(True),
            real_user_clause(),
            ~func.lower(User.email).like("%@merged.invalid"),
        )
    }
    tz_by_user = {
        uid: tz for uid, tz in db.query(NP.user_id, NP.tz_offset_minutes).filter(NP.user_id.in_(real_ids))
    } if real_ids else {}

    def today_of(uid) -> date:
        return _local_date(now, tz_by_user.get(uid))

    inverts = db.query(Invert).filter(Invert.user_id.in_(real_ids)).all() if real_ids else []
    by_id = {i.id: i for i in inverts}
    species_ids = {i.species_id for i in inverts if i.species_id}
    species_by_id = {
        s.id: s for s in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids))
    } if species_ids else {}

    # One query per table; either parent column, like utils/legacy_logs.
    ids = list(by_id)
    molt_rows: Dict = defaultdict(list)  # invert id -> [(local date, is_ultimate, pause_days)]
    meal_days: Dict = defaultdict(set)
    logged_by_owner: Dict = defaultdict(set)
    if ids:
        for iid, tid, molted_at, ult, pause in db.query(
            MoltLog.invert_id, MoltLog.tarantula_id, MoltLog.molted_at,
            MoltLog.is_ultimate, MoltLog.feeding_pause_days,
        ).filter(or_(MoltLog.invert_id.in_(ids), MoltLog.tarantula_id.in_(ids))):
            key = iid if iid in by_id else tid
            if key in by_id:
                molt_rows[key].append((_local_date(molted_at, tz_by_user.get(by_id[key].user_id)), bool(ult), pause))
        for iid, tid, fed_at, accepted, created_at in db.query(
            FeedingLog.invert_id, FeedingLog.tarantula_id, FeedingLog.fed_at,
            FeedingLog.accepted, FeedingLog.created_at,
        ).filter(or_(FeedingLog.invert_id.in_(ids), FeedingLog.tarantula_id.in_(ids))):
            key = iid if iid in by_id else tid
            if key not in by_id:
                continue
            owner = by_id[key].user_id
            logged_by_owner[owner].add(_utc_date(created_at))
            if accepted is True:
                meal_days[key].add(_local_date(fed_at, tz_by_user.get(owner)))

    # ── Episodes ──
    episodes = (
        db.query(PremoltEpisode)
        .filter(PremoltEpisode.user_id.in_(real_ids), PremoltEpisode.opened_on >= since - window)
        .all()
    ) if real_ids else []
    in_window = [e for e in episodes if e.opened_on >= since and e.invert_id in by_id]
    opened_by_invert: Dict = defaultdict(list)
    for e in episodes:
        opened_by_invert[e.invert_id].append(e.opened_on)

    rows: List[Tuple[str, str]] = [("since", since.isoformat()), ("rule_version_now", RULE_VERSION)]
    rows.append(("episodes_opened", str(len(in_window))))
    for reason in CLOSE_REASONS:
        rows.append((f"close_{reason}", str(sum(1 for e in in_window if e.close_reason == reason))))
    rows.append(("close_open", str(sum(1 for e in in_window if e.closed_on is None))))
    for ans in ("yes", "not_yet"):
        rows.append((f"answer_{ans}", str(sum(1 for e in in_window if e.keeper_answer == ans))))
    rows.append(("answer_none", str(sum(1 for e in in_window if e.keeper_answer is None))))
    for ans in ("yes", "not_yet"):
        for src in ("card", "pause"):
            rows.append((
                f"answer_{ans}_{src}",
                str(sum(1 for e in in_window if e.keeper_answer == ans and e.answer_source == src)),
            ))

    def first_molt_after(e) -> Optional[date]:
        days = sorted(d for d, _, _ in molt_rows.get(e.invert_id, []) if d >= e.opened_on)
        return days[0] if days else None

    judged = []  # (episode, molt day or None, resolved?)
    closed_no_molt = 0
    for e in in_window:
        m = first_molt_after(e)
        hit = m is not None and (m - e.opened_on) <= window
        if not hit and e.close_reason == "animal_closed":
            closed_no_molt += 1  # can't be judged: not a miss, not a pending
            continue
        resolved = hit or e.opened_on + window <= today_of(e.user_id)
        judged.append((e, m if hit else None, resolved))
    rows.append(("episodes_pending", str(sum(1 for _, _, r in judged if not r))))
    rows.append(("episodes_animal_closed_no_molt", str(closed_no_molt)))

    def rate(label: str, pick) -> None:
        group = [(e, m) for e, m, r in judged if r and pick(e)]
        hits = [x for x in group if x[1] is not None]
        conf = [x for x in group if x[0].keeper_answer == "yes"]
        rows.append((f"hit_rate_{label}", _share(len(hits), len(group))))
        rows.append((f"confirmed_hit_{label}", _share(sum(1 for x in conf if x[1] is not None), len(conf))))

    rate("overall", lambda e: True)
    for tx in sorted({by_id[e.invert_id].taxon for e in in_window}):
        rate(f"taxon_{tx}", lambda e, tx=tx: by_id[e.invert_id].taxon == tx)
    for br in sorted({e.branch for e in in_window}):
        rate(f"branch_{br}", lambda e, br=br: e.branch == br)
    for rv in sorted({e.rule_version for e in in_window}):
        rate(f"rule_{rv}", lambda e, rv=rv: e.rule_version == rv)

    leads = sorted((m - e.opened_on).days for e, m, _ in judged if m is not None)
    if leads:
        rows.append(("lead_time_median_days", _num(statistics.median(leads))))
        if len(leads) >= 2:
            q1, _, q3 = statistics.quantiles(leads, n=4, method="inclusive")
            rows.append(("lead_time_iqr_days", f"{_num(q1)} to {_num(q3)}"))
        else:
            rows.append(("lead_time_iqr_days", "-"))
    else:
        rows.append(("lead_time_median_days", "-"))
        rows.append(("lead_time_iqr_days", "-"))

    # ── Misses: window molts on animals that could have had an episode ──
    molts_by_taxon: Dict[str, int] = defaultdict(int)
    misses_by_taxon: Dict[str, int] = defaultdict(int)
    for iid, entries in molt_rows.items():
        inv = by_id[iid]
        if not has_feeding_cadence(inv.taxon, species_by_id.get(inv.species_id)):
            continue
        today = today_of(inv.user_id)
        for d, _, _ in entries:
            if not since <= d <= today:
                continue
            molts_by_taxon[inv.taxon] += 1
            if not any(timedelta(0) <= d - o <= window for o in opened_by_invert.get(iid, [])):
                misses_by_taxon[inv.taxon] += 1
    rows.append((
        "misses_total",
        _share(sum(misses_by_taxon.values()), sum(molts_by_taxon.values())),
    ))
    for tx in sorted(molts_by_taxon):
        rows.append((f"misses_taxon_{tx}", _share(misses_by_taxon[tx], molts_by_taxon[tx])))

    # ── Threshold replay ──
    animals = []
    for inv in inverts:
        if inv.died_at is not None or inv.transferred_out_at is not None:
            continue
        species = species_by_id.get(inv.species_id) if inv.species_id else None
        if not has_feeding_cadence(inv.taxon, species):
            continue
        entries = molt_rows.get(inv.id, [])
        if is_matured(inv.taxon, inv.life_stage, any(u for _, u, _ in entries), inv.sex):
            continue
        molts = [(d, _post_molt_window_days(inv, pause)) for d, _, pause in entries]
        animals.append((
            inv, species, sorted(meal_days.get(inv.id, ())), molts,
            sorted(logged_by_owner.get(inv.user_id, ())),
        ))
    rows.extend(_replay_rows(animals, since, today_of))
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only premolt accuracy report.")
    parser.add_argument("--since", help="YYYY-MM-DD (default: 30 days ago, UTC)")
    parser.add_argument("--csv", action="store_true", help="comma-separated output")
    args = parser.parse_args(argv)
    since = (
        date.fromisoformat(args.since) if args.since
        else datetime.now(timezone.utc).date() - timedelta(days=DEFAULT_SINCE_DAYS)
    )

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Must be the first statement of the transaction.
        db.execute(text("SET TRANSACTION READ ONLY"))
        rows = build_rows(db, since=since)
    finally:
        db.rollback()
        db.close()

    if args.csv:
        print("metric,value")
        for k, v in rows:
            print(f'{k},"{v}"')
    else:
        w = max(len(k) for k, _ in rows)
        for k, v in rows:
            print(f"{k.ljust(w)}  {v}")
        print("\nReplay only suggests: change FAST_MULTIPLIER / FAST_MIN_DAYS (and bump RULE_VERSION) by hand.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
