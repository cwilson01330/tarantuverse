"""One-off data fix (2026-10-08, audit-2 M5): one spelling per colony bucket.

Colony bucket names used to be stored in whatever case the client sent --
mobile quick-log sent "Unsexed", web add kept "Adults" as typed, import and
mobile add/edit lowercased. Bucket arithmetic is case-sensitive, so a colony
could hold "Unsexed" AND "unsexed", both counted in its total, and its events
pointed at either. The API now canonicalises every write
(app/utils/colony_counts.py: trimmed, lowercase, "_" read as a space, runs of
whitespace collapsed). This brings the stored rows in line:

  1. colonies.stage_counts -- keys canonicalised; buckets that only differed
     in spelling are MERGED by adding their counts (the colony's total does not
     change).
  2. colony_events.stage -- rewritten to the canonical spelling (blank -> NULL,
     which is the 'mixed' bucket, as before).
  3. animal_transfers.transfer_counts on PENDING colony transfers -- keys
     canonicalised, so a partial transfer link made before the fix still finds
     its buckets when it is claimed.

Nothing else is touched: no count changes value, no event is added or removed,
claimed/cancelled transfers and their snapshots are history and stay as they
were. Idempotent -- a second run finds nothing to do.

Run on the Render shell, from apps/api:
    python3 fix_colony_stage_keys_20261008.py --dry-run   # show what would change
    python3 fix_colony_stage_keys_20261008.py --apply     # write it
(No flag = dry run.)
"""
import json
import sys
from typing import Dict, Optional, Tuple

from sqlalchemy import text

from app.utils.colony_counts import canonical_stage, canonical_stage_counts


def plan_counts(counts) -> Tuple[Optional[Dict[str, int]], Dict[str, list]]:
    """(new map or None if already canonical, {canonical key: [spellings merged]})."""
    if not isinstance(counts, dict) or not counts:
        return None, {}
    new = canonical_stage_counts(counts)
    merged: Dict[str, list] = {}
    for k in counts:
        merged.setdefault(canonical_stage(k) or "mixed", []).append(k)
    merges = {k: v for k, v in merged.items() if len(v) > 1}
    if list(new.items()) == list(counts.items()):
        return None, {}
    return new, merges


def plan_stage(stage: Optional[str]) -> Tuple[bool, Optional[str]]:
    """(needs a rewrite, canonical value)."""
    if stage is None:
        return False, None
    canon = canonical_stage(stage)
    return canon != stage, canon


def _jsonb(v) -> Optional[str]:
    return None if v is None else json.dumps(v)


def main() -> int:
    apply = "--apply" in sys.argv
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # 1. colony bucket maps
        rows = db.execute(text(
            "SELECT id, name, stage_counts FROM colonies WHERE stage_counts IS NOT NULL"
        )).fetchall()
        colonies_changed = merges_total = 0
        for cid, name, counts in rows:
            new, merges = plan_counts(counts)
            if new is None:
                continue
            colonies_changed += 1
            merges_total += len(merges)
            note = "; ".join(f"{'+'.join(map(repr, v))} -> {k!r}" for k, v in merges.items())
            print(f"  colony {cid} ({name}): {counts} -> {new}" + (f"  MERGED {note}" if note else ""))
            if apply:
                db.execute(
                    text("UPDATE colonies SET stage_counts = CAST(:v AS jsonb) WHERE id = :id"),
                    {"v": _jsonb(new), "id": cid},
                )

        # 2. event stages
        ev_rows = db.execute(text(
            "SELECT id, stage FROM colony_events WHERE stage IS NOT NULL"
        )).fetchall()
        events_changed = 0
        for eid, stage in ev_rows:
            needs, canon = plan_stage(stage)
            if not needs:
                continue
            events_changed += 1
            if apply:
                db.execute(text("UPDATE colony_events SET stage = :s WHERE id = :id"), {"s": canon, "id": eid})

        # 3. pending partial colony transfers
        tr_rows = db.execute(text(
            "SELECT id, transfer_counts FROM animal_transfers "
            "WHERE colony_id IS NOT NULL AND status = 'pending' AND transfer_counts IS NOT NULL"
        )).fetchall()
        transfers_changed = 0
        for tid, counts in tr_rows:
            new, _merges = plan_counts(counts)
            if new is None:
                continue
            transfers_changed += 1
            print(f"  pending transfer {tid}: {counts} -> {new}")
            if apply:
                db.execute(
                    text("UPDATE animal_transfers SET transfer_counts = CAST(:v AS jsonb) WHERE id = :id"),
                    {"v": _jsonb(new), "id": tid},
                )

        print(
            f"colonies: {colonies_changed} of {len(rows)} to rewrite ({merges_total} bucket merge(s)); "
            f"events: {events_changed} of {len(ev_rows)}; pending transfers: {transfers_changed} of {len(tr_rows)}"
        )
        if apply:
            db.commit()
            print("Done.")
        else:
            print("Dry run -- nothing written. Add --apply to save.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
