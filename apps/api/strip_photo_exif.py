"""One-shot backfill: strip EXIF (GPS, device info) from photos already in R2.

New uploads are cleaned by `app/utils/image_sanitize.py`. This rewrites the
originals uploaded before that fix. Each object is overwritten IN PLACE (same
key, so every stored URL — photos.url, inverts/animals.photo_url — keeps
working), with its orientation applied.

Quality: originals keep their full dimensions and are re-encoded at JPEG
quality 95, so the one re-compression is as gentle as it can be. If the photo
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

AFTER RUNNING: purge the Cloudflare cache for the photos domain (dashboard →
Caching → Purge Everything, or purge by URL). Objects are served with a
one-year cache, so edge copies of the old bytes can linger until purged.

Run on the Render shell (needs the R2_* env vars):

    python strip_photo_exif.py --dry-run      # count only, changes nothing
    python strip_photo_exif.py                # do it
    python strip_photo_exif.py --limit 20     # try a handful first
"""
import argparse
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
            rotated = Image.open(BytesIO(data)).getexif().get(ORIENTATION, 1) not in (1, None)
            clean, mime, _ext = sanitize_image(data, max_edge=None, jpeg_quality=95)
            if not args.dry_run:
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
