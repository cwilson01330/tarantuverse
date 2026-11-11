"""Which feeding pushes the daily digest sends (Effortless logging, spec §5).

Pure planning, no database: `digest_service.run_feeding_digests` gathers the
due animals and hands them here, then writes one notification per planned push
through `create_notification`.

- Smart reminders on (the owner's `smart_reminders_enabled`), 1–3 TV animals
  due and NO Herpetoverse animal due: one push per animal, with the Fed /
  Refused / Tomorrow buttons (Expo `categoryId` "feeding_due"). HV has no
  action endpoint, so any HV animal due means the summary.
- Otherwise: today's summary ("N animals are due for feeding."). With the
  switch on it carries the "Open Feeding Day" button (`categoryId`
  "feeding_summary"); with it off it is exactly today's push, no category.

"Tomorrow" (`inverts.reminder_snoozed_until`) only removes an animal from the
per-animal pushes. The summary count, Feeding Day and every badge still list
it as due. When every due TV animal is snoozed and nothing in HV is due, no
push goes out — sending a summary about animals the keeper just put off until
tomorrow would undo the button.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Collection, List, Optional
from uuid import UUID

from app.schemas.invert import InvertFeedingStatusItem

# At most this many animals get a push each; more than that is one summary.
MAX_PER_ANIMAL = 3

FEEDING_DUE_CATEGORY = "feeding_due"
FEEDING_SUMMARY_CATEGORY = "feeding_summary"


@dataclass
class ReminderPush:
    title: str
    body: str
    deeplink: str
    data: dict = field(default_factory=dict)
    category_id: Optional[str] = None
    # Notification row type: "feeding_due" per animal, "feeding_digest" summary.
    type: str = "feeding_digest"


def ago_phrase(days: int) -> str:
    """"today" | "1 day ago" | "{n} days ago" (keeper-local calendar days)."""
    days = max(0, int(days))
    if days == 0:
        return "today"
    if days == 1:
        return "1 day ago"
    return f"{days} days ago"


def animal_title(animal) -> str:
    """Nickname, else common name, else scientific name. Duck-typed: a status
    item or an `Invert` row."""
    for candidate in (
        getattr(animal, "name", None),
        getattr(animal, "common_name", None),
        getattr(animal, "scientific_name", None),
    ):
        text = (candidate or "").strip()
        if text:
            return text
    return "Unnamed"


def per_animal_body(
    item: InvertFeedingStatusItem,
    tz_offset_minutes: Optional[int] = None,
    now: Optional[datetime] = None,
) -> str:
    """"Due for a meal · last ate {N}" | "· last offered {N}" | "· no meal logged yet".

    "last offered" only when the owner's refusal switch filled
    `last_offered_date` and it is later than the last meal (or there is no
    meal). Days are keeper-local calendar days, counted the way
    compute_feeding_status counts them.
    """
    # Local import: routers.inverts imports services that import this module's
    # neighbours; keeping it lazy matches services/feeding_status.py.
    from app.routers.inverts import _calendar_day_diff

    last_meal = item.last_feeding_date
    offered = item.last_offered_date
    if offered is not None and (last_meal is None or offered > last_meal):
        now = now or datetime.now(timezone.utc)
        return f"Due for a meal · last offered {ago_phrase(_calendar_day_diff(now, offered, tz_offset_minutes))}"
    if last_meal is not None and item.days_since_last_feeding is not None:
        return f"Due for a meal · last ate {ago_phrase(item.days_since_last_feeding)}"
    return "Due for a meal · no meal logged yet"


def plan_reminder_pushes(
    due: List[InvertFeedingStatusItem],
    hv_due: int,
    smart_on: bool,
    reminder_date: date,
    summary_body: str,
    *,
    snoozed_ids: Collection[UUID] = (),
    tz_offset_minutes: Optional[int] = None,
    now: Optional[datetime] = None,
) -> List[ReminderPush]:
    """The pushes for one keeper's digest run.

    `due` = every due TV animal (the owner's rule); `hv_due` = the HV count;
    `snoozed_ids` = animals still snoozed on `reminder_date` (ignored with the
    switch off). `summary_body` is today's text, built by the caller from the
    full count. Returns [] when nothing is due.
    """
    overdue = len(due) + hv_due
    if overdue <= 0:
        return []

    if smart_on and hv_due == 0:
        snoozed = set(snoozed_ids)
        awake = [i for i in due if i.id not in snoozed]
        if not awake:
            return []
        if len(awake) <= MAX_PER_ANIMAL:
            return [
                ReminderPush(
                    title=animal_title(i),
                    body=per_animal_body(i, tz_offset_minutes, now),
                    deeplink=f"/invert/{i.id}",
                    data={
                        "type": "feeding_due",
                        "invert_id": str(i.id),
                        "reminder_date": reminder_date.isoformat(),
                    },
                    category_id=FEEDING_DUE_CATEGORY,
                    type="feeding_due",
                )
                for i in awake
            ]

    return [
        ReminderPush(
            title="Feeding day",
            body=summary_body,
            deeplink="/feeding-day",
            data={"overdue": overdue},
            category_id=FEEDING_SUMMARY_CATEGORY if smart_on else None,
            type="feeding_digest",
        )
    ]
