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

Callers decide WHICH animals to pass in (access scoping stays in the route).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.schemas.invert import InvertFeedingStatusItem
from app.utils.feeding_pause import is_feeding_paused

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

    # Any log at all (accepted or refused): a refusal means the keeper is
    # logging, so no "log its first meal" nudge.
    logged_ids = {
        row[0]
        for row in db.query(FeedingLog.invert_id)
        .filter(FeedingLog.invert_id.in_(ids))
        .distinct()
        .all()
    }

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
        last = last_by_id.get(inv.id)
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
            is_overdue = eligible and days is not None and days >= interval
        else:
            created_local = _local_date(inv.created_at, tz_offset_minutes) if inv.created_at else today_local
            baseline = created_local
            if inv.date_acquired is not None and inv.date_acquired > baseline:
                baseline = inv.date_acquired  # a future date pushes the baseline out
            days_since_baseline = max(0, (today_local - baseline).days)
            is_overdue = (
                eligible
                and created_local >= cutoff
                and days_since_baseline >= interval
            )
            needs_first_feeding = eligible and inv.id not in logged_ids and not is_overdue

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
            )
        )

    # Never-fed first, then longest-since-fed, so the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items
