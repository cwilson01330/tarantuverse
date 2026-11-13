"""READ-ONLY report (2026-11-13, egg sacs -> sling groups): is the brood flow
used, and does it help keepers keep logging? Run 2 and 6 weeks after release.

Real accounts only (not a Google Play robot account via `real_user_clause`, not
a retired `@merged.invalid` duplicate, still active). Counts cover rows created
on or after --since (default: today, UTC), except the true-spider line which is
always the last 30 days.

  sacs_logged_*                 egg sacs / oothecae / broods logged, in total and
                                by mother's taxon and with/without a pairing
  sacs_hatched / sacs_failed    outcome set
  groups_created_from_sacs      colonies with an egg_sac_id
  spiders_split_out             offspring rows with status kept
  molts_followed_by_photo_2d    molts with a photo of the same animal taken
                                within 2 days after the molt
  feedings_with_quantity_over_1 group feedings ("fed 8")
  true_spider_keepers_fed_30d   keepers with a true-spider feeding in the last
                                30 days, vs the 17 counted on 2026-11-12

Changes nothing: the transaction is opened READ ONLY first.

Run on the Render shell, from apps/api:
    python3 report_broods.py --since 2026-11-23
    python3 report_broods.py --since 2026-11-23 --csv
"""
import argparse
import sys
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import and_, func, text

BASELINE_TRUE_SPIDER_KEEPERS = 17
BASELINE_DATE = "2026-11-12"
ACTIVE_WINDOW_DAYS = 30


def _share(n: int, d: int) -> str:
    return f"{n} of {d} ({100 * n / d:.1f}%)" if d else "0 of 0"


def build_rows(db, since: date, now: Optional[datetime] = None) -> List[Tuple[str, str]]:
    from app.models.colony import Colony
    from app.models.egg_sac import EggSac
    from app.models.feeding_log import FeedingLog
    from app.models.invert import Invert
    from app.models.molt_log import MoltLog
    from app.models.offspring import Offspring, OffspringStatus
    from app.models.photo import Photo
    from app.models.user import User
    from app.utils.test_accounts import real_user_clause

    now = now or datetime.now(timezone.utc)
    since_dt = datetime.combine(since, time.min, tzinfo=timezone.utc)
    cut = now - timedelta(days=ACTIVE_WINDOW_DAYS)

    real = (
        db.query(User.id)
        .filter(
            User.is_active.is_(True),
            real_user_clause(),
            ~func.lower(User.email).like("%@merged.invalid"),
        )
        .subquery()
    )
    real_ids = db.query(real.c.id)

    # Sacs
    sac_rows = (
        db.query(Invert.taxon, EggSac.pairing_id.isnot(None), func.count(EggSac.id))
        .select_from(EggSac)
        .outerjoin(Invert, Invert.id == EggSac.mother_invert_id)
        .filter(EggSac.user_id.in_(real_ids), EggSac.created_at >= since)
        .group_by(Invert.taxon, EggSac.pairing_id.isnot(None))
        .all()
    )
    total = sum(n for _, _, n in sac_rows)
    split = {}
    for taxon, paired, n in sac_rows:
        key = f"sacs_logged_{taxon or 'unknown'}_{'with' if paired else 'no'}_pairing"
        split[key] = split.get(key, 0) + n

    def sac_outcome(o):
        return (
            db.query(func.count(EggSac.id))
            .filter(EggSac.user_id.in_(real_ids), EggSac.created_at >= since, EggSac.outcome == o)
            .scalar()
        )

    groups = (
        db.query(func.count(Colony.id))
        .filter(
            Colony.user_id.in_(real_ids),
            Colony.egg_sac_id.isnot(None),
            Colony.created_at >= since_dt,
        )
        .scalar()
    )
    kept = (
        db.query(func.count(Offspring.id))
        .filter(
            Offspring.user_id.in_(real_ids),
            Offspring.status == OffspringStatus.KEPT,
            Offspring.invert_id.isnot(None),
            Offspring.created_at >= since,
        )
        .scalar()
    )

    # Molts followed by a photo of the same animal within 2 days after.
    molts = (
        db.query(MoltLog.id, MoltLog.invert_id, MoltLog.molted_at)
        .join(Invert, Invert.id == MoltLog.invert_id)
        .filter(Invert.user_id.in_(real_ids), MoltLog.molted_at >= since_dt)
        .all()
    )
    followed = 0
    for _, inv_id, molted_at in molts:
        hit = (
            db.query(Photo.id)
            .filter(
                Photo.invert_id == inv_id,
                func.coalesce(Photo.taken_at, Photo.created_at) >= molted_at,
                func.coalesce(Photo.taken_at, Photo.created_at) <= molted_at + timedelta(days=2),
            )
            .first()
        )
        if hit:
            followed += 1

    group_feeds = (
        db.query(func.count(FeedingLog.id))
        .join(Invert, Invert.id == FeedingLog.invert_id)
        .filter(
            Invert.user_id.in_(real_ids),
            FeedingLog.quantity > 1,
            FeedingLog.created_at >= since_dt,
        )
        .scalar()
    )

    ts_keepers = (
        db.query(func.count(func.distinct(Invert.user_id)))
        .join(FeedingLog, FeedingLog.invert_id == Invert.id)
        .filter(
            Invert.taxon == "true_spider",
            Invert.user_id.in_(real_ids),
            FeedingLog.fed_at >= cut,
        )
        .scalar()
    )

    rows: List[Tuple[str, str]] = [("since", since.isoformat()), ("sacs_logged_total", str(total))]
    rows += sorted((k, str(v)) for k, v in split.items())
    rows += [
        ("sacs_hatched", str(sac_outcome("hatched"))),
        ("sacs_failed", str(sac_outcome("failed"))),
        ("groups_created_from_sacs", str(groups)),
        ("spiders_split_out", str(kept)),
        ("molts_followed_by_photo_2d", _share(followed, len(molts))),
        ("feedings_with_quantity_over_1", str(group_feeds)),
        (
            "true_spider_keepers_fed_30d",
            f"{ts_keepers} (baseline {BASELINE_TRUE_SPIDER_KEEPERS} on {BASELINE_DATE})",
        ),
    ]
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only egg-sac / sling-group report.")
    parser.add_argument("--since", help="YYYY-MM-DD (default: today, UTC)")
    parser.add_argument("--csv", action="store_true", help="comma-separated output")
    args = parser.parse_args(argv)
    since = date.fromisoformat(args.since) if args.since else datetime.now(timezone.utc).date()

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Must be the first statement of the transaction.
        db.execute(text("SET TRANSACTION READ ONLY"))
        rows = build_rows(db, since)
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
