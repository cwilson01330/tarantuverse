"""Server-side product analytics (PostHog) — BRIEF §7.

The first real custom-event funnel in the product. Emitting server-side means the
growth-loop events can't be ad-blocked. Best-effort by design: a missing key,
missing library, or network hiccup must NEVER break the request that triggered it.

Enable by installing `posthog` and setting POSTHOG_API_KEY (+ optional POSTHOG_HOST,
default https://us.i.posthog.com). Until then every call is a silent no-op.
"""
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_client = None
_initialized = False


def _get_client():
    global _client, _initialized
    if _initialized:
        return _client
    _initialized = True
    api_key = os.getenv("POSTHOG_API_KEY")
    if not api_key:
        return None
    try:
        import posthog  # lazy — optional dependency

        posthog.api_key = api_key
        posthog.host = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")
        _client = posthog
    except Exception:
        logger.info("PostHog not available; analytics events are no-ops.")
        _client = None
    return _client


def capture(event: str, distinct_id: Optional[str], properties: Optional[dict[str, Any]] = None) -> None:
    """Emit a product event. Swallows all errors (analytics is never load-bearing)."""
    client = _get_client()
    if client is None:
        return
    try:
        client.capture(
            distinct_id=str(distinct_id) if distinct_id else "anonymous",
            event=event,
            properties={**(properties or {}), "app": "tarantuverse"},
        )
    except Exception:
        logger.debug("analytics capture failed for %s", event, exc_info=True)
