"""Push a support message into the Notion Feedback database.

WHY THIS EXISTS
---------------
Keeper reports arrive as direct messages and then live only in a DM thread,
where they're impossible to search across and easy to lose. The value of a
feedback log isn't any single report — it's noticing the same complaint arriving
a third time. That only works if reports end up somewhere they can sit next to
each other.

DELIBERATELY MANUAL
-------------------
This fires when an admin presses a button, not automatically on every DM. Most
messages aren't feedback, and a log that's mostly noise stops being read. The
press IS the triage decision.

PRIVACY
-------
This sends a keeper's words and display name to a third party. Two consequences
worth remembering:

  - Only send what's needed. The message body and who said it, nothing else —
    no email, no user id, no collection data.
  - A keeper who asks to be deleted now has data in a second place, and neither
    `export_service` nor the account-deletion flow reaches Notion. Removing the
    Notion row is a manual step in that process.

FAILURE BEHAVIOUR
-----------------
Never raises into the caller's transaction. A Notion outage must not break
messaging or lose the message — the DM is still the source of truth, and the
button can be pressed again later.
"""
import logging
from datetime import date
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

NOTION_API = "https://api.notion.com/v1/pages"

# Pinned rather than tracking latest. Notion's newer versions changed page
# creation to address data sources instead of databases; upgrading is a
# deliberate change, not something to inherit silently on their release day.
NOTION_VERSION = "2022-06-28"

# Must match the Source select options in the Feedback database exactly —
# Notion rejects an unknown option rather than creating it.
SOURCE_DIRECT_MESSAGE = "Direct message"
SOURCE_SUPPORT = "Support request"


class NotionNotConfigured(Exception):
    """Raised when the caller asks for Notion and the token or database is unset.

    Distinct from a delivery failure: this one is worth telling the admin about
    plainly, because it means setup was never finished rather than that Notion
    is having a bad day.
    """


def is_configured() -> bool:
    return bool(settings.NOTION_TOKEN and settings.NOTION_FEEDBACK_DATABASE_ID)


def metrics_configured() -> bool:
    return bool(settings.NOTION_TOKEN and settings.NOTION_METRICS_DATABASE_ID)


def _post(payload: dict) -> Optional[str]:
    """POST a page to Notion. Returns the page URL, or None on any failure.

    Shared by both writers so retry, timeout and error-logging behave the same
    whichever one called.
    """
    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                NOTION_API,
                headers={
                    "Authorization": f"Bearer {settings.NOTION_TOKEN}",
                    "Notion-Version": NOTION_VERSION,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code >= 400:
            # Log the body — Notion's errors name the offending property, which
            # is the difference between a two-minute fix and an afternoon.
            logger.error(
                "Notion create failed (%s): %s",
                response.status_code,
                response.text[:500],
            )
            return None
        return response.json().get("url")
    except httpx.HTTPError as e:
        logger.error("Notion create errored: %s", e)
        return None


def _rich_text(value: str) -> dict:
    # Notion rejects rich_text content over 2000 characters per block. Truncate
    # with a marker rather than letting the whole request 400 — a long message
    # is exactly the kind worth capturing.
    text = value if len(value) <= 1900 else value[:1900] + "\n\n[…truncated, see the full message in the app]"
    return {"rich_text": [{"text": {"content": text}}]}


def send_feedback(
    *,
    summary: str,
    message: str,
    keeper: str,
    product: str = "Tarantuverse",
    source: str = SOURCE_DIRECT_MESSAGE,
    received: Optional[date] = None,
) -> Optional[str]:
    """Create a Feedback row. Returns the Notion page URL, or None on failure.

    `summary` becomes the title — the admin's words. `message` goes in the page
    body verbatim, because a paraphrase loses the thing that makes a report
    useful later.
    """
    if not is_configured():
        raise NotionNotConfigured(
            "NOTION_TOKEN and NOTION_FEEDBACK_DATABASE_ID must be set."
        )

    payload = {
        "parent": {"database_id": settings.NOTION_FEEDBACK_DATABASE_ID},
        "properties": {
            "Name": {"title": [{"text": {"content": summary[:200]}}]},
            "Keeper": _rich_text(keeper),
            "Source": {"select": {"name": source}},
            "Product": {"select": {"name": product}},
            "Received": {"date": {"start": (received or date.today()).isoformat()}},
            # Always New. Triage is a judgement made later, in Notion, with the
            # other reports visible — not at the moment of capture.
            "Triage": {"select": {"name": "New"}},
        },
        "children": [
            {
                "object": "block",
                "type": "quote",
                "quote": _rich_text(message),
            }
        ],
    }

    return _post(payload)


def _num(value) -> dict:
    """Notion rejects NaN and infinity. Anything unusable becomes null rather
    than failing the whole snapshot over one bad figure."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return {"number": None}
    if f != f or f in (float("inf"), float("-inf")):
        return {"number": None}
    return {"number": f}


def has_snapshot_for(day: date) -> bool:
    """True if the Metrics database already holds a row for this date.

    Only the cron uses this. A human pressing the button twice is making two
    deliberate observations and both are kept; an automated job firing twice is
    noise, and a time series with random duplicate days is harder to read and
    easy to misinterpret as activity.

    Fails OPEN — on any error this returns False so the snapshot still gets
    written. A duplicate row is a nuisance; a silently missing day is a hole in
    the history that can never be filled.
    """
    if not metrics_configured():
        return False
    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                f"https://api.notion.com/v1/databases/{settings.NOTION_METRICS_DATABASE_ID}/query",
                headers={
                    "Authorization": f"Bearer {settings.NOTION_TOKEN}",
                    "Notion-Version": NOTION_VERSION,
                    "Content-Type": "application/json",
                },
                json={
                    "filter": {"property": "Date", "date": {"equals": day.isoformat()}},
                    "page_size": 1,
                },
            )
        if response.status_code >= 400:
            logger.warning(
                "Notion duplicate check failed (%s) — writing anyway", response.status_code
            )
            return False
        return bool(response.json().get("results"))
    except httpx.HTTPError as e:
        logger.warning("Notion duplicate check errored (%s) — writing anyway", e)
        return False


def send_metrics_snapshot(overview, *, on_date: Optional[date] = None) -> Optional[str]:
    """Append one row to the Metrics database from an AdminAnalyticsOverview.

    WHY SNAPSHOT AT ALL, given there's already a dashboard: the database knows
    what is true now, not what was true in June. Nothing retains history, so
    questions like "did the taxa expansion move signups" are unanswerable after
    the fact. Each row is a fact that can't be recovered later if it isn't
    written down at the time.

    Append-only and not deduplicated by design. Two snapshots in one day are
    two honest observations, and silently overwriting one would be a small lie
    about when a number was taken. `Captured` records the real time.
    """
    if not metrics_configured():
        raise NotionNotConfigured(
            "NOTION_TOKEN and NOTION_METRICS_DATABASE_ID must be set."
        )

    day = on_date or date.today()

    return _post({
        "parent": {"database_id": settings.NOTION_METRICS_DATABASE_ID},
        "properties": {
            "Name": {"title": [{"text": {"content": day.isoformat()}}]},
            "Date": {"date": {"start": day.isoformat()}},
            "Total users": _num(overview.total_users),
            "Active 7d": _num(overview.active_users_7d),
            "Active 30d": _num(overview.active_users_30d),
            "New users 7d": _num(overview.new_users_7d),
            "Premium users": _num(overview.total_premium_users),
            # Kept alongside the total rather than replacing it. Premium users
            # counts comps and payers together, so on its own it rises whenever
            # comps are handed out and reads as conversion. The split is what
            # makes the line interpretable a year from now.
            "Paying": _num(getattr(overview, "paying_subscribers", None)),
            "Comped": _num(getattr(overview, "comped_subscribers", None)),
            "Unknown source": _num(getattr(overview, "subscribers_unknown_source", None)),
            # Recorded alongside MRR, not instead of it. A month from now the
            # question "why did revenue dip in August" is only answerable if
            # the leaving was written down at the time.
            "Cancelling": _num(getattr(overview, "cancelling_subscribers", None)),
            "MRR winding down": _num(getattr(overview, "mrr_winding_down", None)),
            "MRR": _num(overview.mrr),
            "Conversion rate": _num(overview.subscription_conversion_rate),
            # total_collection is the honest cross-product figure. total_tarantulas
            # counts only the legacy table and is deliberately not sent — it
            # under-reports every non-tarantula taxon and would read as decline.
            "Total collection": _num(overview.total_collection),
            "Inverts": _num(overview.total_inverts),
            "HV animals": _num(overview.total_animals),
            "Colonies": _num(overview.total_colonies),
            "Feedings today": _num(overview.total_feedings_today),
            "Forum threads": _num(overview.total_forum_threads),
            "Forum posts": _num(overview.total_forum_posts),
        },
    })
