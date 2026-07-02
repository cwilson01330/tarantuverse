"""
Daily care digest (ADR-009 Phase 3) — the anti-spam replacement for per-animal
feeding pings.

`run_feeding_digests` is called once/hour by a Render Cron job (via the
secret-gated /notifications/run-digests endpoint). For each user whose local
hour matches their digest_hour and who hasn't been processed yet today, it
counts overdue animals with the SAME species/life-stage-aware engine the Feeding
Day screen uses, and — only if something is due — writes ONE notification
("N animals are due for feeding") which pushes best-effort. Never nags when
nothing is due.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.notification_preferences import NotificationPreferences
from app.models.invert_species import InvertSpecies
from app.models.feeding_log import FeedingLog
from app.utils.limits import active_inverts_query
from app.services.notification_service import create_notification
# Reuse the overdue engine that powers /inverts/feeding-status (Feeding Day).
from app.routers.inverts import _recommended_feeding_interval, _calendar_day_diff


def _overdue_count(db: Session, user_id, tz_offset: Optional[int]) -> int:
    inverts = active_inverts_query(db, user_id).all()
    if not inverts:
        return 0
    ids = [i.id for i in inverts]
    rows = (
        db.query(FeedingLog.invert_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.invert_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.invert_id)
        .all()
    )
    last_by = {r[0]: r[1] for r in rows}

    species_ids = {i.species_id for i in inverts if i.species_id}
    species_by = {}
    if species_ids:
        species_by = {
            s.id: s
            for s in db.query(InvertSpecies).filter(InvertSpecies.id.in_(species_ids)).all()
        }

    now = datetime.now(timezone.utc)
    today_local = (now + timedelta(minutes=-(tz_offset or 0))).date()

    count = 0
    for inv in inverts:
        # Paused animals never count as overdue.
        if inv.feeding_paused_reason and (
            inv.feeding_paused_until is None or inv.feeding_paused_until >= today_local
        ):
            continue
        interval = _recommended_feeding_interval(
            inv.life_stage, species_by.get(inv.species_id) if inv.species_id else None
        )
        if interval is None:
            continue  # detritivore — no live-prey cadence
        last = last_by.get(inv.id)
        if last is None:
            count += 1
        elif _calendar_day_diff(now, last, tz_offset) >= interval:
            count += 1
    return count


def run_feeding_digests(db: Session) -> dict:
    """Send one feeding digest per eligible user at their local digest_hour."""
    now = datetime.now(timezone.utc)
    checked = 0
    sent = 0

    prefs_list = (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.daily_digest_enabled.is_(True))
        .all()
    )
    for prefs in prefs_list:
        tz = prefs.tz_offset_minutes
        local = now + timedelta(minutes=-(tz or 0))
        if prefs.digest_hour is not None and local.hour != prefs.digest_hour:
            continue
        if prefs.last_digest_sent_on == local.date():
            continue

        checked += 1
        # Mark processed today up front so a mid-loop error can't double-fire.
        prefs.last_digest_sent_on = local.date()
        db.commit()

        overdue = _overdue_count(db, prefs.user_id, tz)
        if overdue > 0:
            create_notification(
                db,
                user_id=prefs.user_id,
                type="feeding_digest",
                title="Feeding day",
                body=f"{overdue} {'animal is' if overdue == 1 else 'animals are'} due for feeding.",
                deeplink="/feeding-day",
                data={"overdue": overdue},
                push=True,
                push_category=None,
            )
            sent += 1

    return {"checked": checked, "sent": sent}
