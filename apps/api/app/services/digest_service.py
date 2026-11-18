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

Per app (HV day one, spec §5 calls 4 and 6, §7): Tarantuverse animals
(inverts) and Herpetoverse animals are reminded on their own app, each planned
on its own. TV's plan is computed from TV animals alone and sent exactly as
before (no `app` = tarantuverse); HV's plan comes from HV animals and HV
snoozes and goes out with `app="herpetoverse"`.

Opt-in email: after the in-app notification, a keeper with
`email_digest_enabled` (active, real address) gets one `DigestEmail` per app
with something due, unless that app's email already went out this UTC day
(`email_digest_last_sent_on` for TV, `email_digest_last_sent_on_hv` for HV).
The caller sends them (services/digest_email.py::send_digest_emails) — the run
itself stays synchronous.

Per-animal reminders (Effortless logging; HV in Step 2): with the keeper's
`smart_reminders_enabled` on (one switch per account) and 1–3 due animals in
an app, the run sends one notification per animal on that app (Fed / Refused /
Tomorrow buttons; TV data `invert_id` + `/invert/<id>`, HV `animal_id` +
`/reptile/<id>`) instead of that app's summary; animals snoozed with
"Tomorrow" are left out of those. The choice lives in
services/reminder_pushes.py. With the switch off each app's summary call is
exactly what it was before.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session, selectinload

from app.models.notification_preferences import NotificationPreferences
from app.models.user import User
from app.models.animal import Animal
from app.models.push_token import PushToken
from app.models.invert import Invert
from app.schemas.invert import InvertFeedingStatusItem
from app.utils.limits import active_animals_query, active_inverts_query
from app.services.feeding_status import compute_feeding_status
from app.services.notification_service import create_notification
from app.services.digest_email import (
    APP_HERPETOVERSE,
    APP_TARANTUVERSE,
    MAX_NAMES,
    DigestEmail,
    display_name,
    is_reachable_address,
)
from app.services.reminder_pushes import ReminderPush, plan_reminder_pushes
# HV (`animals`) goes through compute_animal_feeding_status and TV through
# compute_feeding_status — each the same function its Feeding Day uses, both on
# the one due-date core (services/feeding_rule.py).
from app.schemas.animal import AnimalFeedingStatusItem
from app.services.animal_feeding_status import compute_animal_feeding_status


def _overdue_items(db: Session, user_id, tz_offset: Optional[int]) -> List[InvertFeedingStatusItem]:
    """The user's due TV animals (active inverts only), by the one feeding rule:
    keeper cadence, paused/grazers excluded, and never-fed animals created on or
    after the release cutoff once a full interval has passed since their
    baseline (services/feeding_status.py)."""
    inverts = active_inverts_query(db, user_id).all()
    return [s for s in compute_feeding_status(db, inverts, tz_offset) if s.is_overdue]


def _overdue_count(db: Session, user_id, tz_offset: Optional[int]) -> int:
    return len(_overdue_items(db, user_id, tz_offset))


def _snoozed_ids(db: Session, items: List[InvertFeedingStatusItem], local_today) -> set:
    """Due animals the keeper put off with "Tomorrow".

    `reminder_snoozed_until` is the day reminders RESUME ("no reminder until
    this local date"): "Tomorrow" stores today + 1, so tomorrow's digest
    reminds again — strictly greater than today means still snoozed. (Spec §5
    wrote ">="; that would skip tomorrow's digest too and break "We'll remind
    you tomorrow".)"""
    if not items:
        return set()
    rows = (
        db.query(Invert.id)
        .filter(
            Invert.id.in_([i.id for i in items]),
            Invert.reminder_snoozed_until.isnot(None),
            Invert.reminder_snoozed_until > local_today,
        )
        .all()
    )
    return {r[0] for r in rows}


def _animal_snoozed_ids(db: Session, items: List[AnimalFeedingStatusItem], local_today) -> set:
    """Due HV animals put off with "Tomorrow" — `_snoozed_ids` for `animals`
    (reminders resume ON the stored day, so strictly greater = still snoozed)."""
    if not items:
        return set()
    rows = (
        db.query(Animal.id)
        .filter(
            Animal.id.in_([i.id for i in items]),
            Animal.reminder_snoozed_until.isnot(None),
            Animal.reminder_snoozed_until > local_today,
        )
        .all()
    )
    return {r[0] for r in rows}


def _animal_overdue_items(db: Session, user_id, tz_offset: Optional[int]) -> List[AnimalFeedingStatusItem]:
    """The user's due HV animals (reptiles/amphibians) by the one HV rule
    (services/animal_feeding_status.py, on the core TV uses): the same verdict
    Feeding Day, the dashboard and the per-animal status give. Paused,
    brumating and plant-eaters without a keeper interval never count; a
    never-fed animal counts only when created on/after the HV cutoff and past
    its interval."""
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
    return [s for s in compute_animal_feeding_status(db, animals, tz_offset) if s.is_overdue]


def _animal_overdue_count(db: Session, user_id, tz_offset: Optional[int]) -> int:
    return len(_animal_overdue_items(db, user_id, tz_offset))


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

        # Each app gets its own reminders on its own app (spec §5 call 4): a
        # shared account may hold inverts (TV) and/or reptiles (HV).
        items = _overdue_items(db, prefs.user_id, tz)
        hv_items = _animal_overdue_items(db, prefs.user_id, tz)
        if not items and not hv_items:
            continue

        # (push, app) — app None = tarantuverse, left off the call.
        pushes: List[Tuple[ReminderPush, Optional[str]]] = []
        smart_on = bool(getattr(prefs, "smart_reminders_enabled", False))
        local_today = local.date()
        if items:
            # TV: exactly the plan it had before HV was split off (HV no longer
            # forces TV's per-animal reminders into a summary — each app is
            # planned on its own). No `app` kwarg = tarantuverse, so the call
            # stays byte-for-byte what it was.
            overdue = len(items)
            tv_pushes = plan_reminder_pushes(
                items,
                0,
                smart_on,
                local_today,
                _summary_body(overdue),
                snoozed_ids=_snoozed_ids(db, items, local_today) if smart_on else (),
                tz_offset_minutes=tz,
                now=now,
            )
            pushes += [(p, None) for p in tv_pushes]
        if hv_items:
            # Per-animal HV pushes (animal_id, /reptile/<id>, Fed/Refused/
            # Tomorrow buttons) only when the account has its OWN Herpetoverse
            # address: without one the push falls back to the Tarantuverse
            # app, whose bridge only understands invert_id. No HV address =
            # exactly the switch-off output (the plain HV summary).
            hv_smart = smart_on and _has_hv_address(db, prefs.user_id)
            # HV: the same planner on HV animals and HV snoozes (spec §7) —
            # per-animal pushes (animal_id, /reptile/<id>) or the HV summary,
            # all on the HV app. Switch off = the Step 1 summary exactly.
            hv_pushes = plan_reminder_pushes(
                hv_items,
                0,
                hv_smart,
                local_today,
                _summary_body(len(hv_items)),
                snoozed_ids=_animal_snoozed_ids(db, hv_items, local_today) if hv_smart else (),
                tz_offset_minutes=tz,
                now=now,
                id_key="animal_id",
                deeplink_prefix="/reptile/",
            )
            pushes += [(p, APP_HERPETOVERSE) for p in hv_pushes]

        for p, app in pushes:
            kwargs = dict(
                user_id=prefs.user_id,
                type=p.type,
                title=p.title,
                body=p.body,
                deeplink=p.deeplink,
                data=p.data,
                push=True,
                push_category=None,
            )
            # Only with a category, so the switch-off call is exactly today's.
            if p.category_id:
                kwargs["push_category_id"] = p.category_id
            if app:
                kwargs["app"] = app
            create_notification(db, **kwargs)
        if pushes:
            sent += 1

        # Opt-in email, one per app with something due. Each app's has its own
        # once-a-UTC-day guard, enforced even in test mode.
        user = prefs.user
        if (
            prefs.email_digest_enabled
            and user is not None
            and is_reachable_address(user)
        ):
            for email_app, due, last_sent in (
                (APP_TARANTUVERSE, items, prefs.email_digest_last_sent_on),
                (APP_HERPETOVERSE, hv_items, prefs.email_digest_last_sent_on_hv),
            ):
                if not due or last_sent == utc_today:
                    continue
                emails.append(
                    DigestEmail(
                        user_id=prefs.user_id,
                        to=user.email,
                        due_count=len(due),
                        names=[
                            display_name(i.name, i.common_name, i.scientific_name)
                            for i in due[:MAX_NAMES]
                        ],
                        app=email_app,
                    )
                )

    return {"checked": checked, "sent": sent, "emails": emails}


def _has_hv_address(db: Session, user_id) -> bool:
    """True when the account has its own Herpetoverse push_tokens row."""
    return (
        db.query(PushToken.id)
        .filter(
            PushToken.user_id == user_id,
            PushToken.app == APP_HERPETOVERSE,
            PushToken.token != "",
        )
        .first()
        is not None
    )


def _summary_body(overdue: int) -> str:
    return f"{overdue} {'animal is' if overdue == 1 else 'animals are'} due for feeding."

