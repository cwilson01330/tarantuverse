"""
Premolt episodes — the daily record of premolt alerts and keeper answers
(premolt v2, spec docs/superpowers/specs/2026-11-17-premolt-v2-design.md §5).

The card's prediction is computed live on every read (`premolt_service`);
reads never write. This module is the only writer of `premolt_episodes`:

- `run_premolt_episodes` — the once-a-day pass. Rides on the hourly digest
  cron (`routers/notifications.run_digests`) but does not depend on any digest
  setting. Guarded by the `premolt.episodes_last_run_on` system setting (a UTC
  ISO date) so the hourly cron runs it once per UTC day.
- `record_answer` — the keeper's "Yes, pause feeding" / "Not yet" from the
  card (`POST /premolt/inverts/{id}/answer`).

Every day count is a LOCAL calendar day on the collection owner's clock
(`premolt_service._owner_context`, the same convention as feeding status).
`user_id` on an episode is always the collection owner; `answered_by` is the
person who tapped (owner or co-keeper).

Closing an episode ALWAYS sets `closed_on` and `close_reason` together (no DB
check pairs them).

Episodes are the keeper's own data: the owner's export carries them; public
routes, share cards, card links, keeper profiles, care sheets, sitter passes
and transfers never do (tests/test_premolt_episodes.py).
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional, Sequence
from uuid import UUID

from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.premolt_episode import PremoltEpisode
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.services import settings_service
from app.services.feeding_status import _local_date
from app.services.premolt_service import (
    RULE_VERSION,
    SNOOZE_DAYS,
    STALE_YES_DAYS,
    _owner_context,
    predict_for_inverts,
    predict_premolt,
)
from app.utils.feeding_pause import is_feeding_paused
from app.utils.test_accounts import real_user_clause

logger = logging.getLogger(__name__)

LAST_RUN_KEY = "premolt.episodes_last_run_on"
ANSWERS = ("yes", "not_yet")


# ── helpers ──────────────────────────────────────────────────────────────────

def _signals(pred: Dict[str, Any], life_stage: Optional[str]) -> Dict[str, Any]:
    """The snapshot stored with an episode when it opens."""
    return {
        "recent_refusal_streak": pred.get("recent_refusal_streak"),
        "days_fasting": pred.get("days_fasting"),
        "usual_gap_days": pred.get("usual_gap_days"),
        "molt_interval_progress": pred.get("molt_interval_progress"),
        "confidence": pred.get("confidence"),
        "taxon": pred.get("taxon"),
        "life_stage": life_stage,
    }


def _open(db: Session, inv: Invert, pred: Dict[str, Any], today: date) -> PremoltEpisode:
    ep = PremoltEpisode(
        id=uuid.uuid4(),
        invert_id=inv.id,
        user_id=inv.user_id,
        opened_on=today,
        branch=pred.get("branch") or "none",
        signals=_signals(pred, inv.life_stage),
        rule_version=RULE_VERSION,
    )
    db.add(ep)
    return ep


def _close(ep: PremoltEpisode, reason: str, today: date) -> None:
    # Always both together.
    ep.closed_on = today
    ep.close_reason = reason


def _open_episodes(db: Session, ids: Sequence[UUID]) -> Dict[UUID, PremoltEpisode]:
    if not ids:
        return {}
    rows = (
        db.query(PremoltEpisode)
        .filter(PremoltEpisode.invert_id.in_(list(ids)), PremoltEpisode.closed_on.is_(None))
        .all()
    )
    return {ep.invert_id: ep for ep in rows}


def _last_accepted_meals(db: Session, ids: Sequence[UUID]) -> Dict[UUID, datetime]:
    """{invert_id: newest accepted fed_at}, either parent column (a tarantula's
    logs may carry only `tarantula_id`; the ids are equal, ADR-005)."""
    if not ids:
        return {}
    key = func.coalesce(FeedingLog.invert_id, FeedingLog.tarantula_id)
    rows = (
        db.query(key, func.max(FeedingLog.fed_at))
        .filter(
            or_(FeedingLog.invert_id.in_(list(ids)), FeedingLog.tarantula_id.in_(list(ids))),
            FeedingLog.accepted.is_(True),
        )
        .group_by(key)
        .all()
    )
    return {k: v for k, v in rows if k is not None and v is not None}


def _iso(value: Optional[str]) -> Optional[date]:
    return date.fromisoformat(value) if value else None


def _snoozed(inv: Invert, today: date) -> bool:
    return inv.premolt_snoozed_until is not None and inv.premolt_snoozed_until >= today


def _paused_for_premolt(inv: Invert, today: date) -> bool:
    """Same test as the prediction's `paused_for_premolt`."""
    return (
        (inv.feeding_paused_reason or "").strip().lower() == "premolt"
        and is_feeding_paused(inv.feeding_paused_reason, inv.feeding_paused_until, today)
    )


def _latest_opened_on(db: Session, ids: Sequence[UUID]) -> Dict[UUID, date]:
    """{invert_id: newest opened_on of ANY episode}, one grouped query."""
    if not ids:
        return {}
    rows = (
        db.query(PremoltEpisode.invert_id, func.max(PremoltEpisode.opened_on))
        .filter(PremoltEpisode.invert_id.in_(list(ids)))
        .group_by(PremoltEpisode.invert_id)
        .all()
    )
    return {k: v for k, v in rows if v is not None}


# The overdue branch fires on elapsed time alone, with no refusals: some
# animals eat straight through premolt. So a meal doesn't end an overdue
# episode the keeper hasn't confirmed — otherwise every meal closes it and the
# next run reopens it. A "yes" is a feeding pause, which a meal does end.
MEAL_DOES_NOT_CLOSE_BRANCHES = ("overdue",)


# ── the daily pass ───────────────────────────────────────────────────────────

def _claim_today(db: Session, today_utc: date) -> bool:
    """True when this run should do the work (and records today first).

    Reads the guard row directly, locked, and never through
    `settings_service.get`: that is cached in-process for 5 minutes, so a
    cached value could run the pass twice a day or not at all. The write is
    committed BEFORE the work, so a second cron run (or a crash mid-pass)
    can't repeat it the same day.
    """
    row = (
        db.query(SystemSetting)
        .filter(SystemSetting.key == LAST_RUN_KEY)
        .with_for_update()
        .populate_existing()  # a copy already in the session may hold an older value
        .first()
    )
    if row is None:
        raise RuntimeError(f"system setting {LAST_RUN_KEY!r} is missing (migration pmv_20261117_premolt_v2)")
    if (row.value or "").strip() == today_utc.isoformat():
        db.commit()  # nothing written; releases the row lock
        return False
    settings_service.update(db, LAST_RUN_KEY, today_utc.isoformat())  # commits + invalidates the cache
    return True


def _run_for_owner(db: Session, owner_id: UUID) -> Dict[str, int]:
    """One owner's animals: every active one, plus any with an open episode
    (a died/transferred animal still needs its episode closed)."""
    counts = {"opened": 0, "closed": 0, "answered_from_pause": 0}

    open_ids = (
        db.query(PremoltEpisode.invert_id)
        .filter(PremoltEpisode.user_id == owner_id, PremoltEpisode.closed_on.is_(None))
    )
    # Locked for this owner's turn, so a keeper's answer tapped mid-pass
    # can't race it into a second open episode. FOR NO KEY UPDATE, not FOR
    # UPDATE: feeding/molt inserts take KEY SHARE on the invert for their FK
    # check, which FOR UPDATE would block for the whole turn.
    inverts = (
        db.query(Invert)
        .filter(
            Invert.user_id == owner_id,
            or_(
                (Invert.transferred_out_at.is_(None) & Invert.died_at.is_(None)),
                Invert.id.in_(open_ids),
            ),
        )
        .order_by(Invert.id)
        .with_for_update(key_share=True)
        .all()
    )
    if not inverts:
        return counts

    ctx = _owner_context(db, owner_id)
    today = ctx.today
    preds = {p["invert_id"]: p for p in predict_for_inverts(db, owner_id, inverts)}
    ids = [inv.id for inv in inverts]
    open_eps = _open_episodes(db, ids)
    meals = _last_accepted_meals(db, ids)
    latest_opened = _latest_opened_on(db, ids)
    now = datetime.now(timezone.utc)

    for inv in inverts:
        pred = preds[str(inv.id)]
        ep = open_eps.get(inv.id)
        last_molt = _iso(pred.get("last_molt_date"))
        last_meal_at = meals.get(inv.id)
        last_meal = _local_date(last_meal_at, ctx.tz) if last_meal_at else None
        paused = bool(pred.get("paused_for_premolt"))

        if ep is not None:
            # Molt, meal, animal closed — whatever the keeper answered.
            # "After opened_on" = on or after the open day, owner-local.
            if last_molt is not None and last_molt >= ep.opened_on:
                reason: Optional[str] = "molted"
            elif (
                last_meal is not None and last_meal >= ep.opened_on
                and not (ep.branch in MEAL_DOES_NOT_CLOSE_BRANCHES and ep.keeper_answer != "yes")
            ):
                reason = "ate"
            elif inv.died_at is not None or inv.transferred_out_at is not None:
                reason = "animal_closed"
            else:
                reason = None

            # A manual premolt pause is a keeper "yes".
            if reason is None and paused and ep.keeper_answer != "yes":
                ep.keeper_answer = "yes"
                ep.answer_source = "pause"
                ep.answered_at = now
                ep.answered_by = None  # who set the pause isn't recorded
                counts["answered_from_pause"] += 1

            if reason is None:
                if ep.keeper_answer != "yes" and not pred.get("is_premolt_likely"):
                    reason = "cleared"
                elif ep.keeper_answer == "yes" and (today - ep.opened_on).days >= STALE_YES_DAYS:
                    # Confirmed, but no molt or meal in 120 days.
                    reason = "stale"
            if reason is not None:
                _close(ep, reason, today)
                counts["closed"] += 1
            # One step per animal per day: an episode closed today isn't
            # replaced until tomorrow's run.
            continue

        if not pred.get("eligible") or _snoozed(inv, today):
            continue

        if paused:
            # A premolt pause still set after a molt with no meal since (a
            # meal ends the pause) predates that molt, or is a post-molt
            # fast: it isn't a premolt answer.
            if last_molt is not None and (last_meal is None or last_molt >= last_meal):
                continue
            # One label per pause. The pause began after the last accepted
            # meal (a meal ends it) and the last molt; an episode that opened
            # since then already covered it — e.g. closed keeper_not_yet, or a
            # "yes" closed stale — so don't label the same pause again.
            starts = [d for d in (last_meal, last_molt) if d is not None]
            pause_start = max(starts) if starts else None
            prior = latest_opened.get(inv.id)
            if prior is not None and (pause_start is None or prior >= pause_start):
                continue
            ep = _open(db, inv, pred, today)
            ep.keeper_answer = "yes"
            ep.answer_source = "pause"
            ep.answered_at = now
            counts["opened"] += 1
            counts["answered_from_pause"] += 1
        elif pred.get("is_premolt_likely"):
            _open(db, inv, pred, today)
            counts["opened"] += 1

    db.flush()
    return counts


def run_premolt_episodes(
    db: Session,
    *,
    today_utc: Optional[date] = None,
    force: bool = False,
    only_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """The once-a-day pass over every active Tarantuverse keeper.

    Unless `force`, does nothing (`skipped True`) when it already ran this UTC
    day, and otherwise records today BEFORE working. `only_user_id` (the
    digest cron's test hook) runs one keeper and neither reads nor writes the
    daily guard — a one-keeper test run must not use up everyone's day.

    Each keeper is committed separately; one keeper's failure is logged and
    skipped, never fatal to the others.

    Returns {"skipped", "opened", "closed", "answered_from_pause", "failed"}.
    """
    out: Dict[str, Any] = {"skipped": False, "opened": 0, "closed": 0, "answered_from_pause": 0, "failed": 0}

    only: Optional[UUID] = None
    if only_user_id is not None:
        try:
            only = uuid.UUID(str(only_user_id))
        except (ValueError, AttributeError):
            return {**out, "skipped": True, "error": "invalid user id"}

    if not force and only is None:
        if not _claim_today(db, today_utc or datetime.now(timezone.utc).date()):
            return {**out, "skipped": True}

    q = db.query(User.id).filter(
        User.is_active.is_(True),
        real_user_clause(),
        ~func.lower(User.email).like("%@merged.invalid"),
        exists().where(Invert.user_id == User.id),
    )
    if only is not None:
        q = q.filter(User.id == only)
    owner_ids = [row[0] for row in q.order_by(User.id).all()]

    for owner_id in owner_ids:
        # A savepoint per keeper: a failure rolls back that keeper's writes
        # only, and the session stays usable for the next one. (Explicit
        # begin/commit/rollback rather than `with`, so session event hooks
        # that open a new savepoint when one ends keep working.)
        savepoint = db.begin_nested()
        try:
            counts = _run_for_owner(db, owner_id)
            savepoint.commit()
        except Exception:
            logger.exception("[premolt] episode pass failed for one keeper; skipped")
            if savepoint.is_active:
                savepoint.rollback()
            out["failed"] += 1
            continue
        try:
            db.commit()
        except Exception:
            logger.exception("[premolt] episode pass commit failed for one keeper; skipped")
            db.rollback()
            out["failed"] += 1
            continue
        for k, v in counts.items():
            out[k] += v

    logger.info(
        "[premolt] episode pass: %d keepers, opened %d, closed %d, answered from pause %d, failed %d",
        len(owner_ids), out["opened"], out["closed"], out["answered_from_pause"], out["failed"],
    )
    return out


# ── keeper answers ───────────────────────────────────────────────────────────

def record_answer(db: Session, invert: Invert, *, answer: str, actor_id: Any) -> None:
    """The keeper's answer from the premolt card. Flushes; the caller commits.

    yes     -> records the answer on the open episode (opening one with the
               current signals if the daily pass hasn't yet) and turns on the
               premolt feeding pause with NO end date — exactly a manual
               premolt pause, ended by the next accepted meal. Clears a
               "Not yet" snooze: the keeper changed their mind.
    not_yet -> records the answer, closes the episode `keeper_not_yet` and
               hides the alert until owner-today + SNOOZE_DAYS. A no-op while
               the animal is paused for premolt.

    The same answer twice changes nothing. Access and the closed-animal 409
    are the route's job.
    """
    if answer not in ANSWERS:
        raise ValueError(f"unknown premolt answer {answer!r}")

    # Lock the animal: two taps (or a tap during the daily pass) can't both
    # open an episode.
    inv = (
        db.query(Invert)
        .filter(Invert.id == invert.id)
        .with_for_update(key_share=True)  # FOR NO KEY UPDATE: see _run_for_owner
        .populate_existing()
        .one()
    )
    today = _owner_context(db, inv.user_id).today
    ep = (
        db.query(PremoltEpisode)
        .filter(PremoltEpisode.invert_id == inv.id, PremoltEpisode.closed_on.is_(None))
        .one_or_none()
    )
    now = datetime.now(timezone.utc)

    if answer == "yes":
        if ep is None:
            ep = _open(db, inv, predict_premolt(db, inv.id), today)
        if ep.keeper_answer != "yes":
            ep.keeper_answer = "yes"
            ep.answer_source = "card"
            ep.answered_at = now
            ep.answered_by = actor_id
        changed = False
        if (inv.feeding_paused_reason or "").strip().lower() != "premolt" or inv.feeding_paused_until is not None:
            inv.feeding_paused_reason = "premolt"
            inv.feeding_paused_until = None
            changed = True
        if inv.premolt_snoozed_until is not None:
            inv.premolt_snoozed_until = None
            changed = True
        if changed:
            from app.services.inverts_dualwrite import mirror_invert_update_to_legacy
            mirror_invert_update_to_legacy(db, inv)
        db.flush()
        return

    # not_yet
    if _paused_for_premolt(inv, today):
        # Already paused for premolt: un-pausing goes through the pause
        # controls, so "Not yet" changes nothing (no snooze, no answer change,
        # no close).
        return
    if ep is None and _snoozed(inv, today):
        return  # already answered: nothing open, still hidden
    if ep is None:
        ep = _open(db, inv, predict_premolt(db, inv.id), today)
    ep.keeper_answer = "not_yet"
    ep.answer_source = "card"
    ep.answered_at = now
    ep.answered_by = actor_id
    _close(ep, "keeper_not_yet", today)
    inv.premolt_snoozed_until = today + timedelta(days=SNOOZE_DAYS)
    db.flush()
