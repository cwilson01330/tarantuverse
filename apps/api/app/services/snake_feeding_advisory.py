"""Snake feeding advisory helpers.

Pure functions — no DB access. Caller fetches the snake + its species
feeding data and passes both in. Keeping this stateless makes it cheap
to unit test and lets the router decide how fresh "current weight"
should be (latest weight_log, snake.current_weight_g, or live compute).

Three responsibilities:

  1. `compute_life_stage`  — classify a snake into hatchling/juvenile/
     subadult/adult from its weight and the species' life_stage_feeding
     JSONB. Returns "unknown" when either input is missing.

  2. `suggest_prey_range`  — for a given life stage + body weight,
     return the suggested prey weight range in grams and the feeding
     interval. Pure function of the species bracket.

  3. `evaluate_prey_advisory` — given a proposed prey weight, return a
     soft warning string (or None) explaining whether it's under/over
     range or above the species' power-feeding threshold.

The numbers come from the species sheet (seeded ratios) — if a
species doesn't yet have life_stage_feeding populated, every function
returns the "data unavailable" fallback. Feature degrades gracefully.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Optional


# Order matters — we pick the first bracket whose weight_g_max the
# snake is at-or-below. The final (adult) bracket should have
# weight_g_max=None meaning "open-ended upper bound".
_STAGE_ORDER = ("hatchling", "juvenile", "subadult", "adult")


@dataclass
class Bracket:
    """Normalized view of one life-stage bracket from the species JSONB."""
    stage: str
    weight_g_max: Optional[Decimal]  # None = open-ended adult
    ratio_pct_min: Decimal
    ratio_pct_max: Decimal
    interval_days_min: int
    interval_days_max: int


def _to_dec(v: Any) -> Optional[Decimal]:
    """Coerce a JSONB number (int/float) to Decimal, preserving None."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _parse_brackets(life_stage_feeding: Any) -> list[Bracket]:
    """Parse the species JSONB into a sorted list of Bracket objects.

    Sort by position in _STAGE_ORDER so lookup is deterministic even
    if the seed wrote the entries out-of-order. Unknown stages are
    discarded (schema-layer validator should have caught them).
    """
    if not isinstance(life_stage_feeding, list):
        return []
    parsed: list[Bracket] = []
    for b in life_stage_feeding:
        if not isinstance(b, dict):
            continue
        stage = b.get("stage")
        if stage not in _STAGE_ORDER:
            continue
        try:
            parsed.append(
                Bracket(
                    stage=stage,
                    weight_g_max=_to_dec(b.get("weight_g_max")),
                    ratio_pct_min=Decimal(str(b["ratio_pct_min"])),
                    ratio_pct_max=Decimal(str(b["ratio_pct_max"])),
                    interval_days_min=int(b["interval_days_min"]),
                    interval_days_max=int(b["interval_days_max"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            # Malformed bracket — skip. Schema validator should have
            # prevented this for seeded data, but be defensive.
            continue
    parsed.sort(key=lambda x: _STAGE_ORDER.index(x.stage))
    return parsed


def compute_life_stage(
    weight_g: Optional[Decimal],
    life_stage_feeding: Any,
) -> str:
    """Classify a snake into a life stage from its weight.

    Returns 'unknown' when we don't have enough data to call it:
      - snake weight is None (never weighed)
      - species has no life_stage_feeding populated

    The algorithm picks the first bracket (in hatchling→adult order)
    whose weight_g_max the snake is at-or-below. The adult bracket
    should have weight_g_max=None which matches everything heavier.
    """
    if weight_g is None:
        return "unknown"
    brackets = _parse_brackets(life_stage_feeding)
    if not brackets:
        return "unknown"
    for b in brackets:
        if b.weight_g_max is None or weight_g <= b.weight_g_max:
            return b.stage
    # Shouldn't reach here if the adult bracket is open-ended, but
    # fall back to the heaviest bracket we have.
    return brackets[-1].stage


def suggest_prey_range(
    weight_g: Optional[Decimal],
    life_stage_feeding: Any,
) -> dict[str, Any]:
    """Return the suggested prey weight range for this snake.

    Dict shape matches `schemas.weight_log.PreySuggestion` without
    wrapping in Pydantic — caller composes the response.
    """
    stage = compute_life_stage(weight_g, life_stage_feeding)
    if stage == "unknown" or weight_g is None:
        return {
            "stage": stage,
            "snake_weight_g": weight_g,
            "suggested_min_g": None,
            "suggested_max_g": None,
            "interval_days_min": None,
            "interval_days_max": None,
            "is_data_available": False,
        }

    brackets = _parse_brackets(life_stage_feeding)
    bracket = next((b for b in brackets if b.stage == stage), None)
    if bracket is None:
        return {
            "stage": stage,
            "snake_weight_g": weight_g,
            "suggested_min_g": None,
            "suggested_max_g": None,
            "interval_days_min": None,
            "interval_days_max": None,
            "is_data_available": False,
        }

    # ratio_pct_min/max are percentages — convert to grams. Round to
    # 2 decimal places to match Numeric(8,2) column precision.
    hundred = Decimal("100")
    suggested_min = (weight_g * bracket.ratio_pct_min / hundred).quantize(Decimal("0.01"))
    suggested_max = (weight_g * bracket.ratio_pct_max / hundred).quantize(Decimal("0.01"))

    return {
        "stage": stage,
        "snake_weight_g": weight_g,
        "suggested_min_g": suggested_min,
        "suggested_max_g": suggested_max,
        "interval_days_min": bracket.interval_days_min,
        "interval_days_max": bracket.interval_days_max,
        "is_data_available": True,
    }


def evaluate_prey_advisory(
    prey_weight_g: Optional[Decimal],
    snake_weight_g: Optional[Decimal],
    life_stage_feeding: Any,
    power_feeding_threshold_pct: Optional[Decimal],
) -> Optional[str]:
    """Return a soft advisory string for a proposed prey weight, or None.

    Priority: power-feeding warning > over-range > under-range. Only
    one message returned — we don't want to stack advisories on the
    feeding form. The message is human-readable and safe to show to
    the keeper verbatim.
    """
    if prey_weight_g is None or snake_weight_g is None or snake_weight_g == 0:
        return None

    ratio_pct = (prey_weight_g * Decimal("100") / snake_weight_g).quantize(Decimal("0.1"))

    # Power feeding — above the species threshold. Warn even if no
    # life-stage brackets exist; this is an absolute limit, not a
    # stage-dependent one.
    if power_feeding_threshold_pct is not None and ratio_pct > power_feeding_threshold_pct:
        return (
            f"That's {ratio_pct}% of body weight — above the "
            f"power-feeding threshold of {power_feeding_threshold_pct}%. "
            f"Power feeding accelerates growth but is linked to obesity "
            f"and shorter lifespan. Consider a smaller prey item."
        )

    suggestion = suggest_prey_range(snake_weight_g, life_stage_feeding)
    if not suggestion["is_data_available"]:
        return None

    sug_min = suggestion["suggested_min_g"]
    sug_max = suggestion["suggested_max_g"]
    if sug_min is None or sug_max is None:
        return None

    if prey_weight_g > sug_max:
        return (
            f"That's {ratio_pct}% of body weight — above the "
            f"{suggestion['stage']} range of "
            f"{sug_min}–{sug_max}g for this snake. Fine occasionally, "
            f"but watch for regurgitation."
        )
    if prey_weight_g < sug_min:
        return (
            f"That's {ratio_pct}% of body weight — below the "
            f"{suggestion['stage']} range of "
            f"{sug_min}–{sug_max}g for this snake. Okay short term, "
            f"but a larger item may be more appropriate."
        )
    return None


def compute_weight_loss_30d(
    weight_series: Iterable[tuple[Any, Decimal]],
) -> Optional[Decimal]:
    """Compute percentage weight change over the last 30 days.

    `weight_series` is an iterable of (weighed_at, weight_g) tuples,
    any order. Returns POSITIVE Decimal when the snake has LOST weight.
    Negative values indicate gain.

    Returns None when:
      - fewer than 2 data points
      - no data point older than 0 days (can't compute a window)
      - the oldest point in the window is the same as the newest

    Callers decide whether to suppress the alert (e.g. during
    brumation or breeding).
    """
    from datetime import timedelta, timezone

    points = sorted(
        [(t, Decimal(str(w))) for t, w in weight_series],
        key=lambda p: p[0],
    )
    if len(points) < 2:
        return None

    newest_time, newest_weight = points[-1]
    # Find the oldest point within the 30-day window before newest.
    # Use naive vs aware comparison defensively — all our timestamps
    # are TZ-aware at the DB level, but unit tests may feed either.
    cutoff = newest_time - timedelta(days=30)

    window = [(t, w) for t, w in points if t >= cutoff and t < newest_time]
    if not window:
        return None
    oldest_in_window_time, oldest_in_window_weight = window[0]

    if oldest_in_window_weight == 0:
        return None

    delta = oldest_in_window_weight - newest_weight  # positive = lost
    pct = (delta * Decimal("100") / oldest_in_window_weight).quantize(Decimal("0.1"))
    return pct
