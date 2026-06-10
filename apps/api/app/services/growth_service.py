"""Growth analytics computed from molt history (ADR-008 follow-up).

Shared by the legacy tarantula growth endpoint's logic and the generic
invert growth endpoint. Works for any taxon: the measurements are
whatever the keeper recorded on molt logs (leg span for spiders,
body length for scorpions/centipedes — the client labels the numbers,
the math is identical).
"""
from datetime import datetime, timezone
from typing import List

from app.models.molt_log import MoltLog
from app.schemas.tarantula import GrowthDataPoint


def compute_growth_fields(molt_logs: List[MoltLog]) -> dict:
    """Build growth data points + summary stats from molt logs.

    Expects molt_logs ordered ascending by molted_at. Returns a dict of
    the common GrowthAnalytics fields (everything except the id field).
    """
    if not molt_logs:
        return {
            "data_points": [],
            "total_molts": 0,
            "average_days_between_molts": None,
            "total_weight_gain": None,
            "total_leg_span_gain": None,
            "growth_rate_weight": None,
            "growth_rate_leg_span": None,
            "last_molt_date": None,
            "days_since_last_molt": None,
        }

    data_points = []
    previous_molt = None

    for molt in molt_logs:
        days_since_previous = None
        weight_change = None
        leg_span_change = None

        if previous_molt:
            days_since_previous = (molt.molted_at - previous_molt.molted_at).days
            if molt.weight_after and previous_molt.weight_after:
                weight_change = molt.weight_after - previous_molt.weight_after
            if molt.leg_span_after and previous_molt.leg_span_after:
                leg_span_change = molt.leg_span_after - previous_molt.leg_span_after

        data_points.append(GrowthDataPoint(
            date=molt.molted_at,
            weight=molt.weight_after,
            leg_span=molt.leg_span_after,
            days_since_previous=days_since_previous,
            weight_change=weight_change,
            leg_span_change=leg_span_change,
        ))
        previous_molt = molt

    days_between = [dp.days_since_previous for dp in data_points if dp.days_since_previous]
    average_days_between_molts = (
        sum(days_between) / len(days_between) if days_between else None
    )

    first_molt, last_molt = molt_logs[0], molt_logs[-1]

    total_weight_gain = None
    if first_molt.weight_after and last_molt.weight_after:
        total_weight_gain = last_molt.weight_after - first_molt.weight_after

    total_leg_span_gain = None
    if first_molt.leg_span_after and last_molt.leg_span_after:
        total_leg_span_gain = last_molt.leg_span_after - first_molt.leg_span_after

    growth_rate_weight = None
    growth_rate_leg_span = None
    if len(molt_logs) > 1:
        months = (last_molt.molted_at - first_molt.molted_at).days / 30.44
        if months > 0:
            if total_weight_gain:
                growth_rate_weight = total_weight_gain / months
            if total_leg_span_gain:
                growth_rate_leg_span = total_leg_span_gain / months

    return {
        "data_points": data_points,
        "total_molts": len(molt_logs),
        "average_days_between_molts": average_days_between_molts,
        "total_weight_gain": total_weight_gain,
        "total_leg_span_gain": total_leg_span_gain,
        "growth_rate_weight": growth_rate_weight,
        "growth_rate_leg_span": growth_rate_leg_span,
        "last_molt_date": last_molt.molted_at,
        "days_since_last_molt": (datetime.now(timezone.utc) - last_molt.molted_at).days,
    }
