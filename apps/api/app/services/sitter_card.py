"""
Sitter care cards (PRD-shared-keeping, "The sitter care card").

A card is a play-by-play of how THIS keeper keeps THIS animal, written for
someone who has never kept one, in the order they need it at the enclosure:
safety, today, feeding, water, heat, leave-alone, the keeper's note.

RULES (each one has a test in tests/test_sitter_card.py)
--------------------------------------------------------
1. Source priority: the keeper's note → the keeper's records → the species
   care sheet. Every line carries its source so the page can say where it
   came from. If none of them knows a fact, the line is OMITTED — never
   guessed. (Decided 2026-09-28.)
2. Safety lines come from the species record, always render, and sit first.
3. Allowlist, not blocklist. Cards are built field by field from the inputs
   below; no model is ever serialised. `notes`, `enclosure_notes`,
   `price_paid`, `source`, provenance and death details are never read here,
   so they cannot leak — and the tests plant sentinel values in them to prove
   it stays that way.
4. Deterministic. Same inputs, same card. No AI, no randomness.
5. A species field that is False or NULL asserts nothing. `urticating_hairs`
   defaults to False in the schema, so False can mean "not recorded". We only
   ever speak when a flag is True — never "this species is harmless".

Pure functions over plain attribute bags: callers pass ORM objects (or, in
tests, SimpleNamespace), plus pre-computed feeding facts. No DB access here.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, List, Optional, Sequence

from app.utils.feeding_mode import has_feeding_cadence
from app.utils.units import f_to_c, normalize_units

# ── line sources ──────────────────────────────────────────────────────────────
SAFETY = "safety"      # species hazard; can't be hidden
KEEPER = "keeper"      # the keeper wrote it or set it
RECORD = "record"      # derived from the keeper's own logs and fields
SPECIES = "species"    # the species care sheet
DEFAULT = "default"    # a universal sitter rule (don't rehouse, etc.)

# ── feeding states ────────────────────────────────────────────────────────────
FEED = "feed"              # due or overdue today
NOT_DUE = "not_due"        # fed recently; next date known
DONT_FEED = "dont_feed"    # paused, premolt, brumation
ASK = "ask"                # no schedule on record — follow the keeper's note
GRAZE = "graze"            # detritivore / colony: keep food available

PREDATOR_TAXA_WITH_PREMOLT = {"tarantula"}


@dataclass
class Line:
    text: str
    source: str

    def as_dict(self) -> dict:
        return {"text": self.text, "source": self.source}


@dataclass
class Section:
    key: str
    title: str
    lines: List[Line] = field(default_factory=list)

    def add(self, text: Optional[str], source: str) -> None:
        if text:
            self.lines.append(Line(text, source))

    def as_dict(self) -> dict:
        return {"key": self.key, "title": self.title, "lines": [l.as_dict() for l in self.lines]}


# ── small helpers ─────────────────────────────────────────────────────────────

def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _fmt_num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:.1f}"


def _range(lo: Any, hi: Any, unit: str) -> Optional[str]:
    lo, hi = _num(lo), _num(hi)
    if lo is None and hi is None:
        return None
    if lo is not None and hi is not None:
        return f"{_fmt_num(lo)}–{_fmt_num(hi)}{unit}" if lo != hi else f"{_fmt_num(lo)}{unit}"
    return f"{'at least ' if lo is not None else 'up to '}{_fmt_num(lo if lo is not None else hi)}{unit}"


def _temp_range(lo: Any, hi: Any, units: Optional[str]) -> Optional[str]:
    """Stored °F range in the KEEPER's display units (users.measurement_units).
    Imperial is printed exactly as stored; metric converts to whole °C."""
    if normalize_units(units) != "metric":
        return _range(lo, hi, "°F")
    lo, hi = _num(lo), _num(hi)
    return _range(
        None if lo is None else round(f_to_c(lo)),
        None if hi is None else round(f_to_c(hi)),
        "°C",
    )


def _local_date(dt: datetime, tz_offset_minutes: Optional[int]) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # JS getTimezoneOffset(): minutes to ADD to local time to reach UTC.
    return (dt - timedelta(minutes=tz_offset_minutes or 0)).date()


def _fmt_day(d: date) -> str:
    return d.strftime("%a %d %b").replace(" 0", " ")


def _clean(s: Any) -> Optional[str]:
    if s is None:
        return None
    s = str(s).strip()
    return s or None


# ── feeding facts ─────────────────────────────────────────────────────────────

@dataclass
class FeedingFacts:
    """What the keeper's own logs say. Built by the caller from FeedingLog rows."""
    last_fed_at: Optional[datetime] = None
    usual_meal: Optional[str] = None        # "2 medium crickets"
    interval_days: Optional[int] = None
    interval_source: Optional[str] = None   # KEEPER / SPECIES / None
    schedule_text: Optional[str] = None     # keeper free text (HV feeding_schedule)


def summarise_meals(feedings: Iterable[Any], limit: int = 5) -> Optional[str]:
    """The most common accepted meal among the last `limit` accepted feedings.

    Only food the animal actually ate counts — a refused cricket is not "what
    it eats". Returns None when nothing usable is recorded.
    """
    accepted = [
        f for f in sorted(
            (f for f in feedings if getattr(f, "accepted", True)),
            key=lambda f: getattr(f, "fed_at", None) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        if _clean(getattr(f, "food_type", None))
    ][:limit]
    if not accepted:
        return None
    key = Counter(
        (
            getattr(f, "quantity", None) or None,
            (_clean(getattr(f, "food_size", None)) or "").lower() or None,
            _clean(getattr(f, "food_type", None)).lower(),
        )
        for f in accepted
    ).most_common(1)[0][0]
    qty, size, food = key
    parts = []
    if qty:
        parts.append(str(qty))
    if size:
        parts.append(size)
    parts.append(food)
    return " ".join(parts)


def _stage_frequency(species: Any, stage: Optional[str], stages: Sequence[str]) -> Optional[str]:
    if species is None:
        return None
    if stage:
        v = _clean(getattr(species, f"feeding_frequency_{stage}", None))
        if v:
            return v
    return None


def feeding_state(
    *,
    paused_reason: Optional[str],
    paused_until: Optional[date],
    premolt_likely: bool,
    brumating: bool,
    detritivore: bool,
    facts: FeedingFacts,
    now: datetime,
    tz_offset_minutes: Optional[int],
) -> dict:
    today = _local_date(now, tz_offset_minutes)
    last_local = _local_date(facts.last_fed_at, tz_offset_minutes) if facts.last_fed_at else None
    days_since = (today - last_local).days if last_local else None

    base = {
        "last_fed_on": last_local.isoformat() if last_local else None,
        "days_since_fed": days_since,
        "interval_days": facts.interval_days,
        "next_due_on": None,
    }

    if paused_reason and (paused_until is None or paused_until >= today):
        until = f" until {_fmt_day(paused_until)}" if paused_until else ""
        return {**base, "state": DONT_FEED,
                "headline": f"Don't feed — paused{until}: {paused_reason}.", "source": KEEPER}
    if brumating:
        return {**base, "state": DONT_FEED,
                "headline": "Don't feed — brumating (a natural winter rest; it won't eat).",
                "source": RECORD}
    if premolt_likely:
        return {**base, "state": DONT_FEED,
                "headline": ("Don't feed — showing signs of premolt (getting ready to shed "
                             "its skin, when it stops eating)."),
                "source": RECORD}
    if detritivore:
        return {**base, "state": GRAZE,
                "headline": "No feeding schedule — keep food available (see below).",
                "source": SPECIES}
    if facts.interval_days is None:
        return {**base, "state": ASK,
                "headline": "No feeding schedule on record — follow the keeper's note, or ask.",
                "source": DEFAULT}
    if last_local is None:
        return {**base, "state": ASK,
                "headline": "No feeding on record yet — check with the keeper before feeding.",
                "source": DEFAULT}

    next_due = last_local + timedelta(days=facts.interval_days)
    base["next_due_on"] = next_due.isoformat()
    if today >= next_due:
        return {**base, "state": FEED, "headline": "Feed today.", "source": RECORD}
    return {**base, "state": NOT_DUE,
            "headline": f"Not today — next feed {_fmt_day(next_due)}.", "source": RECORD}


# ── safety ────────────────────────────────────────────────────────────────────

_SECRETION_TEXT = {
    "benzoquinone": ("Can release a defensive chemical that stains skin and stings eyes. "
                     "Don't handle, and wash your hands after touching anything inside."),
    "hydrogen_cyanide": ("Can release a defensive chemical (it smells of almonds). "
                         "Don't handle; open the lid in a ventilated room and wash your hands after."),
    "acetic_acid": ("Can spray a strong vinegar-like acid. Keep it away from your face "
                    "and don't handle."),
    "other": "Can release a defensive chemical. Don't handle, and wash your hands after.",
}


def invert_safety(species: Any) -> Section:
    s = Section("safety", "Safety")
    if species is not None:
        severity = getattr(species, "venom_severity", None)
        if getattr(species, "medically_significant_venom", False) or severity == "medically_significant":
            s.add("Medically significant venom. Never put your hand inside — use long tongs, and "
                  "keep the lid open only as long as you need.", SAFETY)
        elif severity == "moderate":
            s.add("Painful sting or bite. Use tongs, not fingers.", SAFETY)
        if getattr(species, "urticating_hairs", False):
            s.add("Flicks irritating hairs when disturbed. Keep your face away from the open "
                  "enclosure and wash your hands afterwards.", SAFETY)
        sec = getattr(species, "defensive_secretion", None)
        if sec and sec != "none" and sec in _SECRETION_TEXT:
            s.add(_SECRETION_TEXT[sec], SAFETY)
        if getattr(species, "can_climb_smooth", None) is True:
            s.add("Can climb glass and smooth plastic. Check the lid is fully closed every time.", SAFETY)
        if getattr(species, "can_fly", None) is True:
            s.add("Can fly. Open the enclosure slowly, with the room door shut.", SAFETY)
    s.add("Please don't handle — watch only.", DEFAULT)
    return s


_HANDLE_TEXT = {
    "hands_off": "Don't handle.",
    "defensive": "Defensive and may bite. Don't handle.",
    "nippy": "May nip. Don't handle unless the keeper said you could.",
}


def reptile_safety(species: Any) -> Section:
    s = Section("safety", "Safety")
    h = getattr(species, "handleability", None) if species is not None else None
    if h in _HANDLE_TEXT:
        s.add(_HANDLE_TEXT[h], SAFETY)
    else:
        s.add("No handling needed while the keeper is away.", DEFAULT)
    s.add("Wash your hands before and after — reptiles can carry salmonella.", DEFAULT)
    return s


# ── shared sections ───────────────────────────────────────────────────────────

def _leave_alone(keeper_name: str, colony: bool = False) -> Section:
    s = Section("leave_alone", "Leave alone")
    s.add("Don't rehouse, clean, or change the substrate.", DEFAULT)
    if colony:
        s.add("Don't try to count them or dig through the substrate.", DEFAULT)
    s.add(f"If something looks wrong, message {keeper_name} before doing anything.", DEFAULT)
    return s


def _note(sitter_note: Any) -> Optional[Section]:
    text = _clean(sitter_note)
    if not text:
        return None
    s = Section("note", "From the keeper")
    s.add(text, KEEPER)
    return s


def _today(state: dict) -> Section:
    s = Section("today", "Today")
    s.add(state["headline"], state["source"])
    return s


def _identity(kind: str, obj: Any, taxon: Optional[str]) -> dict:
    # Allowlist. Adding a field here is a privacy decision — see rule 3.
    return {
        "kind": kind,
        "id": str(getattr(obj, "id")),
        "name": _clean(getattr(obj, "name", None)),
        "common_name": _clean(getattr(obj, "common_name", None)),
        "scientific_name": _clean(getattr(obj, "scientific_name", None)),
        "taxon": taxon,
        "photo_url": _clean(getattr(obj, "photo_url", None)),
    }


def _card(identity: dict, state: Optional[dict], sections: Sequence[Optional[Section]]) -> dict:
    return {
        **identity,
        "feeding": {k: v for k, v in (state or {}).items() if k != "source"} if state else None,
        "sections": [s.as_dict() for s in sections if s is not None and s.lines],
    }


# ── invert card ───────────────────────────────────────────────────────────────

def compose_invert_card(
    invert: Any,
    species: Any,
    *,
    facts: FeedingFacts,
    premolt_likely: bool,
    keeper_name: str,
    now: Optional[datetime] = None,
    tz_offset_minutes: Optional[int] = None,
    units: Optional[str] = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    # Grazers (detritivores and omnivores like roaches) by species, else by
    # taxon -- an unlinked millipede used to get the live-prey card.
    detritivore = not has_feeding_cadence(getattr(invert, "taxon", None), species)
    state = feeding_state(
        paused_reason=_clean(getattr(invert, "feeding_paused_reason", None)),
        paused_until=getattr(invert, "feeding_paused_until", None),
        premolt_likely=premolt_likely and getattr(invert, "taxon", None) in PREDATOR_TAXA_WITH_PREMOLT,
        brumating=False,
        detritivore=detritivore,
        facts=facts,
        now=now,
        tz_offset_minutes=tz_offset_minutes,
    )

    feeding = Section("feeding", "Feeding")
    if detritivore:
        feeding.add("Keep leaf litter and a little food available; top it up when it's gone and "
                    "remove anything mouldy.", SPECIES)
    else:
        if facts.usual_meal:
            feeding.add(f"Usually eats: {facts.usual_meal}.", RECORD)
        elif species is not None and _clean(getattr(species, "prey_size", None)):
            feeding.add(f"Prey size: {_clean(species.prey_size)}.", SPECIES)
        if facts.interval_days and facts.interval_source == KEEPER:
            feeding.add(f"Every {facts.interval_days} days.", KEEPER)
        else:
            freq = _stage_frequency(species, getattr(invert, "life_stage", None), ("sling", "juvenile", "adult"))
            if freq:
                feeding.add(f"How often: {freq}.", SPECIES)
        if state["last_fed_on"]:
            feeding.add(f"Last fed {_fmt_day(date.fromisoformat(state['last_fed_on']))}.", RECORD)
        feeding.add("Remove any uneaten live prey the next day.", DEFAULT)
    if species is not None and getattr(species, "supplemental_calcium_required", None) is True:
        feeding.add("Keep a calcium source in (cuttlebone or crushed eggshell).", SPECIES)

    water = Section("water", "Water & humidity")
    wd = getattr(invert, "water_dish", None)
    if wd is True:
        water.add("Keep the water dish topped up with fresh water.", RECORD)
    elif wd is None and species is not None and getattr(species, "water_dish_required", False):
        water.add("Keep the water dish topped up with fresh water.", SPECIES)
    mist = _clean(getattr(invert, "misting_schedule", None))
    if mist:
        water.add(f"Misting: {mist}.", KEEPER)
    hum = _range(getattr(invert, "target_humidity_min", None), getattr(invert, "target_humidity_max", None), "%")
    if hum:
        water.add(f"Humidity: {hum}.", RECORD)
    elif species is not None:
        hum = _range(getattr(species, "humidity_min", None), getattr(species, "humidity_max", None), "%")
        if hum:
            water.add(f"Humidity: {hum}.", SPECIES)
    if species is not None and getattr(species, "moisture_gradient_required", None) is True:
        water.add("Keep one side of the substrate damp and the other dry — never soak it all.", SPECIES)

    heat = Section("heat", "Heat")
    t = _temp_range(getattr(invert, "target_temp_min", None), getattr(invert, "target_temp_max", None), units)
    if t:
        heat.add(f"Room or enclosure should read {t}.", RECORD)
    elif species is not None:
        t = _temp_range(getattr(species, "temperature_min", None), getattr(species, "temperature_max", None), units)
        if t:
            heat.add(f"Room or enclosure should read {t}.", SPECIES)

    return _card(
        _identity("invert", invert, getattr(invert, "taxon", None)),
        state,
        [invert_safety(species), _today(state), feeding, water, heat,
         _leave_alone(keeper_name), _note(getattr(invert, "sitter_note", None))],
    )


# ── colony card ───────────────────────────────────────────────────────────────

def compose_colony_card(colony: Any, species: Any, *, keeper_name: str, units: Optional[str] = None) -> dict:
    care = Section("feeding", "Food")
    care.add("Keep leaf litter and a little food available; top it up when it's gone and "
             "remove anything mouldy.", DEFAULT)
    if species is not None and getattr(species, "supplemental_calcium_required", None) is True:
        care.add("Keep a calcium source in (cuttlebone or crushed eggshell).", SPECIES)

    water = Section("water", "Water & humidity")
    if getattr(colony, "water_dish", None) is True:
        water.add("Keep the water dish or water crystals topped up.", RECORD)
    hum = _range(getattr(colony, "target_humidity_min", None), getattr(colony, "target_humidity_max", None), "%")
    if hum:
        water.add(f"Humidity: {hum}.", RECORD)
    elif species is not None:
        hum = _range(getattr(species, "humidity_min", None), getattr(species, "humidity_max", None), "%")
        if hum:
            water.add(f"Humidity: {hum}.", SPECIES)
    if species is not None and getattr(species, "moisture_gradient_required", None) is True:
        water.add("Keep one side of the substrate damp and the other dry — never soak it all.", SPECIES)

    heat = Section("heat", "Heat")
    t = _temp_range(getattr(colony, "target_temp_min", None), getattr(colony, "target_temp_max", None), units)
    if t:
        heat.add(f"Room or enclosure should read {t}.", RECORD)

    state = {"state": GRAZE, "headline": "No feeding schedule — keep food available (see below).",
             "source": DEFAULT, "last_fed_on": None, "days_since_fed": None,
             "interval_days": None, "next_due_on": None}
    return _card(
        _identity("colony", colony, getattr(colony, "taxon", None)),
        state,
        [invert_safety(species), _today(state), care, water, heat,
         _leave_alone(keeper_name, colony=True), _note(getattr(colony, "sitter_note", None))],
    )


# ── reptile card (Herpetoverse) ───────────────────────────────────────────────

def compose_animal_card(
    animal: Any,
    species: Any,
    *,
    facts: FeedingFacts,
    enclosure: Any,
    feeds_on_cgd: bool,
    keeper_name: str,
    now: Optional[datetime] = None,
    tz_offset_minutes: Optional[int] = None,
    units: Optional[str] = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    state = feeding_state(
        paused_reason=_clean(getattr(animal, "feeding_paused_reason", None)),
        paused_until=getattr(animal, "feeding_paused_until", None),
        premolt_likely=False,
        brumating=bool(getattr(animal, "brumation_active", False)),
        detritivore=False,
        facts=facts,
        now=now,
        tz_offset_minutes=tz_offset_minutes,
    )

    feeding = Section("feeding", "Feeding")
    if feeds_on_cgd:
        feeding.add("Eats a complete gecko diet (CGD). Mix it fresh as the packet says and "
                    "replace any that's been sitting out.", SPECIES)
    if facts.usual_meal:
        feeding.add(f"Usually eats: {facts.usual_meal}.", RECORD)
    if facts.schedule_text:
        feeding.add(f"Schedule: {facts.schedule_text}.", KEEPER)
    elif facts.interval_days and facts.interval_source == KEEPER:
        feeding.add(f"Every {facts.interval_days} days.", KEEPER)
    elif species is not None:
        freq = _clean(getattr(species, "feeding_frequency_adult", None))
        if freq:
            feeding.add(f"How often (adult): {freq}.", SPECIES)
    if state["last_fed_on"]:
        feeding.add(f"Last fed {_fmt_day(date.fromisoformat(state['last_fed_on']))}.", RECORD)
    if species is not None and _clean(getattr(species, "supplementation_notes", None)):
        feeding.add(f"Supplements: {_clean(species.supplementation_notes)}", SPECIES)

    water = Section("water", "Water & humidity")
    if enclosure is not None and getattr(enclosure, "water_dish", None) is True:
        water.add("Keep the water bowl clean and full.", RECORD)
    elif species is not None and _clean(getattr(species, "water_bowl_description", None)):
        water.add(f"Water: {_clean(species.water_bowl_description)}.", SPECIES)
    mist = _clean(getattr(enclosure, "misting_schedule", None)) if enclosure is not None else None
    if mist:
        water.add(f"Misting: {mist}.", KEEPER)
    hum = None
    if enclosure is not None:
        hum = _range(getattr(enclosure, "target_humidity_min", None), getattr(enclosure, "target_humidity_max", None), "%")
    if hum:
        water.add(f"Humidity: {hum}.", RECORD)
    elif species is not None:
        hum = _range(getattr(species, "humidity_min", None), getattr(species, "humidity_max", None), "%")
        if hum:
            water.add(f"Humidity: {hum}.", SPECIES)

    heat = Section("heat", "Heat & light")
    t = None
    if enclosure is not None:
        t = _temp_range(getattr(enclosure, "target_temp_min", None), getattr(enclosure, "target_temp_max", None), units)
    if t:
        heat.add(f"Enclosure should read {t}.", RECORD)
    elif species is not None:
        bask = _temp_range(getattr(species, "temp_basking_min", None), getattr(species, "temp_basking_max", None), units)
        warm = _temp_range(getattr(species, "temp_warm_min", None), getattr(species, "temp_warm_max", None), units)
        cool = _temp_range(getattr(species, "temp_cool_min", None), getattr(species, "temp_cool_max", None), units)
        night = _temp_range(getattr(species, "temp_night_min", None), getattr(species, "temp_night_max", None), units)
        if bask:
            heat.add(f"Basking spot: {bask}.", SPECIES)
        if warm:
            heat.add(f"Warm side: {warm}.", SPECIES)
        if cool:
            heat.add(f"Cool side: {cool}.", SPECIES)
        if night:
            heat.add(f"At night: {night}.", SPECIES)
    if species is not None and getattr(species, "uvb_required", False):
        heat.add("The UVB light should be on during the day and off at night.", SPECIES)

    return _card(
        _identity("animal", animal, getattr(animal, "taxon", None)),
        state,
        [reptile_safety(species), _today(state), feeding, water, heat,
         _leave_alone(keeper_name), _note(getattr(animal, "sitter_note", None))],
    )


# ── collection routine ────────────────────────────────────────────────────────

DEFAULT_EMERGENCY = [
    "An animal is out: close the room door, check under furniture and along the walls, and "
    "shake out shoes. Message the keeper.",
    "An animal is on its back or lying still: it's probably shedding its skin. Don't touch it, "
    "don't feed it, and remove any live food from the enclosure.",
    "An animal has died: close the enclosure, don't remove anything, and message the keeper.",
    "Mould or a bad smell: don't clean it out — take a photo and message the keeper.",
]


def compose_routine(guide: Any, cards: Sequence[dict]) -> dict:
    """The collection-level play-by-play above the cards."""
    counts = Counter(c["feeding"]["state"] for c in cards if c.get("feeding"))
    summary = {
        "feed_today": counts.get(FEED, 0),
        "dont_feed": counts.get(DONT_FEED, 0),
        "not_due": counts.get(NOT_DUE, 0),
        "check": counts.get(ASK, 0) + counts.get(GRAZE, 0),
        "total": len(cards),
    }
    steps = [s for s in (getattr(guide, "routine_steps", None) or []) if _clean(s)]
    emergency_text = getattr(guide, "emergency_text", None) if guide is not None else None
    if emergency_text is None:
        emergency = [{"text": t, "source": DEFAULT} for t in DEFAULT_EMERGENCY]
    else:
        emergency = [{"text": t, "source": KEEPER}
                     for t in (line.strip() for line in str(emergency_text).splitlines()) if t]
    return {
        "summary": summary,
        "steps": [{"text": _clean(s), "source": KEEPER} for s in steps],
        "emergency": emergency,
        "contact_line": _clean(getattr(guide, "contact_line", None)) if guide is not None else None,
        "vet_contact": _clean(getattr(guide, "vet_contact", None)) if guide is not None else None,
    }
