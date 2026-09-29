"""Direct tests for _fmt_size function (Finding 1 of Fix round 1).

Tests that:
1. Leg-span taxa return mm-only size as None (omit the row), not mislabeled.
2. Non-leg-span taxa (scorpion, centipede, etc.) fall back to mm when span missing.
3. Decimal inputs (Decimal("4.10")) are handled correctly and trailing zeros stripped.
"""
from decimal import Decimal

import pytest

from app.routers.share_cards import _fmt_size


class TestFmtSizeLegsSpanTaxa:
    """Leg-span taxa (tarantula, true_spider, whip_spider) should NOT fall back to mm."""

    def test_tarantula_with_span_returns_inches(self):
        """Tarantula with leg span → "4.1 in"."""
        result = _fmt_size("tarantula", 4.1, None)
        assert result == "4.1 in"

    def test_tarantula_with_span_decimal_returns_inches(self):
        """Tarantula with Decimal leg span → "4.1 in"."""
        result = _fmt_size("tarantula", Decimal("4.10"), None)
        assert result == "4.1 in"

    def test_tarantula_without_span_returns_none(self):
        """Tarantula without leg span (even with mm) → None (omit row)."""
        result = _fmt_size("tarantula", None, 62.0)
        assert result is None

    def test_true_spider_without_span_returns_none(self):
        """true_spider without leg span → None."""
        result = _fmt_size("true_spider", None, 55.0)
        assert result is None

    def test_whip_spider_without_span_returns_none(self):
        """whip_spider without leg span → None."""
        result = _fmt_size("whip_spider", None, 48.0)
        assert result is None


class TestFmtSizeNonLegSpanTaxa:
    """Non-leg-span taxa (scorpion, centipede, etc.) CAN fall back to mm."""

    def test_scorpion_with_length_returns_mm(self):
        """Scorpion with only length_mm → "62 mm"."""
        result = _fmt_size("scorpion", None, 62.0)
        assert result == "62 mm"

    def test_centipede_with_length_returns_mm(self):
        """Centipede with only length_mm → "50 mm"."""
        result = _fmt_size("centipede", None, 50.0)
        assert result == "50 mm"

    def test_scorpion_with_span_prefers_span(self):
        """Scorpion with both span and mm → use span in inches."""
        result = _fmt_size("scorpion", 3.2, 80.0)
        assert result == "3.2 in"

    def test_non_leg_span_without_measurements_returns_none(self):
        """Scorpion with no measurements → None."""
        result = _fmt_size("scorpion", None, None)
        assert result is None


class TestFmtSizeDecimalHandling:
    """Verify Decimal inputs are accepted and formatted correctly."""

    def test_decimal_with_trailing_zeros_stripped(self):
        """Decimal("4.10") → "4.1 in" (trailing zero stripped)."""
        result = _fmt_size("tarantula", Decimal("4.10"), None)
        assert result == "4.1 in"

    def test_decimal_exact_value_no_trailing_zeros(self):
        """Decimal("4.0") → "4 in" (trailing zero stripped)."""
        result = _fmt_size("tarantula", Decimal("4.0"), None)
        assert result == "4 in"

    def test_decimal_with_precision(self):
        """Decimal("3.25") → "3.25 in" (retains precision)."""
        result = _fmt_size("tarantula", Decimal("3.25"), None)
        assert result == "3.25 in"
