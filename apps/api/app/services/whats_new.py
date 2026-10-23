"""What's new: the highlights file and its validator.

The feed lives in ``app/content/whats_new.json`` (committed to the repo; the
commit is the approval and the Render deploy publishes it). One list per app,
each app in its own words.

``validate_feed`` is strict on purpose: a bad file raises ``ValueError`` naming
the entry id and field, the test suite loads the real file, and so a typo is
caught before it can reach a deploy. ``load_feed`` caches per path, so the
file is read once per process.

Nothing here knows about users, "seen" state or today's date; the router
(``routers/whats_new.py``) applies the live/unseen rules on top of these lists.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

WHATS_NEW_APPS: tuple[str, ...] = ("tarantuverse", "herpetoverse")

# Screens an entry's button can open. Each client maps these to its own routes
# (an explicit null for a target the app can't serve); tests keep them in sync.
WHATS_NEW_TARGETS: tuple[str, ...] = (
    "expenses",
    "feeding_day",
    "analytics_advanced",
    "collection",
    "species",
    "settings",
)

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "content" / "whats_new.json"

EARLIEST_PUBLISHED_ON = date(2026, 10, 1)

# Used with fullmatch(): `$` would also accept a trailing newline.
ID_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}-[a-z0-9-]+")
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
ID_MAX = 80
TITLE_MAX = 60
BODY_MAX = 220
ACTION_LABEL_MAX = 30

_ENTRY_KEYS = {"id", "published_on", "title", "body", "premium", "action"}
_REQUIRED_KEYS = _ENTRY_KEYS - {"action"}
_ACTION_KEYS = {"label", "target"}


@dataclass(frozen=True)
class WhatsNewEntry:
    id: str
    published_on: date
    title: str
    body: str
    premium: bool
    action_label: str | None
    action_target: str | None


def week_of(d: date) -> date:
    """The Monday of ``d``'s ISO week."""
    return d - timedelta(days=d.weekday())


def _plain_text_problem(value: str) -> str | None:
    if "<" in value or ">" in value:
        return "must be plain text (no '<' or '>')"
    if "](" in value:
        return "must be plain text (no markdown links)"
    return None


def _check_text(label: str, field: str, value: object, max_len: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label}: field '{field}' must be a string")
    if not 1 <= len(value) <= max_len:
        raise ValueError(
            f"{label}: field '{field}' must be 1-{max_len} characters (got {len(value)})"
        )
    problem = _plain_text_problem(value)
    if problem:
        raise ValueError(f"{label}: field '{field}' {problem}")
    return value


def _validate_entry(app: str, index: int, raw: object, seen_ids: set[str]) -> WhatsNewEntry:
    where = f"{app}[{index}]"
    if not isinstance(raw, dict):
        raise ValueError(f"{where}: entry must be an object")

    raw_id = raw.get("id")
    label = f"entry '{raw_id}' ({where})" if isinstance(raw_id, str) else f"entry {where}"

    extra = sorted(set(raw) - _ENTRY_KEYS)
    if extra:
        raise ValueError(f"{label}: unknown field '{extra[0]}'")
    missing = sorted(_REQUIRED_KEYS - set(raw))
    if missing:
        raise ValueError(f"{label}: missing field '{missing[0]}'")

    entry_id = raw_id
    if (
        not isinstance(entry_id, str)
        or len(entry_id) > ID_MAX
        or not ID_PATTERN.fullmatch(entry_id)
    ):
        raise ValueError(
            f"{label}: field 'id' must match ^{ID_PATTERN.pattern}$ and be at most {ID_MAX} characters"
        )
    if entry_id in seen_ids:
        raise ValueError(f"{label}: duplicate id '{entry_id}' in {app}")
    seen_ids.add(entry_id)

    raw_date = raw["published_on"]
    if not isinstance(raw_date, str) or not DATE_PATTERN.fullmatch(raw_date):
        raise ValueError(f"{label}: field 'published_on' must be an ISO date (YYYY-MM-DD)")
    try:
        published_on = date.fromisoformat(raw_date)
    except ValueError:
        raise ValueError(f"{label}: field 'published_on' is not a real date ({raw_date})") from None
    if published_on < EARLIEST_PUBLISHED_ON:
        raise ValueError(
            f"{label}: field 'published_on' must not be before {EARLIEST_PUBLISHED_ON.isoformat()}"
        )

    title = _check_text(label, "title", raw["title"], TITLE_MAX)
    body = _check_text(label, "body", raw["body"], BODY_MAX)

    premium = raw["premium"]
    if not isinstance(premium, bool):
        raise ValueError(f"{label}: field 'premium' must be true or false")

    action_label: str | None = None
    action_target: str | None = None
    if "action" in raw:
        action = raw["action"]
        if not isinstance(action, dict):
            raise ValueError(f"{label}: field 'action' must be an object with label and target")
        if set(action) != _ACTION_KEYS:
            raise ValueError(f"{label}: field 'action' must have exactly 'label' and 'target'")
        action_label = _check_text(label, "action.label", action["label"], ACTION_LABEL_MAX)
        action_target = action["target"]
        if action_target not in WHATS_NEW_TARGETS:
            raise ValueError(
                f"{label}: field 'action.target' unknown target '{action_target}' "
                f"(allowed: {', '.join(WHATS_NEW_TARGETS)})"
            )

    return WhatsNewEntry(
        id=entry_id,
        published_on=published_on,
        title=title,
        body=body,
        premium=premium,
        action_label=action_label,
        action_target=action_target,
    )


def validate_feed(raw: object) -> dict[str, list[WhatsNewEntry]]:
    """Validate the parsed JSON and return per-app entries, newest first.

    Ids are unique within an app's list (the same id may appear in both apps'
    lists: the launch entries do). Raises ``ValueError`` naming the entry/field.
    """
    if not isinstance(raw, dict):
        raise ValueError("top-level value must be an object with one list per app")
    extra = sorted(set(raw) - set(WHATS_NEW_APPS))
    if extra:
        raise ValueError(f"top-level: unknown key '{extra[0]}' (allowed: {', '.join(WHATS_NEW_APPS)})")
    for app in WHATS_NEW_APPS:
        if app not in raw:
            raise ValueError(f"top-level: missing key '{app}'")

    feed: dict[str, list[WhatsNewEntry]] = {}
    for app in WHATS_NEW_APPS:
        items = raw[app]
        if not isinstance(items, list):
            raise ValueError(f"top-level: '{app}' must be a list")
        seen_ids: set[str] = set()
        entries = [_validate_entry(app, i, item, seen_ids) for i, item in enumerate(items)]
        # Newest first; ties by id so the order is stable.
        feed[app] = sorted(entries, key=lambda e: (-e.published_on.toordinal(), e.id))
    return feed


@lru_cache(maxsize=None)
def _load(path: Path) -> Mapping[str, tuple[WhatsNewEntry, ...]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path.name}: not valid JSON ({exc})") from exc
    feed = validate_feed(raw)
    # Immutable all the way down: the same object is handed to every request,
    # so a caller's .sort()/.append() must not be able to corrupt it.
    return MappingProxyType({app: tuple(entries) for app, entries in feed.items()})


def load_feed(path: Path = DEFAULT_PATH) -> Mapping[str, tuple[WhatsNewEntry, ...]]:
    """Read, validate and cache the file (one read per path per process).

    The result is a read-only mapping of per-app tuples (newest first). Raises
    ``ValueError`` on a bad file, so a broken feed fails loudly instead of
    serving garbage.
    """
    return _load(Path(path).resolve())
