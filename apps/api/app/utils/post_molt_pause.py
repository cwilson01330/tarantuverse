"""Post-molt feeding pause: how long after a molt feeding reminders wait.

A freshly molted animal's fangs (chelicerae, or a mantis's raptorial arms) are
soft. Live prey offered too soon can injure it, so keepers hold off for a few
days. When the owner turns on "Pause after a molt", `services/feeding_status`
reads the animal's NEWEST molt and pauses reminders until molt day + window.

The window is the molt's own `feeding_pause_days` when the keeper set one
(0 = no pause), else this table by taxon + life stage. These are keeper rules
of thumb, not a veterinary standard (none exists) — which is why the molt form
copy tells the keeper to check the fangs are fully black before offering food.
Taxa with no entry get no automatic pause. An unknown life stage uses the
adult figure (the longest wait, so the safe side).

Sources (read 2026-11-10):
- Tarantula Heaven, adults about 10 days:
  https://tarantulaheaven.com/how-long-should-you-wait-to-feed-your-tarantula-after-a-molt
- Arachnoboards, adults 7–14+ days, wait for black fangs:
  https://arachnoboards.com/threads/feeding-after-molt-how-long-to-wait.166523
- Breeder blog, slings ~1 week, larger animals ~2 weeks:
  https://bowmanrainglevers.blogspot.com/2022/10/how-long-to-wait-after-molt-to-feed.html
- Arachnoboards, scorpions a few days to a week (check the chelae/chelicerae):
  https://arachnoboards.com/threads/post-molt-feeding-h-longimanus.363598/
  https://arachnoboards.com/threads/how-long-after-molt.98326/
- Mantid Forum, mantises 1–5 days:
  https://mantidforum.net/threads/how-long-do-you-wait-after-a-molt.42646
- Jumping spider guidance, live prey can injure for up to a week:
  https://siegfriedt-survey.umb.edu/pti/breaking-down-how-long-can-a-jumping-spider-go-without-food-the-untold-side
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, Optional

DEFAULT_PAUSE_DAYS: Dict[str, Dict[str, int]] = {
    "tarantula": {"sling": 7, "juvenile": 10, "adult": 14},
    "scorpion": {"sling": 4, "juvenile": 7, "adult": 7},
    "true_spider": {"sling": 7, "juvenile": 7, "adult": 7},
    "mantis": {"sling": 3, "juvenile": 3, "adult": 3},
}


def default_pause_days(taxon: Optional[str], life_stage: Optional[str]) -> Optional[int]:
    """Default window in days for this taxon + stage, or None (no automatic
    pause). Unknown or missing stage -> the adult figure."""
    table = DEFAULT_PAUSE_DAYS.get(taxon or "")
    if table is None:
        return None
    return table.get(life_stage or "adult", table["adult"])


def pause_until(
    molted_on: date,
    today: date,
    days: Optional[int],
    created_on: Optional[date] = None,
) -> Optional[date]:
    """Last paused day (inclusive) for a molt on keeper-local `molted_on`, or
    None when there is no pause (`days` None/0) or the window has passed.

    A future-dated molt is anchored at the keeper-local day the row was
    created (`created_on`; `today` when unknown): start = min(molted_on,
    created_on, today). Nothing is stored, so anchoring on "today" would roll
    the pause forward daily; anchoring on creation gives one window from when
    it was logged, so a year typo can't silence reminders for a year.
    """
    if not days:
        return None
    start = min(molted_on, created_on if created_on is not None else today, today)
    until = start + timedelta(days=days)
    return until if until >= today else None
