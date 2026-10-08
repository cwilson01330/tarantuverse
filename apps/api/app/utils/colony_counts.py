"""
The two rules every colony count write goes through (audit-2 M4, M5).

1. ONE SPELLING PER BUCKET. `stage_counts` keys are free text, and the clients
   used to send them in whatever case they had to hand -- mobile quick-log sent
   the capitalised suggestion ("Unsexed"), web add kept what was typed
   ("Adults"), import and mobile add/edit lowercased. Bucket arithmetic is a
   dict lookup, so "Unsexed" and "unsexed" became two buckets that both counted
   toward the total. Every key and every event stage is now canonicalised:
   trimmed, lowercase, underscores read as spaces, runs of whitespace collapsed.

   Spaces, not underscores, because that is what the stored data already uses
   (import writes "adult females", mobile add/edit keep the typed spacing) and
   every display path already turns "_" into " " -- so canonical keys look
   exactly as they did, and only case variants collapse.

2. THE EVENT TYPE DECIDES THE SIGN. A death can't raise the population. Web
   accepted either sign for death/removed/cannibalism/split while mobile forced
   it, so "5" for a death added five animals on web and took five away on
   mobile. The server now stores the sign the event type implies; only a
   count_correction (and the no-count types, which shouldn't carry one) keep
   the sign they were given.

`scripts`: `fix_colony_stage_keys_20261008.py` applies rule 1 to existing rows;
`report_colony_event_signs.py` lists rows that break rule 2 (read-only).
"""
from __future__ import annotations

from typing import Dict, Mapping, Optional

DEFAULT_STAGE = "mixed"

# Event types that only ever lower / raise the population. Kept in step with
# the clients (web lib/colonies.ts COLONY_EVENT_TYPES `sign`, mobile
# app/colony/[id].tsx POSITIVE_EVENTS / NEGATIVE_EVENTS).
DECREASING_EVENTS = frozenset({"death", "removed", "cannibalism", "split"})
INCREASING_EVENTS = frozenset({"birth", "added", "merge"})

# Notes written on the events that record a colony's starting headcount
# (create and import). The 30-day change on the collection card leaves these
# out: a colony added last week didn't grow by its whole population.
STARTING_COUNT_NOTE = "Starting count"
STARTING_COUNT_IMPORTED_NOTE = "Starting count (imported)"
STARTING_COUNT_NOTES = (STARTING_COUNT_NOTE, STARTING_COUNT_IMPORTED_NOTE)


def canonical_stage(name: Optional[str]) -> Optional[str]:
    """The one spelling of a bucket name, or None for blank."""
    if name is None:
        return None
    s = " ".join(str(name).replace("_", " ").split()).lower()
    return s or None


def bucket_for(stage: Optional[str]) -> str:
    """The bucket an event lands in: its canonical stage, else 'mixed'."""
    return canonical_stage(stage) or DEFAULT_STAGE


def canonical_stage_counts(counts: Optional[Mapping[str, int]]) -> Optional[Dict[str, int]]:
    """Canonicalise every key, summing buckets that only differed in spelling
    ("Unsexed": 3 + "unsexed": 4 -> "unsexed": 7). Order of first appearance
    is kept. None stays None; a blank key is the 'mixed' bucket."""
    if counts is None:
        return None
    out: Dict[str, int] = {}
    for k, v in counts.items():
        key = bucket_for(k)
        try:
            n = int(v)
        except (TypeError, ValueError):
            n = 0
        out[key] = out.get(key, 0) + n
    return out


def signed_delta(event_type: Optional[str], delta: Optional[int]) -> Optional[int]:
    """The count change an event of this type actually means.

    death/removed/cannibalism/split -> -|n|; birth/added/merge -> +|n|;
    anything else (count_correction above all) keeps its sign.
    """
    if delta is None:
        return None
    n = int(delta)
    if event_type in DECREASING_EVENTS:
        return -abs(n)
    if event_type in INCREASING_EVENTS:
        return abs(n)
    return n
