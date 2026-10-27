"""Cross-taxon feeding status: the one place that decides who is due.

Extracted verbatim from `GET /inverts/feeding-status` so Feeding Day and the
analytics "right now" fields (`/analytics/collection`) run the SAME rule and can
never disagree about who is overdue.

is_overdue is species + life-stage aware: an animal is overdue when it has been
fed at least once and days-since-last-feeding has reached its recommended
interval (the keeper's own cadence, else the species' per-stage feeding
frequency, else a stage default). Never-fed animals, paused animals and
animals with no cadence (detritivores) are never flagged.

Callers decide WHICH animals to pass in (access scoping stays in the route).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.feeding_log import FeedingLog
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.schemas.invert import InvertFeedingStatusItem


def compute_feeding_status(
    db: Session,
    inverts: List[Invert],
    tz_offset_minutes: Optional[int],
) -> List[InvertFeedingStatusItem]:
    """Feeding status for `inverts`, neediest first (never-fed, then the longest
    since fed). One grouped query for the last ACCEPTED feeding per animal and
    one batched species load: no N+1.
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

    # Batch-load the species referenced by this collection (avoid N+1).
    species_ids = {inv.species_id for inv in inverts if inv.species_id}
    species_by_id = {}
    if species_ids:
        species_by_id = {
            sp.id: sp
            for sp in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids)).all()
        }

    now = datetime.now(timezone.utc)
    today_local = (
        (now + timedelta(minutes=-(tz_offset_minutes or 0))).date()
        if tz_offset_minutes is not None
        else now.date()
    )

    items: List[InvertFeedingStatusItem] = []
    for inv in inverts:
        last = last_by_id.get(inv.id)
        days = _calendar_day_diff(now, last, tz_offset_minutes) if last else None
        paused = bool(
            inv.feeding_paused_reason
            and (inv.feeding_paused_until is None or inv.feeding_paused_until >= today_local)
        )
        species = species_by_id.get(inv.species_id) if inv.species_id else None
        interval, interval_source = _recommended_feeding_interval_with_source(
            inv.life_stage, species, inv.feeding_interval_days, taxon=inv.taxon
        )
        # Never-fed animals are NOT "overdue" — no feeding has established a
        # cadence yet, so flagging them (esp. in a push digest) is noise. Kept
        # in lockstep with digest_service and /animals/feeding-status.
        is_overdue = (
            (not paused)
            and interval is not None
            and last is not None
            and days is not None
            and days >= interval
        )
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
                interval_days=interval,
                interval_source=interval_source,
            )
        )

    # Never-fed first, then longest-since-fed, so the neediest float to the top.
    items.sort(
        key=lambda x: (0 if x.days_since_last_feeding is None else 1, -(x.days_since_last_feeding or 0))
    )
    return items
