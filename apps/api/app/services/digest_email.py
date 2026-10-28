"""Opt-in daily email version of the feeding digest.

`run_feeding_digests` (services/digest_service.py) decides WHO gets an email and
hands back `DigestEmail`s; the cron endpoint then awaits `send_digest_emails`.
Sending is kept out of the synchronous digest loop on purpose: it is async,
rate-limited by Resend (2 requests/second) and capped per day.

Privacy and safety rules, all enforced here or in the digest loop:
  * opt-in only (`email_digest_enabled`), active accounts only, and never a
    merged (`@merged.invalid`) or automated test-domain address;
  * at most one email per person per UTC day and `DIGEST_EMAIL_DAILY_CAP` per day;
  * every user-provided value in the HTML is escaped; the only data in any URL is
    the signed unsubscribe token;
  * nothing logs an address or a body.
"""
from __future__ import annotations

import asyncio
import html
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List

from sqlalchemy.orm import Session

from app.config import settings
from app.models.notification_preferences import NotificationPreferences
from app.services.email import EmailService
from app.utils.digest_unsubscribe_token import make_unsubscribe_token
from app.utils.frontend_origin import TARANTUVERSE, resolve_frontend_origin
from app.utils.test_accounts import is_test_account

logger = logging.getLogger(__name__)

MAX_NAMES = 10
# Resend allows 2 requests/second.
SEND_PAUSE_SECONDS = 0.6
MERGED_SUFFIX = "@merged.invalid"


@dataclass
class DigestEmail:
    user_id: uuid.UUID
    to: str = field(repr=False)  # an address: never let a stray log of the object print it
    due_count: int
    names: List[str] = field(default_factory=list)


def display_name(name, common_name, scientific_name) -> str:
    """What to call an animal in the email: nickname, else common, else scientific."""
    for candidate in (name, common_name, scientific_name):
        text = (candidate or "").strip()
        if text:
            return text
    return "Unnamed"


def is_reachable_address(user) -> bool:
    """True when a real person can be emailed: an active account whose address
    is neither a retired merge placeholder nor an automated test-lab account."""
    email = (getattr(user, "email", None) or "").strip().lower()
    if not email or not getattr(user, "is_active", False):
        return False
    if email.endswith(MERGED_SUFFIX):
        return False
    return not is_test_account(email)


def _headline(due_count: int) -> str:
    return "1 animal is due to eat today" if due_count == 1 else f"{due_count} animals are due to eat today"


def _build(email: DigestEmail) -> tuple[str, str, dict]:
    origin = resolve_frontend_origin(None)
    token = make_unsubscribe_token(email.user_id)
    feeding_day = f"{origin}/dashboard/feeding-day"
    unsubscribe = f"{origin}/unsubscribe/{token}"
    settings_link = f"{origin}/dashboard/settings/notifications"
    api = settings.API_PUBLIC_URL.rstrip("/")
    list_unsubscribe = f"<{api}/api/v1/notification-preferences/email-unsubscribe?token={token}>"

    subject = _headline(email.due_count)
    names = email.names[:MAX_NAMES]
    items = "".join(f"<li>{html.escape(n)}</li>" for n in names)
    more = email.due_count - len(names)
    names_block = ""
    if names:
        extra = f"<p>and {more} more.</p>" if more > 0 else ""
        names_block = f'<ul style="padding-left: 20px;">{items}</ul>{extra}'

    body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>{html.escape(subject)}</h2>
            {names_block}
            <p style="margin: 20px 0;">
                <a href="{html.escape(feeding_day)}" style="background-color: {TARANTUVERSE.button_hex}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Open Feeding Day
                </a>
            </p>
            <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #666; font-size: 12px;">
                You're getting this because you turned on daily email reminders.
                <a href="{html.escape(unsubscribe)}">Unsubscribe</a> &middot;
                <a href="{html.escape(settings_link)}">Reminder settings</a>
            </p>
        </div>
        """
    headers = {
        "List-Unsubscribe": list_unsubscribe,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    return subject, body, headers


async def send_digest_emails(db: Session, emails: List[DigestEmail]) -> int:
    """Send the collected digest emails; returns how many went out.

    Applies the daily cap (rows already stamped with today's UTC date count),
    re-checks opt-in and the one-per-UTC-day rule against the live row, stamps
    `email_digest_last_sent_on` after each successful send, and skips (logging
    no address) any send that fails.
    """
    if not emails:
        return 0

    # The unsubscribe link and Feeding Day button are built from the frontend
    # origin. A misconfigured (non-https, e.g. localhost) origin would put dead
    # links in a real keeper's inbox, so send nothing this run.
    if not resolve_frontend_origin(None).startswith("https://"):
        logger.warning(
            "Daily digest emails skipped: FRONTEND_URL is not https (%d email(s) not sent)",
            len(emails),
        )
        return 0

    today = datetime.now(timezone.utc).date()
    already = (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.email_digest_last_sent_on == today)
        .count()
    )
    remaining = max(0, int(settings.DIGEST_EMAIL_DAILY_CAP) - already)

    sent = 0
    attempted = 0
    capped = 0
    failed = 0
    for email in emails:
        if remaining <= 0:
            capped += 1
            continue
        prefs = (
            db.query(NotificationPreferences)
            .populate_existing()
            .filter(NotificationPreferences.user_id == email.user_id)
            .first()
        )
        if (
            prefs is None
            or not prefs.email_digest_enabled
            or prefs.email_digest_last_sent_on == today
        ):
            continue

        if attempted:
            await asyncio.sleep(SEND_PAUSE_SECONDS)
        attempted += 1
        subject, body, headers = _build(email)
        try:
            await EmailService.send_email(email.to, subject, body, headers=headers)
        except Exception:
            failed += 1
            logger.error("Daily digest email failed to send (user %s)", email.user_id)
            continue

        prefs.email_digest_last_sent_on = today
        db.commit()
        sent += 1
        remaining -= 1

    if capped:
        logger.warning("Daily digest email cap reached: %d email(s) skipped", capped)
    logger.info("Daily digest emails: %d sent, %d failed, %d over the cap", sent, failed, capped)
    return sent
