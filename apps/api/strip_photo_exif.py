"""One-shot backfill: strip EXIF (GPS, device info) from photos already in R2.

New uploads are cleaned by `app/utils/image_sanitize.py`. This rewrites the
originals uploaded before that fix. Each object is overwritten IN PLACE (same
key, so every stored URL — photos.url, inverts/animals.photo_url — keeps
working), with its orientation applied.

Size: originals are brought to the same 2560 px long edge as every new upload
(re-encoded at JPEG quality 92). That is sharper than any phone screen shows,
and it is what keeps this script inside the Render instance's 512 MB: the
first run (2026-09-29) decoded 30 MP originals at full size, ~200 MB each on
top of the running API, and the instance was killed for running out of
memory. JPEGs are now decoded at reduced scale and never exist at full size. If the photo
was stored sideways-with-a-rotation-tag, its thumbnail is regenerated too
(thumbnails were always made from the un-rotated pixels, so those were
sideways already).

No backup copy is written, on purpose: a backup of the original would be a
second copy of exactly the GPS data this script exists to remove, sitting in
the same public bucket.

Only objects referenced by `photos` rows under `photos/` are touched — never
species images, avatars, or the shop's files in the shared bucket.

Idempotent: an object with no metadata worth removing is skipped, so re-running
never re-compresses a clean JPEG.

Run history: 2026-09-29 — all 823 photo objects cleaned (798 + a 25-photo
test batch), 0 failures. A re-run with --dry-run should report cleaned=0.

Caching: photos are served from the bucket's r2.dev address, not a custom
domain, so there is no zone cache in the Cloudflare dashboard to purge.
Browsers that already viewed a photo may hold their own copy (1-year
Cache-Control) until it's evicted from that device.

Run on the Render shell (needs the R2_* env vars):

    python strip_photo_exif.py --dry-run      # count only, changes nothing
    python strip_photo_exif.py                # do it
    python strip_photo_exif.py --limit 20     # try a handful first
    python strip_photo_exif.py --offset 200 --limit 200   # work in batches
"""
import argparse
import gc
import sys
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.database import SessionLocal
from app.models.photo import Photo
from app.services.storage import storage_service
from app.utils.image_sanitize import sanitize_image
from app.utils.photo_cleanup import KEY_RE

ORIENTATION = 0x0112

_DIRTY_INFO = ("exif", "xmp", "XML:com.adobe.xmp", "comment", "photoshop", "Raw profile type exif")


def needs_cleaning(data: bytes) -> bool:
    try:
        img = Image.open(BytesIO(data))
    except (UnidentifiedImageError, OSError):
        return False
    if len(img.getexif()) > 0:
        return True
    return any(k in img.info for k in _DIRTY_INFO)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    if not storage_service.use_r2:
        print("R2 is not configured here — run this on the Render shell.")
        return 1

    prefix = f"{storage_service.public_url_base}/"
    s3 = storage_service.s3_client
    bucket = storage_service.bucket_name

    db = SessionLocal()
    try:
        rows = {}
        for url, thumb in db.query(Photo.url, Photo.thumbnail_url).all():
            if url and url.startswith(prefix) and KEY_RE.match(url[len(prefix):]) and url[len(prefix):].startswith("photos/"):
                rows.setdefault(url, thumb)
    finally:
        db.close()
    urls = sorted(rows)
    urls = urls[args.offset:]
    if args.limit:
        urls = urls[: args.limit]
    print(f"{len(urls)} photo objects to check{' (dry run)' if args.dry_run else ''}")

    checked = cleaned = skipped = failed = 0
    for url in urls:
        key = url[len(prefix):]
        checked += 1
        try:
            obj = s3.get_object(Bucket=bucket, Key=key)
            data = obj["Body"].read()
            if not needs_cleaning(data):
                skipped += 1
                continue
            with Image.open(BytesIO(data)) as probe:  # header only — no decode
                rotated = probe.getexif().get(ORIENTATION, 1) not in (1, None)
            if not args.dry_run:  # a dry run never decodes a photo
                clean, mime, _ext = sanitize_image(data, jpeg_quality=92)
                s3.put_object(
                    Bucket=bucket, Key=key, Body=clean, ContentType=mime,
                    CacheControl="public, max-age=31536000",
                )
                thumb = rows.get(url)
                if rotated and thumb and thumb.startswith(prefix) and KEY_RE.match(thumb[len(prefix):]):
                    s3.put_object(
                        Bucket=bucket, Key=thumb[len(prefix):],
                        Body=storage_service._create_thumbnail(clean), ContentType="image/jpeg",
                        CacheControl="public, max-age=31536000",
                    )
            cleaned += 1
        except Exception as e:  # keep going; report at the end
            failed += 1
            print(f"  ! {key}: {e}")
        finally:
            # One photo in memory at a time: drop this one's buffers before
            # fetching the next.
            data = obj = None
            clean = None
            gc.collect()
        if checked % 50 == 0:
            print(f"  …{checked} checked, {cleaned} {'would be ' if args.dry_run else ''}cleaned")

    print(
        f"Done. checked={checked} cleaned={cleaned}{' (dry run — nothing written)' if args.dry_run else ''} "
        f"already_clean={skipped} failed={failed}"
    )
    print(
        "Note: the CDN may keep serving a cached copy of an overwritten photo "
        "until its cache expires or is purged."
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
