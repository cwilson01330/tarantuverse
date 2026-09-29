"""Strip metadata from uploaded images before they are stored.

WHY
---
Phones write GPS coordinates into every photo. Until this module existed the
originals were stored byte-for-byte and linked from public animal pages, so
anyone could download a photo of a keeper's animal and read off where it lives
(and many of these collections are worth thousands). Make/model/serial and
editing-software tags identify the keeper's device too.

WHAT
----
`sanitize_image` decodes the upload, applies the EXIF orientation (so photos
stop coming out sideways once the tag is gone), scales anything enormous down
to MAX_EDGE, and re-encodes in the SAME format with no EXIF, no XMP, no
comments and no text chunks. Only the ICC colour profile survives (and only
when the colour mode is unchanged) — it describes colour, not the photo or the
person. Animated GIF/WebP/PNG keep their frames.

SAFETY
------
Image formats compress extremely well: a 700 KB PNG can decode to 13000×13000
pixels (~2 GB of memory). Dimensions and frame counts are checked from the
header BEFORE anything is decoded, so a hostile file is refused cheaply.

Every photo upload converges on `StorageService.upload_photo`, which calls this
(in a worker thread — it's CPU work), so no router can forget.
"""
from io import BytesIO
from typing import Optional

from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

MAX_EDGE = 2560           # plenty for a phone screen at 3x and 1080-wide share cards
MAX_PIXELS = 40_000_000   # ~ a 48 MP phone sensor's largest common output, cropped
MAX_FRAMES = 100
MAX_TOTAL_PIXELS = 200_000_000  # all frames of an animation together
JPEG_QUALITY = 88
WEBP_QUALITY = 88

# Pillow's own guard, lowered from ~179 MP. It raises (DecompressionBombError)
# at twice this; our explicit checks below fire first anyway.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# Pillow format → (stored format, MIME, extension). MPO is how Pillow opens a
# JPEG carrying a multi-picture block (iPhone HDR gain maps, many Android
# cameras) — it IS a JPEG, and refusing it rejected ordinary phone photos.
_FORMATS = {
    "JPEG": ("JPEG", "image/jpeg", ".jpg"),
    "MPO": ("JPEG", "image/jpeg", ".jpg"),
    "PNG": ("PNG", "image/png", ".png"),
    "WEBP": ("WEBP", "image/webp", ".webp"),
    "GIF": ("GIF", "image/gif", ".gif"),
}

# Info keys that carry no information about the photo's origin and are needed
# to re-encode faithfully. Everything else (exif, xmp, comment, text chunks,
# Photoshop blocks, MPF…) is dropped.
_KEEP_INFO = {"transparency", "duration", "loop", "disposal", "background"}


def _clean_info(img: Image.Image) -> None:
    img.info = {k: v for k, v in img.info.items() if k in _KEEP_INFO}


def sanitize_image(
    data: bytes,
    max_edge: Optional[int] = MAX_EDGE,
    jpeg_quality: int = JPEG_QUALITY,
) -> tuple[bytes, str, str]:
    """Return (clean_bytes, mime_type, extension) for an uploaded image.

    `max_edge=None` keeps the original dimensions (the backfill uses that, so
    old photos aren't shrunk as a side effect of removing their GPS).

    Raises ValueError for anything that isn't a decodable image in an allowed
    format, or is too large to decode safely.
    """
    try:
        src = Image.open(BytesIO(data))  # lazy: reads the header only
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("File is not a readable image") from e

    if src.format not in _FORMATS:
        raise ValueError(f"Unsupported image format: {src.format}")
    fmt, mime, ext = _FORMATS[src.format]

    # Size checks from the header, before any pixels are decoded.
    w, h = src.size
    if w * h > MAX_PIXELS:
        raise ValueError("Image dimensions are too large")
    n_frames = getattr(src, "n_frames", 1) if fmt != "JPEG" else 1
    if n_frames > MAX_FRAMES or n_frames * w * h > MAX_TOTAL_PIXELS:
        raise ValueError("Animation is too long or too large")

    try:
        src.load()
    except (OSError, Image.DecompressionBombError, SyntaxError) as e:  # truncated / corrupt
        raise ValueError("File is not a readable image") from e

    icc = src.info.get("icc_profile")
    out = BytesIO()

    if n_frames > 1:  # animated GIF / WebP / APNG: keep every frame
        frames = []
        for frame in ImageSequence.Iterator(src):
            f = frame.copy()
            if max_edge and max(f.size) > max_edge:
                f.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            _clean_info(f)
            frames.append(f)
        first, rest = frames[0], frames[1:]
        params = {"save_all": True, "append_images": rest}
        for k in ("duration", "loop"):
            if k in src.info:
                params[k] = src.info[k]
        if fmt == "GIF":
            first.save(out, format="GIF", comment=b"", **params)
        elif fmt == "WEBP":
            first.save(out, format="WEBP", quality=WEBP_QUALITY, exif=b"", xmp=b"", **params)
        else:
            first.save(out, format="PNG", exif=b"", **params)
        return out.getvalue(), mime, ext

    img = ImageOps.exif_transpose(src) or src
    if max_edge and max(img.size) > max_edge:
        img = img.copy()
        img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    mode_before = img.mode
    _clean_info(img)

    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")  # CMYK, P, RGBA… JPEG holds RGB/L only

    params: dict = {"exif": b""}
    # An ICC profile only describes the pixels in the mode it came with; a
    # CMYK profile on converted RGB data would render wrong colours.
    if icc and img.mode == mode_before:
        params["icc_profile"] = icc

    if fmt == "JPEG":
        img.save(out, format="JPEG", quality=jpeg_quality, optimize=True, **params)
    elif fmt == "PNG":
        img.save(out, format="PNG", optimize=True, **params)
    elif fmt == "WEBP":
        img.save(out, format="WEBP", quality=WEBP_QUALITY, xmp=b"", **params)
    else:  # single-frame GIF
        img.save(out, format="GIF", comment=b"")
    return out.getvalue(), mime, ext
