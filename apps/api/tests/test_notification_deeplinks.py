"""Deeplink vocabulary invariants.

One backend serves four clients (TV web/mobile, HV web/mobile) with four
different route shapes. The `deeplink` field therefore holds a CANONICAL
LOGICAL route, not a literal path — each client owns a resolver.

These tests guard the failure mode that produced the bug: someone pastes the
path they happen to have open in their own app, it's stored verbatim, and taps
from the other three clients land on a 404. Historically /dashboard/transfers
and /app/transfers both shipped this way, and neither existed on the client
that received most of those notifications.

Pure-function tests — no database, so no requires_postgres marker.
"""
import pytest

from app.services.notification_service import DEEPLINK_PATTERNS, _validate_deeplink


@pytest.mark.parametrize(
    "deeplink",
    [
        "/messages/brooke",
        "/community/cory",
        "/forums/thread/3f8a1c2e-5b6d-4a7f-9c0e-1d2b3a4c5d6e",
        "/feeding-day",
        "/transfers",
        None,
    ],
)
def test_vocabulary_is_preserved(deeplink):
    assert _validate_deeplink(deeplink, "test") == deeplink


@pytest.mark.parametrize(
    "deeplink",
    [
        # Platform-specific paths that must never be stored raw. Each of these
        # is a real route on exactly one client and a 404 on the other three.
        "/dashboard/transfers",
        "/app/transfers",
        "/dashboard/feeding-day",
        "/app/feeding-day",
        "/community/forums/thread/3f8a1c2e-5b6d-4a7f-9c0e-1d2b3a4c5d6e",
        "/dashboard/tarantulas/new",
        # Not an in-app path at all.
        "https://example.com/phish",
        "//example.com/phish",
        "not-a-path",
    ],
)
def test_platform_specific_and_external_links_are_dropped(deeplink):
    assert _validate_deeplink(deeplink, "test") is None


def test_patterns_are_anchored():
    """Unanchored patterns would let a prefix match smuggle anything through."""
    for pattern in DEEPLINK_PATTERNS:
        assert pattern.startswith("^"), pattern
        assert pattern.endswith("$"), pattern
