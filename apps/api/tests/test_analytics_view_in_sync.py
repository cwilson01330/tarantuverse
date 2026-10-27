"""The analytics view lib ships in two copies (mobile + web); everything below
the marker line must be byte-identical.

`apps/mobile/src/lib/analytics-view.ts` and `apps/web/src/lib/analyticsView.ts`
turn the analytics API responses into the redesign's copy and chart geometry.
Only the doc comment above the marker differs. A drift here means one platform
shows different words or a different chart than the other, so it fails here
(the jest suite in apps/mobile pins the behaviour of the shared half).

Reads the TypeScript sources; skips when they are not present (API-only checkout).
"""
from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]

MOBILE = "apps/mobile/src/lib/analytics-view.ts"
WEB = "apps/web/src/lib/analyticsView.ts"
MARKER = "// ---- shared below: keep identical in both copies ----"


def _shared_half(rel: str) -> str:
    if not (REPO / "apps" / "web").exists():
        pytest.skip("client sources not present (API-only checkout)")
    path = REPO / rel
    assert path.exists(), f"{rel} is missing"
    # Compare bytes as text without letting a CRLF checkout look like drift.
    src = path.read_bytes().decode("utf-8").replace("\r\n", "\n")
    assert src.count(MARKER) == 1, f"{rel}: expected exactly one marker line {MARKER!r}"
    return src.split(MARKER, 1)[1]


def test_both_copies_are_identical_below_the_marker():
    mobile = _shared_half(MOBILE)
    web = _shared_half(WEB)
    if mobile != web:
        a, b = mobile.splitlines(), web.splitlines()
        for i, (x, y) in enumerate(zip(a, b), start=1):
            if x != y:
                pytest.fail(
                    f"analytics view copies differ at shared line {i}:\n"
                    f"  mobile: {x!r}\n  web:    {y!r}"
                )
        pytest.fail(f"analytics view copies differ in length ({len(a)} vs {len(b)} shared lines)")


def test_shared_half_is_not_empty():
    assert len(_shared_half(MOBILE).strip()) > 1000
