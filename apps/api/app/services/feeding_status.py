"""Cross-taxon feeding status: the one place that decides who is due.

Extracted verbatim from `GET /inverts/feeding-status` so Feeding Day, the
single-animal feeding stats, the analytics "right now" fields
(`/analytics/collection`) and the daily digest all run the SAME rule and can
never disagree about who is overdue.

is_overdue is species + life-stage aware: an animal is overdue when days since
its last ACCEPTED feeding have reached its recommended interval (the keeper's
own cadence, else the species' per-stage feeding frequency, else a stage
default). Paused animals and animals with no cadence (grazers / detritivores)
are never flagged and never nudged.

NEVER-FED ANIMALS (Day one). An animal with no accepted feeding has a
*baseline*: the later of its created_at (keeper-local date) and its
date_acquired. Then:

- created on/after `FIRST_FEEDING_DUE_FROM` (the release day): it becomes
  due once local days since baseline reach its interval, like any fed animal.
- created before it: it is NEVER due while never-fed (many keepers deliberately
  don't log feedings; their existing animals must not start producing daily
  "N due" reminders the day this shipped). It only gets the nudge.
- `needs_first_feeding` = no feeding log AT ALL (a refusal counts as a log, so
  a refusal-only animal gets no nudge), a cadence, not paused, not due.
- once a feeding is accepted the normal rule applies to every animal.

OWNER SWITCHES (effortless logging, spec §4). Read here from each animal's
OWNER's `notification_preferences` (`load_feeding_rules`; no row = all off), so
a co-keeper sees the owner's rule and callers need no new arguments. With
every switch off the output is exactly what it was before them.

- refusal_restarts_wait: the countdown runs from the newest feeding log of
  either kind (`last_offered_date`), so a refused meal waits a full interval
  before the next reminder. `last_feeding_date` / `days_since_last_feeding`
  keep meaning "last meal". For a never-fed animal a refusal restarts the wait
  from the later of the baseline and the refusal; the release cutoff and
  `needs_first_feeding` are unchanged.
- post_molt_pause_enabled: the animal's NEWEST molt (invert_id, or the legacy
  tarantula_id) + its window (`molt_logs.feeding_pause_days`, else
  `utils/post_molt_pause.py`'s table) >= the keeper's today ->
  `post_molt_pause_until`, never overdue, no first-feeding nudge. Only for
  animals with a cadence; a keeper-set pause wins (it keeps its own flag and
  label). Nothing is stored on the animal: deleting the molt ends the pause.

Callers decide WHICH animals to pass in (access scoping stays in the route).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional
from uuid import UUID

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.models.molt_log import MoltLog
from app.models.notification_preferences import NotificationPreferences
from app.schemas.invert import InvertFeedingStatusItem
from app.utils.feeding_pause import is_feeding_paused
from app.utils.post_molt_pause import default_pause_days, pause_until

# Release cutoff: never-fed animals created on/after this (keeper-local) day
# can become due. Read at call time as a module attribute (tests move it), never
# bound as a default argument.
FIRST_FEEDING_DUE_FROM: date = date(2026, 10, 28)


def _local_date(moment: datetime, tz_offset_minutes: Optional[int]) -> date:
    """Calendar date of `moment` in the keeper's zone (JS getTimezoneOffset()
    sign: positive west, local = UTC - offset). No offset = UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    moment = moment.astimezone(timezone.utc)
    if tz_offset_minutes is None:
        return moment.date()
    return (moment + timedelta(minutes=-tz_offset_minutes)).date()


@dataclass(frozen=True)
class FeedingRules:
    """One owner's due-rule switches. The defaults are "off" = today's rule."""
    refusal_restarts_wait: bool = False
    post_molt_pause: bool = False


def load_feeding_rules(db: Session, owner_ids: Iterable[UUID]) -> Dict[UUID, FeedingRules]:
    """Every owner's switches in one query. An owner with no
    notification_preferences row gets all switches off."""
    ids = {oid for oid in owner_ids if oid is not None}
    if not ids:
        return {}
    rules = {oid: FeedingRules() for oid in ids}
    rows = (
        db.query(
            NotificationPreferences.user_id,
            NotificationPreferences.refusal_restarts_wait,
            NotificationPreferences.post_molt_pause_enabled,
        )
        .filter(NotificationPreferences.user_id.in_(ids))
        .all()
    )
    for user_id, refusal, molt in rows:
        rules[user_id] = FeedingRules(
            refusal_restarts_wait=bool(refusal), post_molt_pause=bool(molt)
        )
    return rules


def _newest_molts(db: Session, ids: List[UUID]) -> Dict[UUID, tuple]:
    """(molted_at, feeding_pause_days, created_at) of each animal's newest molt,
    one query. A molt dated in the future never hides a real past one: the
    newest molt with molted_at <= now wins, and a future-dated one is used only
    when the animal has no other.

    A tarantula's molts may carry only the legacy `tarantula_id` (same id as
    its invert; see utils/legacy_logs.py), so match either column.
    """
    if not ids:
        return {}
    key = func.coalesce(MoltLog.invert_id, MoltLog.tarantula_id)
    rows = (
        db.query(key, MoltLog.molted_at, MoltLog.feeding_pause_days, MoltLog.created_at)
        .filter(or_(MoltLog.invert_id.in_(ids), MoltLog.tarantula_id.in_(ids)))
        .distinct(key)
        .order_by(
            key,
            case((MoltLog.molted_at > datetime.now(timezone.utc), 1), else_=0),
            MoltLog.molted_at.desc(),
            MoltLog.created_at.desc(),
        )
        .all()
    )
    wanted = set(ids)
    newest: Dict[UUID, tuple] = {}
    for animal_id, molted_at, pause_days, created_at in rows:
        # Rows arrive newest first per animal; keep the first one seen.
        if animal_id in wanted:
            newest.setdefault(animal_id, (molted_at, pause_days, created_at))
    return newest


def compute_feeding_status(
    db: Session,
    inverts: List[Invert],
    tz_offset_minutes: Optional[int],
) -> List[InvertFeedingStatusItem]:
    """Feeding status for `inverts`, neediest first (never-fed, then the longest
    since fed). One grouped query for the last ACCEPTED feeding per animal, one
    for "has any feeding log at all", and one batched species load: no N+1.
    """
    # The cadence helpers live next to the routes that grew them. Imported here,
    # not at module level, because routers.inverts imports this service.
    from app.routers.inverts import (
        _calendar_day_diff,
        _recommended_feeding_interval_with_source,
    )

    if not inverts:
        return []

    ids = [inv.id for inv in inverts]
    rows = (
        db.query(FeedingLog.invert_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.invert_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.invert_id)
        .all()
    )
    last_by_id = {row[0]: row[1] for row in rows}

    # The OWNER's switches (a co-keeper sees the owner's rule). Each extra
    # query below runs only when some owner in this batch has that switch on.
    rules_by_owner = load_feeding_rules(db, {inv.user_id for inv in inverts})
    off = FeedingRules()
    refusal_ids = [inv.id for inv in inverts if rules_by_owner.get(inv.user_id, off).refusal_restarts_wait]
    molt_ids = [inv.id for inv in inverts if rules_by_owner.get(inv.user_id, off).post_molt_pause]

    # Any log at all (accepted or refused): a refusal means the keeper is
    # logging, so no "log its first meal" nudge.
    logged_ids = {
        row[0]
        for row in db.query(FeedingLog.invert_id)
        .filter(FeedingLog.invert_id.in_(ids))
        .distinct()
        .all()
    }

    # Newest log of either kind, for owners whose refusals restart the wait.
    offered_by_id = {}
    if refusal_ids:
        offered_by_id = {
            row[0]: row[1]
            for row in db.query(FeedingLog.invert_id, func.max(FeedingLog.fed_at))
            .filter(FeedingLog.invert_id.in_(refusal_ids))
            .group_by(FeedingLog.invert_id)
            .all()
        }

    newest_molt_by_id = _newest_molts(db, molt_ids)

    # Batch-load the species referenced by this collection (avoid N+1).
    species_ids = {inv.species_id for inv in inverts if inv.species_id}
    species_by_id = {}
    if species_ids:
        species_by_id = {
            sp.id: sp
            for sp in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids)).all()
        }

    now = datetime.now(timezone.utc)
    today_local = _local_date(now, tz_offset_minutes)
    cutoff = FIRST_FEEDING_DUE_FROM  # read at call time

    items: List[InvertFeedingStatusItem] = []
    for inv in inverts:
        rules = rules_by_owner.get(inv.user_id, off)
        last = last_by_id.get(inv.id)
        last_offered = offered_by_id.get(inv.id) if rules.refusal_restarts_wait else None
        days = _calendar_day_diff(now, last, tz_offset_minutes) if last else None
        paused = is_feeding_paused(inv.feeding_paused_reason, inv.feeding_paused_until, today_local)
        species = species_by_id.get(inv.species_id) if inv.species_id else None
        interval, interval_source = _recommended_feeding_interval_with_source(
            inv.life_stage, species, inv.feeding_interval_days, taxon=inv.taxon
        )
        eligible = (not paused) and interval is not None

        days_since_baseline: Optional[int] = None
        needs_first_feeding = False
        if last is not None:
            # Switch on: count from the newest log (>= the last meal, so the
            # switch can only push the due day out, never pull it in).
            wait_days = days
            if last_offered is not None and last_offered > last:
                wait_days = _calendar_day_diff(now, last_offered, tz_offset_minutes)
            is_overdue = eligible and wait_days is not None and wait_days >= interval
        else:
            created_local = _local_date(inv.created_at, tz_offset_minutes) if inv.created_at else today_local
            baseline = created_local
            if inv.date_acquired is not None and inv.date_acquired > baseline:
                baseline = inv.date_acquired  # a future date pushes the baseline out
            days_since_baseline = max(0, (today_local - baseline).days)
            wait_days = days_since_baseline
            if last_offered is not None:
                # A refusal restarts the wait, from the later of it and the baseline.
                wait_start = max(baseline, _local_date(last_offered, tz_offset_minutes))
                wait_days = max(0, (today_local - wait_start).days)
            is_overdue = (
                eligible
                and created_local >= cutoff
                and wait_days >= interval
            )
            needs_first_feeding = eligible and inv.id not in logged_ids and not is_overdue

        # Post-molt pause: owner's switch on, a cadence, no keeper pause.
        post_molt_until: Optional[date] = None
        newest_molt = newest_molt_by_id.get(inv.id) if rules.post_molt_pause else None
        if newest_molt is not None and eligible:
            molted_at, override_days, molt_created_at = newest_molt
            molt_local_day = _local_date(molted_at, tz_offset_minutes)
            window = override_days if override_days is not None else default_pause_days(inv.taxon, inv.life_stage)
            if last is not None and _local_date(last, tz_offset_minutes) >= molt_local_day:
                # An accepted meal on or after the molt day: the animal is
                # eating again, so the pause is over.
                window = None
            post_molt_until = pause_until(
                molt_local_day,
                today_local,
                window,
                _local_date(molt_created_at, tz_offset_minutes) if molt_created_at else None,
            )
            if post_molt_until is not None:
                is_overdue = False
                needs_first_feeding = False

        items.append(
            InvertFeedingStatusItem(
                id=inv.id,
                name=inv.name,
                common_name=inv.common_name,
                scientific_name=inv.scientific_name,
                taxon=inv.taxon,
                photo_url=inv.photo_url,
                life_stage=inv.life_stage,
                location=inv.location,
                last_feeding_date=last,
                days_since_last_feeding=days,
                is_feeding_paused=paused,
                is_overdue=is_overdue,
                needs_first_feeding=needs_first_feeding,
                days_since_baseline=days_since_baseline,
                interval_days=interval,
                interval_source=interval_source,
                last_offered_date=last_offered,
                post_molt_pause_until=post_molt_until,
            )
        )

    # Never-fed first, then longest-since-fed, so the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items
