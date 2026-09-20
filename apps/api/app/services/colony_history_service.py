"""
A colony's population over time, reconstructed from its own events.

WHAT THIS IS, AND DELIBERATELY IS NOT
-------------------------------------
It is the keeper's logged counts plotted against time, plus a growth rate
measured from those points. Their data, reflected back.

It is NOT a breeding model, and it must not become one. Isopod reproduction
depends on species, temperature, humidity, calcium, protein, substrate depth,
colony age and founding sex ratio — and that last one is unknowable, because
most isopods can't be reliably sexed at a glance and nobody counts a colony
that lives inside substrate. `count_is_estimated` defaults to True for exactly
that reason. A projection built on an estimate would be a guess stacked on a
guess, presented with a number and a confidence it hasn't earned. That is the
failure mode ADR-014 exists to prevent, and the one the premolt predictor
already walked into: sound logic, starved inputs, 17 of 1834 animals.

So: no forecast, no "expected population", no doubling-time extrapolated past
the last real observation. If a keeper wants to know where their colony is
going, the honest answer is the shape of where it has been.

HOW THE TIMELINE IS BUILT
-------------------------
`colony_events.count_delta` adjusts a `stage_counts` bucket on write, so the
current counts are the sum of every delta. Replaying them forward from zero
reproduces the population at each point.

The replay clamps each bucket at zero exactly as `_apply_delta` does, or the
reconstruction would drift away from the stored value the moment a keeper
logged a removal larger than the bucket held.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.colony import Colony, ColonyEvent

# A growth rate needs at least this many observations spanning at least this
# many days before it means anything. Two points a day apart would produce an
# arithmetically valid, practically absurd figure.
MIN_POINTS_FOR_RATE = 3
MIN_DAYS_FOR_RATE = 14


def _replay(events: list[ColonyEvent]) -> list[dict]:
    """Walk events oldest-first, yielding the population after each change."""
    buckets: dict[str, int] = defaultdict(int)
    points: list[dict] = []

    for ev in events:
        if ev.count_delta is None or ev.count_delta == 0:
            # Observations, molts found, aggression notes — real history, but
            # they don't move the count, so they don't make a data point.
            continue
        bucket = (ev.stage or "mixed").strip() or "mixed"
        buckets[bucket] = max(0, buckets[bucket] + int(ev.count_delta))
        occurred = ev.occurred_at or (ev.created_at.date() if ev.created_at else None)
        points.append(
            {
                "date": occurred.isoformat() if isinstance(occurred, date) else None,
                "total": sum(buckets.values()),
                "stage_counts": dict(buckets),
                "event_type": ev.event_type,
                "delta": int(ev.count_delta),
            }
        )
    return points


def _growth(points: list[dict]) -> dict:
    """Observed change between the first and last data point.

    Reported as a plain per-30-day rate rather than a doubling time. Doubling
    time is the number a breeder wants, but it's only meaningful for something
    growing roughly exponentially, and a colony that was topped up by hand or
    had animals sold out of it isn't. A flat "net change over this window" can't
    be misread as a forecast.
    """
    out = {
        "has_rate": False,
        "reason": None,
        "first_date": None,
        "last_date": None,
        "first_total": None,
        "last_total": None,
        "net_change": None,
        "days_observed": None,
        "per_30_days": None,
    }
    dated = [p for p in points if p["date"]]
    if len(dated) < MIN_POINTS_FOR_RATE:
        out["reason"] = (
            f"Log at least {MIN_POINTS_FOR_RATE} counts to see how this colony is trending."
        )
        return out

    first, last = dated[0], dated[-1]
    days = (date.fromisoformat(last["date"]) - date.fromisoformat(first["date"])).days
    out.update(
        first_date=first["date"],
        last_date=last["date"],
        first_total=first["total"],
        last_total=last["total"],
        net_change=last["total"] - first["total"],
        days_observed=days,
    )
    if days < MIN_DAYS_FOR_RATE:
        out["reason"] = (
            f"Counts so far span {days} day{'s' if days != 1 else ''}. "
            f"A trend needs at least {MIN_DAYS_FOR_RATE} days to mean anything."
        )
        return out

    out["has_rate"] = True
    out["per_30_days"] = round((last["total"] - first["total"]) / days * 30, 1)
    return out


def colony_population_history(db: Session, colony: Colony) -> dict:
    """Timeline + observed trend for one colony."""
    events = (
        db.query(ColonyEvent)
        .filter(ColonyEvent.colony_id == colony.id)
        .order_by(ColonyEvent.occurred_at.asc(), ColonyEvent.created_at.asc())
        .all()
    )
    points = _replay(events)

    current_total = sum((colony.stage_counts or {}).values())
    replayed_total = points[-1]["total"] if points else 0

    return {
        "colony_id": str(colony.id),
        "points": points,
        "current_total": current_total,
        # Surfaced rather than hidden. They diverge when counts were written
        # directly instead of through an event — which is what the edit screen
        # used to do. A keeper seeing a chart that disagrees with their headline
        # number deserves to know the chart only covers what was logged as
        # events, not to be quietly shown a wrong line.
        "replayed_total": replayed_total,
        "history_complete": replayed_total == current_total,
        "count_is_estimated": bool(colony.count_is_estimated),
        "growth": _growth(points),
    }
