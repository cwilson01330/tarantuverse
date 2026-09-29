"""Uploaded photos must not carry the keeper's location (or any other metadata).

Before this, originals were stored byte-for-byte — GPS included — and public
animal pages linked them. Anyone could download a photo of a keeper's most
valuable animal and read off where it lives. Share cards would have spread
those same originals further. These tests pin the fix.
"""
import asyncio
from io import BytesIO

import pytest
from PIL import Image

from app.utils.image_sanitize import MAX_EDGE, sanitize_image

GPS_IFD = 0x8825
ORIENTATION = 0x0112
MAKE = 0x010F


def _exif_with_gps(orientation: int | None = None) -> Image.Exif:
    exif = Image.Exif()
    exif[MAKE] = "KeeperPhone"
    if orientation:
        exif[ORIENTATION] = orientation
    # Latitude 36°28'N, longitude 81°48'W — a real-looking fix.
    exif[GPS_IFD] = {1: "N", 2: (36.0, 28.0, 0.0), 3: "W", 4: (81.0, 48.0, 0.0)}
    return exif


def _jpeg(size=(40, 20), exif: Image.Exif | None = None, mode="RGB") -> bytes:
    buf = BytesIO()
    Image.new(mode, size, "red" if mode == "RGB" else 0).save(
        buf, format="JPEG", exif=exif.tobytes() if exif else b""
    )
    return buf.getvalue()


def _metadata(data: bytes) -> tuple[Image.Image, Image.Exif]:
    img = Image.open(BytesIO(data))
    return img, img.getexif()


def test_gps_is_removed_from_jpeg():
    raw = _jpeg(exif=_exif_with_gps())
    assert Image.open(BytesIO(raw)).getexif().get_ifd(GPS_IFD), "fixture must carry GPS"

    out, mime, ext = sanitize_image(raw)

    img, exif = _metadata(out)
    assert not exif.get_ifd(GPS_IFD)
    assert len(exif) == 0, "no EXIF at all — make/model identify the phone too"
    assert "exif" not in img.info
    assert (mime, ext) == ("image/jpeg", ".jpg")


def test_the_raw_gps_bytes_are_gone_not_just_unparsed():
    """Belt and braces: the degrees we wrote must not survive anywhere."""
    out, _, _ = sanitize_image(_jpeg(exif=_exif_with_gps()))
    assert b"KeeperPhone" not in out
    assert b"Exif\x00\x00" not in out


def test_orientation_is_applied_then_dropped():
    """Orientation 6 = rotate 90° CW on display. A 40×20 sensor image is a
    20×40 photo; storing it un-rotated without the tag would show it sideways."""
    out, _, _ = sanitize_image(_jpeg(size=(40, 20), exif=_exif_with_gps(orientation=6)))
    img, exif = _metadata(out)
    assert img.size == (20, 40)
    assert ORIENTATION not in exif


def test_png_exif_chunk_is_removed():
    buf = BytesIO()
    Image.new("RGBA", (30, 30), (0, 128, 0, 255)).save(buf, format="PNG", exif=_exif_with_gps().tobytes())
    assert Image.open(BytesIO(buf.getvalue())).getexif().get_ifd(GPS_IFD)

    out, mime, ext = sanitize_image(buf.getvalue())
    img, exif = _metadata(out)
    assert not exif.get_ifd(GPS_IFD) and len(exif) == 0
    assert (mime, ext) == ("image/png", ".png")
    assert img.mode == "RGBA", "transparency survives"


def test_webp_exif_is_removed():
    buf = BytesIO()
    Image.new("RGB", (30, 30), "blue").save(buf, format="WEBP", exif=_exif_with_gps().tobytes())
    assert Image.open(BytesIO(buf.getvalue())).getexif().get_ifd(GPS_IFD)

    out, mime, ext = sanitize_image(buf.getvalue())
    _, exif = _metadata(out)
    assert len(exif) == 0
    assert (mime, ext) == ("image/webp", ".webp")


def test_huge_photos_are_scaled_down_never_up():
    big, _, _ = sanitize_image(_jpeg(size=(MAX_EDGE * 2, MAX_EDGE)))
    assert max(Image.open(BytesIO(big)).size) == MAX_EDGE
    small, _, _ = sanitize_image(_jpeg(size=(300, 200)))
    assert Image.open(BytesIO(small)).size == (300, 200)


def test_cmyk_jpeg_becomes_rgb():
    out, _, _ = sanitize_image(_jpeg(mode="CMYK"))
    assert Image.open(BytesIO(out)).mode == "RGB"


def test_gif_is_re_encoded_without_comments():
    buf = BytesIO()
    Image.new("P", (10, 10)).save(buf, format="GIF", comment=b"shot at 36.47N 81.8W")
    out, mime, ext = sanitize_image(buf.getvalue())
    assert b"36.47N" not in out
    assert (mime, ext) == ("image/gif", ".gif")


def test_not_an_image_is_rejected():
    with pytest.raises(ValueError):
        sanitize_image(b"definitely not an image, just some bytes here")


def test_upload_photo_stores_the_sanitized_bytes(monkeypatch):
    """The storage layer is where every upload route converges — so that's
    where sanitising has to happen, not in each router."""
    from app.services.storage import storage_service

    stored: dict[str, bytes] = {}

    async def fake_local(data, filename, directory):
        stored[filename] = data
        return f"/{directory}/{filename}"

    monkeypatch.setattr(storage_service, "use_r2", False)
    monkeypatch.setattr(storage_service, "upload_dir", "uploads/photos", raising=False)
    monkeypatch.setattr(storage_service, "thumbnail_dir", "uploads/thumbnails", raising=False)
    monkeypatch.setattr(storage_service, "_upload_to_local", fake_local)

    raw = _jpeg(size=(40, 20), exif=_exif_with_gps(orientation=6))
    # The client lies about the type and name; neither should matter.
    photo_url, thumb_url = asyncio.run(storage_service.upload_photo(raw, "IMG_0001.png", "image/png"))

    assert photo_url.endswith(".jpg"), "extension follows the real format"
    original = next(v for k, v in stored.items() if not k.startswith("thumb_"))
    img, exif = _metadata(original)
    assert len(exif) == 0 and img.size == (20, 40)
    thumb = next(v for k, v in stored.items() if k.startswith("thumb_"))
    assert Image.open(BytesIO(thumb)).size[1] > Image.open(BytesIO(thumb)).size[0], "thumbnail is upright too"


def test_avatar_is_upright():
    """Left half red, right half blue, tagged 'rotate 90° CW'. Displayed
    upright, red is on TOP — so the centre-cropped avatar must be red above
    blue, not red beside blue."""
    from app.services.storage import storage_service

    src = Image.new("RGB", (40, 20), "blue")
    src.paste((255, 0, 0), (0, 0, 20, 20))
    buf = BytesIO()
    src.save(buf, format="JPEG", quality=95, exif=_exif_with_gps(orientation=6).tobytes())

    out = storage_service._create_square_avatar(buf.getvalue(), size=20)
    img, exif = _metadata(out)
    assert len(exif) == 0 and img.size == (20, 20)
    top, bottom = img.getpixel((10, 2)), img.getpixel((10, 17))
    assert top[0] > 150 and top[2] < 100, f"top should be red, got {top}"
    assert bottom[2] > 150 and bottom[0] < 100, f"bottom should be blue, got {bottom}"


def test_backfill_skips_clean_photos_and_catches_dirty_ones():
    """The backfill must be safe to re-run: a photo it already cleaned is left
    alone (no second JPEG re-compression), a dirty one is caught."""
    from strip_photo_exif import needs_cleaning

    dirty = _jpeg(exif=_exif_with_gps())
    assert needs_cleaning(dirty)
    clean, _, _ = sanitize_image(dirty)
    assert not needs_cleaning(clean)
    assert not needs_cleaning(b"not an image at all, skip rather than crash")


# ── Review follow-ups (2026-09-29) ───────────────────────────────────────────

def test_mpo_phone_jpegs_are_accepted_as_jpeg():
    """iPhone HDR / many Android cameras write a multi-picture JPEG that Pillow
    opens as 'MPO'. Refusing it rejected ordinary phone photos."""
    buf = BytesIO()
    a, b = Image.new("RGB", (40, 20), "red"), Image.new("RGB", (40, 20), "blue")
    a.save(buf, format="MPO", save_all=True, append_images=[b], exif=_exif_with_gps(orientation=6).tobytes())
    assert Image.open(BytesIO(buf.getvalue())).format == "MPO"

    out, mime, ext = sanitize_image(buf.getvalue())
    img, exif = _metadata(out)
    assert (mime, ext) == ("image/jpeg", ".jpg") and img.format == "JPEG"
    assert len(exif) == 0 and img.size == (20, 40)


def test_decompression_bombs_are_refused_before_decoding():
    """A tiny PNG that decodes to 13000×13000 used ~2 GB. The header check
    must refuse it without allocating the pixels."""
    buf = BytesIO()
    Image.new("1", (13000, 13000)).save(buf, format="PNG", optimize=True)
    assert len(buf.getvalue()) < 1_000_000
    with pytest.raises(ValueError):
        sanitize_image(buf.getvalue())


def test_long_animations_are_refused():
    # Distinct frames — Pillow merges identical ones when saving a GIF.
    frames = [Image.new("L", (8, 8), (i * 37) % 256) for i in range(150)]
    buf = BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=50)
    assert Image.open(BytesIO(buf.getvalue())).n_frames == 150
    with pytest.raises(ValueError):
        sanitize_image(buf.getvalue())


def test_animated_webp_keeps_its_frames_and_loses_metadata():
    frames = [Image.new("RGB", (16, 16), c) for c in ("red", "green", "blue")]
    buf = BytesIO()
    frames[0].save(buf, format="WEBP", save_all=True, append_images=frames[1:], duration=100,
                   exif=_exif_with_gps().tobytes())
    out, mime, _ = sanitize_image(buf.getvalue())
    img = Image.open(BytesIO(out))
    assert mime == "image/webp" and getattr(img, "n_frames", 1) == 3
    assert len(img.getexif()) == 0


def test_cmyk_icc_profile_is_not_attached_to_rgb_output():
    buf = BytesIO()
    Image.new("CMYK", (10, 10)).save(buf, format="JPEG", icc_profile=b"fake-cmyk-profile-bytes")
    out, _, _ = sanitize_image(buf.getvalue())
    assert "icc_profile" not in Image.open(BytesIO(out)).info


def test_backfill_can_keep_full_size():
    out, _, _ = sanitize_image(_jpeg(size=(MAX_EDGE * 2, 100)), max_edge=None)
    assert Image.open(BytesIO(out)).size == (MAX_EDGE * 2, 100)
