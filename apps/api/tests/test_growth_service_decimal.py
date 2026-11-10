"""Growth rates from Numeric (Decimal) molt measurements.

2026-10-29: /inverts/{id}/growth returned 500 for animals whose first and
last molts both had measurements — Decimal / float raised TypeError in the
growth-rate step. Postgres Numeric columns always come back as Decimal.
"""
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.growth_service import compute_growth_fields


def _molt(day: datetime, leg_span: str, weight: str):
    return SimpleNamespace(
        molted_at=day,
        leg_span_after=Decimal(leg_span),
        weight_after=Decimal(weight),
    )


def test_decimal_measurements_give_growth_rates_not_a_500():
    molts = [
        _molt(datetime(2026, 1, 1, tzinfo=timezone.utc), "2.0", "1.5"),
        _molt(datetime(2026, 7, 1, tzinfo=timezone.utc), "3.5", "4.0"),
    ]
    out = compute_growth_fields(molts)

    assert out["total_molts"] == 2
    assert out["total_leg_span_gain"] == Decimal("1.5")
    months = 181 / 30.44
    assert abs(float(out["growth_rate_leg_span"]) - 1.5 / months) < 1e-9
    assert abs(float(out["growth_rate_weight"]) - 2.5 / months) < 1e-9
