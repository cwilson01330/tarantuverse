"""
Apply sourced species images to invert_species (BRIEF-care-guide-expansion P0).

Step 2 of the three-way image workflow:
  1. Image agent produces docs/design/species_images_wikimedia.csv  (done)
  2. Cory copies each verified file into R2 (needs bucket creds) and rewrites the
     CSV `image_url` column to the R2 object URL  (or adds an `r2_object_url` col)
  3. THIS script applies the CSV: UPDATE invert_species SET image_url +
     image_attribution WHERE scientific_name_lower = ...   (idempotent, re-runnable)

Reads the CSV "dumb" — takes the URL verbatim — so it never needs to know the R2
key scheme. Only rows with status == 'verified' are touched; license_pending /
review_quality are skipped.

HOTLINK GUARD: any row whose URL still points at wikimedia/wikipedia is SKIPPED
(unless --allow-commons), so running this before the R2 rewrite can't publish a
Commons hotlink (the README bans that). Prefers an `r2_object_url` column when present.

Usage (Render shell):
  python3 apply_species_images.py --dry-run          # plan only, no DB writes
  python3 apply_species_images.py                     # apply
  python3 apply_species_images.py path/to/other.csv   # alternate CSV
"""
import argparse
import csv
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_CSV = os.path.join(_REPO_ROOT, "docs", "design", "species_images_wikimedia.csv")

# Substrings that mean "this is still a Commons/Wikipedia hotlink, not an R2 object".
_HOTLINK_HOSTS = ("wikimedia.org", "wikipedia.org")


def _is_hotlink(url: str) -> bool:
    u = url.lower()
    return any(h in u for h in _HOTLINK_HOSTS)


def _pick_url(row: dict) -> str:
    # Prefer an explicit r2_object_url column if the image agent adds one;
    # otherwise use image_url verbatim (Cory rewrites it to the R2 URL post-copy).
    return (row.get("r2_object_url") or row.get("image_url") or "").strip()


def run(csv_path: str, dry_run: bool, allow_commons: bool) -> int:
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        return 1

    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    n = dict(verified=0, skipped_status=0, no_url=0, hotlink=0,
             would_apply=0, updated=0, unchanged=0, not_found=0)

    db = None
    if not dry_run:
        from app.database import SessionLocal
        from app.models.invert_species import InvertSpecies
        db = SessionLocal()

    try:
        for row in rows:
            status = (row.get("status") or "").strip().lower()
            if status != "verified":
                n["skipped_status"] += 1
                continue
            n["verified"] += 1

            name = (row.get("scientific_name_lower") or "").strip().lower()
            url = _pick_url(row)
            attribution = (row.get("attribution") or "").strip() or None

            if not name or not url:
                n["no_url"] += 1
                print(f"  SKIP (no url):       {name or '???'}")
                continue
            if _is_hotlink(url) and not allow_commons:
                n["hotlink"] += 1
                print(f"  SKIP (still Commons, awaiting R2 rewrite): {name}")
                continue

            if dry_run:
                n["would_apply"] += 1
                print(f"  WOULD SET:           {name} -> {url}")
                continue

            obj = (
                db.query(InvertSpecies)
                .filter(InvertSpecies.scientific_name_lower == name)
                .first()
            )
            if obj is None:
                n["not_found"] += 1
                print(f"  NOT IN DB:           {name}")
                continue
            if obj.image_url == url and obj.image_attribution == attribution:
                n["unchanged"] += 1
                continue
            obj.image_url = url
            obj.image_attribution = attribution
            n["updated"] += 1
            print(f"  UPDATED:             {name}")

        if not dry_run:
            db.commit()
    except Exception:
        if db is not None:
            db.rollback()
        raise
    finally:
        if db is not None:
            db.close()

    print("\nSummary:")
    print(f"  verified rows in CSV:        {n['verified']}")
    print(f"  skipped (not verified):      {n['skipped_status']}")
    print(f"  skipped (no url):            {n['no_url']}")
    print(f"  skipped (Commons hotlink):   {n['hotlink']}")
    if dry_run:
        print(f"  would apply:                 {n['would_apply']}")
        print("  (dry run — no DB writes)")
    else:
        print(f"  updated:                     {n['updated']}")
        print(f"  unchanged (already set):     {n['unchanged']}")
        print(f"  not found in DB:             {n['not_found']}")
    if n["hotlink"] and not allow_commons:
        print("\n  NOTE: rows skipped as Commons hotlinks. Run the R2 copy + rewrite the")
        print("  CSV image_url (or add r2_object_url) to point at R2, then re-run.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Apply sourced species images to invert_species.")
    p.add_argument("csv_path", nargs="?", default=DEFAULT_CSV, help="CSV path (default: docs/design/species_images_wikimedia.csv)")
    p.add_argument("--dry-run", action="store_true", help="Parse + plan only; no DB writes.")
    p.add_argument("--allow-commons", action="store_true", help="Override the hotlink guard (testing only).")
    args = p.parse_args()
    return run(args.csv_path, args.dry_run, args.allow_commons)


if __name__ == "__main__":
    raise SystemExit(main())
