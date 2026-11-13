"""The brood and everyday-logging libs ship in two copies (mobile + web);
everything below the marker line must be byte-identical. Imports (which differ
per platform) sit above the marker. Skips on an API-only checkout."""
from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
MARKER = "// ---- shared below: keep identical in both copies ----"

PAIRS = {
    "broods": ("apps/mobile/src/lib/broods.ts", "apps/web/src/lib/broods.ts"),
    "everyday-logging": ("apps/mobile/src/lib/everyday-logging.ts", "apps/web/src/lib/everydayLogging.ts"),
}


def _shared_half(rel: str) -> str:
    if not (REPO / "apps" / "web").exists():
        pytest.skip("client sources not present (API-only checkout)")
    path = REPO / rel
    assert path.exists(), f"{rel} is missing"
    src = path.read_bytes().decode("utf-8").replace("\r\n", "\n")
    assert src.count(MARKER) == 1, f"{rel}: expected exactly one marker line {MARKER!r}"
    return src.split(MARKER, 1)[1]


@pytest.mark.parametrize("name", sorted(PAIRS))
def test_copies_are_identical_below_the_marker(name):
    mobile_rel, web_rel = PAIRS[name]
    mobile, web = _shared_half(mobile_rel), _shared_half(web_rel)
    if mobile != web:
        for i, (x, y) in enumerate(zip(mobile.splitlines(), web.splitlines()), start=1):
            if x != y:
                pytest.fail(f"{name} copies differ at shared line {i}:\n  mobile: {x!r}\n  web:    {y!r}")
        pytest.fail(f"{name} copies differ in length")


@pytest.mark.parametrize("name", sorted(PAIRS))
def test_shared_half_is_not_empty(name):
    assert len(_shared_half(PAIRS[name][0]).strip()) > 500
