"""The one place a `notification_preferences` row is created.

Every keeper must have a row (the daily digest, push token and quiet hours all
hang off it), so every account-creating path and every prefs route goes through
`ensure_notification_preferences`. The defaults are the ones the GET route has
always written, plus the daily digest on at 9 and the opt-in email digest off.
"""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification_preferences import NotificationPreferences


def ensure_notification_preferences(db: Session, user_id) -> NotificationPreferences:
    """The user's preferences row, created with defaults if missing.

    Flushes but does NOT commit — the caller owns the transaction. Safe against
    two requests creating the row at once (the unique constraint decides; the
    loser reads the winner's row).
    """
    prefs = (
        db.query(NotificationPreferences)
        .filter(NotificationPreferences.user_id == user_id)
        .first()
    )
    if prefs is not None:
        return prefs

    prefs = NotificationPreferences(
        user_id=user_id,
        feeding_reminders_enabled=True,
        feeding_reminder_hours=24,
        substrate_reminders_enabled=True,
        substrate_reminder_days=90,
        molt_predictions_enabled=True,
        maintenance_reminders_enabled=True,
        maintenance_reminder_days=30,
        feeder_low_stock_enabled=True,
        push_notifications_enabled=True,
        direct_messages_enabled=True,
        forum_replies_enabled=True,
        new_followers_enabled=True,
        community_activity_enabled=False,
        sitter_activity_enabled=True,
        quiet_hours_enabled=False,
        quiet_hours_start="22:00",
        quiet_hours_end="08:00",
        daily_digest_enabled=True,
        digest_hour=9,
        email_digest_enabled=False,
    )
    savepoint = db.begin_nested()
    try:
        db.add(prefs)
        db.flush()
        savepoint.commit()
    except IntegrityError:
        savepoint.rollback()
        existing = (
            db.query(NotificationPreferences)
            .filter(NotificationPreferences.user_id == user_id)
            .first()
        )
        if existing is None:
            raise
        return existing
    return prefs
