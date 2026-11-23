"""Freed memory is handed back to the OS after heavy work (2026-11-23).

Render metrics showed the API creeping from ~370 MB to ~464 MB of its 512 MB
over four days; the biggest single step (+52 MB, 2026-11-20 22:40-22:50 UTC)
lined up with three photo uploads. Python frees the decode buffers, but glibc
keeps the pages in its (per-thread) arenas, so every upload raises the floor.
`utils/memory.py::release_memory` runs a GC pass and `malloc_trim(0)`; it is
called after every image upload and after the hourly digest cron.
"""
import asyncio
from io import BytesIO

from PIL import Image

from app.utils import memory


def _jpeg() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (40, 20), "red").save(buf, format="JPEG")
    return buf.getvalue()


def test_release_memory_returns_a_bool_and_never_raises():
    assert memory.release_memory() in (True, False)


def test_release_memory_without_malloc_trim_is_a_no_op(monkeypatch):
    monkeypatch.setattr(memory, "_trim_function", lambda: None)
    assert memory.release_memory() is False


def test_release_memory_swallows_a_failing_trim(monkeypatch):
    def broken(_pad):
        raise OSError("no")

    monkeypatch.setattr(memory, "_trim_function", lambda: broken)
    assert memory.release_memory() is False


def test_release_memory_reports_trim_result(monkeypatch):
    calls = []

    def trim(pad):
        calls.append(pad)
        return 1

    monkeypatch.setattr(memory, "_trim_function", lambda: trim)
    assert memory.release_memory() is True
    assert calls == [0]


def _spy(monkeypatch):
    from app.services import storage

    calls = []
    monkeypatch.setattr(storage, "release_memory", lambda: calls.append(1) or True)
    return calls


def _local_storage(monkeypatch):
    from app.services.storage import storage_service

    async def fake_local(data, filename, directory):
        return f"/{directory}/{filename}"

    monkeypatch.setattr(storage_service, "use_r2", False)
    monkeypatch.setattr(storage_service, "upload_dir", "uploads/photos", raising=False)
    monkeypatch.setattr(storage_service, "thumbnail_dir", "uploads/thumbnails", raising=False)
    monkeypatch.setattr(storage_service, "_upload_to_local", fake_local)
    return storage_service


def test_photo_upload_releases_memory(monkeypatch):
    calls = _spy(monkeypatch)
    svc = _local_storage(monkeypatch)
    asyncio.run(svc.upload_photo(_jpeg(), "a.jpg", "image/jpeg"))
    assert calls, "upload_photo must hand decode memory back"


def test_failed_photo_upload_still_releases_memory(monkeypatch):
    calls = _spy(monkeypatch)
    svc = _local_storage(monkeypatch)
    try:
        asyncio.run(svc.upload_photo(b"not an image at all", "a.jpg", "image/jpeg"))
    except ValueError:
        pass
    assert calls, "a rejected upload decoded (part of) an image too"


def test_avatar_and_species_uploads_release_memory(monkeypatch):
    calls = _spy(monkeypatch)
    svc = _local_storage(monkeypatch)
    asyncio.run(svc.upload_avatar(_jpeg(), "a.jpg"))
    asyncio.run(svc.upload_species_image(_jpeg(), "test-species"))
    assert len(calls) == 2
