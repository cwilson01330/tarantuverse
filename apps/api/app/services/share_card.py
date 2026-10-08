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
# How the card looks. All three render from the same composed payload; the
# Field notes frame also reads the `notes` block below.
FRAMES = ("specimen", "notes", "herbarium")
DEFAULT_FRAME = "specimen"

FIELD_ALLOW: dict[tuple[str, str], tuple[str, ...]] = {
    ("tarantuverse", "molt"): ("photo", "name", "species", "size_change", "days_in_care"),
    ("tarantuverse", "profile"): ("photo", "name", "species", "sex", "in_care", "molts", "size"),
    # A population colony (ADR-010). Never: location, notes, sitter note,
    # source, enclosure, price — none of them is even read into the subject.
    ("tarantuverse", "colony"): ("photo", "name", "species", "population", "stages", "founded"),
    ("herpetoverse", "profile"): ("photo", "name", "species", "sex", "in_care", "weight", "length", "sheds"),
    # One shed log / one weigh-in. Their free-text notes (and retained-shed
    # notes) are never includable.
    ("herpetoverse", "shed"): (
        "photo", "name", "species", "shed_number", "shed_date", "completeness", "days_since_previous", "in_care",
    ),
    ("herpetoverse", "weight"): ("photo", "name", "species", "weight", "change", "weigh_date", "in_care"),
}

# What a first-time sharer sees switched on. Days-in-care is off by default
# on the molt card (the mockup the spec approved).
DEFAULT_FIELDS: dict[tuple[str, str], tuple[str, ...]] = {
    ("tarantuverse", "molt"): ("photo", "name", "species", "size_change"),
    ("tarantuverse", "profile"): FIELD_ALLOW[("tarantuverse", "profile")],
    ("tarantuverse", "colony"): ("photo", "name", "species", "population"),
    ("herpetoverse", "profile"): FIELD_ALLOW[("herpetoverse", "profile")],
    ("herpetoverse", "shed"): ("photo", "name", "species", "shed_number", "shed_date"),
    ("herpetoverse", "weight"): ("photo", "name", "species", "weight", "change"),
}

# Every kind any app has. The schema / defaults-route patterns and the
# card_links_kind_check CHECK (migration shk_20261007_share_card_kinds) are
# kept in lockstep with this.
CARD_KINDS = ("molt", "profile", "colony", "shed", "weight")

# Taxa whose size is a leg span (spider-shaped); everything else is a body
# length. Mirrors growthLengthLabel() on the clients.
_LEG_SPAN_TAXA = {"tarantula", "true_spider", "whip_spider"}

# What a colony's headcount is OF, per taxon: (one, many). "other" stays
# neutral rather than guessing what the animals are.
_POPULATION_NOUN: dict[str, tuple[str, str]] = {
    "tarantula": ("tarantula", "tarantulas"),
    "scorpion": ("scorpion", "scorpions"),
    "centipede": ("centipede", "centipedes"),
    "whip_spider": ("whip spider", "whip spiders"),
    "vinegaroon": ("vinegaroon", "vinegaroons"),
    "true_spider": ("spider", "spiders"),
    "millipede": ("millipede", "millipedes"),
    "mantis": ("mantis", "mantises"),
    "roach": ("roach", "roaches"),
    "isopod": ("isopod", "isopods"),
}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


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
    # Colony only (ADR-010).
    founded_date: Optional[date] = None
    stage_counts: Optional[dict] = None
    count_is_estimated: bool = False


@dataclass
class MoltFacts:
    number: int
    molted_on: date
    span_before: Optional[float]
    span_after: Optional[float]


@dataclass
class ShedFacts:
    """One shed log. `number` counts sheds oldest first; `previous_on` is the
    shed before it, if any."""
    number: int
    shed_on: date
    is_complete: Optional[bool] = None
    has_retained: bool = False
    previous_on: Optional[date] = None


@dataclass
class WeightFacts:
    """One weigh-in, and the weigh-in before it (None for the first)."""
    weight_g: float
    weighed_on: date
    previous_g: Optional[float] = None


def clean_fields(app: str, kind: str, requested: Optional[list[str]]) -> list[str]:
    key = (app, kind)
    if key not in FIELD_ALLOW:
        raise ValueError(f"No {kind} card for {app}")
    if requested is None:
        return list(DEFAULT_FIELDS[key])
    allowed = FIELD_ALLOW[key]
    # Keep allow-list order, drop anything else, de-duplicate.
    return [f for f in allowed if f in set(requested)]


def clean_frame(frame: Optional[str]) -> str:
    return frame if frame in FRAMES else DEFAULT_FRAME


def read_defaults(saved) -> tuple[Optional[list[str]], str]:
    """A remembered `app:kind` entry → (fields, frame). Older rows stored a
    bare list of fields; read those as the Specimen frame."""
    if isinstance(saved, list):
        return saved, DEFAULT_FRAME
    if isinstance(saved, dict):
        fields = saved.get("fields")
        return (fields if isinstance(fields, list) else None), clean_frame(saved.get("frame"))
    return None, DEFAULT_FRAME


def ordinal(n: int) -> str:
    """1st 2nd 3rd 4th … 11th 12th 13th … 21st 22nd 101st 111th."""
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


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


def date_label(d: date) -> str:
    """'Oct 3, 2026' — ASCII only, so every card font can draw it."""
    return f"{_MONTHS[d.month - 1]} {d.day}, {d.year}"


def _count_word(taxon: str, n: int) -> str:
    one, many = _POPULATION_NOUN.get(taxon, ("animal", "animals"))
    return one if n == 1 else many


def stage_buckets(stage_counts: Optional[dict]) -> list[tuple[str, int]]:
    """The colony's non-empty buckets, largest first (ties by name). Only real
    integer counts: JSONB can hold anything, and True is an int in Python."""
    out = []
    for k, v in (stage_counts or {}).items():
        if isinstance(v, bool) or not isinstance(v, int) or v <= 0 or not isinstance(k, str):
            continue
        label = " ".join(k.replace("_", " ").split())[:24]
        if label:
            out.append((label, v))
    return sorted(out, key=lambda kv: (-kv[1], kv[0]))


def population_label(taxon: str, stage_counts: Optional[dict], estimated: bool) -> Optional[str]:
    """'~360 isopods' when the keeper marked the count as an estimate, else
    '360 isopods'. None for an empty colony (no empty rows)."""
    total = sum(n for _, n in stage_buckets(stage_counts))
    if total <= 0:
        return None
    return f"{'~' if estimated else ''}{total:,} {_count_word(taxon, total)}"


_STAGES_MAX_CHARS = 44


def stages_label(stage_counts: Optional[dict], estimated: bool) -> Optional[str]:
    """'200 juveniles · 120 adults' — the biggest buckets. Only when there are
    two or more; a single bucket would just repeat the population. A third
    bucket is added only while the line stays short enough for one card row."""
    buckets = stage_buckets(stage_counts)
    if len(buckets) < 2:
        return None
    mark = "~" if estimated else ""
    parts = [f"{mark}{n:,} {k}" for k, n in buckets[:3]]
    three = " · ".join(parts)
    return three if len(parts) == 3 and len(three) <= _STAGES_MAX_CHARS else " · ".join(parts[:2])


def since_label(start: Optional[date], today: date) -> Optional[str]:
    """'2025' — or 'Mar 2026' for a colony less than a year old, where the year
    alone says almost nothing. None for a future date."""
    if start is None or start > today:
        return None
    months = (today.year - start.year) * 12 + (today.month - start.month)
    return str(start.year) if months >= 12 else f"{_MONTHS[start.month - 1]} {start.year}"


MINUS = "−"  # a true minus sign; all three card fonts have it


def _signed_weight(delta_g: float) -> str:
    sign = "+" if delta_g > 0 else MINUS if delta_g < 0 else ""
    return f"{sign}{_weight(abs(delta_g))}"


def weight_change_label(now_g: float, prev_g: Optional[float]) -> Optional[str]:
    """'+12 g (+3%)', '−40 g (−3%)', '0 g'. None when there is no earlier
    weigh-in to compare with."""
    if prev_g is None:
        return None
    delta = round(float(now_g) - float(prev_g), 2)
    if delta == 0:
        return "0 g"
    out = _signed_weight(delta)
    if prev_g > 0:
        pct = delta / float(prev_g) * 100
        p = f"{abs(pct):.1f}".rstrip("0").rstrip(".") if abs(pct) < 1 else f"{abs(pct):.0f}"
        if p != "0":
            out += f" ({'+' if pct > 0 else MINUS}{p}%)"
    return out


def compose_card(
    kind: str,
    subject: CardSubject,
    fields: list[str],
    molt: Optional[MoltFacts] = None,
    today: Optional[date] = None,
    shed: Optional[ShedFacts] = None,
    weight: Optional[WeightFacts] = None,
) -> dict:
    today = today or date.today()
    f = set(fields)
    sex = (getattr(subject.sex, "value", subject.sex) or "").lower()
    facts: list[dict] = []

    def fact(label: str, value: Optional[str]) -> None:
        if value:  # a missing value removes its row
            facts.append({"label": label, "value": value})

    # The Field notes frame says the same facts as one handwritten line, in
    # the keeper's voice ("4.1 in · 9 molts · 1 yr with me"). Built here, from
    # the same chosen fields, so the client still only ever sends field names.
    note_facts: list[str] = []

    def note(value: Optional[str]) -> None:
        if value:
            note_facts.append(value)

    name = subject.name if "name" in f else None
    species_on = "species" in f
    sex_on = "sex" in f and sex in ("male", "female")

    if kind == "molt":
        if molt is None:
            raise ValueError("molt card needs a molt")
        header = f"Specimen · molt no. {molt.number}"
        if "size_change" in f:
            b, a = molt.span_before, molt.span_after
            unit = " in"
            if b is not None and a is not None:
                value = f"{_num(b)} → {_num(a)}{unit}"
            elif a is not None:
                value = f"{_num(a)}{unit}"
            else:
                value = None
            fact(_size_label(subject.taxon), value)
            note(value)
        if "days_in_care" in f and subject.date_acquired and subject.date_acquired <= molt.molted_on:
            days = (molt.molted_on - subject.date_acquired).days
            fact("In care", f"day {days}")
            note(f"day {days} with me")
        headline = f"{name}, {ordinal(molt.number)} molt" if name else f"{ordinal(molt.number)} molt"
        species_line = subject.scientific_name if species_on else None
    elif kind == "shed":
        if shed is None:
            raise ValueError("shed card needs a shed")
        number_on = "shed_number" in f
        header = f"Specimen · shed no. {shed.number}" if number_on else "Specimen · shed"
        if "shed_date" in f:
            d = date_label(shed.shed_on)
            fact("Shed on", d)
            note(d)
        if "completeness" in f and shed.is_complete is not None:
            word = "Complete" if shed.is_complete else "Incomplete"
            if shed.has_retained:
                word += ", some retained"
            fact("Shed", word)
            note(f"{word.lower()} shed" if not shed.has_retained else word.lower())
        if "days_since_previous" in f and shed.previous_on and shed.previous_on <= shed.shed_on:
            gap = (shed.shed_on - shed.previous_on).days
            fact("Since last shed", _plural(gap, "day"))
            note(f"{_plural(gap, 'day')} since the last")
        in_care = in_care_label(subject.date_acquired, shed.shed_on) if "in_care" in f and subject.date_acquired else None
        fact("In care", in_care)
        if in_care:
            note(f"{in_care} with me")
        if name:
            headline = f"{name}, {ordinal(shed.number)} shed" if number_on else name
        else:
            headline = f"{ordinal(shed.number)} shed" if number_on else "Shed"
        species_line = subject.scientific_name if species_on else None
    elif kind == "weight":
        if weight is None:
            raise ValueError("weight card needs a weigh-in")
        header = "Specimen · weigh-in"
        if "weight" in f:
            w = _weight(float(weight.weight_g))
            fact("Weight", w)
            note(w)
        if "change" in f:
            ch = weight_change_label(weight.weight_g, weight.previous_g)
            fact("Change", ch)
            if ch:
                note(f"{ch} since the last")
        if "weigh_date" in f:
            d = date_label(weight.weighed_on)
            fact("Weighed", d)
            note(d)
        in_care = in_care_label(subject.date_acquired, weight.weighed_on) if "in_care" in f and subject.date_acquired else None
        fact("In care", in_care)
        if in_care:
            note(f"{in_care} with me")
        headline = name or "Weigh-in"
        species_line = subject.scientific_name if species_on else None
    elif kind == "colony":
        header = "Colony"
        if "population" in f:
            pop = population_label(subject.taxon, subject.stage_counts, subject.count_is_estimated)
            fact("Population", pop)
            if pop:
                note(pop.replace("~", "about ", 1) if pop.startswith("~") else pop)
        if "stages" in f:
            st = stages_label(subject.stage_counts, subject.count_is_estimated)
            fact("Stages", st)
            # Handwritten, the buckets read as a list; the dots stay between facts.
            note(st.replace(" · ", ", ") if st else None)
        if "founded" in f:
            since = since_label(subject.founded_date or subject.date_acquired, today)
            fact("Colony since", since)
            if since:
                note(f"since {since}")
        sci = subject.scientific_name if species_on else None
        common = subject.common_name if species_on else None
        if name:
            headline, species_line = name, sci or common
        else:
            headline, species_line = (sci, common) if sci else (common, None)
    else:
        header = "Specimen"
        if sex_on:
            header = f"Specimen · {sex}"
        in_care = in_care_label(subject.date_acquired, today) if "in_care" in f and subject.date_acquired else None
        fact("In care", in_care)
        if subject.app == "tarantuverse":
            if "size" in f:
                fact(_size_label(subject.taxon), subject.latest_size)
                note(subject.latest_size)
            if "molts" in f and subject.molt_count > 0:
                fact("Molts", str(subject.molt_count))
                note(_plural(subject.molt_count, "molt"))
            # Fact rows keep their original order (In care first); only the
            # handwritten line reads size-first.
            facts.sort(key=lambda r: {"In care": 0, "Molts": 1}.get(r["label"], 2))
        else:
            if "weight" in f and subject.weight_g:
                w = _weight(float(subject.weight_g))
                fact("Weight", w)
                note(w)
            if "length" in f and subject.length_in:
                ln = f"{_num(float(subject.length_in))} in"
                fact("Length", ln)
                note(ln)
            if "sheds" in f and subject.shed_count > 0:
                fact("Sheds", str(subject.shed_count))
                note(_plural(subject.shed_count, "shed"))
        if in_care:
            note(f"{in_care} with me")
        sci = subject.scientific_name if species_on else None
        common = subject.common_name if species_on else None
        if name:
            headline, printed = name, sci
        else:
            # No name: the species becomes the handwritten headline and the
            # printed line falls back to the common name.
            headline, printed = (sci, common) if sci else (common, None)
        species_line = " · ".join(v for v in (printed, sex if sex_on else None) if v) or None

    return {
        "app": subject.app,
        "kind": kind,
        "taxon": subject.taxon,
        "header": header,
        "name": name,
        "scientific_name": subject.scientific_name if species_on else None,
        "common_name": subject.common_name if species_on and kind in ("profile", "colony") else None,
        "photo_url": allowed_photo_url(subject.photo_url) if "photo" in f else None,
        "facts": facts,
        "notes": {"headline": headline, "species_line": species_line, "facts": note_facts},
    }
