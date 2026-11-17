"""The premolt card view lib ships in two copies (mobile + web); everything
below the marker line must be byte-identical.

`apps/mobile/src/lib/premolt-view.ts` and `apps/web/src/lib/premoltView.ts`
hold the prediction type, the card-state rule and the card copy. Only the
transport above the marker differs (axios vs fetch).
"""
from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]

MOBILE = "apps/mobile/src/lib/premolt-view.ts"
WEB = "apps/web/src/lib/premoltView.ts"
MARKER = "// ---- shared below: keep identical in both copies ----"


def _shared_half(rel: str) -> str:
    if not (REPO / "apps" / "web").exists():
        pytest.skip("client sources not present (API-only checkout)")
    path = REPO / rel
    assert path.exists(), f"{rel} is missing"
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
                    f"premolt view copies differ at shared line {i}:\n"
                    f"  mobile: {x!r}\n  web:    {y!r}"
                )
        pytest.fail(f"premolt view copies differ in length ({len(a)} vs {len(b)} shared lines)")


def test_shared_half_is_not_empty():
    shared = _shared_half(MOBILE)
    assert "premoltCardState" in shared and "PREMOLT_COPY" in shared and "alertCount" in shared
