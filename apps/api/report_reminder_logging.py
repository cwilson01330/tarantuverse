"""READ-ONLY report (2026-11-10, Effortless logging stage 1): do the smarter
reminders get used, and do they help keepers keep logging?

Real accounts only (not a Google Play robot account via `real_user_clause`, not
a retired `@merged.invalid` duplicate, still active). A keeper with no
`notification_preferences` row counts as all switches off.

  reminder_logged_feedings_*   feedings written from a notification button
                               (`feeding_logs.reminder_date` set, notes "Logged
                               from reminder"), in total and by whether the
                               owner has smart_reminders_enabled today
  keepers_*_on                 keepers with each switch on today
  logged_30d_smart_*           keepers who logged any feeding in the last 30
                               days (by log `created_at`), split by
                               smart_reminders_enabled today

The retention split is a correlation, not an effect: keepers choose the
switch. Compare the same split 2 and 6 weeks after release.

Changes nothing: the transaction is opened READ ONLY first.

Run on the Render shell, from apps/api:
    python3 report_reminder_logging.py          # aligned table
    python3 report_reminder_logging.py --csv    # for a spreadsheet
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, text

RETENTION_WINDOW_DAYS = 30


def _share(n: int, d: int) -> str:
    return f"{n} of {d} ({100 * n / d:.1f}%)" if d else "0 of 0"


def build_rows(db, now: Optional[datetime] = None) -> List[Tuple[str, str]]:
    from app.models.feeding_log import FeedingLog
    from app.models.invert import Invert
    from app.models.notification_preferences import NotificationPreferences as NP
    from app.models.user import User
    from app.utils.test_accounts import real_user_clause

    now = now or datetime.now(timezone.utc)
    cut = now - timedelta(days=RETENTION_WINDOW_DAYS)

    users = (
        db.query(
            User.id,
            func.coalesce(NP.smart_reminders_enabled, False),
            func.coalesce(NP.refusal_restarts_wait, False),
            func.coalesce(NP.post_molt_pause_enabled, False),
        )
        .outerjoin(NP, NP.user_id == User.id)
        .filter(
            User.is_active.is_(True),
            real_user_clause(),
            ~func.lower(User.email).like("%@merged.invalid"),
        )
        .all()
    )
    smart = {uid: bool(s) for uid, s, _, _ in users}

    reminder_by_owner = {}
    for uid, n in (
        db.query(Invert.user_id, func.count(FeedingLog.id))
        .join(FeedingLog, FeedingLog.invert_id == Invert.id)
        .filter(FeedingLog.reminder_date.isnot(None))
        .group_by(Invert.user_id)
    ):
        if uid in smart:
            reminder_by_owner[uid] = n

    logged_30d = {
        uid for (uid,) in db.query(Invert.user_id)
        .join(FeedingLog, FeedingLog.invert_id == Invert.id)
        .filter(FeedingLog.created_at >= cut)
        .distinct()
    }

    on_ids = [u for u, s in smart.items() if s]
    off_ids = [u for u, s in smart.items() if not s]
    r_on = sum(n for u, n in reminder_by_owner.items() if smart[u])
    r_off = sum(n for u, n in reminder_by_owner.items() if not smart[u])

    return [
        ("reminder_logged_feedings_total", str(r_on + r_off)),
        ("reminder_logged_feedings_smart_on", str(r_on)),
        ("reminder_logged_feedings_smart_off", str(r_off)),
        ("keepers_total", str(len(users))),
        ("keepers_smart_reminders_on", str(len(on_ids))),
        ("keepers_refusal_restarts_wait_on", str(sum(1 for _, _, r, _ in users if r))),
        ("keepers_post_molt_pause_on", str(sum(1 for _, _, _, m in users if m))),
        ("logged_30d_smart_on", _share(sum(1 for u in on_ids if u in logged_30d), len(on_ids))),
        ("logged_30d_smart_off", _share(sum(1 for u in off_ids if u in logged_30d), len(off_ids))),
    ]


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only smarter-reminders report.")
    parser.add_argument("--csv", action="store_true", help="comma-separated output")
    args = parser.parse_args(argv)

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Must be the first statement of the transaction.
        db.execute(text("SET TRANSACTION READ ONLY"))
        rows = build_rows(db)
    finally:
        db.rollback()
        db.close()

    if args.csv:
        print("metric,value")
        for k, v in rows:
            print(f'{k},"{v}"')
    else:
        w = max(len(k) for k, _ in rows)
        for k, v in rows:
            print(f"{k.ljust(w)}  {v}")
        print("\nkeepers choose the switch: the 30-day split is a correlation, not an effect.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
