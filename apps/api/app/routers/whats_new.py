"""What's new: the card's `unseen` list, the page's `weeks`, and "seen".

  GET  /api/v1/whats-new/?app=tarantuverse|herpetoverse -> {weeks, unseen}
  POST /api/v1/whats-new/seen  {app}                    -> {seen_through}

The highlights themselves are a committed file (app/content/whats_new.json,
loaded and validated by services/whats_new.py). What is per keeper is one
DATE per app on the user row: the newest entry they have dismissed.

Per-user, non-collection data: plain `get_current_user`, no `@policy` tag, and
deliberately not in COLLECTION_ROUTERS.

An entry dated in the future is never returned anywhere (a draft can be
committed ahead of its date). All dates are UTC calendar days.
"""
# NOTE: no `from __future__ import annotations` — slowapi's @limiter.limit
# wraps the endpoint and FastAPI must resolve the annotations (see
# routers/care_sheets.py).
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.whats_new import (
    APP_PATTERN,
    ActionOut,
    EntryOut,
    SeenRequest,
    SeenResponse,
    WeekOut,
    WhatsNewFeed,
)
from app.services.whats_new import WhatsNewEntry, load_feed, week_of
from app.utils.dependencies import get_current_user
from app.utils.rate_limit import limiter

router = APIRouter()

# Which users column holds each app's marker.
SEEN_COLUMN = {
    "tarantuverse": "whats_new_seen_tv",
    "herpetoverse": "whats_new_seen_hv",
}


def _today() -> date:
    """UTC today. A function so tests can pin it."""
    return datetime.now(timezone.utc).date()


def _newest_first(entries: Sequence[WhatsNewEntry]) -> List[WhatsNewEntry]:
    return sorted(entries, key=lambda e: (-e.published_on.toordinal(), e.id))


def live_entries(entries: Sequence[WhatsNewEntry], today: date) -> List[WhatsNewEntry]:
    """Entries published on or before ``today``, newest first."""
    return _newest_first([e for e in entries if e.published_on <= today])


def compute_unseen(
    entries: Sequence[WhatsNewEntry],
    *,
    signed_up_on: date,
    seen_through: Optional[date],
    today: date,
) -> List[WhatsNewEntry]:
    """What the Home card shows.

    Live entries published after both the keeper's signup day and their seen
    marker, limited to the two most recent weeks (the newest live entry's ISO
    week and the one before it). Newest first.
    """
    live = live_entries(entries, today)
    if not live:
        return []
    cutoff = signed_up_on if seen_through is None else max(signed_up_on, seen_through)
    earliest = week_of(live[0].published_on) - timedelta(days=7)
    return [e for e in live if e.published_on > cutoff and e.published_on >= earliest]


def _entry_out(e: WhatsNewEntry) -> EntryOut:
    action = (
        ActionOut(label=e.action_label, target=e.action_target)
        if e.action_label is not None and e.action_target is not None
        else None
    )
    return EntryOut(
        id=e.id,
        published_on=e.published_on,
        title=e.title,
        body=e.body,
        premium=e.premium,
        action=action,
    )


def _signed_up_on(user: User, today: date) -> date:
    created = user.created_at
    if created is None:
        return today
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(timezone.utc).date()


def _weeks(live: Sequence[WhatsNewEntry]) -> List[WeekOut]:
    grouped: Dict[date, List[WhatsNewEntry]] = {}
    for e in live:  # already newest first
        grouped.setdefault(week_of(e.published_on), []).append(e)
    return [
        WeekOut(week_of=monday, entries=[_entry_out(e) for e in items])
        for monday, items in sorted(grouped.items(), reverse=True)
    ]


@router.get("/", response_model=WhatsNewFeed)
async def get_whats_new(
    app: str = Query(..., pattern=APP_PATTERN),
    current_user: User = Depends(get_current_user),
):
    today = _today()
    entries = load_feed()[app]
    seen_through = getattr(current_user, SEEN_COLUMN[app])
    unseen = compute_unseen(
        entries,
        signed_up_on=_signed_up_on(current_user, today),
        seen_through=seen_through,
        today=today,
    )
    return WhatsNewFeed(
        weeks=_weeks(live_entries(entries, today)),
        unseen=[_entry_out(e) for e in unseen],
    )


@router.post("/seen", response_model=SeenResponse)
@limiter.limit("30/minute")
async def mark_seen(
    request: Request,
    body: SeenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dismiss: remember the newest live entry. Idempotent, never backwards
    (the file may be edited to drop an entry keepers have already dismissed)."""
    column = SEEN_COLUMN[body.app]
    live = live_entries(load_feed()[body.app], _today())
    current = getattr(current_user, column)
    if live:
        newest = live[0].published_on
        if current is None or newest > current:
            setattr(current_user, column, newest)
            db.commit()
            db.refresh(current_user)
    return SeenResponse(seen_through=getattr(current_user, column))
