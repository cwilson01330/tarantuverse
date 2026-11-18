"""The due-date core: one pure function that decides whether an animal is due.

Both products ask it. Tarantuverse's `services/feeding_status.py::
compute_feeding_status` and Herpetoverse's `services/animal_feeding_status.py::
compute_animal_feeding_status` each load their own animals and logs, turn them
into the plain days below, and call `decide`. Nothing here touches the
database, a clock or a time zone: every input is already a day.

WHICH days: with a `tz_offset_minutes` the loaders pass keeper-local calendar
dates. WITHOUT one they pass 24-hour "count days" for the meal and (for a fed
animal) the refusal: `feeding_status.count_day` = today minus the whole
24-hour periods since the log, NOT the log's UTC date. That keeps TV's
tz-less callers byte-identical to the old `_calendar_day_diff` count (a meal
23 hours ago is "0 days", not "yesterday"). A never-fed animal's baseline and
refusal are always calendar dates (UTC with no offset), as before.

THE RULE (the arithmetic that used to sit inline in compute_feeding_status)

- An animal is *eligible* when it is not paused (keeper pause; HV brumation) and
  has an interval. Ineligible animals are never due and get no first-feeding
  nudge.
- Fed (an accepted meal exists): due once the days since the wait started reach
  the interval. The wait starts at the last meal, or — with the owner's
  "refusal restarts the wait" switch on — at the newest log of either kind when
  that is later (a refusal can only push the due day out, never pull it in).
  `days_since_last_feeding` keeps meaning "since the last meal" and is not
  clamped (a future-dated meal gives a negative count, as before).
- Never fed: the wait starts at `baseline` (the later of the owner-local created
  day and date_acquired), or the later of that and the newest refusal with the
  switch on. Due only when the animal was created on/after `cutoff` (the
  product's release day for this rule) and the wait has reached the interval.
  `needs_first_feeding` = eligible, no feeding log at all, not due.
- `post_pause_until` (TV's post-molt pause, already worked out by the loader):
  for an eligible animal it forces "not due, no nudge" and is echoed back on the
  decision; for an ineligible animal it is dropped (a keeper pause wins).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True)
class FeedingDecision:
    is_overdue: bool
    days_since_last_feeding: Optional[int]
    needs_first_feeding: bool
    days_since_baseline: Optional[int]
    # The day the current wait counts from: next due day = wait_from + interval.
    wait_from: Optional[date]
    # The post-molt window that applied (None when none did, or the animal
    # wasn't eligible for one).
    post_pause_until: Optional[date] = None


def decide(
    *,
    last_accepted: Optional[date],
    last_offered: Optional[date],
    baseline: date,
    interval_days: Optional[int],
    paused: bool,
    today: date,
    created_local: date,
    cutoff: date,
    refusal_restarts_wait: bool,
    has_any_log: bool,
    post_pause_until: Optional[date] = None,
) -> FeedingDecision:
    """Decide one animal. Dates are keeper-local days, or 24-hour count days
    when the caller had no time zone (see module doc)."""
    eligible = (not paused) and interval_days is not None
    offered = last_offered if refusal_restarts_wait else None

    days_since_last: Optional[int] = None
    days_since_baseline: Optional[int] = None
    needs_first_feeding = False

    if last_accepted is not None:
        days_since_last = (today - last_accepted).days
        wait_from = last_accepted
        if offered is not None and offered > last_accepted:
            wait_from = offered
        wait_days = (today - wait_from).days
        is_overdue = eligible and wait_days >= interval_days
    else:
        days_since_baseline = max(0, (today - baseline).days)
        wait_from = baseline
        if offered is not None:
            # A refusal restarts the wait, from the later of it and the baseline.
            wait_from = max(baseline, offered)
        wait_days = max(0, (today - wait_from).days)
        is_overdue = eligible and created_local >= cutoff and wait_days >= interval_days
        needs_first_feeding = eligible and not has_any_log and not is_overdue

    applied_pause = post_pause_until if eligible else None
    if applied_pause is not None:
        is_overdue = False
        needs_first_feeding = False

    return FeedingDecision(
        is_overdue=bool(is_overdue),
        days_since_last_feeding=days_since_last,
        needs_first_feeding=bool(needs_first_feeding),
        days_since_baseline=days_since_baseline,
        wait_from=wait_from,
        post_pause_until=applied_pause,
    )
