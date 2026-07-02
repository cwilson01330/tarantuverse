"""
Notification service — the single chokepoint for creating notifications (ADR-009).

`create_notification` always writes an in-app notification row (so the center
works regardless of push delivery), then best-effort sends a push as a
side-effect, gated by the user's preferences. Every notify-worthy event should
route through here instead of calling the push utility directly.

Phase 3 will add quiet-hours + per-category frequency caps here and the daily
digest; for now push honors the existing per-category enabled flags.
"""
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.notification_preferences import NotificationPreferences
from app.utils.push_notifications import PushNotificationService


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
        deeplink=deeplink,
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
                if deeplink:
                    payload["deeplink"] = deeplink
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
