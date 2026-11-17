"""
Premolt prediction service — every predator taxon (premolt v2, 2026-11-17).

Analyzes feeding logs, molt history, and timing to predict when an animal may
be entering premolt. Spec: docs/superpowers/specs/2026-11-17-premolt-v2-design.md §4.

The prediction is built on the unified `Invert` row (shared primary key with
the legacy `tarantulas` row, so tarantula ids keep working) and reads logs by
either parent column (`utils/legacy_logs.tarantula_logs`).

ELIGIBLE ANIMALS
----------------
Active (no `died_at`, no `transferred_out_at`), a feeding cadence
(`utils/feeding_mode.has_feeding_cadence` — grazers are out), and not matured
(`is_matured` — an ultimate molt, an adult of a taxon whose adults don't
molt, or an adult male tarantula). Ineligible animals still get a prediction — with
`is_premolt_likely False`, `branch "none"` and an `ineligible_reason` — never
an error.

BRANCHES
--------
The three original branches (refusals | refusals_interval | overdue) are
checked first and are unchanged. The fasting branch (`fasting`) compares days
without an accepted meal — counted from the later of the last accepted meal and
the end of the newest molt's post-molt window — with the animal's own usual
gap; see `evaluate_premolt` and `_build_prediction`. It stays quiet past
FAST_MAX_DAYS (120) days and while the animal is feeding-paused for any reason
other than premolt (`paused_other`). Sitter cards keep the
original three branches only (`routers/sitter_passes._premolt_likely`).

DAY COUNTS
----------
"Today" and every days-since count are local calendar days on the collection
OWNER's clock (`notification_preferences.tz_offset_minutes`; no row = UTC),
the same convention as `services/feeding_status.py`.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import INVERT_TAXON_VALUES, InvertSpecies
from app.models.molt_log import MoltLog
from app.models.notification_preferences import NotificationPreferences
from app.models.premolt_episode import PremoltEpisode
from app.services.feeding_status import _local_date
from app.utils.feeding_mode import effective_feeding_mode, has_feeding_cadence
from app.utils.feeding_pause import is_feeding_paused
from app.utils.legacy_logs import tarantula_logs
from app.utils.limits import active_inverts_query
from app.utils.post_molt_pause import default_pause_days


# Post-molt fasting guard. See evaluate_premolt.
MIN_PROGRESS_FOR_REFUSAL_ONLY = 25   # percent of the animal's average interval
MIN_DAYS_FOR_REFUSAL_ONLY = 14       # absolute fallback when no average exists

# ── Premolt v2 rule constants ────────────────────────────────────────────────
# Tuned from `report_premolt_accuracy.py` (hit rate per branch and taxon).
# Change them only with that report in hand, and bump RULE_VERSION when you
# do: it is stored on every premolt episode so results can be compared rule
# by rule.
FAST_MULTIPLIER = 2.5        # fasting fires at this many usual gaps...
FAST_MIN_DAYS = 14           # ...and never before this many days
FAST_MAX_DAYS = 120          # ...and never past this many (a stale record, not a fast)
USUAL_GAP_WINDOW_DAYS = 180  # accepted meals inside this window set the usual gap
USUAL_GAP_MIN_MEALS = 4      # fewer meal days -> fall back to the feeding interval
STILL_LOGGING_DAYS = 7       # fasting needs a feeding logged on any animal this recently
SNOOZE_DAYS = 14             # "Not yet" hides the alert this long
HIT_WINDOW_DAYS = 45         # a molt within this many days of opening = a hit
STALE_YES_DAYS = 120         # a confirmed episode with no molt or meal closes as stale
RULE_VERSION = "2026-11-v2"

# Taxa whose adults keep molting. An `adult` of any other taxon (true_spider,
# mantis, scorpion, vinegaroon, ...) is matured and never flagged. `other` is
# treated as "adults may molt". The client registries mirror this list.
ADULTS_KEEP_MOLTING = ("tarantula", "centipede", "whip_spider", "other")

# Taxa that can be eligible for premolt: those whose default feeding mode is
# predator (they take prey on a cadence, so fasting means something). A linked
# species can still make one animal a grazer at runtime (`has_feeding_cadence`).
# The client `premolt` module in both registries is pinned to this tuple by
# tests/test_taxon_lists_in_sync.py.
PREMOLT_TAXA = tuple(t for t in INVERT_TAXON_VALUES if effective_feeding_mode(t) == "predator")


# ── Pure helpers ─────────────────────────────────────────────────────────────

def usual_meal_gap(accepted_meal_days: Iterable[date], today: date) -> Optional[float]:
    """Median gap in days between consecutive accepted-meal days within the
    last `USUAL_GAP_WINDOW_DAYS`. None with fewer than `USUAL_GAP_MIN_MEALS`
    meal days.

    Days, not logs: two feedings logged on one day are one meal day, so a
    keeper who logs each cricket separately doesn't get a usual gap of zero.
    Median, not mean: one long gap (a holiday, a rehouse) shouldn't move it.
    """
    start = today - timedelta(days=USUAL_GAP_WINDOW_DAYS)
    days = sorted({d for d in accepted_meal_days if d is not None and start <= d <= today})
    if len(days) < USUAL_GAP_MIN_MEALS:
        return None
    gaps = [(b - a).days for a, b in zip(days, days[1:])]
    return float(statistics.median(gaps))


def fasting_fires(
    days_fasting: Optional[int],
    usual_gap: Optional[float],
    *,
    multiplier: float = FAST_MULTIPLIER,
    min_days: float = FAST_MIN_DAYS,
) -> bool:
    """`max(multiplier * usual_gap, min_days) <= days_fasting <= FAST_MAX_DAYS`.

    The cap: past 120 days without an accepted meal the record is more likely
    stale (an animal nobody logs for any more, in a collection whose keeper
    still logs others) than a premolt fast, so the fasting branch stays quiet;
    the refusal and overdue branches can still fire. `multiplier` / `min_days`
    are for the report's threshold replay (`report_premolt_accuracy.py`); the
    cap applies to every combination.
    """
    if days_fasting is None or usual_gap is None:
        return False
    if days_fasting > FAST_MAX_DAYS:
        return False
    return days_fasting >= max(multiplier * usual_gap, min_days)


def is_matured(
    taxon: Optional[str],
    life_stage: Optional[str],
    has_ultimate_molt: bool,
    sex: Any = None,
) -> bool:
    """An ultimate molt is logged, or an adult of a taxon whose adults don't
    molt, or an adult MALE tarantula (only females keep molting; a male's
    last molt is his ultimate, logged or not). No stage set and no ultimate
    molt = not matured (we can't know).

    `sex` is the shared `Sex` enum on `Invert` (values male/female/unknown),
    a plain string, or None; compared case-insensitively by value.
    """
    if has_ultimate_molt:
        return True
    stage = (life_stage or "").strip().lower()
    if stage != "adult":
        return False
    tx = (taxon or "").strip().lower()
    if tx not in ADULTS_KEEP_MOLTING:
        return True
    sex_value = getattr(sex, "value", sex)
    return tx == "tarantula" and str(sex_value or "").strip().lower() == "male"


def evaluate_premolt(
    *,
    recent_refusal_streak: int,
    molt_interval_progress: Optional[float],
    days_since_last_molt: Optional[int],
    has_ultimate_molt: bool = False,
    fasting: bool = False,
) -> Tuple[bool, str]:
    """Decide whether an animal is likely in premolt, and which rule said so.

    Returns (likely, branch) with branch in
    `refusals | refusals_interval | overdue | fasting | none`.

    THE ULTIMATE MOLT OVERRIDES EVERYTHING (ult_20260911)
    ------------------------------------------------------
    An animal that has had its ultimate molt will not molt again — a matured
    male tarantula has hooks and emboli and is done. No combination of
    refusals or elapsed time changes that, so this returns False before any
    branch is considered.

    It matters most for branch 3, which needs no refusals at all: past 110% of
    the average interval and more than 30 days since the last molt fires on
    elapsed time alone. A matured male drifts past 110% and stays there, so
    without this gate the app declares him "likely in premolt" permanently,
    about an animal that is biologically incapable of it. Sixteen live male
    tarantulas with molt history were on that path when this was written.

    Note the refusals are still real and still meaningful — a mature male
    often stops eating — they just aren't premolt. Suppressing the verdict
    doesn't hide the refusal streak, which stays in the response.

    Pure function of already-computed signals, extracted from predict_premolt
    so it can be tested without a database. The decision was subtly wrong for
    a long time precisely because it was buried mid-function with no tests
    around it.

    Branches, in order (the first three are unchanged by premolt v2):
      1. Strong behavioural: 3+ consecutive refusals, once the animal is clear
         of the post-molt fasting window (see below).
      2. Behavioural + temporal: 2+ refusals AND past 60% of the average
         interval.
      3. Temporal only: meaningfully overdue (>110% of average, >30 days) with
         no refusals. Some adults — stockier New World females especially —
         eat straight through premolt, so a strong interval signal still
         carries information on its own.
      4. Fasting (v2): the caller has decided the animal has gone well past its
         usual gap without an accepted meal while the keeper is still logging
         (`fasting=True`). It needs the same post-molt window as branch 1: an
         animal that just molted isn't eating because its fangs are hardening.

    THE POST-MOLT GUARD (branches 1 and 4)
    --------------------------------------
    A spider that has just moulted cannot be entering premolt, however it
    behaves at the tongs. It refuses food after a moult because its fangs are
    still hardening — the same observable as premolt refusal, opposite
    meaning, and only the calendar separates the two.

    Branch 1 previously had no temporal gate at all, while 2 and 3 both did.
    So three post-molt refusals — a keeper offering food twice a week for a
    fortnight — declared premolt on an animal that had moulted days earlier.

    The gate is proportional where it can be and absolute where it can't:
      - with an average interval, require 25% of it elapsed, which scales to
        the animal (~17 days on a 68-day adult cycle, ~6 on a fast sling)
        rather than imposing one number on a group whose cycles run from
        weeks to over a year;
      - without one (fewer than 3 moults logged), fall back to 14 days;
      - with no moult history at all, don't gate — nothing contradicts the
        refusals, and a keeper whose spider is refusing deserves the warning.

    Erring toward suppression is deliberate. A false positive tells a keeper
    their freshly-moulted spider is about to moult again, which is visibly
    wrong and costs trust in every other prediction the app makes. A false
    negative merely withholds a heads-up about something the refusal log
    already shows them. The failure modes are not symmetric.
    """
    if has_ultimate_molt:
        return False, "none"

    if molt_interval_progress is not None:
        past_post_molt_window = molt_interval_progress >= MIN_PROGRESS_FOR_REFUSAL_ONLY
    elif days_since_last_molt is not None:
        past_post_molt_window = days_since_last_molt >= MIN_DAYS_FOR_REFUSAL_ONLY
    else:
        past_post_molt_window = True

    if recent_refusal_streak >= 3 and past_post_molt_window:
        return True, "refusals"
    if (recent_refusal_streak >= 2 and molt_interval_progress
            and molt_interval_progress >= 60):
        return True, "refusals_interval"
    if (molt_interval_progress and molt_interval_progress >= 110
            and days_since_last_molt is not None and days_since_last_molt > 30):
        return True, "overdue"
    if fasting and past_post_molt_window:
        return True, "fasting"
    return False, "none"


def evaluate_premolt_likely(
    *,
    recent_refusal_streak: int,
    molt_interval_progress: Optional[float],
    days_since_last_molt: Optional[int],
    has_ultimate_molt: bool = False,
) -> bool:
    """The original three-branch boolean (no fasting). See evaluate_premolt."""
    return evaluate_premolt(
        recent_refusal_streak=recent_refusal_streak,
        molt_interval_progress=molt_interval_progress,
        days_since_last_molt=days_since_last_molt,
        has_ultimate_molt=has_ultimate_molt,
        fasting=False,
    )[0]


def _whole_days(gap: float) -> int:
    """Half-up to whole days, at least 1 (4.5 -> 5; Python's round() would
    give 4)."""
    return max(1, int(math.floor(gap + 0.5)))


def _days(n: int) -> str:
    """"1 day", "14 days"."""
    return f"{n} day" if n == 1 else f"{n} days"


def premolt_reason(
    branch: str,
    *,
    days_fasting: Optional[int],
    usual_gap: Optional[float],
    recent_refusal_streak: int,
    days_since_last_molt: Optional[int],
    gap_is_observed: bool = True,
    clock_from_molt: bool = False,
) -> Optional[str]:
    """The one plain sentence the card shows under "May be in premolt".

    The fasting sentence says where the gap came from: the animal's own meals
    ("usually eats every N") only when it has enough of them; otherwise the
    feeding interval the app uses for it — claiming "usually" from two logged
    meals would be invented.

    When the fasting clock started at the newest molt's post-molt window
    rather than the last meal (`clock_from_molt`), "no accepted meal in N
    days" would contradict the last-fed date on the same screen, so the
    sentence names the molt instead: "No accepted meal since its molt N days
    ago." (N = days since that molt).
    """
    if branch == "fasting" and days_fasting is not None and usual_gap is not None:
        if clock_from_molt and days_since_last_molt is not None:
            return f"No accepted meal since its molt {_days(days_since_last_molt)} ago."
        n = _whole_days(usual_gap)
        if gap_is_observed:
            return f"No accepted meal in {_days(days_fasting)} — usually eats every {n}."
        return f"No accepted meal in {_days(days_fasting)} — its feeding interval is {_days(n)}."
    if branch in ("refusals", "refusals_interval"):
        return f"Refused the last {recent_refusal_streak} meals."
    if branch == "overdue" and days_since_last_molt is not None:
        return f"It's been {days_since_last_molt} days since the last molt — longer than usual."
    return None


# ── Context: the owner's clock and whether they're still logging ─────────────

@dataclass(frozen=True)
class _Context:
    now: datetime
    today: date
    tz: Optional[int]
    still_logging: bool


def _owner_context(db: Session, owner_id: UUID) -> _Context:
    tz = (
        db.query(NotificationPreferences.tz_offset_minutes)
        .filter(NotificationPreferences.user_id == owner_id)
        .scalar()
    )
    now = datetime.now(timezone.utc)
    # Still logging: a feeding (by anyone — owner, co-keeper, sitter) logged in
    # the last STILL_LOGGING_DAYS on any of the owner's Tarantuverse animals.
    # Without it a keeper who stopped opening the app would see every animal
    # "fasting". Herpetoverse activity doesn't count.
    recent = (
        db.query(FeedingLog.id)
        .join(Invert, Invert.id == FeedingLog.invert_id)
        .filter(
            Invert.user_id == owner_id,
            FeedingLog.created_at >= now - timedelta(days=STILL_LOGGING_DAYS),
        )
        .first()
    )
    return _Context(now=now, today=_local_date(now, tz), tz=tz, still_logging=recent is not None)


def _open_episode_answers(db: Session, ids: Sequence[UUID]) -> Dict[UUID, Optional[str]]:
    """{invert_id: keeper_answer} for every animal with an OPEN episode (the
    answer may be None)."""
    if not ids:
        return {}
    rows = (
        db.query(PremoltEpisode.invert_id, PremoltEpisode.keeper_answer)
        .filter(PremoltEpisode.invert_id.in_(list(ids)), PremoltEpisode.closed_on.is_(None))
        .all()
    )
    return {invert_id: answer for invert_id, answer in rows}


# ── The prediction ───────────────────────────────────────────────────────────

def _usual_gap_with_fallback(
    inv: Invert, species: Any, accepted_days: List[date], today: date
) -> Tuple[Optional[float], bool]:
    """(gap, observed): the animal's own usual gap (observed=True), else the
    interval feeding status uses for it (keeper override, then species, then
    taxon/stage default; observed=False). gap None = no fasting branch."""
    gap = usual_meal_gap(accepted_days, today)
    if gap is not None:
        return gap, True
    # Lives next to the routes that grew it; imported here, not at module
    # level, because routers.inverts imports services that import this one.
    from app.routers.inverts import _recommended_feeding_interval_with_source

    interval = _recommended_feeding_interval_with_source(
        inv.life_stage, species, inv.feeding_interval_days, taxon=inv.taxon
    )[0]
    return (float(interval) if interval else None), False


def _post_molt_window_days(inv: Invert, keeper_set: Optional[int]) -> int:
    """Days after a molt that don't count toward fasting: the molt's own
    keeper-set `feeding_pause_days` when set (0 = none), else the default
    post-molt pause for the animal's taxon/stage (`utils/post_molt_pause`;
    unknown stage = adult), else 0."""
    if keeper_set is not None:
        return max(0, int(keeper_set))
    return default_pause_days(inv.taxon, inv.life_stage) or 0


def _build_prediction(
    inv: Invert,
    species: Any,
    molts: Sequence[Tuple[datetime, bool, Optional[int]]],
    feedings: Sequence[Tuple[datetime, Optional[bool]]],
    ctx: _Context,
    keeper_answer: Optional[str],
) -> Dict[str, Any]:
    """One animal's prediction from already-loaded rows.

    molts: (molted_at, is_ultimate, feeding_pause_days), newest first.
    feedings: (fed_at, accepted), newest first.
    """
    now, today, tz = ctx.now, ctx.today, ctx.tz

    def days_since(moment: datetime) -> int:
        return (today - _local_date(moment, tz)).days

    # Days since last molt (local calendar days).
    days_since_last_molt = None
    last_molt_date = None
    if molts:
        last_molt_date = _local_date(molts[0][0], tz)
        days_since_last_molt = days_since(molts[0][0])

    # Average molt interval. Requires at least 3 molts (so we get 2+
    # intervals) before we trust the average — a single interval is too
    # unreliable, especially around life-stage transitions where intervals can
    # jump from weeks to months. For keepers with just 2 molts logged we leave
    # this None and the downstream branches skip any interval-based prediction.
    average_molt_interval = None
    if len(molts) >= 3:
        intervals = []
        for i in range(len(molts) - 1):
            interval = (molts[i][0] - molts[i + 1][0]).days
            if interval > 0:
                intervals.append(interval)
        if intervals:
            average_molt_interval = sum(intervals) / len(intervals)

    molt_interval_progress = None
    if average_molt_interval and days_since_last_molt is not None:
        molt_interval_progress = (days_since_last_molt / average_molt_interval) * 100

    # Recent refusal streak (consecutive refusals from most recent backwards).
    # Refusals older than the cutoff don't count — the cutoff is the later of
    # (60 days ago) or (last molt date), because:
    #   - refusals older than ~2 months are too stale to indicate current
    #     premolt state (the spider has probably moved on), and
    #   - refusals from before the last logged molt are definitionally
    #     obsolete — the spider has since molted.
    # Without this bound, a keeper who logged 3 refusals six months ago and
    # hasn't tried feeding since would see "3 refusals → likely premolt" today.
    recent_refusal_streak = 0
    if feedings:
        refusal_cutoff = now - timedelta(days=60)
        if molts and molts[0][0] > refusal_cutoff:
            refusal_cutoff = molts[0][0]
        for fed_at, accepted in feedings:
            if fed_at < refusal_cutoff:
                break  # Too old to count toward current streak
            if not accepted:
                recent_refusal_streak += 1
            else:
                break  # Stop at first accepted feeding

    refusal_rate_last_30_days = None
    if feedings:
        cutoff_date = now - timedelta(days=30)
        recent = [acc for fed_at, acc in feedings if fed_at >= cutoff_date]
        if recent:
            refusal_rate_last_30_days = (sum(1 for acc in recent if not acc) / len(recent)) * 100
        else:
            refusal_rate_last_30_days = 0.0

    # The ultimate molt, if one has been recorded (ult_20260911). molts is
    # newest-first, so this also gives the date maturity happened.
    ultimate = next((m for m in molts if m[1]), None)
    matured_at = ultimate[0] if ultimate else None
    days_since_matured = days_since(matured_at) if matured_at else None

    # Eligibility (spec §4): closed, then grazer, then matured.
    if inv.died_at is not None or inv.transferred_out_at is not None:
        ineligible_reason: Optional[str] = "closed"
    elif not has_feeding_cadence(inv.taxon, species):
        ineligible_reason = "grazer"
    elif is_matured(inv.taxon, inv.life_stage, ultimate is not None, inv.sex):
        ineligible_reason = "matured"
    else:
        ineligible_reason = None
    eligible = ineligible_reason is None

    # Fasting signal: local days without an ACCEPTED meal vs the usual gap.
    # The clock starts at the later of the last accepted meal and the end of
    # the newest molt's post-molt window. Counting from the meal alone would
    # include the fast BEFORE the molt (premolt itself) plus the post-molt
    # wait, so a freshly molted animal would read as "fasting" the day its
    # window ended.
    accepted_times = [fed_at for fed_at, acc in feedings if acc is True]
    days_fasting = None
    clock_from_molt = False  # the clock started at the molt's window, not the meal
    if accepted_times:
        fast_start = _local_date(max(accepted_times), tz)
        if molts:
            window_end = _local_date(molts[0][0], tz) + timedelta(
                days=_post_molt_window_days(inv, molts[0][2])
            )
            clock_from_molt = window_end > fast_start
            fast_start = max(fast_start, window_end)
        days_fasting = max(0, (today - fast_start).days)
    usual_gap, gap_is_observed = None, True
    if eligible:
        usual_gap, gap_is_observed = _usual_gap_with_fallback(
            inv, species, [_local_date(t, tz) for t in accepted_times], today
        )
    # Paused for any reason other than premolt (rehoused, breeding season,
    # ...): the keeper is withholding food on purpose, so not eating says
    # nothing about premolt. The fasting branch stays quiet; the other
    # branches may still fire, but clients hide the answer buttons and the
    # answer route refuses, so "Yes" can't overwrite the keeper's reason.
    paused_any = is_feeding_paused(inv.feeding_paused_reason, inv.feeding_paused_until, today)
    paused_other = paused_any and (inv.feeding_paused_reason or "").strip().lower() != "premolt"
    fasting = ctx.still_logging and not paused_other and fasting_fires(days_fasting, usual_gap)

    if eligible:
        is_premolt_likely, branch = evaluate_premolt(
            recent_refusal_streak=recent_refusal_streak,
            molt_interval_progress=molt_interval_progress,
            days_since_last_molt=days_since_last_molt,
            has_ultimate_molt=ultimate is not None,
            fasting=fasting,
        )
    else:
        is_premolt_likely, branch = False, "none"

    # Confidence. Refusal + high progress → high. Refusal + moderate progress
    # → medium. Overdue-only (no refusals) → low, because adult
    # eat-through-premolt behaviour is common but not universal. Fasting alone
    # → low; fasting with a refusal logged during it → medium.
    confidence = "low"
    if recent_refusal_streak >= 3 and molt_interval_progress and molt_interval_progress >= 80:
        confidence = "high"
    elif recent_refusal_streak >= 2 and molt_interval_progress and molt_interval_progress >= 60:
        confidence = "medium"
    elif branch == "fasting" and recent_refusal_streak >= 1:
        confidence = "medium"

    # Estimated molt window (remaining days). None once matured — there is no
    # next molt to be a window toward.
    estimated_molt_window_days = None
    if ultimate is None and average_molt_interval and days_since_last_molt is not None:
        estimated_molt_window_days = max(0, average_molt_interval - days_since_last_molt)

    feeding_count = len(feedings)
    molt_count = len(molts)
    if feeding_count >= 10 and molt_count >= 2:
        data_quality = "good"
    elif feeding_count >= 5 and molt_count >= 1:
        data_quality = "fair"
    else:
        data_quality = "insufficient"

    last_feeding_date = _local_date(feedings[0][0], tz) if feedings else None

    paused_for_premolt = (
        (inv.feeding_paused_reason or "").strip().lower() == "premolt"
        and is_feeding_paused(inv.feeding_paused_reason, inv.feeding_paused_until, today)
    )
    snoozed_until = inv.premolt_snoozed_until
    snoozed = snoozed_until is not None and snoozed_until >= today
    show_alert = eligible and is_premolt_likely and not paused_for_premolt and not snoozed

    return {
        # Old fields — kept for app versions that predate premolt v2.
        "tarantula_id": str(inv.id),
        "tarantula_name": inv.name or inv.common_name or inv.scientific_name or "Unnamed",
        "is_premolt_likely": is_premolt_likely,
        "confidence": confidence,
        "days_since_last_molt": days_since_last_molt,
        "average_molt_interval": round(average_molt_interval, 1) if average_molt_interval else None,
        # `is not None`, not truthiness — an animal that moulted today has
        # progress 0.0, which is a fact, not a missing value.
        "molt_interval_progress": round(molt_interval_progress, 1) if molt_interval_progress is not None else None,
        "recent_refusal_streak": recent_refusal_streak,
        "refusal_rate_last_30_days": round(refusal_rate_last_30_days, 1) if refusal_rate_last_30_days is not None else None,
        "estimated_molt_window_days": round(estimated_molt_window_days, 1) if estimated_molt_window_days is not None else None,
        "data_quality": data_quality,
        # Maturity (ult_20260911). ELAPSED ONLY — never time remaining.
        # species.lifespan_male is populated on 3 of 197 rows, so a "months
        # left" figure would be invented for 98% of the catalog. Clients
        # render "Matured 8 months ago", never a countdown.
        "has_matured": ultimate is not None,
        "matured_at": _local_date(matured_at, tz).isoformat() if matured_at else None,
        "days_since_matured": days_since_matured,
        "last_molt_date": last_molt_date.isoformat() if last_molt_date else None,
        "last_feeding_date": last_feeding_date.isoformat() if last_feeding_date else None,
        "feeding_count": feeding_count,
        "molt_count": molt_count,
        # Premolt v2.
        "invert_id": str(inv.id),
        "taxon": inv.taxon,
        "eligible": eligible,
        "ineligible_reason": ineligible_reason,
        "branch": branch,
        "days_fasting": days_fasting,
        "usual_gap_days": round(usual_gap, 1) if usual_gap is not None else None,
        "reason": premolt_reason(
            branch,
            days_fasting=days_fasting,
            usual_gap=usual_gap,
            recent_refusal_streak=recent_refusal_streak,
            days_since_last_molt=days_since_last_molt,
            gap_is_observed=gap_is_observed,
            clock_from_molt=clock_from_molt,
        ),
        "keeper_answer": keeper_answer,
        "premolt_snoozed_until": snoozed_until.isoformat() if snoozed_until else None,
        "paused_for_premolt": paused_for_premolt,
        "paused_other": paused_other,
        "show_alert": show_alert,
    }


def predict_premolt(db: Session, invert_id: UUID) -> Dict[str, Any]:
    """Premolt prediction for one animal of any taxon.

    A missing animal returns the old error dict; every existing animal gets a
    prediction (ineligible ones with `eligible False` and a reason).
    Access is the caller's job (the routes use `load_invert`).
    """
    inv = db.query(Invert).filter(Invert.id == invert_id).first()
    if not inv:
        return {"tarantula_id": str(invert_id), "error": "Tarantula not found"}

    molts = (
        db.query(MoltLog.molted_at, MoltLog.is_ultimate, MoltLog.feeding_pause_days)
        .filter(tarantula_logs(MoltLog, invert_id))
        .order_by(MoltLog.molted_at.desc(), MoltLog.created_at.desc())
        .all()
    )
    feedings = (
        db.query(FeedingLog.fed_at, FeedingLog.accepted)
        .filter(tarantula_logs(FeedingLog, invert_id))
        .order_by(FeedingLog.fed_at.desc(), FeedingLog.created_at.desc())
        .all()
    )
    ctx = _owner_context(db, inv.user_id)
    answers = _open_episode_answers(db, [inv.id])
    return _build_prediction(inv, inv.species, molts, feedings, ctx, answers.get(inv.id))


def _predict_many(
    db: Session, owner_id: UUID, inverts: Sequence[Invert]
) -> List[Tuple[Dict[str, Any], bool]]:
    """(prediction, has_open_episode) for each of one owner's animals. One
    query per table for the whole set — never per animal."""
    if not inverts:
        return []
    ids = [inv.id for inv in inverts]
    wanted = set(ids)

    species_ids = {inv.species_id for inv in inverts if inv.species_id}
    species_by_id = {}
    if species_ids:
        species_by_id = {
            sp.id: sp
            for sp in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids)).all()
        }

    # Either parent column, like utils/legacy_logs.tarantula_logs (a
    # tarantula's logs may carry only one of the two; the ids are equal).
    molts_by_id: Dict[UUID, List[Tuple[datetime, bool, Optional[int]]]] = {i: [] for i in ids}
    for invert_id, tarantula_id, molted_at, is_ultimate, pause_days in (
        db.query(
            MoltLog.invert_id, MoltLog.tarantula_id, MoltLog.molted_at,
            MoltLog.is_ultimate, MoltLog.feeding_pause_days,
        )
        .filter(or_(MoltLog.invert_id.in_(ids), MoltLog.tarantula_id.in_(ids)))
        .order_by(MoltLog.molted_at.desc(), MoltLog.created_at.desc())
        .all()
    ):
        key = invert_id if invert_id in wanted else tarantula_id
        molts_by_id[key].append((molted_at, is_ultimate, pause_days))

    feeds_by_id: Dict[UUID, List[Tuple[datetime, Optional[bool]]]] = {i: [] for i in ids}
    for invert_id, tarantula_id, fed_at, accepted in (
        db.query(FeedingLog.invert_id, FeedingLog.tarantula_id, FeedingLog.fed_at, FeedingLog.accepted)
        .filter(or_(FeedingLog.invert_id.in_(ids), FeedingLog.tarantula_id.in_(ids)))
        .order_by(FeedingLog.fed_at.desc(), FeedingLog.created_at.desc())
        .all()
    ):
        key = invert_id if invert_id in wanted else tarantula_id
        feeds_by_id[key].append((fed_at, accepted))

    ctx = _owner_context(db, owner_id)
    answers = _open_episode_answers(db, ids)

    out = []
    for inv in inverts:
        species = species_by_id.get(inv.species_id) if inv.species_id else None
        pred = _build_prediction(
            inv, species, molts_by_id[inv.id], feeds_by_id[inv.id], ctx, answers.get(inv.id)
        )
        out.append((pred, inv.id in answers))
    return out


def predict_for_inverts(db: Session, owner_id: UUID, inverts: Sequence[Invert]) -> List[Dict[str, Any]]:
    """Predictions for a given set of ONE owner's animals, unfiltered (for the
    daily episode pass). Batched like predict_premolt_batch."""
    return [pred for pred, _ in _predict_many(db, owner_id, inverts)]


def predict_premolt_batch(db: Session, user_id: UUID) -> Dict[str, Any]:
    """Predictions for the owner's collection (Home tile, dashboard).

    Every ACTIVE animal that is eligible or has an open episode. Sorted likely
    first, then by confidence, then by molt-interval progress.
    `premolt_likely_count` counts only animals whose alert shows (not paused
    for premolt, not snoozed). `total_tarantulas` is kept for old app versions
    and equals `total_animals`.
    """
    inverts = active_inverts_query(db, user_id).all()
    predictions = [
        pred for pred, has_open in _predict_many(db, user_id, inverts)
        if pred["eligible"] or has_open
    ]

    def sort_key(p):
        confidence_order = {"high": 0, "medium": 1, "low": 2}
        confidence_val = confidence_order.get(p.get("confidence", "low"), 3)
        progress = p.get("molt_interval_progress") or 0
        return (not p.get("is_premolt_likely"), confidence_val, -progress)

    predictions.sort(key=sort_key)

    return {
        "total_tarantulas": len(predictions),
        "total_animals": len(predictions),
        "premolt_likely_count": sum(1 for p in predictions if p["show_alert"]),
        "predictions": predictions,
    }
