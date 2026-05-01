"""
Parse `species.feeding_frequency_*` strings into structured numeric
`feeding_interval_min_days_*` / `..._max_days_*` columns.

Background
----------
Tarantuverse stored feeding cadence as free text ("every 2-3 days",
"weekly", etc.) for human readability on care sheets. Path B of the
2026-05-01 next-feeding-prediction fix introduced numeric columns so
the API can compute reliable predictions per spider's life stage.

This script reads each species row, runs the existing strings through
a regex parser, and writes the numeric columns. Strings that don't
match a known pattern are reported but skipped — never overwrite a
manually-set value, never invent intervals from ambiguous text.

Patterns understood (case-insensitive)
--------------------------------------
  "every N days"               → (N, N)
  "every N-M days"             → (N, M)
  "every N to M days"          → (N, M)
  "every N or N+1 days"        → (N, N+1)
  "every other day"            → (2, 2)
  "every N weeks"              → (N*7, N*7)
  "every N-M weeks"            → (N*7, M*7)
  "weekly" / "once a week"     → (7, 7)
  "twice a week"               → (3, 4)
  "N times per week"           → (round(7/N), ceil(7/N))
  "biweekly" / "every 2 weeks" → (14, 14)
  "monthly"                    → (28, 30)

Run with:
    python3 backfill_species_feeding_intervals.py          # dry run
    python3 backfill_species_feeding_intervals.py --apply  # write changes
    python3 backfill_species_feeding_intervals.py --apply --overwrite
        # also rewrite columns that already have values (for re-runs after
        # parser improvements). Default is to skip columns that aren't NULL.

Idempotent. Safe to re-run.
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys
from typing import Optional, Tuple

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.species import Species


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

# Case-insensitive patterns; first match wins. Each returns (min, max) days.
# Using a list of (regex, lambda) keeps the parsing data-driven and easy to
# extend.

_NUM = r"(\d+)"


def _parse(text: Optional[str]) -> Optional[Tuple[int, int]]:
    if not text:
        return None
    s = text.strip().lower()

    # Strip trailing punctuation
    s = s.rstrip(".!? ")

    # ── Common keywords ────────────────────────────────────────────────
    if s in ("daily", "every day"):
        return (1, 1)
    if s == "every other day":
        return (2, 2)
    if s in (
        "weekly",
        "once a week",
        "once weekly",
        "once per week",  # found on prod 2026-05-01
        "every week",
    ):
        return (7, 7)
    if s in ("biweekly", "bi-weekly", "every 2 weeks", "every two weeks"):
        return (14, 14)
    if s in (
        "twice a week",
        "twice weekly",
        "twice per week",  # found on prod 2026-05-01
        "2x weekly",
        "2x per week",
        "2x a week",
    ):
        return (3, 4)
    if s in ("monthly", "once a month"):
        return (28, 30)

    # ── "once or twice <per/a> week" / "1-2 times <per/a> week" ────────
    # Range case: 1 feeding/week → 7-day interval, 2 feedings/week → 3-4
    # day interval. Combined window is "every 3-7 days."
    if s in (
        "once or twice a week",
        "once or twice per week",
        "1-2 times a week",
        "1-2 times per week",
        "1 to 2 times per week",
        "1 to 2 times a week",
    ):
        return (3, 7)

    # ── "N-M times <per/a> week" ───────────────────────────────────────
    # Convert frequency range → interval range. More feedings/week →
    # SHORTER interval, so the high frequency bound gives the min
    # interval and vice versa.
    m = re.fullmatch(
        rf"{_NUM}\s*(?:-|to|or)\s*{_NUM}\s*(?:x|times?)(?:\s+per\s+|\s+a\s+|\s+)week",
        s,
    )
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        lo, hi = min(a, b), max(a, b)
        if lo <= 0:
            return None
        min_interval = max(1, math.floor(7 / hi))
        max_interval = max(1, math.ceil(7 / lo))
        return (min_interval, max_interval)

    # ── "N times per week" / "N times a week" ──────────────────────────
    m = re.fullmatch(rf"{_NUM}\s*(?:x|times?)(?:\s+per\s+|\s+a\s+|\s+)week", s)
    if m:
        n = int(m.group(1))
        if n <= 0:
            return None
        avg = 7 / n
        return (max(1, math.floor(avg)), max(1, math.ceil(avg)))

    # ── "every N-M days" / "every N to M days" ─────────────────────────
    m = re.fullmatch(
        rf"every\s+{_NUM}\s*(?:-|to|or)\s*{_NUM}\s+days?", s
    )
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return (min(a, b), max(a, b))

    # ── "every N days" ─────────────────────────────────────────────────
    m = re.fullmatch(rf"every\s+{_NUM}\s+days?", s)
    if m:
        n = int(m.group(1))
        return (n, n)

    # ── "every N-M weeks" ──────────────────────────────────────────────
    m = re.fullmatch(
        rf"every\s+{_NUM}\s*(?:-|to|or)\s*{_NUM}\s+weeks?", s
    )
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return (min(a, b) * 7, max(a, b) * 7)

    # ── "every N weeks" ────────────────────────────────────────────────
    m = re.fullmatch(rf"every\s+{_NUM}\s+weeks?", s)
    if m:
        n = int(m.group(1))
        return (n * 7, n * 7)

    # No match — caller logs it and leaves the column null.
    return None


# ---------------------------------------------------------------------------
# Sanity tests — exercised when run with --self-test. Not a unittest
# framework, just enough to catch regressions in the parser.
# ---------------------------------------------------------------------------

_TESTS = [
    ("every 2-3 days", (2, 3)),
    ("every 5-7 days", (5, 7)),
    ("Every 7 days", (7, 7)),
    ("weekly", (7, 7)),
    ("Once a week", (7, 7)),
    ("Once per week", (7, 7)),  # prod variant
    ("twice a week", (3, 4)),
    ("Twice per week", (3, 4)),  # prod variant
    ("3 times per week", (2, 3)),
    ("Once or twice per week", (3, 7)),  # prod variant
    ("2-3 times per week", (2, 4)),  # prod variant
    ("every other day", (2, 2)),
    ("every 2 weeks", (14, 14)),
    ("biweekly", (14, 14)),
    ("monthly", (28, 30)),
    ("every 1-2 weeks", (7, 14)),
    ("daily", (1, 1)),
    # Edge cases that should NOT parse — we'd rather skip than guess.
    ("when hungry", None),
    ("varies by season", None),
    ("", None),
    (None, None),
]


def _self_test() -> int:
    failures = 0
    for text, expected in _TESTS:
        actual = _parse(text)
        if actual != expected:
            failures += 1
            print(f"  FAIL: parse({text!r}) → {actual!r} (expected {expected!r})")
    if failures:
        print(f"  {failures}/{len(_TESTS)} test(s) failed.")
        return 1
    print(f"  all {len(_TESTS)} parser tests passed.")
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

_STAGES = ("sling", "juvenile", "adult")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Write changes (default: dry run)")
    ap.add_argument(
        "--overwrite",
        action="store_true",
        help="Rewrite columns that already have values (default: skip non-null)",
    )
    ap.add_argument("--self-test", action="store_true", help="Run parser unit tests and exit")
    args = ap.parse_args()

    if args.self_test:
        return _self_test()

    db = SessionLocal()
    try:
        species_list = db.query(Species).order_by(Species.scientific_name).all()
    finally:
        if not args.apply:
            db.close()

    n_species = len(species_list)
    n_parsed_total = 0
    n_skipped_already_set = 0
    n_skipped_no_string = 0
    n_unparseable = 0
    unparseable_examples: list[tuple[str, str, str]] = []  # (sciname, stage, text)

    print(f"Scanning {n_species} species...")
    if not args.apply:
        print("(Dry run — no changes will be written. Pass --apply to commit.)")

    for sp in species_list:
        for stage in _STAGES:
            text = getattr(sp, f"feeding_frequency_{stage}", None)
            min_col = f"feeding_interval_min_days_{stage}"
            max_col = f"feeding_interval_max_days_{stage}"
            current_min = getattr(sp, min_col, None)

            if current_min is not None and not args.overwrite:
                n_skipped_already_set += 1
                continue

            if not text:
                n_skipped_no_string += 1
                continue

            parsed = _parse(text)
            if parsed is None:
                n_unparseable += 1
                unparseable_examples.append((sp.scientific_name, stage, text))
                continue

            min_val, max_val = parsed
            if args.apply:
                setattr(sp, min_col, min_val)
                setattr(sp, max_col, max_val)
            n_parsed_total += 1

    if args.apply:
        db.commit()
        db.close()
        print(f"Committed {n_parsed_total} interval pairs.")
    else:
        print(f"Would write {n_parsed_total} interval pairs.")

    print(
        f"  skipped (already set):    {n_skipped_already_set}\n"
        f"  skipped (no string):      {n_skipped_no_string}\n"
        f"  unparseable (left NULL):  {n_unparseable}"
    )

    if unparseable_examples:
        print("\nUnparseable strings (review manually if you want them filled in):")
        # Show up to 25 — beyond that it's noise
        for sciname, stage, text in unparseable_examples[:25]:
            print(f"  {sciname} [{stage}]: {text!r}")
        if len(unparseable_examples) > 25:
            print(f"  ... and {len(unparseable_examples) - 25} more")

    return 0


if __name__ == "__main__":
    sys.exit(main())
