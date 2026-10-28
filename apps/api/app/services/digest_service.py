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

Opt-in email: after the in-app notification, a keeper with
`email_digest_enabled` (active, real address, not already emailed this UTC day)
gets a `DigestEmail` in the result's "emails". The caller sends them
(services/digest_email.py::send_digest_emails) — the run itself stays synchronous.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.models.feeding_log import FeedingLog
from app.models.animal import Animal
from app.schemas.invert import InvertFeedingStatusItem
from app.utils.limits import active_animals_query, active_inverts_query
from app.services.feeding_status import compute_feeding_status
from app.services.notification_service import create_notification
from app.services.digest_email import MAX_NAMES, DigestEmail, display_name, is_reachable_address
# HV (`animals`) keeps its own overdue engine; TV goes through
# compute_feeding_status, the same function Feeding Day uses.
from app.routers.inverts import _calendar_day_diff
from app.routers.animals import _animal_feeding_interval


def _overdue_items(db: Session, user_id, tz_offset: Optional[int]) -> List[InvertFeedingStatusItem]:
    """The user's due TV animals (active inverts only), by the one feeding rule:
    keeper cadence, paused/grazers excluded, and never-fed animals created on or
    after the release cutoff once a full interval has passed since their
    baseline (services/feeding_status.py)."""
    inverts = active_inverts_query(db, user_id).all()
    return [s for s in compute_feeding_status(db, inverts, tz_offset) if s.is_overdue]


def _overdue_count(db: Session, user_id, tz_offset: Optional[int]) -> int:
    return len(_overdue_items(db, user_id, tz_offset))


def _animal_overdue_count(db: Session, user_id, tz_offset: Optional[int]) -> int:
    """Overdue reptiles/amphibians (HV) for one user — the `animals` mirror of
    _overdue_count, using the animal cadence resolver. Never-fed is NOT counted
    (consistent with /animals/feeding-status + the dashboard)."""
    # Route through the shared helper rather than re-stating the filter. This
    # inlined copy already had to be updated separately every time the
    # definition of "active" changed, and ADR-015 added deceased animals to it —
    # a digest that nags about an animal that died would be the worst possible
    # notification this app could send.
    animals = (
        active_animals_query(db, user_id)
        .options(selectinload(Animal.herp_species))
        .all()
    )
    if not animals:
        return 0
    ids = [a.id for a in animals]
    rows = (
        db.query(FeedingLog.animal_id, func.max(FeedingLog.fed_at))
        .filter(FeedingLog.animal_id.in_(ids), FeedingLog.accepted.is_(True))
        .group_by(FeedingLog.animal_id)
        .all()
    )
    last_by = {r[0]: r[1] for r in rows}

    now = datetime.now(timezone.utc)
    today_local = (now + timedelta(minutes=-(tz_offset or 0))).date()

    count = 0
    for a in animals:
        if a.feeding_paused_reason and (
            a.feeding_paused_until is None or a.feeding_paused_until >= today_local
        ):
            continue
        # Brumating animals don't eat; the app tells keepers reminders are
        # silenced during brumation, so the digest must not count them.
        if getattr(a, "brumation_active", False):
            continue
        interval = _animal_feeding_interval(a)
        if interval is None:
            continue
        last = last_by.get(a.id)
        if last is not None and _calendar_day_diff(now, last, tz_offset) >= interval:
            count += 1
    return count


def run_feeding_digests(
    db: Session,
    only_user_id: Optional[str] = None,
    ignore_schedule: bool = False,
) -> dict:
    """Send one feeding digest per eligible user at their local digest_hour.

    Returns {"checked", "sent", "emails": [DigestEmail, ...]}; the emails are
    only COLLECTED here — the caller awaits send_digest_emails.

    Test hooks (secret-gated at the endpoint): `only_user_id` restricts to one
    user, and `ignore_schedule` bypasses the hour + already-sent-today gates so a
    digest can be fired on demand for verification.
    """
    now = datetime.now(timezone.utc)
    utc_today = now.date()
    checked = 0
    sent = 0
    emails: List[DigestEmail] = []

    # Deactivated accounts get nothing: no notification, no push, no email.
    q = (
        db.query(NotificationPreferences)
        .join(User, User.id == NotificationPreferences.user_id)
        .filter(
            NotificationPreferences.daily_digest_enabled.is_(True),
            User.is_active.is_(True),
        )
    )
    if only_user_id is not None:
        try:
            q = q.filter(NotificationPreferences.user_id == uuid.UUID(str(only_user_id)))
        except (ValueError, AttributeError):
            return {"checked": 0, "sent": 0, "emails": [], "error": "invalid user id"}

    for prefs in q.all():
        tz = prefs.tz_offset_minutes
        local = now + timedelta(minutes=-(tz or 0))
        if not ignore_schedule:
            if prefs.digest_hour is not None and local.hour != prefs.digest_hour:
                continue
            if prefs.last_digest_sent_on == local.date():
                continue

        checked += 1
        # Mark processed today up front so a mid-loop error can't double-fire.
        # Skipped in test mode so a manual run doesn't lock out the real one.
        if not ignore_schedule:
            prefs.last_digest_sent_on = local.date()
            db.commit()

        # Count both platforms — a shared account may hold inverts (TV) and/or
        # reptiles (HV); one combined "N due" digest covers whatever they keep.
        items = _overdue_items(db, prefs.user_id, tz)
        overdue = len(items) + _animal_overdue_count(db, prefs.user_id, tz)
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

            # Opt-in email. Never twice in one UTC day, even in test mode.
            user = prefs.user
            if (
                prefs.email_digest_enabled
                and prefs.email_digest_last_sent_on != utc_today
                and user is not None
                and is_reachable_address(user)
            ):
                emails.append(
                    DigestEmail(
                        user_id=prefs.user_id,
                        to=user.email,
                        due_count=overdue,
                        names=[
                            display_name(i.name, i.common_name, i.scientific_name)
                            for i in items[:MAX_NAMES]
                        ],
                    )
                )

    return {"checked": checked, "sent": sent, "emails": emails}
