"""Bridge step 2: download verified Commons images -> upload to R2 -> emit a CSV
with an `r2_object_url` column that apply_species_images.py consumes.

Pipeline (BRIEF-care-guide-expansion image workflow):
  1. image agent  -> docs/design/species_images_wikimedia.csv   (Commons URLs)   [done]
  2. THIS SCRIPT  -> downloads each verified image, puts it in R2, writes
                     docs/design/species_images_r2.csv with r2_object_url filled
  3. apply_species_images.py docs/design/species_images_r2.csv  -> DB UPDATE

Why a separate CSV column instead of rewriting image_url: apply_species_images.py
prefers `r2_object_url` and keeps the original Commons URL for provenance. Its
hotlink guard then passes because it reads the R2 url.

R2 wiring: reuses the app's own `storage_service` (app/services/storage.py) — same
client, bucket, and public-URL base the app uses for every photo — so this can
never drift from production storage. Run it on the Render shell where the R2_* env
vars are set (locally, storage falls back to filesystem and this script will exit).
Needs bucket WRITE creds — that's why it's a you-run script, not the image agent's.

Idempotent: skips the R2 upload if the object key already exists (HEAD), unless
--force. Safe to re-run. Only status == 'verified' rows are uploaded; the rest are
passed through with an empty r2_object_url.

Usage (from apps/api/ on the Render shell):
  python3 upload_species_images_to_r2.py --dry-run               # plan only
  python3 upload_species_images_to_r2.py --max-width 1600        # upload (recommended)
  python3 upload_species_images_to_r2.py --force                 # re-upload even if key exists
"""
import argparse
import csv
import io
import os
import re
import sys
import time
import urllib.request

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_IN = os.path.join(_REPO_ROOT, "docs", "design", "species_images_wikimedia.csv")
DEFAULT_OUT = os.path.join(_REPO_ROOT, "docs", "design", "species_images_r2.csv")
KEY_PREFIX = "species-images"

# Wikimedia BLOCKS requests without a descriptive User-Agent (returns 403). Per
# their UA policy: https://meta.wikimedia.org/wiki/User-Agent_policy
USER_AGENT = "Tarantuverse-ImageBot/1.0 (https://tarantuverse.com; images@appalachiantarantulas.com)"

_CT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
       ".gif": "image/gif", ".webp": "image/webp"}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "unnamed"


def ext_from_url(url: str) -> str:
    ext = os.path.splitext(url.split("?")[0])[1].lower()
    return ext if ext in _CT else ".jpg"


def _r2():
    """Reuse the app's storage_service so this never drifts from production R2."""
    from app.services.storage import storage_service
    if not getattr(storage_service, "use_r2", False):
        sys.exit(
            "R2 is not configured in this environment (storage_service is in local "
            "filesystem mode). Run this on the Render shell where R2_* env vars are set."
        )
    return (
        storage_service.s3_client,
        storage_service.bucket_name,
        storage_service.public_url_base.rstrip("/"),
    )


def key_exists(client, bucket: str, key: str) -> bool:
    from botocore.exceptions import ClientError
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def fetch(url: str, max_width):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    ext = ext_from_url(url)
    if max_width:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        if img.width > max_width:
            h = round(img.height * max_width / img.width)
            img = img.resize((max_width, h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), ".jpg"
    return data, ext


def run(in_path: str, out_path: str, dry_run: bool, force: bool, max_width) -> int:
    if not os.path.exists(in_path):
        print(f"Input CSV not found: {in_path}")
        return 1

    with open(in_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
        fields = reader.fieldnames or []
    if "r2_object_url" not in fields:
        fields = fields + ["r2_object_url"]

    client = bucket = public = None
    if not dry_run:
        client, bucket, public = _r2()

    n = dict(verified=0, uploaded=0, reused=0, failed=0, skipped=0)
    for row in rows:
        if (row.get("status") or "").strip().lower() != "verified":
            row.setdefault("r2_object_url", "")
            n["skipped"] += 1
            continue
        n["verified"] += 1
        name = (row.get("scientific_name_lower") or "").strip().lower()
        src = (row.get("image_url") or "").strip()
        if not name or not src:
            n["failed"] += 1
            print(f"  SKIP (missing name/url): {name or '???'}")
            continue

        key = f"{KEY_PREFIX}/{slugify(name)}{'.jpg' if max_width else ext_from_url(src)}"
        if dry_run:
            print(f"  WOULD UPLOAD: {name}  ->  {key}")
            row["r2_object_url"] = f"<R2_PUBLIC_URL>/{key}"
            continue

        public_url = f"{public}/{key}"
        try:
            if not force and key_exists(client, bucket, key):
                row["r2_object_url"] = public_url
                n["reused"] += 1
                print(f"  EXISTS (reuse): {name}")
                continue
            data, ext = fetch(src, max_width)
            client.put_object(
                Bucket=bucket, Key=key, Body=data,
                ContentType=_CT.get(ext, "image/jpeg"),
                CacheControl="public, max-age=31536000",
            )
            row["r2_object_url"] = public_url
            n["uploaded"] += 1
            print(f"  UPLOADED: {name}  ->  {key}")
            time.sleep(0.3)  # be polite to Wikimedia
        except Exception as e:
            n["failed"] += 1
            print(f"  FAILED: {name}: {e}")

    if not dry_run:
        with open(out_path, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            for row in rows:
                w.writerow({k: row.get(k, "") for k in fields})
        print(f"\nWrote {out_path}")

    print("\nSummary:")
    print(f"  verified rows:   {n['verified']}")
    print(f"  uploaded:        {n['uploaded']}")
    print(f"  reused (exists): {n['reused']}")
    print(f"  failed:          {n['failed']}")
    print(f"  passed through:  {n['skipped']}")
    if not dry_run:
        print(f"\nNext: python3 apply_species_images.py {out_path} --dry-run   (then without --dry-run)")
    return 0 if n["failed"] == 0 else 2


def main() -> int:
    p = argparse.ArgumentParser(description="Download verified Commons species images and upload to R2.")
    p.add_argument("in_path", nargs="?", default=DEFAULT_IN, help="input CSV (species_images_wikimedia.csv)")
    p.add_argument("--out", default=DEFAULT_OUT, help="output CSV with r2_object_url column")
    p.add_argument("--dry-run", action="store_true", help="plan only; no downloads, no uploads, no file write")
    p.add_argument("--force", action="store_true", help="re-upload even if the R2 key already exists")
    p.add_argument("--max-width", type=int, default=None, help="downscale to this width (px) and re-encode JPEG")
    a = p.parse_args()
    return run(a.in_path, a.out, a.dry_run, a.force, a.max_width)


if __name__ == "__main__":
    raise SystemExit(main())
