"""READ-ONLY report (2026-10-28, Day one): do new keepers get started?

Per signup week (ISO weeks, Monday start, the last 12), for real accounts only:

  signups      accounts created that week
  animal_1d    % with an active animal or colony created within 1 day of signing up
  fed_7d       % with an ACCEPTED feeding logged within 7 days of signing up
  reminders    % with a push token or the daily email reminder switched on (today)
  active_30d   % who logged any feeding, molt or photo in the last 30 days --
               only for cohorts whose week began 60+ days ago (blank otherwise)

"Real" = not a Google Play robot account (`real_user_clause`), not a retired
`@merged.invalid` duplicate, and still active. "Active" animals follow
`utils/limits.py` (`active_inverts_query` / `active_colonies_query`): not
transferred out, not dead, not archived or ended. Logging time is the log's
`created_at` (when the keeper wrote it), so an imported "last fed" date still
counts as a feeding logged at signup.

Recent weeks are still maturing (a week-old cohort has not had 7 days yet), so
read them as a floor. Re-run 2 and 6 weeks after a release and compare.

Changes nothing: the transaction is opened READ ONLY first.

Run on the Render shell, from apps/api:
    python3 report_activation.py          # aligned table
    python3 report_activation.py --csv    # for a spreadsheet
"""
import argparse
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set

from sqlalchemy import func, or_, text

WEEKS = 12
RETENTION_MIN_AGE_DAYS = 60
RETENTION_WINDOW_DAYS = 30

COLUMNS = ["signup_week", "signups", "animal_1d_pct", "fed_7d_pct", "reminders_pct", "active_30d_pct"]


def _week_start(dt: datetime):
    d = dt.astimezone(timezone.utc).date()
    return d - timedelta(days=d.weekday())


def _pct(n: int, d: int) -> str:
    return f"{100 * n / d:.1f}" if d else ""


def _first_within(events: Dict, signups: Dict, days: int) -> Set:
    """Users with at least one event stamped <= signup + `days`."""
    out = set()
    for uid, stamps in events.items():
        limit = signups[uid] + timedelta(days=days)
        if any(s <= limit for s in stamps):
            out.add(uid)
    return out


def build_rows(db, now: Optional[datetime] = None) -> List[Dict[str, str]]:
    from app.models.colony import Colony
    from app.models.feeding_log import FeedingLog
    from app.models.invert import Invert
    from app.models.molt_log import MoltLog
    from app.models.notification_preferences import NotificationPreferences
    from app.models.photo import Photo
    from app.models.user import User
    from app.utils.test_accounts import real_user_clause

    now = now or datetime.now(timezone.utc)
    first_week = _week_start(now) - timedelta(weeks=WEEKS - 1)
    window_start = datetime.combine(first_week, datetime.min.time(), tzinfo=timezone.utc)

    users = (
        db.query(User.id, User.created_at)
        .filter(
            User.created_at >= window_start,
            User.is_active.is_(True),
            real_user_clause(),
            ~func.lower(User.email).like("%@merged.invalid"),
        )
        .all()
    )
    signups = {uid: created for uid, created in users}
    ids = list(signups)
    cohorts: Dict = defaultdict(list)
    for uid, created in users:
        cohorts[_week_start(created)].append(uid)

    animal_stamps: Dict = defaultdict(list)
    fed_stamps: Dict = defaultdict(list)
    recent_activity: Set = set()
    reminders: Set = set()

    if ids:
        for uid, created in db.query(Invert.user_id, Invert.created_at).filter(
            Invert.user_id.in_(ids), Invert.transferred_out_at.is_(None), Invert.died_at.is_(None)
        ):
            animal_stamps[uid].append(created)
        for uid, created in db.query(Colony.user_id, Colony.created_at).filter(
            Colony.user_id.in_(ids),
            Colony.transferred_out_at.is_(None),
            Colony.is_active.is_(True),
            Colony.ended_at.is_(None),
        ):
            animal_stamps[uid].append(created)

        recent_cut = now - timedelta(days=RETENTION_WINDOW_DAYS)
        for owner_model, parent_col, log_model, extra in (
            (Invert, FeedingLog.invert_id, FeedingLog, FeedingLog.accepted.is_(True)),
            (Colony, FeedingLog.colony_id, FeedingLog, FeedingLog.accepted.is_(True)),
        ):
            for uid, created in (
                db.query(owner_model.user_id, log_model.created_at)
                .join(owner_model, owner_model.id == parent_col)
                .filter(owner_model.user_id.in_(ids), extra)
            ):
                fed_stamps[uid].append(created)

        # Any feeding (accepted or not), molt or photo in the last 30 days.
        for model, inv_col, col_col in (
            (FeedingLog, FeedingLog.invert_id, FeedingLog.colony_id),
            (MoltLog, MoltLog.invert_id, MoltLog.colony_id),
            (Photo, Photo.invert_id, Photo.colony_id),
        ):
            for owner_model, parent_col in ((Invert, inv_col), (Colony, col_col)):
                recent_activity.update(
                    uid for (uid,) in db.query(owner_model.user_id)
                    .join(model, parent_col == owner_model.id)
                    .filter(owner_model.user_id.in_(ids), model.created_at >= recent_cut)
                    .distinct()
                )

        reminders.update(
            uid for (uid,) in db.query(NotificationPreferences.user_id).filter(
                NotificationPreferences.user_id.in_(ids),
                or_(
                    NotificationPreferences.email_digest_enabled.is_(True),
                    (NotificationPreferences.expo_push_token.isnot(None))
                    & (NotificationPreferences.expo_push_token != ""),
                ),
            )
        )

    with_animal = _first_within(animal_stamps, signups, 1)
    with_feeding = _first_within(fed_stamps, signups, 7)

    rows = []
    retention_cutoff = (now - timedelta(days=RETENTION_MIN_AGE_DAYS)).date()
    for i in range(WEEKS):
        wk = first_week + timedelta(weeks=i)
        members = cohorts.get(wk, [])
        n = len(members)
        mature = wk <= retention_cutoff
        rows.append({
            "signup_week": wk.isoformat(),
            "signups": str(n),
            "animal_1d_pct": _pct(sum(1 for u in members if u in with_animal), n),
            "fed_7d_pct": _pct(sum(1 for u in members if u in with_feeding), n),
            "reminders_pct": _pct(sum(1 for u in members if u in reminders), n),
            "active_30d_pct": _pct(sum(1 for u in members if u in recent_activity), n) if mature else "",
        })
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only new-keeper activation report.")
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
        print(",".join(COLUMNS))
        for r in rows:
            print(",".join(r[c] for c in COLUMNS))
    else:
        widths = {c: max(len(c), 10) for c in COLUMNS}
        print("  ".join(c.ljust(widths[c]) for c in COLUMNS))
        for r in rows:
            print("  ".join((r[c] or "-").ljust(widths[c]) for c in COLUMNS))
        print("\nweeks start on Monday (UTC); recent cohorts are still maturing; active_30d needs a 60-day-old cohort.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
