"""Convert an invert row that's standing in for a communal into a real colony.

WHY THIS EXISTS
---------------
Colony mode (ADR-010) is the right home for a communal: per-stage headcounts, a
population that changes through events, no pretence that eleven spiders are one
animal. But the colony picker excludes `tarantula`, so keepers with communal
tarantulas can't reach it — and at least one worked around it by creating a
single invert named "Communal of 11" and logging the whole group against it.

That workaround loses real information. Feedings carry no count against a
headcount. "Molted" can't say who or how many. The collection is short by ten
animals. And the name has to be hand-edited every time the population changes,
which is the question that surfaced this in the first place.

WHAT CONVERTS, AND WHAT IT COSTS
--------------------------------
  feeding_logs  →  reparented invert_id → colony_id   (lossless)
  photos        →  reparented invert_id → colony_id   (lossless)
  molt_logs     →  reparented invert_id → colony_id   (lossless)
  the invert    →  deleted, after everything else moved

Nothing is lost. An earlier draft of this script degraded molt logs into
`molt_found` colony events, because colonies couldn't own molts. That was the
wrong trade and cml_20260730 removed the need for it: finding a shed skin is
often the ONLY observation a communal keeper gets, and it's how sexing happens
in a communal — you sex the molt, not the spider. Flattening that into an
event with no measurement columns would have thrown away the most valuable
records the keeper has.

SAFETY
------
Idempotent — re-running finds the colony already exists and stops. Dry-run by
default in the sense that nothing commits unless --commit is passed. Scoped to
one invert id, never a batch: this is a judgment call about one keeper's data,
not a migration.

USAGE (Render shell)
--------------------
    python convert_invert_to_colony.py --invert-id <uuid>
    python convert_invert_to_colony.py --invert-id <uuid> \
        --buckets "Unsexed=8,Females=3" --commit
"""
import argparse
import sys
import uuid

from sqlalchemy import text

from app.database import SessionLocal
from app.models.colony import Colony
from app.models.invert import Invert
from app.models.invert_species import InvertSpecies


def parse_buckets(raw: str) -> dict:
    """"Unsexed=8,Females=3" → {"Unsexed": 8, "Females": 3}."""
    out = {}
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            sys.exit(f"Bad bucket '{part}'. Expected Name=Count.")
        label, _, count = part.partition("=")
        label = label.strip()
        try:
            out[label] = int(count)
        except ValueError:
            sys.exit(f"Bucket '{label}' has a non-numeric count: {count!r}")
        if out[label] < 0:
            sys.exit(f"Bucket '{label}' is negative.")
    if not out:
        sys.exit("No buckets parsed.")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--invert-id", required=True)
    ap.add_argument(
        "--buckets",
        default="Unsexed=8,Females=3",
        help=(
            "Per-stage counts, e.g. 'Unsexed=8,Females=3'. These are the "
            "keeper's numbers — confirm them before running. The default is "
            "only a starting point derived from a total of 11 with 3 "
            "molt-confirmed females."
        ),
    )
    ap.add_argument("--name", default=None, help="Colony name. Defaults to the invert's.")
    ap.add_argument("--commit", action="store_true", help="Actually write. Otherwise rollback.")
    args = ap.parse_args()

    try:
        invert_id = uuid.UUID(args.invert_id)
    except ValueError:
        sys.exit(f"Not a UUID: {args.invert_id}")

    buckets = parse_buckets(args.buckets)
    db = SessionLocal()
    try:
        inv = db.query(Invert).filter(Invert.id == invert_id).first()
        if inv is None:
            sys.exit(f"No invert {invert_id}")

        print(f"Source invert : {inv.name!r} ({inv.scientific_name}) taxon={inv.taxon}")
        print(f"Owner         : {inv.user_id}")

        # Idempotency: a colony carrying this invert's id in its notes marker
        # means we've already run. Cheap and doesn't need a schema change.
        marker = f"[converted-from-invert:{invert_id}]"
        existing = (
            db.query(Colony)
            .filter(Colony.user_id == inv.user_id, Colony.notes.ilike(f"%{marker}%"))
            .first()
        )
        if existing:
            print(f"ALREADY CONVERTED → colony {existing.id} ({existing.name!r}). Nothing to do.")
            return

        molt_count = db.execute(
            text("SELECT count(*) FROM molt_logs WHERE invert_id = :iid"),
            {"iid": str(invert_id)},
        ).scalar_one()

        feedings = db.execute(
            text("SELECT count(*) FROM feeding_logs WHERE invert_id = :iid"),
            {"iid": str(invert_id)},
        ).scalar_one()
        photos = db.execute(
            text("SELECT count(*) FROM photos WHERE invert_id = :iid"),
            {"iid": str(invert_id)},
        ).scalar_one()

        total = sum(buckets.values())
        print(f"\nWill create colony : {args.name or inv.name!r}")
        print(f"  buckets          : {buckets}  (total {total})")
        print(f"  reparent         : {feedings} feeding(s), {photos} photo(s)")
        print(f"  reparent         : {molt_count} molt log(s)")
        print(f"  then delete invert {invert_id}")

        # Species: the colony references invert_species, same catalog the invert
        # uses, so the existing link carries over directly. Fall back to a
        # name match for animals that were never linked.
        species_id = inv.species_id
        if species_id is None and inv.scientific_name:
            sp = (
                db.query(InvertSpecies)
                .filter(InvertSpecies.scientific_name_lower == inv.scientific_name.strip().lower())
                .first()
            )
            species_id = sp.id if sp else None
            print(f"  species          : resolved by name → {species_id}")

        colony = Colony(
            user_id=inv.user_id,
            taxon=inv.taxon,
            species_id=species_id,
            name=args.name or inv.name or "Communal",
            date_acquired=inv.date_acquired,
            source=inv.source,
            stage_counts=buckets,
            count_is_estimated=False,
            enclosure_type=inv.enclosure_type,
            enclosure_size=inv.enclosure_size,
            substrate_type=inv.substrate_type,
            substrate_depth=inv.substrate_depth,
            last_substrate_change=inv.last_substrate_change,
            target_temp_min=inv.target_temp_min,
            target_temp_max=inv.target_temp_max,
            target_humidity_min=inv.target_humidity_min,
            target_humidity_max=inv.target_humidity_max,
            water_dish=inv.water_dish,
            photo_url=inv.photo_url,
            notes=((inv.notes + "\n\n") if inv.notes else "") + marker,
            is_active=True,
        )
        db.add(colony)
        db.flush()  # need colony.id for the reparenting below
        print(f"\n  created colony {colony.id}")

        # Reparent. Both tables gained colony_id in cph_20260729_colony_logs,
        # and their one-parent CHECK requires invert_id to go null in the same
        # statement — a row may not claim an animal and a colony at once.
        # molt_logs gained colony_id in cml_20260730, so all three move the
        # same way. molt_logs carries only an at-least-one-parent CHECK (not
        # exactly-one like the other two), but nulling the old parent is still
        # correct — a row should name one owner, not two.
        for table in ("feeding_logs", "photos", "molt_logs"):
            res = db.execute(
                text(
                    f"UPDATE {table} SET colony_id = :cid, invert_id = NULL, "
                    f"tarantula_id = NULL WHERE invert_id = :iid"
                ),
                {"cid": str(colony.id), "iid": str(invert_id)},
            )
            print(f"  reparented {res.rowcount} row(s) in {table}")

        # A colony molt is unattributed by definition — you can't say which of
        # eleven animals shed it. Matches what the POST route forces.
        db.execute(
            text("UPDATE molt_logs SET is_unidentified = TRUE WHERE colony_id = :cid"),
            {"cid": str(colony.id)},
        )

        db.delete(inv)
        print(f"  deleted invert {invert_id}")

        if args.commit:
            db.commit()
            print("\nCOMMITTED.")
        else:
            db.rollback()
            print("\nDRY RUN — rolled back. Re-run with --commit to apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
