"""Display-unit conversion: imperial (in, °F) or metric (cm, °C).

STORAGE NEVER CHANGES. Whatever a keeper's `users.measurement_units` is, the
database holds:

  * lengths in INCHES -- molt_logs.leg_span_before/after (every taxon; the
    column is "leg span" for legacy reasons, it's body length for non-spiders)
    and growth rates derived from them; HV animals.current_length_in
  * lengths in MILLIMETRES where the column says so -- inverts.current_length_mm,
    invert_species.adult_length_min_mm / adult_length_max_mm
  * temperatures in °F -- target_temp_min/max, species temperature_min/max,
    incubation temps
  * weights in GRAMS for everyone (the hobby norm; never converted)

Conversion happens only at the edges (forms, charts, cards). These helpers are
the server-side edge, used by share cards; the web and mobile clients carry
their own copies (`apps/web/src/lib/units.ts`, `apps/mobile/src/lib/units.ts`)
with the same rounding rules:

  * cm: 1 decimal          (8.9 cm)
  * in: 2 decimals, trimmed (3.5 in, 3.25 in, 4 in)
  * mm: 1 decimal, trimmed (45 mm, 45.5 mm)
  * temperatures: whole degrees (75°F, 24°C)

Exports keep storage units; see EXPORT_UNITS.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional, Union

Number = Union[int, float, Decimal]

IMPERIAL = "imperial"
METRIC = "metric"
UNITS = (IMPERIAL, METRIC)

CM_PER_INCH = 2.54
MM_PER_INCH = 25.4

# Countries that use imperial everyday measurements. Everyone else -> metric.
IMPERIAL_REGIONS = frozenset({"US", "LR", "MM"})

# What exports say about their own numbers (they never convert).
EXPORT_UNITS = {
    "length": "inches (molt leg span / body length, HV current_length_in)",
    "length_mm": "millimetres (fields ending in _mm)",
    "temperature": "degrees Fahrenheit",
    "weight": "grams",
}


def normalize_units(value: Optional[str]) -> str:
    """'imperial' | 'metric'; anything else (including None) -> imperial,
    which is what every stored number already is."""
    return METRIC if value == METRIC else IMPERIAL


def default_units_for_region(region: Optional[str]) -> str:
    """Imperial for US, Liberia, Myanmar; metric for every other known region.
    An unknown region keeps imperial (today's behaviour)."""
    if not region:
        return IMPERIAL
    return IMPERIAL if region.strip().upper() in IMPERIAL_REGIONS else METRIC


# ── raw conversions ──────────────────────────────────────────────────────────

def inches_to_cm(inches: Number) -> float:
    return float(inches) * CM_PER_INCH


def cm_to_inches(cm: Number) -> float:
    return float(cm) / CM_PER_INCH


def mm_to_inches(mm: Number) -> float:
    return float(mm) / MM_PER_INCH


def inches_to_mm(inches: Number) -> float:
    return float(inches) * MM_PER_INCH


def f_to_c(f: Number) -> float:
    return (float(f) - 32.0) * 5.0 / 9.0


def c_to_f(c: Number) -> float:
    return float(c) * 9.0 / 5.0 + 32.0


# ── rounding ─────────────────────────────────────────────────────────────────

def _trim(value: float, places: int) -> str:
    """Round half away from zero to `places`, then drop trailing zeros."""
    q = Decimal(1).scaleb(-places)
    d = Decimal(repr(float(value))).quantize(q, rounding="ROUND_HALF_UP")
    s = format(d, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def length_unit(units: Optional[str]) -> str:
    return "cm" if normalize_units(units) == METRIC else "in"


def length_mm_unit(units: Optional[str]) -> str:
    return "mm" if normalize_units(units) == METRIC else "in"


def temp_unit(units: Optional[str]) -> str:
    return "°C" if normalize_units(units) == METRIC else "°F"


def length_value(inches: Optional[Number], units: Optional[str]) -> Optional[str]:
    """Number only (no unit) for a stored-inches length, in the keeper's units."""
    if inches is None:
        return None
    if normalize_units(units) == METRIC:
        return _trim(inches_to_cm(inches), 1)
    return _trim(float(inches), 2)


def length_mm_value(mm: Optional[Number], units: Optional[str]) -> Optional[str]:
    """Number only for a stored-millimetres length."""
    if mm is None:
        return None
    if normalize_units(units) == METRIC:
        return _trim(float(mm), 1)
    return _trim(mm_to_inches(mm), 2)


def temp_value(f: Optional[Number], units: Optional[str]) -> Optional[str]:
    """Whole degrees for a stored-°F temperature."""
    if f is None:
        return None
    v = f_to_c(f) if normalize_units(units) == METRIC else float(f)
    return _trim(v, 0)


# ── formatted strings ────────────────────────────────────────────────────────

def format_length(inches: Optional[Number], units: Optional[str]) -> Optional[str]:
    """3.5 -> '3.5 in' / '8.9 cm'."""
    v = length_value(inches, units)
    return None if v is None else f"{v} {length_unit(units)}"


def format_length_mm(mm: Optional[Number], units: Optional[str]) -> Optional[str]:
    """45 -> '45 mm' / '1.77 in'."""
    v = length_mm_value(mm, units)
    return None if v is None else f"{v} {length_mm_unit(units)}"


def format_temp(f: Optional[Number], units: Optional[str]) -> Optional[str]:
    """75 -> '75°F' / '24°C'."""
    v = temp_value(f, units)
    return None if v is None else f"{v}{temp_unit(units)}"


def format_length_rate(inches_per_month: Optional[Number], units: Optional[str]) -> Optional[str]:
    """Growth rate stored in inches/month -> '0.25 in/mo' / '0.64 cm/mo'.
    Rates are small, so cm keeps 2 decimals here (1 would round most to 0)."""
    if inches_per_month is None:
        return None
    if normalize_units(units) == METRIC:
        return f"{_trim(inches_to_cm(inches_per_month), 2)} cm/mo"
    return f"{_trim(float(inches_per_month), 2)} in/mo"


def format_temp_range(lo: Optional[Number], hi: Optional[Number], units: Optional[str]) -> Optional[str]:
    """(72, 82) -> '72–82°F' / '22–28°C'; one side missing shows '?'."""
    if lo is None and hi is None:
        return None
    a = temp_value(lo, units) or "?"
    b = temp_value(hi, units) or "?"
    return f"{a}–{b}{temp_unit(units)}"


def format_length_mm_range(lo: Optional[Number], hi: Optional[Number], units: Optional[str]) -> Optional[str]:
    """(40, 60) -> '40–60 mm' / '1.57–2.36 in'."""
    if lo is None and hi is None:
        return None
    a = length_mm_value(lo, units) or "?"
    b = length_mm_value(hi, units) or "?"
    return f"{a}–{b} {length_mm_unit(units)}"


# ── input parsing (keeper's units -> storage units) ──────────────────────────

def parse_length_input(value: Optional[Union[str, Number]], units: Optional[str]) -> Optional[float]:
    """A length typed in the keeper's units -> INCHES (2 decimals).
    Blank, unparseable or negative -> None."""
    n = _to_number(value)
    if n is None or n < 0:
        return None
    inches = cm_to_inches(n) if normalize_units(units) == METRIC else n
    return round(inches, 2)


def parse_length_mm_input(value: Optional[Union[str, Number]], units: Optional[str]) -> Optional[float]:
    """A length typed in the keeper's units (mm or in) -> MILLIMETRES (2 dp).
    Blank, unparseable or negative -> None."""
    n = _to_number(value)
    if n is None or n < 0:
        return None
    mm = n if normalize_units(units) == METRIC else inches_to_mm(n)
    return round(mm, 2)


def parse_temp_input(value: Optional[Union[str, Number]], units: Optional[str]) -> Optional[float]:
    """A temperature typed in the keeper's units -> °F (1 decimal, exact for
    whole °C)."""
    n = _to_number(value)
    if n is None:
        return None
    f = c_to_f(n) if normalize_units(units) == METRIC else n
    return round(f, 1)


def _to_number(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    s = str(value).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None
