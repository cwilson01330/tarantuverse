"""Every client's `TARGET_ROUTES` must name exactly the targets the API allows.

An entry's button names a screen by target (`app.services.whats_new.WHATS_NEW_TARGETS`).
Each of the four client libs maps every target to that app's own route, or to an
explicit `null` when the app has no such screen (the entry then renders without a
button). A target missing from a lib would silently render a dead link, and an
extra key means the lib is ahead of the API, so both fail here.

Reads the TypeScript sources; skips when they are not present (API-only checkout).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.whats_new import WHATS_NEW_TARGETS

REPO = Path(__file__).resolve().parents[3]

CLIENT_LIBS = [
    "apps/web/src/lib/whatsNew.ts",
    "apps/web-herpetoverse/src/lib/whatsNew.ts",
    "apps/mobile/src/lib/whats-new.ts",
    "apps/mobile-herpetoverse/src/lib/whats-new.ts",
]

_BLOCK = re.compile(
    r"export\s+const\s+TARGET_ROUTES\b[^=]*=\s*\{(?P<body>.*?)\n\}", re.DOTALL
)
_KEY = re.compile(r"^\s*(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*:", re.MULTILINE)


def _strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    return re.sub(r"(?m)//.*$", "", src)


def _target_route_keys(rel: str) -> list[str]:
    path = REPO / rel
    if not (REPO / "apps" / "web").exists():
        pytest.skip("client sources not present (API-only checkout)")
    assert path.exists(), f"{rel} is missing (every app ships a what's-new lib)"
    src = _strip_comments(path.read_text(encoding="utf-8"))
    m = _BLOCK.search(src)
    assert m, f"{rel}: no literal `export const TARGET_ROUTES … = {{ … }}` found"
    return _KEY.findall(m.group("body"))


@pytest.mark.parametrize("rel", CLIENT_LIBS)
def test_target_routes_cover_exactly_the_api_targets(rel):
    keys = _target_route_keys(rel)
    assert len(keys) == len(set(keys)), f"{rel}: duplicate TARGET_ROUTES keys {keys}"
    missing = sorted(set(WHATS_NEW_TARGETS) - set(keys))
    extra = sorted(set(keys) - set(WHATS_NEW_TARGETS))
    assert not missing, f"{rel}: TARGET_ROUTES is missing {missing} (use an explicit null if the app has no such screen)"
    assert not extra, f"{rel}: TARGET_ROUTES has targets the API does not allow: {extra}"


def test_the_target_list_is_the_one_the_spec_names():
    assert set(WHATS_NEW_TARGETS) == {
        "expenses",
        "feeding_day",
        "analytics_advanced",
        "collection",
        "species",
        "settings",
    }
