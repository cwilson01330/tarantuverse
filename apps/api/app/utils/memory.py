"""Hand freed memory back to the operating system after heavy work.

The API runs on a 512 MB instance. Python frees image-decode buffers and big
query results, but glibc keeps the freed pages in its malloc arenas (one per
worker thread), so the process's resident memory only ever ratchets up. Render
metrics 2026-11-19 → 11-23 showed ~370 MB → ~464 MB, with the biggest step
(+52 MB) during three photo uploads. `malloc_trim(0)` returns the free pages
of every arena; a GC pass first makes sure cyclic garbage is actually freed.

Called after every image upload (services/storage.py) and at the end of the
hourly digest cron (routers/notifications.py). Cheap (milliseconds), never
raises, and a no-op where glibc isn't available (macOS, Windows, musl).
"""
from __future__ import annotations

import ctypes
import ctypes.util
import gc
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)

_TRIM: Optional[Callable[[int], int]] = None
_LOOKED_UP = False


def _trim_function() -> Optional[Callable[[int], int]]:
    """glibc's malloc_trim, looked up once; None when it doesn't exist."""
    global _TRIM, _LOOKED_UP
    if not _LOOKED_UP:
        _LOOKED_UP = True
        try:
            name = ctypes.util.find_library("c")
            libc = ctypes.CDLL(name) if name else None
            trim = getattr(libc, "malloc_trim", None) if libc is not None else None
            if trim is not None:
                trim.argtypes = [ctypes.c_size_t]
                trim.restype = ctypes.c_int
            _TRIM = trim
        except Exception:  # pragma: no cover - platform dependent
            _TRIM = None
    return _TRIM


def release_memory() -> bool:
    """Collect garbage and return free heap pages to the OS.

    Returns True when glibc reported it released memory. Never raises.
    """
    try:
        gc.collect()
    except Exception:  # pragma: no cover
        pass
    trim = _trim_function()
    if trim is None:
        return False
    try:
        return bool(trim(0))
    except Exception:
        logger.debug("malloc_trim failed", exc_info=True)
        return False
