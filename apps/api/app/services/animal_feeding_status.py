"""Herpetoverse feeding status: the one place that decides which HV animals are due.

The HV twin of `services/feeding_status.py::compute_feeding_status`. It loads
HV rows (`animals`, `feeding_logs.animal_id`) and asks the SAME pure core
(`services/feeding_rule.py::decide`) TV uses, so the two products can't drift.
Every HV surface that says "due" goes through here: Feeding Day and the
dashboard (`GET /animals/feeding-status`), the per-animal status
(`GET /animals/{id}/feeding-status`, which keeps its "eat again in X-Y days"
window as a display) and the daily digest (`digest_service._animal_overdue_count`).

What stays HV's own:

- the interval: `routers/animals.py::_animal_feeding_interval` (keeper interval
  -> plant-eater = none -> CGD -> weight bracket -> keeper schedule text ->
  species frequency -> none);
- paused = the keeper's own pause OR brumation/aestivation;
- no pause around sheds (a refusal in the blue phase is what "refusal restarts
  the wait" is for);
- its release cutoff `HV_FIRST_FEEDING_DUE_FROM`: never-fed animals created
  before it never turn due while never-fed (they only get the first-meal nudge).

The owner's switches come from `feeding_status.load_feeding_rules` (one set per
account, shared with TV); only "refusal restarts the wait" applies here. Days are
the owner-local days of the `tz_offset_minutes` passed in, exactly as TV counts
them (`feeding_status.count_day`).

Callers decide WHICH animals to pass in (access scoping stays in the route) and
should eager-load `Animal.herp_species`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.animal import Animal
from app.models.feeding_log import FeedingLog
from app.schemas.animal import AnimalFeedingStatusItem
from app.services.feeding_rule import FeedingDecision, decide
from app.services.feeding_status import (
    FeedingRules,
    _local_date,
    count_day,
    load_feeding_rules,
    offered_day,
)
from app.utils.feeding_pause import is_feeding_paused

# HV release cutoff for the first-feeding rule (Step 1's API deploy). Read at
# call time as a module attribute (tests move it), never bound as a default.
HV_FIRST_FEEDING_DUE_FROM: date = date(2026, 11, 18)

HERBIVORE = "herbivore"


def is_plant_eater(animal: Animal) -> bool:
    """Linked species is a herbivore (an unlinked animal is not)."""
    species = getattr(animal, "herp_species", None)
    return species is not None and getattr(species, "diet_type", None) == HERBIVORE


@dataclass(frozen=True)
class AnimalVerdict:
    """One animal's board row plus the core's decision behind it and the
    owner-local "today" it was decided on. The per-animal status route needs
    the decision's `wait_from` (where the current wait started, a refusal
    included) to count "due today" vs "overdue" and days-until-due the same
    way the core did."""
    item: AnimalFeedingStatusItem
    decision: FeedingDecision
    today: date

    @property
    def wait_days(self) -> Optional[int]:
        """Days the current wait has run, counted exactly as the core counts
        them: from the last meal (or a later refusal with the switch on) for a
        fed animal; from the later of the baseline and a refusal, never below
        0, for a never-fed one."""
        if self.decision.wait_from is None:
            return None
        days = (self.today - self.decision.wait_from).days
        if self.item.last_feeding_date is None:
            return max(0, days)
        return days


def compute_animal_feeding_status(
    db: Session,
    animals: List[Animal],
    tz_offset_minutes: Optional[int],
) -> List[AnimalFeedingStatusItem]:
    """Feeding status for `animals`, neediest first (never-fed, then the longest
    since fed). One grouped query for the last ACCEPTED feeding per animal, one
    for "has any feeding log", and one for the newest log of either kind only
    when some owner has "refusal restarts the wait" on: no N+1.
    """
    items = [v.item for v in evaluate_animals(db, animals, tz_offset_minutes)]
    # Never-fed first, then longest-since-fed: the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items


def evaluate_animals(
    db: Session,
    animals: List[Animal],
    tz_offset_minutes: Optional[int],
) -> List[AnimalVerdict]:
    """The rows of `compute_animal_feeding_status` with their decisions, in the
    order given (unsorted). Same queries."""
    # Imported here, not at module level: routers.animals is a router module
    # and the digest service imports both.
    from app.routers.animals import _animal_feeding_interval

    if not animals:
        return []

    ids = [a.id for a in animals]
    last_by_id = {
        row[0]: row[1]
        for row in db.query(FeedingLog.animal_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.animal_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.animal_id)
        .all()
    }

    # Any log at all (accepted or refused): a refusal means the keeper is
    # logging, so no "log its first meal" nudge.
    logged_ids = {
        row[0]
        for row in db.query(FeedingLog.animal_id, func.count(FeedingLog.id))
        .filter(FeedingLog.animal_id.in_(ids))
        .group_by(FeedingLog.animal_id)
        .all()
    }

    rules_by_owner = load_feeding_rules(db, {a.user_id for a in animals})
    off = FeedingRules()
    refusal_ids = [a.id for a in animals if rules_by_owner.get(a.user_id, off).refusal_restarts_wait]
    offered_by_id = {}
    if refusal_ids:
        offered_by_id = {
            row[0]: row[1]
            for row in db.query(FeedingLog.animal_id, func.max(FeedingLog.fed_at))
            .filter(FeedingLog.animal_id.in_(refusal_ids))
            .group_by(FeedingLog.animal_id)
            .all()
        }

    now = datetime.now(timezone.utc)
    today_local = _local_date(now, tz_offset_minutes)
    cutoff = HV_FIRST_FEEDING_DUE_FROM  # read at call time

    verdicts: List[AnimalVerdict] = []
    for a in animals:
        rules = rules_by_owner.get(a.user_id, off)
        last = last_by_id.get(a.id)
        last_offered = offered_by_id.get(a.id) if rules.refusal_restarts_wait else None
        keeper_paused = is_feeding_paused(
            getattr(a, "feeding_paused_reason", None),
            getattr(a, "feeding_paused_until", None),
            today_local,
        )
        # Brumation / aestivation: the keeper has said the animal is resting
        # and won't eat. Same treatment as a pause: never due, no nudge.
        brumating = bool(getattr(a, "brumation_active", False))
        interval = _animal_feeding_interval(a)
        no_schedule = interval is None and is_plant_eater(a) and not getattr(a, "feeding_interval_days", None)

        created_at = getattr(a, "created_at", None)
        created_local = _local_date(created_at, tz_offset_minutes) if created_at else today_local
        baseline = created_local
        acquired = getattr(a, "date_acquired", None)
        if acquired is not None and acquired > baseline:
            baseline = acquired  # a future date pushes the baseline out

        decision = decide(
            last_accepted=count_day(now, last, tz_offset_minutes) if last else None,
            last_offered=offered_day(now, last, last_offered, tz_offset_minutes),
            baseline=baseline,
            interval_days=interval,
            paused=keeper_paused or brumating,
            today=today_local,
            created_local=created_local,
            cutoff=cutoff,
            refusal_restarts_wait=rules.refusal_restarts_wait,
            has_any_log=a.id in logged_ids,
        )
        days = decision.days_since_last_feeding

        item = (
            AnimalFeedingStatusItem(
                id=a.id,
                name=a.name,
                common_name=a.common_name,
                scientific_name=a.scientific_name,
                taxon=a.taxon,
                photo_url=a.photo_url,
                location=a.location,
                last_feeding_date=last,
                days_since_last_feeding=days,
                is_feeding_paused=keeper_paused,
                is_overdue=decision.is_overdue,
                interval_days=interval,
                feeds_on_cgd=bool(getattr(a, "feeds_on_cgd", False)),
                # Cadence-aware presentation: a frequent feeder (fed daily or
                # more) uses a fed-today check, not a days-since/overdue badge
                # that would sit red every morning.
                status_mode="daily" if (interval is not None and interval <= 1) else "interval",
                fed_today=days == 0,
                is_brumating=brumating,
                needs_first_feeding=decision.needs_first_feeding,
                days_since_baseline=decision.days_since_baseline,
                last_offered_date=last_offered,
                no_schedule=no_schedule,
            )
        )
        verdicts.append(AnimalVerdict(item=item, decision=decision, today=today_local))

    return verdicts
