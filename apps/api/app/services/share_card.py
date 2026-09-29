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


def allowed_photo_url(url: Optional[str], base: Optional[str] = None) -> Optional[str]:
    """photo_url is user-editable free text; only emit it when it lives under
    our own storage public base (the renderer fetches it server-side)."""
    if base is None:
        from app.services.storage import storage_service
        base = getattr(storage_service, "public_url_base", None) if getattr(storage_service, "use_r2", False) else None
    if not url or not base:
        return None
    return url if url.startswith(base.rstrip("/") + "/") else None


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
        "photo_url": allowed_photo_url(subject.photo_url) if "photo" in f else None,
        "facts": facts,
    }
