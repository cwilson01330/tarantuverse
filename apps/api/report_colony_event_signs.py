"""READ-ONLY report (2026-10-08, audit-2 M4): colony events with the wrong sign.

Until this fix the web event form accepted either sign for death / removed /
cannibalism / split, so a keeper who typed "5" for a death RAISED the colony's
count by five (mobile always forced the sign). The API now stores the sign the
event type implies (app/utils/colony_counts.py::signed_delta), but rows written
before that are still in the table, and the colony's stored counts include them.

This lists them. It changes nothing. A wrong-signed event moved its bucket the
wrong way by twice its size (+5 instead of -5 is 10 out). The keeper can fix
one in the app: opening the event and saving it -- any edit -- re-applies the
sign rule and corrects the count in the same step. Do that, or ask them, rather
than rewriting counts from here: some keepers may already have corrected the
total by hand with a recount, and flipping the event too would then
double-correct.

Run on the Render shell, from apps/api:
    python3 report_colony_event_signs.py
"""
import sys

from sqlalchemy import text

from app.utils.colony_counts import DECREASING_EVENTS, INCREASING_EVENTS

QUERY = """
    SELECT e.id, e.colony_id, c.name, u.username, e.event_type, e.stage,
           e.count_delta, e.occurred_at, e.created_at, c.stage_counts
      FROM colony_events e
      JOIN colonies c ON c.id = e.colony_id
      LEFT JOIN users u ON u.id = c.user_id
     WHERE (e.event_type = ANY(:dec) AND e.count_delta > 0)
        OR (e.event_type = ANY(:inc) AND e.count_delta < 0)
     ORDER BY u.username, c.name, e.occurred_at, e.created_at
"""


def main() -> int:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(text(QUERY), {
            "dec": sorted(DECREASING_EVENTS),
            "inc": sorted(INCREASING_EVENTS),
        }).fetchall()
        if not rows:
            print("No wrong-signed colony events.")
            return 0
        colonies = {}
        for (eid, cid, cname, username, etype, stage, delta, occurred, _created, counts) in rows:
            colonies.setdefault((cid, cname, username, str(counts)), []).append(
                (eid, etype, stage, delta, occurred)
            )
        for (cid, cname, username, counts), evs in colonies.items():
            off = sum(2 * abs(d) for _e, _t, _s, d, _o in evs)
            print(f"@{username or '?'} / {cname} ({cid})  stored counts {counts}  -> off by up to {off}")
            for eid, etype, stage, delta, occurred in evs:
                print(f"    {occurred}  {etype:<12} {stage or 'mixed':<16} {delta:+d}   event {eid}")
        print(f"{len(rows)} wrong-signed event(s) across {len(colonies)} colon{'y' if len(colonies) == 1 else 'ies'}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
