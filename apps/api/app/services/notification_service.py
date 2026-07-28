"""
Notification service — the single chokepoint for creating notifications (ADR-009).

`create_notification` always writes an in-app notification row (so the center
works regardless of push delivery), then best-effort sends a push as a
side-effect, gated by the user's preferences. Every notify-worthy event should
route through here instead of calling the push utility directly.

Phase 3 will add quiet-hours + per-category frequency caps here and the daily
digest; for now push honors the existing per-category enabled flags.
"""
import logging
import re
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.utils.push_notifications import PushNotificationService

logger = logging.getLogger(__name__)


# ─── Deeplink vocabulary ──────────────────────────────────────────────────────
#
# A deeplink is a CANONICAL LOGICAL ROUTE, not a literal path for either client.
# Web and mobile have genuinely different route shapes for the same screen
# (mobile threads live at /forums/thread/<id>, web at
# /community/forums/thread/<id>; Feeding Day is /feeding-day on mobile and
# /dashboard/feeding-day on web). Historically this field held whatever path the
# author happened to have open, so notifications 404'd on one platform or the
# other — /dashboard/transfers and /app/transfers pointed at pages that have
# never existed on EITHER client.
#
# Rules:
#   1. Only emit a pattern in DEEPLINK_PATTERNS below.
#   2. Each client owns a resolver that maps these to its own real routes:
#        apps/mobile/src/lib/deeplinks.ts
#        apps/web/src/lib/deeplinks.ts
#      A client that can't serve a pattern returns null and simply doesn't
#      navigate — the notification still reads fine as text.
#   3. Adding a pattern means adding it HERE and in BOTH resolvers. If a
#      destination doesn't exist yet, pass deeplink=None rather than inventing
#      a route; an informational notification beats a tap into a 404.
DEEPLINK_PATTERNS = (
    r"^/messages/[^/]+$",              # DM conversation with a username
    r"^/community/[^/]+$",             # keeper profile
    r"^/forums/thread/[0-9a-fA-F-]+$",  # forum thread by id
    r"^/feeding-day$",                 # bulk feeding screen
    r"^/transfers$",                   # transfers index (Herpetoverse web only)
)

_COMPILED_DEEPLINK_PATTERNS = tuple(re.compile(p) for p in DEEPLINK_PATTERNS)


def _validate_deeplink(deeplink: Optional[str], notification_type: str) -> Optional[str]:
    """Drop deeplinks outside the vocabulary instead of shipping a dead tap.

    Deliberately non-fatal: a bad link should never block the notification
    itself. It logs loudly so the gap surfaces in Render logs rather than as a
    silent 404 in a keeper's hand.
    """
    if deeplink is None:
        return None
    if any(p.match(deeplink) for p in _COMPILED_DEEPLINK_PATTERNS):
        return deeplink
    logger.warning(
        "Dropping unrecognized notification deeplink %r for type %r. "
        "Add it to DEEPLINK_PATTERNS and both client resolvers, or pass None.",
        deeplink,
        notification_type,
    )
    return None


def create_notification(
    db: Session,
    *,
    user_id: UUID,
    type: str,
    title: str,
    body: Optional[str] = None,
    deeplink: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    push: bool = True,
    push_category: Optional[str] = None,
) -> Notification:
    """Write a notification row and (best-effort) push it.

    push_category: name of the per-category boolean on NotificationPreferences
      (e.g. 'direct_messages_enabled'); when set, push is suppressed if that
      flag is off. The in-app row is ALWAYS written regardless of push settings.
    """
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        deeplink=_validate_deeplink(deeplink, type),
        data=data,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    if push:
        try:
            prefs = (
                db.query(NotificationPreferences)
                .filter(NotificationPreferences.user_id == user_id)
                .first()
            )
            category_ok = push_category is None or getattr(prefs, push_category, True)
            if (
                prefs
                and getattr(prefs, "push_notifications_enabled", False)
                and prefs.expo_push_token
                and category_ok
            ):
                payload: Dict[str, Any] = {"type": type, "notification_id": str(notif.id)}
                # notif.deeplink, NOT the raw argument — the push payload and the
                # stored row must agree, or a tap from the tray goes somewhere
                # the notification center wouldn't.
                if notif.deeplink:
                    payload["deeplink"] = notif.deeplink
                if data:
                    payload.update(data)
                PushNotificationService.send_notification(
                    expo_push_token=prefs.expo_push_token,
                    title=title,
                    body=body or "",
                    data=payload,
                    badge=1,
                    sound="default",
                    priority="high" if type == "direct_message" else "default",
                )
        except Exception:
            # Push is best-effort; the in-app row is the source of truth.
            pass

    return notif
