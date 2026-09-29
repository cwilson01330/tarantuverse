# Share Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let keepers share a "specimen label" card of an animal (profile) or a fresh molt as an image to Instagram/TikTok/Facebook/Reddit/Discord, optionally with an unlisted card link — without ever changing anything in their collection.

**Architecture:** The API composes every card's text server-side from an allow-listed set of fields the keeper chose, and hands out a short-lived signed render token. One renderer on the Tarantuverse web app (`next/og` `ImageResponse`) turns that payload into PNGs in four shapes; the same renderer draws link previews for card links and already-public animals. Both mobile apps get a composer screen that downloads the PNG and opens the native share sheet (new native modules ⇒ new builds).

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (API, `apps/api`), Next.js 15 App Router + `next/og` (`apps/web`, `apps/web-herpetoverse`), Expo SDK 54 / RN 0.81 (`apps/mobile`, `apps/mobile-herpetoverse`), `expo-sharing` ~14.0.7, `expo-media-library` ~18.2.0, `expo-file-system` (already bundled with `expo`).

**Spec:** `docs/superpowers/specs/2026-09-29-share-cards-design.md` — read it before starting. §6 (privacy and card links) is the part most likely to be gotten wrong.

## Global Constraints

- Tarantuverse web lives at `https://www.tarantuverse.com` (the bare domain redirects there — checked 2026-09-29). Use the `www` origin everywhere an image or card-link URL is built, so crawlers never have to follow a redirect for a preview image. Herpetoverse is served on the bare `https://herpetoverse.com`.

- Sharing NEVER changes anything in the app: no write to `inverts.visibility`, `inverts.is_public`, `animals.visibility`, `animals.is_public`, or `users.collection_visibility` anywhere in this feature.
- Card text is computed server-side from the animal. The client only sends WHICH fields to show, never values.
- Field allow-lists (exact): TV molt → `photo, name, species, size_change, days_in_care`; TV profile → `photo, name, species, sex, in_care, molts, size`; HV profile → `photo, name, species, sex, in_care, weight, length, sheds`. Never includable anywhere: price paid, source, notes, enclosure, location, owner email/username.
- Shapes (exact px): `story` 1080×1920, `post` 1080×1350, `square` 1080×1080, `wide` 1200×630.
- Render tokens expire after 15 minutes. Card-link codes are 128-bit random, URL-safe (`secrets.token_urlsafe(16)`).
- Card-link pages are `robots: noindex, nofollow`, show only the card image, and never link into the animal, collection or keeper profile.
- Wordmark only (`tarantuverse` / `herpetoverse`). No QR, URL, slogan or call to action on any card.
- A missing value removes its row; never render "—", "0 molts", or an empty row.
- Copy rules (ADR-015 carry over): never "Successfully", no exclamation marks, no emoji on cards.
- Web: dark mode on every new UI surface (`dark:` variants). Card IMAGES use a fixed paper palette regardless of theme.
- Mobile: no new hardcoded hex/fontSize/borderRadius (TV token gate: `node scripts/check-design-tokens.js`).
- Git: the human partner runs all git commands. Commit steps below are the exact commands to hand over, PowerShell-safe (one per line, no `&&`).
- Neon is read-only from the agent; migrations run on Render via `start.sh`.

## Review Focus

1. **Private animal, private collection** — sharing must work (image) and leave every visibility column byte-for-byte unchanged. Pinned in Task 3.
2. **Crawler blocked by robots.txt** — `apps/web/src/app/robots.ts` disallows `/api/`; X/Twitter's card fetcher honours robots, so previews would silently be blank. Pinned in Task 4 (allow `/api/og/` and `/api/card-link/`).
3. **Animal deleted after a card link was made** — `/c/<code>` must show "This card is no longer shared", not a broken image or a 500. Pinned in Task 3 (410) and Task 5 (page copy).
4. **Photo URL that fails to load in the renderer** (deleted photo, r2.dev rate-limit) — card must still render with the taxon glyph block. Pinned in Task 4.
5. **Co-keeper (keeper role) shares someone else's animal** — allowed; a viewer/logger or stranger gets 404; only the sharer or the owner can revoke the card link. Pinned in Task 3.

---

## File Structure

**API (`apps/api`)**
- Create `app/services/share_card.py` — pure composition: allow-lists, defaults, `compose_card()`. No DB.
- Create `app/utils/share_token.py` — sign/verify stateless render tokens (HMAC).
- Create `app/models/card_link.py` — `CardLink` model.
- Create `alembic/versions/shc_20260930_share_cards.py` — `card_links` table + `users.share_defaults`.
- Create `app/schemas/share_card.py` — request/response models.
- Create `app/routers/share_cards.py` — `/share-cards`, `/card-links`, `/public-card`.
- Modify `app/main.py` — register router.
- Modify `app/models/user.py` — `share_defaults` column.
- Modify `app/config.py` — `CARD_RENDERER_ORIGIN`.
- Tests: `tests/test_share_card_compose.py`, `tests/test_share_token.py`, `tests/test_share_cards_router.py`.

**Web renderer (`apps/web`)**
- Create `src/lib/share-card/SpecimenCard.tsx` — the one template (JSX for `ImageResponse`).
- Create `src/lib/share-card/render.tsx` — shape sizes, font loading, `renderCard(payload, shape)`.
- Create `src/lib/share-card/fonts/LibreCaslonText-Regular.ttf`, `LibreCaslonText-Italic.ttf` (OFL; download in Task 4).
- Create `src/app/api/card/[token]/route.tsx`, `src/app/api/card-link/[code]/route.tsx`, `src/app/api/og/[app]/[id]/route.tsx`.
- Modify `src/app/robots.ts`.

**Link pages + previews**
- Create `apps/web/src/app/c/[code]/page.tsx`, `apps/web-herpetoverse/src/app/c/[code]/page.tsx`.
- Modify `apps/web/src/app/i/[id]/page.tsx` → move body to `InvertPublicClient.tsx`; page becomes server with `generateMetadata`. Same for `apps/web/src/app/t/[id]/page.tsx` (→ `TarantulaPublicClient.tsx`).
- Modify `apps/web-herpetoverse/src/app/a/[id]/page.tsx` — add `generateMetadata`.

**Web composer**
- Create `apps/web/src/lib/shareCards.ts`, `apps/web/src/components/ShareCardModal.tsx`; modify `apps/web/src/app/dashboard/inverts/[id]/page.tsx`.
- Create `apps/web-herpetoverse/src/lib/shareCards.ts`, `apps/web-herpetoverse/src/components/ShareCardModal.tsx`; modify `apps/web-herpetoverse/src/app/app/reptiles/[id]/AnimalDetailClient.tsx`.

**Mobile**
- TV: create `apps/mobile/src/lib/share-cards.ts`, `apps/mobile/app/share/[animalId].tsx`, `apps/mobile/app/share/cards.tsx`; modify `app/invert/[id].tsx`, `app/invert/add-molt.tsx`, `app/sharing/index.tsx`, `app.json`, `package.json`.
- HV: create `apps/mobile-herpetoverse/src/lib/share-cards.ts`, `apps/mobile-herpetoverse/app/share/[animalId].tsx`; modify `src/screens/AnimalDetailScreen.tsx`, `app.json`, `package.json`.

---

## Milestone A — API

### Task 1: Card composition (pure)

**Files:**
- Create: `apps/api/app/services/share_card.py`
- Test: `apps/api/tests/test_share_card_compose.py`

**Interfaces:**
- Produces:
  - `FIELD_ALLOW: dict[tuple[str, str], tuple[str, ...]]`, `DEFAULT_FIELDS: dict[tuple[str, str], tuple[str, ...]]`, `SHAPES: tuple[str, ...] = ("story", "post", "square", "wide")`
  - `@dataclass CardSubject(app: str, name: str|None, scientific_name: str|None, common_name: str|None, sex: str|None, date_acquired: date|None, photo_url: str|None, taxon: str, molt_count: int = 0, latest_size: str|None = None, weight_g: float|None = None, length_in: float|None = None, shed_count: int = 0)`
  - `@dataclass MoltFacts(number: int, molted_on: date, span_before: float|None, span_after: float|None)`
  - `clean_fields(app: str, kind: str, requested: list[str] | None) -> list[str]` (raises `ValueError` for an unknown app/kind)
  - `compose_card(kind: str, subject: CardSubject, fields: list[str], molt: MoltFacts | None = None, today: date | None = None) -> dict` returning `{"app", "kind", "taxon", "header", "name", "scientific_name", "common_name", "photo_url", "facts": [{"label": str, "value": str}]}`
  - `in_care_label(start: date, end: date) -> str|None`

- [ ] **Step 1: Write the failing tests**

```python
# apps/api/tests/test_share_card_compose.py
"""Card text is composed server-side, from only the fields the keeper chose.

These pin the privacy promise (a field that wasn't chosen, or isn't on the
allow-list, never appears) and the "no empty rows" rule from the spec.
"""
from datetime import date

import pytest

from app.services.share_card import (
    DEFAULT_FIELDS, FIELD_ALLOW, CardSubject, MoltFacts,
    clean_fields, compose_card, in_care_label,
)

TODAY = date(2026, 9, 30)


def rosie(**kw):
    base = dict(
        app="tarantuverse", taxon="tarantula", name="Rosie",
        scientific_name="Brachypelma hamorii", common_name="Mexican redknee",
        sex="female", date_acquired=date(2025, 8, 14),
        photo_url="https://pub.example.r2.dev/photos/0b1c.jpg",
        molt_count=9, latest_size="4.1 in",
    )
    base.update(kw)
    return CardSubject(**base)


def test_unknown_and_disallowed_fields_are_dropped():
    assert clean_fields("tarantuverse", "profile", ["name", "price_paid", "notes", "email", "sex"]) == ["name", "sex"]


def test_none_means_defaults():
    assert clean_fields("tarantuverse", "molt", None) == list(DEFAULT_FIELDS[("tarantuverse", "molt")])


def test_herpetoverse_has_no_molt_card():
    with pytest.raises(ValueError):
        clean_fields("herpetoverse", "molt", None)


def test_profile_card_full():
    card = compose_card("profile", rosie(), list(FIELD_ALLOW[("tarantuverse", "profile")]), today=TODAY)
    assert card["header"] == "Specimen · female"
    assert card["name"] == "Rosie"
    assert card["scientific_name"] == "Brachypelma hamorii"
    assert card["common_name"] == "Mexican redknee"
    assert card["photo_url"].endswith("0b1c.jpg")
    assert card["facts"] == [
        {"label": "In care", "value": "1 yr, 1 mo"},
        {"label": "Molts", "value": "9"},
        {"label": "Leg span", "value": "4.1 in"},
    ]


def test_unchosen_fields_are_absent_not_blank():
    card = compose_card("profile", rosie(), ["species"], today=TODAY)
    assert card["name"] is None and card["photo_url"] is None
    assert card["header"] == "Specimen"  # sex not chosen
    assert card["facts"] == []


def test_missing_values_remove_rows():
    card = compose_card(
        "profile", rosie(date_acquired=None, molt_count=0, latest_size=None, sex="unknown"),
        list(FIELD_ALLOW[("tarantuverse", "profile")]), today=TODAY,
    )
    assert card["header"] == "Specimen"
    assert card["facts"] == []


def test_molt_card_with_measurements():
    molt = MoltFacts(number=9, molted_on=date(2026, 9, 29), span_before=3.2, span_after=4.1)
    card = compose_card("molt", rosie(), ["name", "species", "size_change", "days_in_care"], molt=molt, today=TODAY)
    assert card["header"] == "Specimen · molt no. 9"
    assert card["facts"] == [
        {"label": "Leg span", "value": "3.2 → 4.1 in"},
        {"label": "In care", "value": "day 411"},
    ]


def test_molt_card_without_measurements_is_still_complete():
    """385 of 438 production molts have no measurements (2026-09-29)."""
    molt = MoltFacts(number=3, molted_on=date(2026, 9, 29), span_before=None, span_after=None)
    card = compose_card("molt", rosie(), ["name", "species", "size_change"], molt=molt, today=TODAY)
    assert card["header"] == "Specimen · molt no. 3"
    assert card["facts"] == []


def test_molt_card_after_only():
    molt = MoltFacts(number=4, molted_on=TODAY, span_before=None, span_after=2.0)
    card = compose_card("molt", rosie(), ["size_change"], molt=molt, today=TODAY)
    assert card["facts"] == [{"label": "Leg span", "value": "2 in"}]


def test_non_spider_size_label():
    s = rosie(taxon="scorpion", latest_size="62 mm")
    card = compose_card("profile", s, ["size"], today=TODAY)
    assert card["facts"] == [{"label": "Body length", "value": "62 mm"}]


def test_herpetoverse_profile():
    s = CardSubject(
        app="herpetoverse", taxon="snake", name="Juniper", scientific_name="Python regius",
        common_name="Ball python", sex="male", date_acquired=date(2023, 5, 2), photo_url=None,
        weight_g=1412.0, length_in=38.5, shed_count=14,
    )
    card = compose_card("profile", s, list(FIELD_ALLOW[("herpetoverse", "profile")]), today=TODAY)
    assert card["header"] == "Specimen · male"
    assert card["facts"] == [
        {"label": "In care", "value": "3 yr, 4 mo"},
        {"label": "Weight", "value": "1.41 kg"},
        {"label": "Length", "value": "38.5 in"},
        {"label": "Sheds", "value": "14"},
    ]


@pytest.mark.parametrize("start,end,label", [
    (date(2026, 9, 1), date(2026, 9, 30), "less than a month"),
    (date(2026, 8, 30), date(2026, 9, 30), "1 mo"),
    (date(2025, 9, 30), date(2026, 9, 30), "1 yr"),
    (date(2026, 10, 1), date(2026, 9, 30), None),  # future acquisition: say nothing
])
def test_in_care_label(start, end, label):
    assert in_care_label(start, end) == label
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api` then `python -m pytest -q -p no:cacheprovider tests/test_share_card_compose.py`
Expected: collection ERROR — `ModuleNotFoundError: No module named 'app.services.share_card'`.

- [ ] **Step 3: Implement**

```python
# apps/api/app/services/share_card.py
"""Share cards — composing the text on a card (spec: docs/superpowers/specs/
2026-09-29-share-cards-design.md).

Everything a card says is decided HERE, from the animal's own data and the
list of fields the keeper chose. The client never sends values, only field
names, and names not on the allow-list are dropped. That is the privacy
promise: nothing appears on a card that the keeper didn't pick, and some
things (price paid, source, notes, location) can never be picked at all.

Pure functions, no DB — the router gathers a CardSubject and calls in.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

SHAPES = ("story", "post", "square", "wide")

FIELD_ALLOW: dict[tuple[str, str], tuple[str, ...]] = {
    ("tarantuverse", "molt"): ("photo", "name", "species", "size_change", "days_in_care"),
    ("tarantuverse", "profile"): ("photo", "name", "species", "sex", "in_care", "molts", "size"),
    ("herpetoverse", "profile"): ("photo", "name", "species", "sex", "in_care", "weight", "length", "sheds"),
}

# What a first-time sharer sees switched on. Days-in-care is off by default
# on the molt card (the mockup the spec approved).
DEFAULT_FIELDS: dict[tuple[str, str], tuple[str, ...]] = {
    ("tarantuverse", "molt"): ("photo", "name", "species", "size_change"),
    ("tarantuverse", "profile"): FIELD_ALLOW[("tarantuverse", "profile")],
    ("herpetoverse", "profile"): FIELD_ALLOW[("herpetoverse", "profile")],
}

# Taxa whose size is a leg span (spider-shaped); everything else is a body
# length. Mirrors growthLengthLabel() on the clients.
_LEG_SPAN_TAXA = {"tarantula", "true_spider", "whip_spider"}


@dataclass
class CardSubject:
    app: str
    name: Optional[str]
    scientific_name: Optional[str]
    common_name: Optional[str]
    sex: Optional[str]
    date_acquired: Optional[date]
    photo_url: Optional[str]
    taxon: str
    molt_count: int = 0
    latest_size: Optional[str] = None
    weight_g: Optional[float] = None
    length_in: Optional[float] = None
    shed_count: int = 0


@dataclass
class MoltFacts:
    number: int
    molted_on: date
    span_before: Optional[float]
    span_after: Optional[float]


def clean_fields(app: str, kind: str, requested: Optional[list[str]]) -> list[str]:
    key = (app, kind)
    if key not in FIELD_ALLOW:
        raise ValueError(f"No {kind} card for {app}")
    if requested is None:
        return list(DEFAULT_FIELDS[key])
    allowed = FIELD_ALLOW[key]
    # Keep allow-list order, drop anything else, de-duplicate.
    return [f for f in allowed if f in set(requested)]


def _num(x: float) -> str:
    """3.0 → '3', 3.25 → '3.25', never '3.250'."""
    return f"{x:.2f}".rstrip("0").rstrip(".")


def in_care_label(start: date, end: date) -> Optional[str]:
    if start > end:
        return None
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    if months <= 0:
        return "less than a month"
    years, rem = divmod(months, 12)
    parts = []
    if years:
        parts.append(f"{years} yr")
    if rem:
        parts.append(f"{rem} mo")
    return ", ".join(parts)


def _size_label(taxon: str) -> str:
    return "Leg span" if taxon in _LEG_SPAN_TAXA else "Body length"


def _weight(g: float) -> str:
    return f"{_num(g / 1000)} kg" if g >= 1000 else f"{_num(g)} g"


def compose_card(
    kind: str,
    subject: CardSubject,
    fields: list[str],
    molt: Optional[MoltFacts] = None,
    today: Optional[date] = None,
) -> dict:
    today = today or date.today()
    f = set(fields)
    sex = (getattr(subject.sex, "value", subject.sex) or "").lower()
    facts: list[dict] = []

    def fact(label: str, value: Optional[str]) -> None:
        if value:  # a missing value removes its row
            facts.append({"label": label, "value": value})

    if kind == "molt":
        if molt is None:
            raise ValueError("molt card needs a molt")
        header = f"Specimen · molt no. {molt.number}"
        if "size_change" in f:
            b, a = molt.span_before, molt.span_after
            unit = " in"
            if b is not None and a is not None:
                fact(_size_label(subject.taxon), f"{_num(b)} → {_num(a)}{unit}")
            elif a is not None:
                fact(_size_label(subject.taxon), f"{_num(a)}{unit}")
        if "days_in_care" in f and subject.date_acquired and subject.date_acquired <= molt.molted_on:
            fact("In care", f"day {(molt.molted_on - subject.date_acquired).days}")
    else:
        header = "Specimen"
        if "sex" in f and sex in ("male", "female"):
            header = f"Specimen · {sex}"
        if "in_care" in f and subject.date_acquired:
            fact("In care", in_care_label(subject.date_acquired, today))
        if subject.app == "tarantuverse":
            if "molts" in f and subject.molt_count > 0:
                fact("Molts", str(subject.molt_count))
            if "size" in f:
                fact(_size_label(subject.taxon), subject.latest_size)
        else:
            if "weight" in f and subject.weight_g:
                fact("Weight", _weight(float(subject.weight_g)))
            if "length" in f and subject.length_in:
                fact("Length", f"{_num(float(subject.length_in))} in")
            if "sheds" in f and subject.shed_count > 0:
                fact("Sheds", str(subject.shed_count))

    species_on = "species" in f
    return {
        "app": subject.app,
        "kind": kind,
        "taxon": subject.taxon,
        "header": header,
        "name": subject.name if "name" in f else None,
        "scientific_name": subject.scientific_name if species_on else None,
        "common_name": subject.common_name if species_on and kind == "profile" else None,
        "photo_url": subject.photo_url if "photo" in f else None,
        "facts": facts,
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_card_compose.py`
Expected: all pass (15 tests incl. parametrized).

- [ ] **Step 5: Commit** (hand to Cory)

```
git add apps/api/app/services/share_card.py apps/api/tests/test_share_card_compose.py
git commit -m "Share cards: server-side card composition with field allow-lists"
```

---

### Task 2: Render tokens, card-link model, migration

**Files:**
- Create: `apps/api/app/utils/share_token.py`
- Create: `apps/api/app/models/card_link.py`
- Create: `apps/api/alembic/versions/shc_20260930_share_cards.py`
- Modify: `apps/api/app/models/user.py` (add `share_defaults`), `apps/api/app/models/__init__.py` (import `CardLink`), `apps/api/app/config.py` (add `CARD_RENDERER_ORIGIN`)
- Test: `apps/api/tests/test_share_token.py`

**Interfaces:**
- Produces:
  - `sign_render_token(payload: dict, ttl_seconds: int = 900, now: float | None = None) -> str`
  - `verify_render_token(token: str, now: float | None = None) -> dict | None` (None when tampered, malformed or expired)
  - `class CardLink(Base)` table `card_links`: `id UUID pk`, `code String(32) unique indexed`, `app String(20)`, `animal_id UUID` (no FK — polymorphic across `inverts`/`animals`), `kind String(20)`, `payload JSONB not null`, `created_by UUID FK users.id ON DELETE CASCADE`, `owner_id UUID FK users.id ON DELETE CASCADE`, `created_at timestamptz server_default now()`, `revoked_at timestamptz null`
  - `User.share_defaults` JSONB nullable, shape `{"tarantuverse:molt": [...], "tarantuverse:profile": [...], "herpetoverse:profile": [...]}`
  - `settings.CARD_RENDERER_ORIGIN: str = "https://www.tarantuverse.com"`

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_share_token.py
"""Render tokens are the only credential for drawing a card of a private
animal, so tampering and expiry must both fail closed."""
from app.utils.share_token import sign_render_token, verify_render_token

P = {"app": "tarantuverse", "kind": "profile", "animal_id": "a1", "fields": ["name"], "shape": "story"}


def test_round_trip():
    t = sign_render_token(P, now=1000.0)
    assert verify_render_token(t, now=1001.0)["animal_id"] == "a1"


def test_expired():
    t = sign_render_token(P, ttl_seconds=900, now=1000.0)
    assert verify_render_token(t, now=1901.0) is None


def test_tampered_payload():
    t = sign_render_token(P, now=1000.0)
    body, sig = t.split(".")
    other = sign_render_token({**P, "animal_id": "someone-else"}, now=1000.0).split(".")[0]
    assert verify_render_token(f"{other}.{sig}", now=1001.0) is None


def test_garbage():
    for bad in ("", "abc", "a.b.c", "!!!.???"):
        assert verify_render_token(bad, now=1001.0) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_token.py`
Expected: `ModuleNotFoundError: No module named 'app.utils.share_token'`.

- [ ] **Step 3: Implement the token helper**

```python
# apps/api/app/utils/share_token.py
"""Stateless, short-lived tokens for rendering a share card.

The renderer (on the web app) fetches card DATA with this token and nothing
else — no login. So the token is the capability: HMAC-signed with a key
derived from API_SECRET_KEY (domain-separated from the invite-code key), and
dead after 15 minutes. No table: a token that outlives its use is harmless
once expired, and nothing needs revoking.
"""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from app.config import settings


def _key() -> bytes:
    return hashlib.sha256(f"share-card-render|{settings.API_SECRET_KEY}".encode()).digest()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_render_token(payload: dict, ttl_seconds: int = 900, now: Optional[float] = None) -> str:
    body = dict(payload, exp=int((now if now is not None else time.time()) + ttl_seconds))
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(_key(), raw, hashlib.sha256).digest()
    return f"{_b64(raw)}.{_b64(sig)}"


def verify_render_token(token: str, now: Optional[float] = None) -> Optional[dict]:
    try:
        body_b64, sig_b64 = token.split(".")
        raw = _unb64(body_b64)
        if not hmac.compare_digest(hmac.new(_key(), raw, hashlib.sha256).digest(), _unb64(sig_b64)):
            return None
        body = json.loads(raw)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(body, dict) or body.get("exp", 0) < (now if now is not None else time.time()):
        return None
    return body
```

- [ ] **Step 4: Run the token tests**

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_token.py`
Expected: 4 passed.

- [ ] **Step 5: Add the model, column and config**

```python
# apps/api/app/models/card_link.py
"""A card link — an unlisted, frozen, revocable page showing ONE share card.

Spec §6. The payload is the composed card (already filtered to the fields the
keeper chose) captured at the moment of sharing, so later edits to the animal
never reach it. There is deliberately no FK to the animal: animals live in two
tables (`inverts`, `animals`), and a deleted animal is detected at read time
(the link then reads as revoked).
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class CardLink(Base):
    __tablename__ = "card_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, index=True, nullable=False)
    app = Column(String(20), nullable=False)
    animal_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    payload = Column(JSONB, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
```

In `apps/api/app/models/user.py`, next to the other JSONB profile columns (search for `social_links = Column(`), add:

```python
    # Share cards: the fields a keeper last chose, per "app:kind", used as the
    # composer's defaults next time (spec §4.1). Never read by anything else.
    share_defaults = Column(JSONB, nullable=True)
```

(If `JSONB` isn't imported in `user.py`, add `from sqlalchemy.dialects.postgresql import JSONB`.)

In `apps/api/app/models/__init__.py` add `from app.models.card_link import CardLink` beside the other model imports.

In `apps/api/app/config.py`, beside `FRONTEND_URL`, add:

```python
    # Where share-card PNGs are rendered (the Tarantuverse web app hosts the
    # one renderer for both products). Override per environment.
    CARD_RENDERER_ORIGIN: str = "https://www.tarantuverse.com"
```

- [ ] **Step 6: Write the migration**

```python
# apps/api/alembic/versions/shc_20260930_share_cards.py
"""share cards: card_links table + users.share_defaults

Revision ID: shc_20260930_share_cards
Revises: cka_20260929_log_attribution
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "shc_20260930_share_cards"
down_revision = "cka_20260929_log_attribution"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("app", sa.String(20), nullable=False),
        sa.Column("animal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("app IN ('tarantuverse', 'herpetoverse')", name="card_links_app_check"),
        sa.CheckConstraint("kind IN ('molt', 'profile')", name="card_links_kind_check"),
    )
    op.create_index("ix_card_links_code", "card_links", ["code"], unique=True)
    op.create_index("ix_card_links_animal_id", "card_links", ["animal_id"])
    op.create_index("ix_card_links_created_by", "card_links", ["created_by"])
    op.create_index("ix_card_links_owner_id", "card_links", ["owner_id"])
    op.add_column("users", sa.Column("share_defaults", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("users", "share_defaults")
    op.drop_index("ix_card_links_owner_id", table_name="card_links")
    op.drop_index("ix_card_links_created_by", table_name="card_links")
    op.drop_index("ix_card_links_animal_id", table_name="card_links")
    op.drop_index("ix_card_links_code", table_name="card_links")
    op.drop_table("card_links")
```

- [ ] **Step 7: Verify the chain and the whole suite**

Run: `python -c "import app.models; from app.models.card_link import CardLink; print(CardLink.__table__.c.keys())"`
Expected: `['id', 'code', 'app', 'animal_id', 'kind', 'payload', 'created_by', 'owner_id', 'created_at', 'revoked_at']`

Run: `python -m pytest -q -p no:cacheprovider tests`
Expected: all pass (no mapper errors from the new model).

Confirm single head: the only revision not referenced as a `down_revision` is `shc_20260930_share_cards` (script used in planning: parse `alembic/versions/*.py` for `revision`/`down_revision`).

- [ ] **Step 8: Commit** (hand to Cory)

```
git add apps/api/app/utils/share_token.py apps/api/app/models/card_link.py apps/api/app/models/__init__.py apps/api/app/models/user.py apps/api/app/config.py apps/api/alembic/versions/shc_20260930_share_cards.py apps/api/tests/test_share_token.py
git commit -m "Share cards: signed render tokens, card_links table, share_defaults"
```

---

### Task 3: Share-cards router

**Files:**
- Create: `apps/api/app/schemas/share_card.py`, `apps/api/app/routers/share_cards.py`
- Modify: `apps/api/app/main.py` (register)
- Test: `apps/api/tests/test_share_cards_router.py`

**Interfaces:**
- Consumes: `compose_card`, `clean_fields`, `CardSubject`, `MoltFacts`, `SHAPES` (Task 1); `sign_render_token`, `verify_render_token`, `CardLink`, `User.share_defaults`, `settings.CARD_RENDERER_ORIGIN` (Task 2); `load_invert(db, user, id, need, not_found)` and `load_animal(...)` from `app/utils/access.py` (existing; raise 404 when the caller lacks the role).
- Produces (HTTP, all under `/api/v1`):
  - `POST /share-cards/` body `ShareCardCreate{app, animal_id, kind, molt_id?, fields?: list[str], shape, link: bool=false}` → `ShareCardCreated{image_url: str, card_link: str|None, code: str|None, fields: list[str]}`
  - `GET /share-cards/{token}/data` (no auth) → card payload dict + `"shape"`; 404 on bad/expired token or missing animal.
  - `GET /share-cards/defaults?app=&kind=` (auth) → `{"fields": [...]}`
  - `GET /card-links/{code}` (no auth) → payload dict; 404 unknown; 410 revoked or animal gone.
  - `GET /card-links/` (auth) → list of `{code, app, kind, created_at, revoked_at, name, url}` where the caller is `created_by` or `owner_id`.
  - `DELETE /card-links/{code}` (auth) → 204; 404 unless caller is `created_by` or `owner_id`.
  - `GET /public-card/{app}/{animal_id}` (no auth) → fixed public-safe payload (`name, species, photo, sex, in_care, molts|sheds, size|weight`) only when the owner's `collection_visibility == "public"` and the animal isn't died/transferred; else 404.
  - Card link URL format: `https://www.tarantuverse.com/c/{code}` (TV) / `https://herpetoverse.com/c/{code}` (HV) — constant `CARD_LINK_ORIGINS`.

- [ ] **Step 1: Write the failing tests**

These follow the repo's no-database test style (fakes + calling route functions directly, see `tests/test_colony_list_change.py`). The router is written so its DB access goes through three small module-level functions that tests monkeypatch: `_load_subject`, `_load_molt`, `_animal_exists`.

```python
# apps/api/tests/test_share_cards_router.py
"""Share-card endpoints. The two promises under test:

1. Sharing never changes anything in the app (no visibility write, ever).
2. Only the chosen, allow-listed fields ever leave the server.
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.routers import share_cards as sc
from app.schemas.share_card import ShareCardCreate
from app.services.share_card import CardSubject, MoltFacts

OWNER = NS(id=uuid.uuid4(), share_defaults=None, collection_visibility="private")
KEEPER = NS(id=uuid.uuid4(), share_defaults=None)
ANIMAL_ID = uuid.uuid4()


def subject():
    return CardSubject(
        app="tarantuverse", taxon="tarantula", name="Rosie", scientific_name="Brachypelma hamorii",
        common_name="Mexican redknee", sex="female", date_acquired=date(2025, 8, 14),
        photo_url="https://pub.example.r2.dev/photos/x.jpg", molt_count=9, latest_size="4.1 in",
    )


class FakeDB:
    def __init__(self):
        self.added, self.commits = [], 0
        self.links: dict[str, object] = {}

    def add(self, obj):
        self.added.append(obj)
        if getattr(obj, "code", None):
            self.links[obj.code] = obj

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def run(c):
    return asyncio.run(c)


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    animal = NS(id=ANIMAL_ID, user_id=OWNER.id, visibility="private", is_public=False)

    def load_subject(db, user, app, animal_id, need):
        if user is not OWNER and user is not KEEPER:
            raise HTTPException(404, "Animal not found")
        return animal, OWNER, subject()

    monkeypatch.setattr(sc, "_load_subject", load_subject)
    # The token-authorised read path (renderer) — returns the same subject.
    monkeypatch.setattr(sc, "_load_subject_unchecked", lambda db, app, animal_id: (animal, OWNER, subject()))
    monkeypatch.setattr(sc, "_load_molt", lambda db, animal_id, molt_id: MoltFacts(9, date(2026, 9, 29), 3.2, 4.1))
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, animal_id: True)
    monkeypatch.setattr(sc, "_find_link", lambda db, code: db.links.get(code))
    return animal


def create(user, db, **kw):
    body = dict(app="tarantuverse", animal_id=ANIMAL_ID, kind="profile", shape="story")
    body.update(kw)
    return run(sc.create_share_card(ShareCardCreate(**body), db=db, current_user=user))


def test_share_private_animal_changes_nothing(fakes):
    """Review Focus #1."""
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "species"])
    assert out.image_url.startswith("https://www.tarantuverse.com/api/card/")
    assert fakes.visibility == "private" and fakes.is_public is False
    assert OWNER.collection_visibility == "private"
    # The only rows written are the card link; the user row only gains share_defaults.
    assert [type(o).__name__ for o in db.added] == ["CardLink"]


def test_token_data_contains_only_chosen_fields():
    db = FakeDB()
    out = create(OWNER, db, fields=["species", "price_paid", "notes"])
    # Disallowed names never make it into the token, the response, or the
    # remembered defaults.
    assert out.fields == ["species"]
    assert OWNER.share_defaults["tarantuverse:profile"] == ["species"]
    token = out.image_url.rsplit("/", 1)[1]
    data = run(sc.share_card_data(token, db=db))
    assert data["name"] is None and data["photo_url"] is None
    assert data["scientific_name"] == "Brachypelma hamorii"
    assert "price_paid" not in str(data) and "notes" not in str(data)
    assert data["shape"] == "story"


def test_bad_token_is_404():
    with pytest.raises(HTTPException) as e:
        run(sc.share_card_data("nope.nope", db=FakeDB()))
    assert e.value.status_code == 404


def test_stranger_gets_404():
    with pytest.raises(HTTPException) as e:
        create(NS(id=uuid.uuid4(), share_defaults=None), FakeDB())
    assert e.value.status_code == 404


def test_keeper_role_cokeeper_can_share():
    """Review Focus #5 (first half)."""
    out = create(KEEPER, FakeDB())
    assert out.image_url


def test_molt_card_requires_molt_id():
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), kind="molt")
    assert e.value.status_code == 422


def test_herpetoverse_molt_card_is_rejected():
    with pytest.raises(HTTPException) as e:
        create(OWNER, FakeDB(), app="herpetoverse", kind="molt", molt_id=uuid.uuid4())
    assert e.value.status_code == 422


def test_defaults_are_remembered():
    db = FakeDB()
    create(OWNER, db, fields=["name"])
    assert OWNER.share_defaults["tarantuverse:profile"] == ["name"]
    assert run(sc.get_share_defaults(app="tarantuverse", kind="profile", current_user=OWNER))["fields"] == ["name"]


def test_card_link_is_frozen_and_revocable(monkeypatch):
    db = FakeDB()
    out = create(OWNER, db, link=True, fields=["name", "species"])
    assert out.card_link == f"https://www.tarantuverse.com/c/{out.code}"
    assert len(out.code) >= 22
    payload = run(sc.get_card_link(out.code, db=db))
    assert payload["name"] == "Rosie"
    # Frozen: changing what _load_subject returns does not change the link.
    monkeypatch.setattr(sc, "_load_subject", lambda *a, **k: (None, OWNER, CardSubject(
        app="tarantuverse", taxon="tarantula", name="Renamed", scientific_name=None, common_name=None,
        sex=None, date_acquired=None, photo_url=None)))
    assert run(sc.get_card_link(out.code, db=db))["name"] == "Rosie"
    # Only the sharer or the owner may revoke (Review Focus #5, second half).
    with pytest.raises(HTTPException) as e:
        run(sc.revoke_card_link(out.code, db=db, current_user=NS(id=uuid.uuid4())))
    assert e.value.status_code == 404
    run(sc.revoke_card_link(out.code, db=db, current_user=OWNER))
    with pytest.raises(HTTPException) as e:
        run(sc.get_card_link(out.code, db=db))
    assert e.value.status_code == 410


def test_card_link_for_deleted_animal_is_gone(monkeypatch):
    """Review Focus #3."""
    db = FakeDB()
    out = create(OWNER, db, link=True)
    monkeypatch.setattr(sc, "_animal_exists", lambda db, app, animal_id: False)
    with pytest.raises(HTTPException) as e:
        run(sc.get_card_link(out.code, db=db))
    assert e.value.status_code == 410


def test_router_never_writes_visibility():
    """Belt and braces for Global Constraint #1: no visibility column is ever
    assigned anywhere in the share-card code."""
    import inspect
    src = inspect.getsource(sc)
    for col in ("visibility =", "is_public =", "collection_visibility ="):
        assert col not in src
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_cards_router.py`
Expected: `ModuleNotFoundError: No module named 'app.schemas.share_card'`.

- [ ] **Step 3: Write the schemas**

```python
# apps/api/app/schemas/share_card.py
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ShareCardCreate(BaseModel):
    app: str = Field(..., pattern="^(tarantuverse|herpetoverse)$")
    animal_id: UUID
    kind: str = Field(..., pattern="^(molt|profile)$")
    molt_id: Optional[UUID] = None
    fields: Optional[List[str]] = Field(None, max_length=20)
    shape: str = Field("story", pattern="^(story|post|square|wide)$")
    link: bool = False


class ShareCardCreated(BaseModel):
    image_url: str
    card_link: Optional[str] = None
    code: Optional[str] = None
    fields: List[str]


class CardLinkItem(BaseModel):
    code: str
    app: str
    kind: str
    name: Optional[str]
    url: str
    created_at: datetime
    revoked_at: Optional[datetime]
```

- [ ] **Step 4: Write the router**

```python
# apps/api/app/routers/share_cards.py
"""Share cards and card links (spec: docs/superpowers/specs/2026-09-29-share-cards-design.md).

Nothing here writes to any visibility setting — sharing never changes the
app (spec §6). The only rows written are a card link (when asked for) and the
sharer's remembered field choices.
"""
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.card_link import CardLink
from app.models.user import User
from app.schemas.share_card import CardLinkItem, ShareCardCreate, ShareCardCreated
from app.services.share_card import CardSubject, MoltFacts, clean_fields, compose_card
from app.utils.dependencies import get_current_user
from app.utils.share_token import sign_render_token, verify_render_token

router = APIRouter()

CARD_LINK_ORIGINS = {
    "tarantuverse": "https://www.tarantuverse.com",
    "herpetoverse": "https://herpetoverse.com",
}

# Public-card fields for link previews of ALREADY-public animals (spec §4.1).
PUBLIC_FIELDS = {
    "tarantuverse": ["photo", "name", "species", "sex", "in_care", "molts", "size"],
    "herpetoverse": ["photo", "name", "species", "sex", "in_care", "weight", "sheds"],
}


# ── DB access (monkeypatched in tests) ──────────────────────────────────────

def _fmt_size(taxon: str, latest_span_in, length_mm) -> Optional[str]:
    if latest_span_in is not None:
        n = float(latest_span_in)
        return f"{n:.2f}".rstrip("0").rstrip(".") + " in"
    if length_mm is not None:
        return f"{float(length_mm):g} mm"
    return None


def _load_subject(db: Session, user, app: str, animal_id: UUID, need: str):
    """(animal_row, owner_user, CardSubject). Raises 404 when the caller lacks
    `need` in the owner's collection — same rule as every other route."""
    if app == "tarantuverse":
        from app.models.molt_log import MoltLog
        from app.utils.access import load_invert

        inv, access = load_invert(db, user, animal_id, need, not_found="Animal not found")
        molts = (
            db.query(MoltLog)
            .filter(MoltLog.invert_id == inv.id)
            .order_by(MoltLog.molted_at.desc())
            .all()
        )
        latest_span = next((m.leg_span_after for m in molts if m.leg_span_after is not None), None)
        subj = CardSubject(
            app=app, taxon=inv.taxon, name=inv.name, scientific_name=inv.scientific_name,
            common_name=inv.common_name, sex=inv.sex, date_acquired=inv.date_acquired,
            photo_url=inv.photo_url, molt_count=len(molts),
            latest_size=_fmt_size(inv.taxon, latest_span, inv.current_length_mm),
        )
        return inv, access.owner, subj

    from app.models.shed_log import ShedLog
    from app.utils.access import load_animal

    ani, access = load_animal(db, user, animal_id, need, not_found="Animal not found")
    sheds = db.query(ShedLog).filter(ShedLog.animal_id == ani.id).count()
    subj = CardSubject(
        app=app, taxon=ani.taxon, name=ani.name, scientific_name=ani.scientific_name,
        common_name=ani.common_name, sex=ani.sex, date_acquired=ani.date_acquired,
        photo_url=ani.photo_url, weight_g=ani.current_weight_g, length_in=ani.current_length_in,
        shed_count=sheds,
    )
    return ani, access.owner, subj


def _load_molt(db: Session, animal_id: UUID, molt_id: UUID) -> MoltFacts:
    from app.models.molt_log import MoltLog

    molt = db.query(MoltLog).filter(MoltLog.id == molt_id, MoltLog.invert_id == animal_id).first()
    if molt is None:
        raise HTTPException(status_code=404, detail="Molt not found")
    number = (
        db.query(MoltLog)
        .filter(MoltLog.invert_id == animal_id, MoltLog.molted_at <= molt.molted_at)
        .count()
    )
    return MoltFacts(
        number=number,
        molted_on=molt.molted_at.date(),
        span_before=float(molt.leg_span_before) if molt.leg_span_before is not None else None,
        span_after=float(molt.leg_span_after) if molt.leg_span_after is not None else None,
    )


def _animal_exists(db: Session, app: str, animal_id) -> bool:
    if app == "tarantuverse":
        from app.models.invert import Invert
        return db.query(Invert.id).filter(Invert.id == animal_id).first() is not None
    from app.models.animal import Animal
    return db.query(Animal.id).filter(Animal.id == animal_id).first() is not None


def _find_link(db: Session, code: str) -> Optional[CardLink]:
    return db.query(CardLink).filter(CardLink.code == code).first()


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/share-cards/", response_model=ShareCardCreated, status_code=status.HTTP_201_CREATED)
async def create_share_card(
    body: ShareCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        fields = clean_fields(body.app, body.kind, body.fields)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if body.kind == "molt" and body.molt_id is None:
        raise HTTPException(status_code=422, detail="A molt card needs molt_id")

    # Keeper role or owner (spec §4.1). 404 for anyone else.
    _animal, owner, subject = _load_subject(db, current_user, body.app, body.animal_id, "keeper")
    molt = _load_molt(db, body.animal_id, body.molt_id) if body.kind == "molt" else None

    token = sign_render_token({
        "app": body.app, "kind": body.kind, "animal_id": str(body.animal_id),
        "molt_id": str(body.molt_id) if body.molt_id else None,
        "fields": fields, "shape": body.shape,
    })
    image_url = f"{settings.CARD_RENDERER_ORIGIN.rstrip('/')}/api/card/{token}"

    card_link = code = None
    if body.link:
        code = secrets.token_urlsafe(16)
        db.add(CardLink(
            id=uuid.uuid4(), code=code, app=body.app, animal_id=body.animal_id, kind=body.kind,
            payload=compose_card(body.kind, subject, fields, molt=molt),
            created_by=current_user.id, owner_id=owner.id,
        ))
        card_link = f"{CARD_LINK_ORIGINS[body.app]}/c/{code}"

    defaults = dict(current_user.share_defaults or {})
    defaults[f"{body.app}:{body.kind}"] = fields
    current_user.share_defaults = defaults
    db.commit()
    return ShareCardCreated(image_url=image_url, card_link=card_link, code=code, fields=fields)


@router.get("/share-cards/defaults")
async def get_share_defaults(
    app: str = Query(..., pattern="^(tarantuverse|herpetoverse)$"),
    kind: str = Query(..., pattern="^(molt|profile)$"),
    current_user: User = Depends(get_current_user),
):
    saved = (current_user.share_defaults or {}).get(f"{app}:{kind}")
    try:
        return {"fields": clean_fields(app, kind, saved)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/share-cards/{token}/data")
async def share_card_data(token: str, db: Session = Depends(get_db)):
    """Called by the renderer. The token is the only credential."""
    claims = verify_render_token(token)
    if not claims:
        raise HTTPException(status_code=404, detail="Card not found")
    # No login here: the token proved the sharer's right when it was issued.
    app, animal_id = claims["app"], UUID(claims["animal_id"])
    _animal, _owner, subject = _load_subject_unchecked(db, app, animal_id)
    molt = _load_molt(db, animal_id, UUID(claims["molt_id"])) if claims.get("molt_id") else None
    card = compose_card(claims["kind"], subject, claims["fields"], molt=molt)
    card["shape"] = claims["shape"]
    return card


def _load_subject_unchecked(db: Session, app: str, animal_id: UUID):
    """Token-authorised read: the role check happened when the token was
    issued. Reuses _load_subject with the owner as the actor so there is one
    query path to keep correct."""
    if app == "tarantuverse":
        from app.models.invert import Invert
        row = db.query(Invert).filter(Invert.id == animal_id).first()
    else:
        from app.models.animal import Animal
        row = db.query(Animal).filter(Animal.id == animal_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found")
    owner = db.query(User).filter(User.id == row.user_id).first()
    return _load_subject(db, owner, app, animal_id, "viewer")


@router.get("/card-links/{code}")
async def get_card_link(code: str, db: Session = Depends(get_db)):
    link = _find_link(db, code)
    if link is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if link.revoked_at is not None or not _animal_exists(db, link.app, link.animal_id):
        raise HTTPException(status_code=410, detail="This card is no longer shared")
    return dict(link.payload, shape="wide")


@router.get("/card-links/", response_model=List[CardLinkItem])
async def list_card_links(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(CardLink)
        .filter((CardLink.created_by == current_user.id) | (CardLink.owner_id == current_user.id))
        .order_by(CardLink.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        CardLinkItem(
            code=r.code, app=r.app, kind=r.kind, name=(r.payload or {}).get("name"),
            url=f"{CARD_LINK_ORIGINS[r.app]}/c/{r.code}", created_at=r.created_at, revoked_at=r.revoked_at,
        )
        for r in rows
    ]


@router.delete("/card-links/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_card_link(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    link = _find_link(db, code)
    if link is None or current_user.id not in (link.created_by, link.owner_id):
        raise HTTPException(status_code=404, detail="Card not found")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/public-card/{app}/{animal_id}")
async def public_card(app: str, animal_id: UUID, db: Session = Depends(get_db)):
    """Link-preview payload for an animal that is ALREADY public under the
    existing rule (owner's collection public; not died, not transferred).
    Changes nothing; 404 otherwise."""
    if app not in PUBLIC_FIELDS:
        raise HTTPException(status_code=404, detail="Not found")
    if app == "tarantuverse":
        from app.models.invert import Invert as Model
    else:
        from app.models.animal import Animal as Model
    row = db.query(Model).filter(Model.id == animal_id).first()
    if row is None or row.died_at is not None or row.transferred_out_at is not None:
        raise HTTPException(status_code=404, detail="Not found")
    owner = db.query(User).filter(User.id == row.user_id).first()
    if owner is None or owner.collection_visibility != "public":
        raise HTTPException(status_code=404, detail="Not found")
    _a, _o, subject = _load_subject(db, owner, app, animal_id, "viewer")
    return dict(compose_card("profile", subject, PUBLIC_FIELDS[app]), shape="wide")
```

In `apps/api/app/main.py`, beside the `collection_members` import and `include_router` lines, add:

```python
import app.routers.share_cards as share_cards  # share cards (spec 2026-09-29)
```

```python
app.include_router(share_cards.router, prefix="/api/v1", tags=["share-cards"])
```

- [ ] **Step 5: Run to verify pass**

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_cards_router.py`
Expected: all pass.

- [ ] **Step 6: Public-card test for already-public vs private**

Append to `tests/test_share_cards_router.py`:

```python
class Q:
    def __init__(self, row):
        self.row = row

    def filter(self, *a):
        return self

    def first(self):
        return self.row


def test_public_card_only_for_public_collections(monkeypatch):
    row = NS(id=ANIMAL_ID, user_id=OWNER.id, died_at=None, transferred_out_at=None)
    private_owner = NS(id=OWNER.id, collection_visibility="private")
    public_owner = NS(id=OWNER.id, collection_visibility="public")

    def db_for(owner):
        return NS(query=lambda model, *a: Q(owner if getattr(model, "__name__", "") == "User" else row))

    # public_card reads as the owner it looked up; accept whichever owner row it found.
    monkeypatch.setattr(sc, "_load_subject", lambda db, user, app, aid, need: (row, user, subject()))

    with pytest.raises(HTTPException) as e:
        run(sc.public_card("tarantuverse", ANIMAL_ID, db=db_for(private_owner)))
    assert e.value.status_code == 404
    card = run(sc.public_card("tarantuverse", ANIMAL_ID, db=db_for(public_owner)))
    assert card["shape"] == "wide" and card["name"] == "Rosie"
    assert private_owner.collection_visibility == "private"  # untouched
```

Run: `python -m pytest -q -p no:cacheprovider tests/test_share_cards_router.py`
Expected: all pass.

- [ ] **Step 7: Mutation check (the privacy promise must be load-bearing)**

Temporarily change the last line of `clean_fields` to `return list(requested)`; run `tests/test_share_cards_router.py` — expect `test_token_data_contains_only_chosen_fields` to FAIL (on `out.fields`). Revert. Temporarily change `"name": subject.name if "name" in f else None` to `"name": subject.name` in `compose_card`; expect the same test to FAIL (on `data["name"]`). Revert. Temporarily add `animal.visibility = "public"` inside `create_share_card`; expect `test_router_never_writes_visibility` and `test_share_private_animal_changes_nothing` to FAIL. Revert.

Run the whole suite: `python -m pytest -q -p no:cacheprovider tests` — expected all pass.

- [ ] **Step 8: Commit** (hand to Cory)

```
git add apps/api/app/schemas/share_card.py apps/api/app/routers/share_cards.py apps/api/app/main.py apps/api/tests/test_share_cards_router.py
git commit -m "Share cards: create/render-data/card-link/public-card endpoints"
```

---

## Milestone B — Renderer and link previews (web only; ships with a normal push)

### Task 4: The renderer

**Files:**
- Create: `apps/web/src/lib/share-card/SpecimenCard.tsx`, `apps/web/src/lib/share-card/render.tsx`
- Create: `apps/web/src/lib/share-card/fonts/LibreCaslonText-Regular.ttf`, `apps/web/src/lib/share-card/fonts/LibreCaslonText-Italic.ttf`
- Create: `apps/web/src/app/api/card/[token]/route.tsx`, `apps/web/src/app/api/card-link/[code]/route.tsx`, `apps/web/src/app/api/og/[app]/[id]/route.tsx`
- Modify: `apps/web/src/app/robots.ts`

**Interfaces:**
- Consumes: `GET {API}/api/v1/share-cards/{token}/data`, `GET {API}/api/v1/card-links/{code}`, `GET {API}/api/v1/public-card/{app}/{id}` (Task 3). `API = process.env.NEXT_PUBLIC_API_URL`.
- Produces:
  - `type CardPayload = { app: 'tarantuverse'|'herpetoverse'; kind: 'molt'|'profile'; taxon: string; header: string; name: string|null; scientific_name: string|null; common_name: string|null; photo_url: string|null; facts: { label: string; value: string }[]; shape: Shape }`
  - `type Shape = 'story'|'post'|'square'|'wide'`, `SHAPE_SIZE: Record<Shape, { width: number; height: number }>`
  - `renderCard(payload: CardPayload, shape?: Shape): Promise<ImageResponse>`
  - `renderNoLongerShared(shape: Shape): Promise<ImageResponse>`
  - HTTP: `GET /api/card/{token}` → PNG; `GET /api/card-link/{code}?shape=wide|story|post|square` → PNG; `GET /api/og/{app}/{id}` → PNG (1200×630).

- [ ] **Step 1: Fetch the fonts (OFL, from Google Fonts' GitHub)**

Run (PowerShell, from repo root):
```
New-Item -ItemType Directory -Force apps/web/src/lib/share-card/fonts
Invoke-WebRequest https://github.com/google/fonts/raw/main/ofl/librecaslontext/LibreCaslonText%5Bwght%5D.ttf -OutFile apps/web/src/lib/share-card/fonts/LibreCaslonText-Regular.ttf
Invoke-WebRequest https://github.com/google/fonts/raw/main/ofl/librecaslontext/LibreCaslonText-Italic%5Bwght%5D.ttf -OutFile apps/web/src/lib/share-card/fonts/LibreCaslonText-Italic.ttf
```
Expected: two files, each > 100 KB. (If the variable-font filenames have changed, pick the regular and italic TTFs from `ofl/librecaslontext/` in that repo. TTF/OTF only — `next/og` cannot read WOFF2.) Add `apps/web/src/lib/share-card/fonts/OFL.txt` copied from the same folder.

- [ ] **Step 2: Write the template**

```tsx
// apps/web/src/lib/share-card/SpecimenCard.tsx
/**
 * The specimen-label share card (spec §3). Rendered by next/og (satori), so:
 * flexbox only, inline styles only, every element with >1 child needs
 * display:flex. Fixed paper palette — the card is an image and must read the
 * same on light and dark feeds.
 */
export type Shape = 'story' | 'post' | 'square' | 'wide'

export type CardPayload = {
  app: 'tarantuverse' | 'herpetoverse'
  kind: 'molt' | 'profile'
  taxon: string
  header: string
  name: string | null
  scientific_name: string | null
  common_name: string | null
  photo_url: string | null
  facts: { label: string; value: string }[]
  shape: Shape
}

export const SHAPE_SIZE: Record<Shape, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  wide: { width: 1200, height: 630 },
}

const PAPER = '#F1EFE8'
const INK = '#2C2C2A'
const INK_SOFT = '#5F5E5A'
const RULE = '#888780'
const PHOTO_BG = '#444441'

const GLYPH: Record<string, string> = {
  tarantula: 'T', scorpion: 'S', centipede: 'C', snake: 'S', lizard: 'L',
}

function Photo({ url, taxon, w, h }: { url: string | null; taxon: string; w: number; h: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover', borderRadius: 6 }} />
  }
  return (
    <div style={{ width: w, height: h, background: PHOTO_BG, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RULE, fontSize: Math.round(h / 5) }}>
      {GLYPH[taxon] ?? '·'}
    </div>
  )
}

function Ruler({ width }: { width: number }) {
  const ticks = Math.floor(width / 24)
  return (
    <div style={{ display: 'flex', width, height: 18, borderTop: `1.5px solid ${RULE}`, marginTop: 14 }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <div key={i} style={{ width: 24, height: i % 2 === 0 ? 16 : 9, borderLeft: `1.5px solid ${RULE}` }} />
      ))}
    </div>
  )
}

function Label({ p, scale, width }: { p: CardPayload; scale: number; width: number }) {
  const s = (n: number) => Math.round(n * scale)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', color: INK, width }}>
      <div style={{ fontSize: s(26), letterSpacing: 2, color: INK_SOFT }}>{p.header}</div>
      {p.name ? <div style={{ fontSize: s(64), lineHeight: 1.1, marginTop: s(6) }}>{p.name}</div> : null}
      {p.scientific_name ? <div style={{ fontSize: s(34), fontStyle: 'italic', color: '#444441', marginTop: s(4) }}>{p.scientific_name}</div> : null}
      {p.common_name ? <div style={{ fontSize: s(26), color: INK_SOFT, marginTop: s(2) }}>{p.common_name}</div> : null}
      {p.facts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1.5px solid ${RULE}`, marginTop: s(20), paddingTop: s(12) }}>
          {p.facts.map((f) => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: s(30), lineHeight: 1.5 }}>
              <span>{f.label}</span><span>{f.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Ruler width={width} />
    </div>
  )
}

export function SpecimenCard({ p, shape }: { p: CardPayload; shape: Shape }) {
  const { width, height } = SHAPE_SIZE[shape]
  const wordmark = (
    <div style={{ fontSize: shape === 'wide' ? 22 : 28, color: INK_SOFT }}>{p.app}</div>
  )
  if (shape === 'wide' || shape === 'square') {
    const pad = shape === 'wide' ? 36 : 48
    const photoW = Math.round(width * (shape === 'wide' ? 0.46 : 0.5)) - pad
    const labelW = width - photoW - pad * 3
    return (
      <div style={{ width, height, background: PAPER, display: 'flex', padding: pad, fontFamily: 'Caslon' }}>
        <Photo url={p.photo_url} taxon={p.taxon} w={photoW} h={height - pad * 2} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', marginLeft: pad, width: labelW }}>
          <Label p={p} scale={shape === 'wide' ? 0.62 : 0.8} width={labelW} />
          {wordmark}
        </div>
      </div>
    )
  }
  const pad = 56
  const photoH = Math.round(height * (shape === 'story' ? 0.56 : 0.5))
  return (
    <div style={{ width, height, background: PAPER, display: 'flex', flexDirection: 'column', padding: pad, fontFamily: 'Caslon' }}>
      <Photo url={p.photo_url} taxon={p.taxon} w={width - pad * 2} h={photoH} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, marginTop: 40 }}>
        <Label p={p} scale={1} width={width - pad * 2} />
        {wordmark}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the render helper (fonts + photo fallback)**

```tsx
// apps/web/src/lib/share-card/render.tsx
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CardPayload, SHAPE_SIZE, Shape, SpecimenCard } from './SpecimenCard'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

let fonts: Promise<{ name: string; data: Buffer; style: 'normal' | 'italic' }[]> | null = null
function loadFonts() {
  const dir = path.join(process.cwd(), 'src/lib/share-card/fonts')
  fonts ??= Promise.all([
    readFile(path.join(dir, 'LibreCaslonText-Regular.ttf')).then((data) => ({ name: 'Caslon', data, style: 'normal' as const })),
    readFile(path.join(dir, 'LibreCaslonText-Italic.ttf')).then((data) => ({ name: 'Caslon', data, style: 'italic' as const })),
  ])
  return fonts
}

/** A photo that won't load must not break the card (Review Focus #4):
 *  probe it first; on any failure fall back to the glyph block. */
async function usablePhoto(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return r.ok && (r.headers.get('content-type') || '').startsWith('image/') ? url : null
  } catch {
    return null
  }
}

export async function renderCard(p: CardPayload, shape: Shape = p.shape) {
  const safe = { ...p, photo_url: await usablePhoto(p.photo_url) }
  return new ImageResponse(<SpecimenCard p={safe} shape={shape} />, {
    ...SHAPE_SIZE[shape],
    fonts: await loadFonts(),
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  })
}

export async function renderNoLongerShared(shape: Shape) {
  const { width, height } = SHAPE_SIZE[shape]
  return new ImageResponse(
    (
      <div style={{ width, height, background: '#F1EFE8', color: '#5F5E5A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Caslon', fontSize: 40 }}>
        This card is no longer shared
      </div>
    ),
    { width, height, fonts: await loadFonts(), headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}

export function asShape(v: string | null): Shape {
  return v === 'story' || v === 'post' || v === 'square' || v === 'wide' ? v : 'wide'
}
```

In `apps/web/next.config.js`, make sure the font files ship with the serverless function. Add to the exported config:

```js
  outputFileTracingIncludes: {
    '/api/**': ['./src/lib/share-card/fonts/**'],
  },
```

(Next 15 has this key at the top level of the config, not under `experimental`. Keys are route globs.) The fonts are read with `readFile` from `process.cwd()`; this must be confirmed on a **Vercel preview deployment**, not just `next dev` — Step 6 includes that check.

- [ ] **Step 4: Write the three routes**

```tsx
// apps/web/src/app/api/card/[token]/route.tsx
import { API_URL, renderCard } from '@/lib/share-card/render'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await fetch(`${API_URL}/api/v1/share-cards/${encodeURIComponent(token)}/data`, { cache: 'no-store' })
  if (!r.ok) return new Response('Not found', { status: 404 })
  return renderCard(await r.json())
}
```

```tsx
// apps/web/src/app/api/card-link/[code]/route.tsx
import { API_URL, asShape, renderCard, renderNoLongerShared } from '@/lib/share-card/render'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const shape = asShape(new URL(req.url).searchParams.get('shape'))
  const r = await fetch(`${API_URL}/api/v1/card-links/${encodeURIComponent(code)}`, { next: { revalidate: 60 } })
  if (r.status === 410) return renderNoLongerShared(shape)
  if (!r.ok) return new Response('Not found', { status: 404 })
  return renderCard(await r.json(), shape)
}
```

```tsx
// apps/web/src/app/api/og/[app]/[id]/route.tsx
import { API_URL, renderCard } from '@/lib/share-card/render'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ app: string; id: string }> }) {
  const { app, id } = await params
  if (app !== 'tarantuverse' && app !== 'herpetoverse') return new Response('Not found', { status: 404 })
  const r = await fetch(`${API_URL}/api/v1/public-card/${app}/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } })
  if (!r.ok) return new Response('Not found', { status: 404 })
  return renderCard(await r.json(), 'wide')
}
```

- [ ] **Step 5: Unblock crawlers (Review Focus #2)**

In `apps/web/src/app/robots.ts` change the rules to:

```ts
    rules: {
      userAgent: '*',
      // Link-preview images must be fetchable: X/Twitter's card crawler
      // honours robots.txt, and a disallowed og:image renders as nothing.
      allow: ['/', '/api/og/', '/api/card-link/', '/c/'],
      disallow: ['/dashboard', '/messages', '/api/'],
    },
```

- [ ] **Step 6: Verify locally**

Run (in `apps/web`): `npx tsc --noEmit -p .` — expected no errors.
Run the API locally with a seeded animal, create a token via `POST /api/v1/share-cards/` (or run the router test's flow against a dev DB), then `npm run dev` and open `http://localhost:3000/api/card/<token>` — expected: a 1080×1920 PNG with the paper background, name, italic species and the ruler. Repeat with `?shape=`-equivalent tokens for `post`, `square`, `wide`, one card with `photo_url` pointing at a 404 (expect the glyph block, not an error), and one with no facts (expect no rule block).
Save the four PNGs to `docs/superpowers/plans/share-card-samples/` for review.
Then push to a branch and open the same URLs on the **Vercel preview deployment** — a missing-font error there (`ENOENT …LibreCaslonText`) means the tracing include in `next.config.js` isn't matching; fix before merging. (The web apps have no automated test runner, so Review Focus #4 — the dead photo URL — is pinned by this manual check with a 404 `photo_url`; do not skip it.)

- [ ] **Step 7: Commit** (hand to Cory)

```
git add apps/web/src/lib/share-card apps/web/src/app/api/card apps/web/src/app/api/card-link apps/web/src/app/api/og apps/web/src/app/robots.ts apps/web/next.config.js docs/superpowers/plans/share-card-samples
git commit -m "Share cards: one next/og renderer for cards, card links and previews"
```

---

### Task 5: `/c/<code>` pages and link previews on public animal pages

**Files:**
- Create: `apps/web/src/app/c/[code]/page.tsx`, `apps/web-herpetoverse/src/app/c/[code]/page.tsx`
- Modify: `apps/web/src/app/i/[id]/page.tsx` (→ server wrapper) and create `apps/web/src/app/i/[id]/InvertPublicClient.tsx` (the current file's contents, unchanged except the default export name)
- Modify: `apps/web/src/app/t/[id]/page.tsx` (→ server wrapper) and create `apps/web/src/app/t/[id]/TarantulaPublicClient.tsx`
- Modify: `apps/web-herpetoverse/src/app/a/[id]/page.tsx` (add `generateMetadata`)

**Interfaces:**
- Consumes: `GET {API}/api/v1/card-links/{code}` (Task 3); renderer URLs `https://www.tarantuverse.com/api/card-link/{code}?shape=…` and `/api/og/{app}/{id}` (Task 4). Env: `NEXT_PUBLIC_CARD_RENDERER_URL` (default `https://www.tarantuverse.com`) on BOTH web apps.
- Produces: pages at `/c/{code}` on both sites.

- [ ] **Step 1: TV `/c/[code]` page**

```tsx
// apps/web/src/app/c/[code]/page.tsx
/**
 * A card link (spec §6): the card image and nothing else. No path into the
 * animal, the collection or the keeper — by design. Unlisted: noindex.
 */
import type { Metadata } from 'next'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

type Params = { params: Promise<{ code: string }> }

async function load(code: string): Promise<{ status: 'ok' | 'gone' | 'missing'; name?: string | null; species?: string | null }> {
  const r = await fetch(`${API_URL}/api/v1/card-links/${encodeURIComponent(code)}`, { next: { revalidate: 60 } })
  if (r.status === 410) return { status: 'gone' }
  if (!r.ok) return { status: 'missing' }
  const p = await r.json()
  return { status: 'ok', name: p.name, species: p.scientific_name }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params
  const card = await load(code)
  const title = card.status === 'ok' ? (card.name || card.species || 'A specimen') : 'No longer shared'
  const image = `${RENDERER}/api/card-link/${encodeURIComponent(code)}?shape=wide`
  return {
    title,
    robots: { index: false, follow: false },
    openGraph: { title, images: card.status === 'ok' ? [{ url: image, width: 1200, height: 630 }] : [] },
    twitter: { card: 'summary_large_image', title, images: card.status === 'ok' ? [image] : [] },
  }
}

export default async function CardLinkPage({ params }: Params) {
  const { code } = await params
  const card = await load(code)
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      {card.status === 'ok' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${RENDERER}/api/card-link/${encodeURIComponent(code)}?shape=post`}
          alt={[card.name, card.species].filter(Boolean).join(', ') || 'Specimen card'}
          className="w-full max-w-md rounded-lg shadow-sm"
        />
      ) : (
        <p className="text-gray-600 dark:text-gray-400">This card is no longer shared.</p>
      )}
    </main>
  )
}
```

- [ ] **Step 2: HV `/c/[code]` page**

Create `apps/web-herpetoverse/src/app/c/[code]/page.tsx` with the exact contents of Step 1, changing only:

```tsx
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
```

(The renderer stays on the TV domain — one renderer for both products, spec §4.2.)

- [ ] **Step 3: Server wrappers for TV public pages**

Move the entire current content of `apps/web/src/app/i/[id]/page.tsx` into `apps/web/src/app/i/[id]/InvertPublicClient.tsx`, keeping `'use client'` first and renaming its default export to `InvertPublicClient` (props unchanged — check how it reads the id; if it uses `useParams()`, it keeps working inside the wrapper). Then replace `page.tsx` with:

```tsx
// apps/web/src/app/i/[id]/page.tsx
import type { Metadata } from 'next'
import InvertPublicClient from './InvertPublicClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // Only animals that are ALREADY public get a preview; anything else gets a
  // bare title, so a private animal's link reveals nothing when pasted.
  const r = await fetch(`${API_URL}/api/v1/public-card/tarantuverse/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } })
  if (!r.ok) return { title: 'Tarantuverse' }
  const p = await r.json()
  const title = p.name || p.scientific_name || 'A specimen'
  const image = `${RENDERER}/api/og/tarantuverse/${encodeURIComponent(id)}`
  return {
    title,
    description: p.scientific_name ?? undefined,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [image] },
  }
}

export default function Page() {
  return <InvertPublicClient />
}
```

Do the same for `apps/web/src/app/t/[id]/page.tsx` → `TarantulaPublicClient.tsx` (same wrapper, same `public-card/tarantuverse/` call — tarantulas share their id with the inverts row).

- [ ] **Step 4: HV `/a/[id]` metadata**

In `apps/web-herpetoverse/src/app/a/[id]/page.tsx` add above the default export:

```tsx
import type { Metadata } from 'next'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const r = await fetch(`${API_URL}/api/v1/public-card/herpetoverse/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } })
  if (!r.ok) return { title: 'Herpetoverse' }
  const p = await r.json()
  const title = p.name || p.scientific_name || 'A specimen'
  const image = `${RENDERER}/api/og/herpetoverse/${encodeURIComponent(id)}`
  return {
    title,
    description: p.scientific_name ?? undefined,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [image] },
  }
}
```

- [ ] **Step 5: Verify**

Run `npx tsc --noEmit -p .` in `apps/web` and `apps/web-herpetoverse` — no errors.
With both dev servers running, `curl -s http://localhost:3000/c/<valid code> | grep -o 'og:image[^>]*'` — expected one `og:image` pointing at `/api/card-link/<code>?shape=wide`; and `grep -c noindex` ≥ 1. For a revoked code: page text "This card is no longer shared." and no `og:image`. For a private animal's `/i/<id>`: no `og:image`.
Open `/i/<id>` of a public animal in the browser — the page itself must look and behave exactly as before the split.

- [ ] **Step 6: Commit** (hand to Cory)

```
git add apps/web/src/app/c apps/web/src/app/i apps/web/src/app/t apps/web-herpetoverse/src/app/c apps/web-herpetoverse/src/app/a
git commit -m "Share cards: /c card-link pages and link previews for public animals"
```

**Ship point:** after Tasks 1–5 deploy (Render migration runs from `start.sh`; Vercel auto-deploys), link previews are live. Set `NEXT_PUBLIC_CARD_RENDERER_URL=https://www.tarantuverse.com` on both Vercel projects before or with this push. Validate one public animal link in the Facebook Sharing Debugger and a Discord paste.

---

### Task 6: Web composer (both sites)

**Files:**
- Create: `apps/web/src/lib/shareCards.ts`, `apps/web/src/components/ShareCardModal.tsx`
- Modify: `apps/web/src/app/dashboard/inverts/[id]/page.tsx` (add a "Share card" button for keeper-role viewers)
- Create: `apps/web-herpetoverse/src/lib/shareCards.ts`, `apps/web-herpetoverse/src/components/ShareCardModal.tsx`
- Modify: `apps/web-herpetoverse/src/app/app/reptiles/[id]/AnimalDetailClient.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/share-cards/`, `GET /api/v1/share-cards/defaults` (Task 3); image URLs (Task 4).
- Produces:
  - `createShareCard(token: string, body: { app; animal_id; kind; molt_id?; fields; shape; link }): Promise<{ image_url: string; card_link: string|null; code: string|null; fields: string[] }>`
  - `getShareDefaults(token: string, app, kind): Promise<string[]>`
  - `<ShareCardModal open onClose app animalId kind moltId? token />`

- [ ] **Step 1: API client (TV web; HV identical with its own `API_URL` default and `app: 'herpetoverse'` at call sites)**

```ts
// apps/web/src/lib/shareCards.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type CardKind = 'molt' | 'profile'
export type CardShape = 'story' | 'post' | 'square'
export type CardApp = 'tarantuverse' | 'herpetoverse'

export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  molts: 'Molt count', size: 'Size', size_change: 'Size change', days_in_care: 'Days in care',
  weight: 'Weight', length: 'Length', sheds: 'Shed count',
}

export const FIELDS: Record<string, string[]> = {
  'tarantuverse:molt': ['photo', 'name', 'species', 'size_change', 'days_in_care'],
  'tarantuverse:profile': ['photo', 'name', 'species', 'sex', 'in_care', 'molts', 'size'],
  'herpetoverse:profile': ['photo', 'name', 'species', 'sex', 'in_care', 'weight', 'length', 'sheds'],
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  })
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : "Couldn't make the card. Try again.")
  }
  return r.json()
}

export function getShareDefaults(token: string, app: CardApp, kind: CardKind) {
  return call<{ fields: string[] }>(token, `/share-cards/defaults?app=${app}&kind=${kind}`).then((d) => d.fields)
}

export function createShareCard(token: string, body: {
  app: CardApp; animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; link: boolean
}) {
  return call<{ image_url: string; card_link: string | null; code: string | null; fields: string[] }>(
    token, '/share-cards/', { method: 'POST', body: JSON.stringify(body) },
  )
}
```

- [ ] **Step 2: The modal (TV; HV copy uses emerald accents in place of primary)**

```tsx
// apps/web/src/components/ShareCardModal.tsx
'use client'
/**
 * Share-card composer (spec §4.4). Live preview, shape chips, field toggles,
 * optional card link. Nothing here changes any app setting (spec §6).
 */
import { useEffect, useRef, useState } from 'react'
import { CardApp, CardKind, CardShape, FIELDS, FIELD_LABELS, createShareCard, getShareDefaults } from '@/lib/shareCards'

export default function ShareCardModal({
  open, onClose, app, animalId, kind, moltId, token,
}: {
  open: boolean; onClose: () => void; app: CardApp; animalId: string; kind: CardKind; moltId?: string; token: string
}) {
  const [shape, setShape] = useState<CardShape>('post')
  const [fields, setFields] = useState<string[] | null>(null)
  const [link, setLink] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [cardLink, setCardLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    getShareDefaults(token, app, kind).then(setFields).catch(() => setFields(FIELDS[`${app}:${kind}`]))
  }, [open, token, app, kind])

  // Debounced live preview: each toggle re-requests a token-signed image.
  useEffect(() => {
    if (!open || !fields) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        setError(null)
        const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, link: false })
        setPreview(r.image_url)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't make the card. Try again.")
      }
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [open, fields, shape, token, app, animalId, kind, moltId])

  if (!open) return null
  const all = FIELDS[`${app}:${kind}`]
  const toggle = (f: string) => setFields((cur) => (cur ?? []).includes(f) ? (cur ?? []).filter((x) => x !== f) : [...(cur ?? []), f])

  const finish = async () => {
    if (!fields) return
    setBusy(true)
    try {
      const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, link })
      setCardLink(r.card_link)
      const blob = await fetch(r.image_url).then((x) => x.blob())
      const file = new File([blob], `${kind}-card.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], ...(r.card_link ? { url: r.card_link } : {}) })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = file.name
        a.click()
        URL.revokeObjectURL(a.href)
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : "Couldn't make the card. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Share card">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl p-6 grid md:grid-cols-2 gap-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg min-h-[320px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Card preview" className="max-h-[480px] rounded" /> : <span className="text-gray-500 dark:text-gray-400">Preparing preview…</span>}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{kind === 'molt' ? 'Share molt' : 'Share card'}</h2>
          <div className="flex gap-2">
            {(['story', 'post', 'square'] as CardShape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} aria-pressed={shape === s}
                className={`px-3 py-1 rounded-full text-sm border ${shape === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                {s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}
              </button>
            ))}
          </div>
          <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            <legend className="text-xs text-gray-500 dark:text-gray-400 px-1">On this card</legend>
            {all.map((f) => (
              <label key={f} className="flex items-center justify-between px-3 py-2 text-sm text-gray-900 dark:text-white">
                {FIELD_LABELS[f]}
                <input type="checkbox" checked={!!fields?.includes(f)} onChange={() => toggle(f)} />
              </label>
            ))}
          </fieldset>
          <label className="flex items-start justify-between gap-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <span>
              Make a link to this card
              <span className="block text-xs text-gray-500 dark:text-gray-400">Shows only this card. Doesn&apos;t change who can see your animals. You can turn it off later.</span>
            </span>
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
          </label>
          {cardLink ? <p className="text-xs text-gray-600 dark:text-gray-300 break-all">{cardLink}</p> : null}
          {error ? <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p> : null}
          <div className="flex gap-2 mt-auto">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Close</button>
            <button onClick={finish} disabled={busy || !fields} className="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-60">
              {busy ? 'Preparing…' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into the TV detail page**

In `apps/web/src/app/dashboard/inverts/[id]/page.tsx`: import the modal, add `const [shareOpen, setShareOpen] = useState(false)`, and next to the existing header actions render (only when `viewerRole` is `'owner'` or `'keeper'`):

```tsx
<button onClick={() => setShareOpen(true)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">Share card</button>
```

and at the end of the page's JSX:

```tsx
{token && invert ? (
  <ShareCardModal open={shareOpen} onClose={() => setShareOpen(false)} app="tarantuverse" animalId={invert.id} kind="profile" token={token} />
) : null}
```

For molts: in the molt list rows on the same page, add a small "Share" text button per molt that opens the modal with `kind="molt"` and `moltId={m.id}` (hold the chosen molt id in state: `const [shareMolt, setShareMolt] = useState<string | null>(null)`; render a second `<ShareCardModal … kind="molt" moltId={shareMolt ?? undefined} open={!!shareMolt} onClose={() => setShareMolt(null)} />`).

- [ ] **Step 4: Wire into HV**

In `AnimalDetailClient.tsx`, same pattern with `app="herpetoverse"`, `kind="profile"` only, gated on the existing `canKeep`/owner check in that file.

- [ ] **Step 5: Verify**

`npx tsc --noEmit -p .` in both web apps — no errors. `npx next lint --file` on the new/changed files — no new errors. In the browser (dev): open an animal, click Share card, toggle Name off → preview updates within ~0.5 s without the name; toggle "Make a link" and Share → a `/c/` link appears; open it in a private window → only the card. Check both themes on the modal.

- [ ] **Step 6: Commit** (hand to Cory)

```
git add apps/web/src/lib/shareCards.ts apps/web/src/components/ShareCardModal.tsx apps/web/src/app/dashboard/inverts apps/web-herpetoverse/src/lib/shareCards.ts apps/web-herpetoverse/src/components/ShareCardModal.tsx apps/web-herpetoverse/src/app/app/reptiles
git commit -m "Share cards: web composer on both sites"
```

---

## Milestone C — Mobile (new native builds)

### Task 7: TV mobile composer

**Files:**
- Modify: `apps/mobile/package.json` (add `expo-sharing@~14.0.7`, `expo-media-library@~18.2.0`), `apps/mobile/app.json` (`runtimeVersion` → `"1.1.0"`; add the `expo-media-library` plugin with a save-only photos permission string)
- Create: `apps/mobile/src/lib/share-cards.ts`, `apps/mobile/app/share/[animalId].tsx`, `apps/mobile/app/share/cards.tsx`
- Modify: `apps/mobile/app/invert/[id].tsx` (replace `handleShare`), `apps/mobile/app/invert/add-molt.tsx` (post-save offer), `apps/mobile/app/sharing/index.tsx` (row → "Shared cards")

**Interfaces:**
- Consumes: `POST /share-cards/`, `GET /share-cards/defaults`, `GET /card-links/`, `DELETE /card-links/{code}` (Task 3).
- Produces:
  - `createShareCard(body): Promise<ShareCardCreated>`, `getShareDefaults(kind): Promise<string[]>`, `listCardLinks(): Promise<CardLinkItem[]>`, `revokeCardLink(code): Promise<void>`
  - Route `/share/[animalId]?kind=profile|molt&moltId=…`, route `/share/cards`.

- [ ] **Step 1: Dependencies and runtime version**

Run (in `apps/mobile`): `npx expo install expo-sharing expo-media-library`
Expected: `package.json` gains `"expo-sharing": "~14.0.7"` and `"expo-media-library": "~18.2.0"`.
In `app.json`: set `"runtimeVersion": "1.1.0"`; add to `plugins`:
```json
["expo-media-library", { "savePhotosPermission": "Save share cards you make to your photo library.", "isAccessMediaLocationEnabled": false }]
```

- [ ] **Step 2: Client**

```ts
// apps/mobile/src/lib/share-cards.ts
import { apiClient } from '../services/api';

export type CardKind = 'molt' | 'profile';
export type CardShape = 'story' | 'post' | 'square';

export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  molts: 'Molt count', size: 'Size', size_change: 'Size change', days_in_care: 'Days in care',
};
export const FIELDS: Record<CardKind, string[]> = {
  molt: ['photo', 'name', 'species', 'size_change', 'days_in_care'],
  profile: ['photo', 'name', 'species', 'sex', 'in_care', 'molts', 'size'],
};

export interface ShareCardCreated { image_url: string; card_link: string | null; code: string | null; fields: string[] }
export interface CardLinkItem { code: string; app: string; kind: CardKind; name: string | null; url: string; created_at: string; revoked_at: string | null }

export async function getShareDefaults(kind: CardKind): Promise<string[]> {
  const { data } = await apiClient.get<{ fields: string[] }>(`/share-cards/defaults`, { params: { app: 'tarantuverse', kind } });
  return data.fields;
}
export async function createShareCard(body: { animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; link: boolean }): Promise<ShareCardCreated> {
  const { data } = await apiClient.post<ShareCardCreated>(`/share-cards/`, { app: 'tarantuverse', ...body });
  return data;
}
export async function listCardLinks(): Promise<CardLinkItem[]> {
  const { data } = await apiClient.get<CardLinkItem[]>(`/card-links/`);
  return data;
}
export async function revokeCardLink(code: string): Promise<void> {
  await apiClient.delete(`/card-links/${encodeURIComponent(code)}`);
}
```

- [ ] **Step 3: Composer screen**

```tsx
// apps/mobile/app/share/[animalId].tsx
/**
 * Share-card composer (spec §4.3). Live preview, shape chips, field toggles,
 * "Make a link to this card", Save and Share. Sharing changes nothing in the
 * app (spec §6) — this screen only ever writes a card link if asked.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { TYPE } from '../../src/theme/tokens';
import { AppHeader } from '../../src/components/AppHeader';
import { CardKind, CardShape, FIELDS, FIELD_LABELS, createShareCard, getShareDefaults } from '../../src/lib/share-cards';

const ASPECT: Record<CardShape, number> = { story: 1080 / 1920, post: 1080 / 1350, square: 1 };

export default function ShareCardScreen() {
  const router = useRouter();
  const { animalId, kind: kindParam, moltId } = useLocalSearchParams<{ animalId: string; kind?: string; moltId?: string }>();
  const kind: CardKind = kindParam === 'molt' ? 'molt' : 'profile';
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [shape, setShape] = useState<CardShape>('story');
  const [fields, setFields] = useState<string[] | null>(null);
  const [link, setLink] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { getShareDefaults(kind).then(setFields).catch(() => setFields(FIELDS[kind])); }, [kind]);

  useEffect(() => {
    if (!fields || !animalId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setError(null);
        const r = await createShareCard({ animal_id: animalId, kind, molt_id: moltId, fields, shape, link: false });
        setPreview(r.image_url);
      } catch {
        setError("Couldn't make the card. Try again.");
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fields, shape, animalId, kind, moltId]);

  const toggle = (f: string) => setFields((cur) => (cur ?? []).includes(f) ? (cur ?? []).filter((x) => x !== f) : [...(cur ?? []), f]);

  const produce = async (): Promise<{ file: string; cardLink: string | null }> => {
    const r = await createShareCard({ animal_id: animalId!, kind, molt_id: moltId, fields: fields!, shape, link });
    const file = `${FileSystem.cacheDirectory}share-card-${Date.now()}.png`;
    const dl = await FileSystem.downloadAsync(r.image_url, file);
    if (dl.status !== 200) throw new Error('download');
    return { file, cardLink: r.card_link };
  };

  const onShare = async () => {
    setBusy('share');
    try {
      const { file, cardLink } = await produce();
      await Sharing.shareAsync(file, { mimeType: 'image/png', dialogTitle: 'Share card', UTI: 'public.png' });
      if (cardLink) Alert.alert('Card link', `${cardLink}\n\nOnly this card is visible at this link. Turn it off any time in Sharing → Shared cards.`);
    } catch {
      setError("Couldn't make the card. Try again.");
    } finally { setBusy(null); }
  };

  const onSave = async () => {
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { setError('Allow photo access to save cards.'); return; }
      const { file } = await produce();
      await MediaLibrary.saveToLibraryAsync(file);
      Alert.alert('Saved to Photos');
    } catch {
      setError("Couldn't save the card. Try again.");
    } finally { setBusy(null); }
  };

  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title={kind === 'molt' ? 'Share molt' : 'Share card'}
        leftAction={<TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close"><MaterialCommunityIcons name="close" size={26} color={iconColor} /></TouchableOpacity>} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.previewWrap, { borderRadius: layout.radius.md }]}>
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '70%', aspectRatio: ASPECT[shape], borderRadius: layout.radius.sm }} accessibilityLabel="Card preview" />
          ) : <ActivityIndicator color={colors.primary} />}
        </View>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {(['story', 'post', 'square'] as CardShape[]).map((s) => {
            const on = s === shape;
            return (
              <TouchableOpacity key={s} onPress={() => setShape(s)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[styles.chip, { borderRadius: layout.radius.full, borderColor: on ? colors.textPrimary : colors.border, backgroundColor: on ? colors.textPrimary : 'transparent' }]}>
                <Text style={[TYPE.bodyStrong, { color: on ? colors.background : colors.textSecondary }]}>{s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[TYPE.caption, styles.section]}>On this card</Text>
        <View style={[styles.group, { borderRadius: layout.radius.md }]}>
          {FIELDS[kind].map((f) => (
            <View key={f} style={styles.row}>
              <Text style={[TYPE.body, { color: colors.textPrimary }]}>{FIELD_LABELS[f]}</Text>
              <Switch value={!!fields?.includes(f)} onValueChange={() => toggle(f)} accessibilityLabel={FIELD_LABELS[f]} />
            </View>
          ))}
        </View>
        <View style={[styles.group, styles.linkGroup, { borderRadius: layout.radius.md }]}>
          <View style={styles.row}>
            <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>Make a link to this card</Text>
            <Switch value={link} onValueChange={setLink} accessibilityLabel="Make a link to this card" />
          </View>
          <Text style={[TYPE.caption, styles.hint]}>Shows only this card. Doesn&apos;t change who can see your animals.</Text>
        </View>
        {error ? <Text style={[TYPE.caption, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onSave} disabled={!!busy || !fields} style={[styles.btn, { borderRadius: layout.radius.md, borderColor: colors.border }]} accessibilityRole="button">
            {busy === 'save' ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Save</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} disabled={!!busy || !fields} style={[styles.btn, { borderRadius: layout.radius.md, backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }]} accessibilityRole="button">
            {busy === 'share' ? <ActivityIndicator color={colors.background} /> : <Text style={[TYPE.bodyStrong, { color: colors.background }]}>Share</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  previewWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: 16, minHeight: 240 },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  section: { color: colors.textTertiary, marginTop: 4 },
  group: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  linkGroup: { paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, minHeight: 48 },
  hint: { color: colors.textSecondary, paddingHorizontal: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 4: "Shared cards" list**

```tsx
// apps/mobile/app/share/cards.tsx
/** Your shared cards — every card link you made, with a way to turn each off. */
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { TYPE } from '../../src/theme/tokens';
import { AppHeader } from '../../src/components/AppHeader';
import { CardLinkItem, listCardLinks, revokeCardLink } from '../../src/lib/share-cards';

export default function SharedCardsScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [items, setItems] = useState<CardLinkItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    listCardLinks().then((d) => { setItems(d); setError(false); }).catch(() => setError(true));
  }, []);
  useFocusEffect(load);

  const turnOff = (c: CardLinkItem) => Alert.alert('Turn off this link?', 'Anyone with the link will see that the card is no longer shared.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Turn off', style: 'destructive', onPress: () => { revokeCardLink(c.code).then(load).catch(() => Alert.alert("Couldn't turn it off. Try again.")); } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Shared cards" leftAction={<TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back"><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      {error ? (
        <Text style={[TYPE.body, styles.pad, { color: colors.textSecondary }]}>Couldn&apos;t load your shared cards. Pull down to retry.</Text>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(c) => c.code}
          contentContainerStyle={styles.pad}
          ListEmptyComponent={items ? <Text style={[TYPE.body, { color: colors.textSecondary }]}>Card links you make appear here.</Text> : null}
          renderItem={({ item: c }) => (
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{c.name || 'Specimen'} · {c.kind === 'molt' ? 'molt' : 'profile'}</Text>
                <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{c.revoked_at ? 'Off' : c.url}</Text>
              </View>
              {!c.revoked_at ? (
                <TouchableOpacity onPress={() => turnOff(c)} accessibilityRole="button" style={styles.off}>
                  <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Turn off</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 12, gap: 8 },
  off: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
```

- [ ] **Step 5: Entry points**

In `apps/mobile/app/invert/[id].tsx` replace `handleShare` with:

```tsx
  const handleShare = () => {
    router.push(`/share/${id}?kind=profile` as any);
  };
```

and hide the Share hero button unless `canKeep` (co-keepers below keeper can't share — the API would 404).

In `apps/mobile/app/invert/add-molt.tsx`, after a successful NEW molt that is not fatal: the create call returns the molt (`createInvertMolt` resolves `InvertMoltLog` with `id`); offer, never force:

```tsx
        const created = await createInvertMolt(taxon, id, payload);
        if (outcome !== 'fatal' && can(role, 'keeper')) {
          Alert.alert('Molt saved', 'Make a card of it?', [
            { text: 'Not now', style: 'cancel', onPress: () => router.back() },
            { text: 'Make a card', onPress: () => router.replace(`/share/${id}?kind=molt&moltId=${created.id}` as any) },
          ], { cancelable: true, onDismiss: () => router.back() });
          return;
        }
```

(Place this after the existing fatal-molt branch; keep that branch first so a fatal molt never offers a share card.)

In `apps/mobile/app/sharing/index.tsx`, add a row that pushes `/share/cards` labelled "Shared cards".

- [ ] **Step 6: Verify**

In `apps/mobile`: `npx tsc --noEmit -p .` — no errors; `node scripts/check-design-tokens.js` — passes (run `--update` only if the counts went DOWN). Build a dev client (`eas build --profile development --platform android`) — `expo-sharing`/`expo-media-library` need a native build; Expo Go won't show them. On device: share a profile card to Instagram Stories, Discord and Messages; save one to Photos; log a molt → "Make a card" → molt card; make a card link → it appears in Shared cards → Turn off → the link page reads "This card is no longer shared".

- [ ] **Step 7: Commit** (hand to Cory)

```
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/src/lib/share-cards.ts apps/mobile/app/share apps/mobile/app/invert apps/mobile/app/sharing
git commit -m "Share cards: TV mobile composer, shared-cards list, post-molt offer"
```

---

### Task 8: HV mobile composer (profile card)

**Files:**
- Modify: `apps/mobile-herpetoverse/package.json` (`npx expo install expo-sharing expo-media-library`), `apps/mobile-herpetoverse/app.json` (`runtimeVersion` → `"1.2.0"`; the same `expo-media-library` plugin block as Task 7)
- Create: `apps/mobile-herpetoverse/src/lib/share-cards.ts`, `apps/mobile-herpetoverse/app/share/[animalId].tsx`
- Modify: `apps/mobile-herpetoverse/src/screens/AnimalDetailScreen.tsx`

**Interfaces:**
- Consumes: Task 3 endpoints with `app: 'herpetoverse'`, `kind: 'profile'`.
- Produces: route `/share/[animalId]` in HV.

- [ ] **Step 1: Dependencies** — as Task 7 Step 1, in `apps/mobile-herpetoverse`, runtimeVersion `"1.2.0"`.

- [ ] **Step 2: Client**

```ts
// apps/mobile-herpetoverse/src/lib/share-cards.ts
import { apiClient } from '../services/api';

export type CardShape = 'story' | 'post' | 'square';
export const FIELDS = ['photo', 'name', 'species', 'sex', 'in_care', 'weight', 'length', 'sheds'];
export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  weight: 'Weight', length: 'Length', sheds: 'Shed count',
};
export interface ShareCardCreated { image_url: string; card_link: string | null; code: string | null; fields: string[] }

export async function getShareDefaults(): Promise<string[]> {
  const { data } = await apiClient.get<{ fields: string[] }>(`/share-cards/defaults`, { params: { app: 'herpetoverse', kind: 'profile' } });
  return data.fields;
}
export async function createShareCard(body: { animal_id: string; fields: string[]; shape: CardShape; link: boolean }): Promise<ShareCardCreated> {
  const { data } = await apiClient.post<ShareCardCreated>(`/share-cards/`, { app: 'herpetoverse', kind: 'profile', ...body });
  return data;
}
```

(Check the import path of HV's axios client — if `src/services/api` doesn't exist, use the one `src/lib/animals.ts` imports.)

- [ ] **Step 3: Composer screen** — create `apps/mobile-herpetoverse/app/share/[animalId].tsx` with the Task 7 Step 3 screen, adapted:
  - imports: `useTheme` from `../../src/contexts/ThemeContext`, `TYPE` from `../../src/theme/type`, `AppHeader` from `../../src/components/AppHeader`, and `FIELDS, FIELD_LABELS, createShareCard, getShareDefaults, CardShape` from `../../src/lib/share-cards`;
  - drop `kind`/`moltId` params (profile only): `getShareDefaults()` and `createShareCard({ animal_id: animalId, fields, shape, link })`;
  - `FIELDS` is a flat array here (`FIELDS.map(...)`);
  - HV theme has `colors.danger` (not `error`) and `layout.radius.xl` (no `full`): use `colors.danger` for the error text and `layout.radius.xl` for chips;
  - title always "Share card".

- [ ] **Step 4: Entry point** — in `AnimalDetailScreen.tsx`, change the hero's `onShare` to push the composer instead of the link sheet, keeping the existing gating:

```tsx
          onShare={isOwner && !dead ? () => router.push(`/share/${animal.id}` as never) : undefined}
```

Keep `ReptileShareSheet` reachable for the profile link: add a "Share profile link" text row under the hero actions that sets `setShareOpen(true)` (the sheet stays as it is).

- [ ] **Step 5: Verify** — `npx tsc --noEmit -p .` in `apps/mobile-herpetoverse`; dev build; share a reptile profile card to Instagram Stories and save one to Photos.

- [ ] **Step 6: Commit** (hand to Cory)

```
git add apps/mobile-herpetoverse/package.json apps/mobile-herpetoverse/app.json apps/mobile-herpetoverse/src/lib/share-cards.ts apps/mobile-herpetoverse/app/share apps/mobile-herpetoverse/src/screens/AnimalDetailScreen.tsx
git commit -m "Share cards: HV mobile composer (profile card)"
```

---

### Task 9: Privacy copy, docs, release

**Files:**
- Modify: the three privacy policy pages touched on 2026-09-29 (`apps/web/src/app/privacy/page.tsx` or the `privacy-policy` pages found by `grep -rln "Co-keepers" apps/web/src/app apps/web-herpetoverse/src/app`), `CLAUDE.md`

- [ ] **Step 1: Privacy policy** — add a subsection after "Co-keepers" in each policy:

> **Share cards.** When you make a share card, we generate the image from the details you choose for that card. Making a card never changes who can see your animals. If you choose "Make a link to this card", we store a copy of that card so the link can show it; the link shows only that card, isn't listed or indexed, and you can turn it off at any time under Sharing → Shared cards. Deleting the animal or your account turns its card links off.

Update each page's "Last updated" date.

- [ ] **Step 2: CLAUDE.md** — under "Security Hardening" add a "Share cards" bullet: server-side composition in `services/share_card.py` with the allow-lists; render tokens in `utils/share_token.py` (15 min, HMAC); `card_links` frozen snapshots, revocable, 410 when revoked/animal gone; renderer lives on TV web (`src/lib/share-card`) for both products; `robots.ts` must keep `/api/og/` and `/api/card-link/` allowed; sharing never writes a visibility column (test `test_router_never_writes_visibility`).

- [ ] **Step 3: Full verification**

- `cd apps/api` → `python -m pytest -q -p no:cacheprovider tests` — all pass.
- `npx tsc --noEmit -p .` in `apps/web`, `apps/web-herpetoverse`, `apps/mobile`, `apps/mobile-herpetoverse` — no errors.
- `node scripts/check-design-tokens.js` in `apps/mobile` — passes.
- Facebook Sharing Debugger + Discord paste on one `/c/<code>` and one public `/i/<id>`.
- Request a whole-branch code review (superpowers:requesting-code-review) before release.

- [ ] **Step 4: Release (hand to Cory, in order)**

```
git add CLAUDE.md apps/web/src/app apps/web-herpetoverse/src/app
git commit -m "Share cards: privacy policy and docs"
git push
```
Then Android first (fast review), iOS after:
```
cd apps/mobile
eas build --platform android --profile production
eas submit --platform android
eas build --platform ios --profile production
eas submit --platform ios
cd ../mobile-herpetoverse
eas build --platform android --profile production
eas submit --platform android
eas build --platform ios --profile production
eas submit --platform ios
```
OTA updates that include the composer only reach binaries with the bumped `runtimeVersion` (1.1.0 TV / 1.2.0 HV); older installs keep the text share.
