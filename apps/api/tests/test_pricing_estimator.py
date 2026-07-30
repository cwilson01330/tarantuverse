from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.utils.pricing_estimator import PricingEstimator


class _SpeciesQuery:
    def filter(self, *_args):
        return self

    def first(self):
        return SimpleNamespace(id="species-id")


class _FakeDb:
    def query(self, *_args):
        return _SpeciesQuery()


def _observation(user_id: str, price: str, vendor: str | None = None):
    return SimpleNamespace(
        user_id=user_id,
        price_paid=Decimal(price),
        vendor_name=vendor,
        is_verified=False,
        purchase_date=date(2026, 1, 1),
    )


def _estimator_with(observations):
    estimator = PricingEstimator(_FakeDb())
    estimator._get_community_observations = lambda *_args: observations
    return estimator


def test_market_signal_requires_five_independent_contributors():
    signal = _estimator_with(
        [_observation(f"user-{index}", str(100 + index * 10)) for index in range(4)]
    ).estimate_price("species-id", "juvenile")

    assert signal.evidence_status == "insufficient_evidence"
    assert signal.estimated_low is None
    assert signal.estimated_high is None
    assert signal.contributor_count == 4


def test_market_signal_deduplicates_contributors():
    """One keeper reporting twice counts once — and 5 is no longer enough
    for a number. Both halves matter: dedup is the anti-Sybil floor, and
    withholding the range at 5 is the low-sample policy (ADR-014)."""
    observations = [
        _observation("user-1", "100"),
        _observation("user-1", "9000"),
        *[_observation(f"user-{index}", str(90 + index * 10)) for index in range(2, 6)],
    ]
    signal = _estimator_with(observations).estimate_price("species-id", "juvenile")

    assert signal.contributor_count == 5
    assert signal.data_points == 5
    # 5 contributors is acknowledged evidence but not a publishable band.
    assert signal.evidence_status == "emerging_evidence"
    assert signal.estimated_low is None
    assert signal.estimated_high is None


def test_emerging_evidence_reports_progress_toward_threshold():
    observations = [
        _observation(f"user-{index}", str(90 + index * 10)) for index in range(1, 8)
    ]
    signal = _estimator_with(observations).estimate_price("species-id", "juvenile")

    assert signal.evidence_status == "emerging_evidence"
    assert signal.contributor_count == 7
    assert signal.estimated_low is None
    # The keeper is told how far off the threshold is — that's the whole
    # reason to surface anything at all below 12.
    assert any("7 of 12" in limitation for limitation in signal.limitations)


def test_market_signal_excludes_extreme_outlier_before_range():
    """Outlier removal is only claimed to work where the sample supports it,
    so this exercises it above the numeric threshold rather than at n=6."""
    observations = [
        *[
            _observation(f"user-{index}", str(90 + index * 5), f"Vendor {index}")
            for index in range(1, 13)
        ],
        _observation("user-99", "10000", "Vendor Z"),
    ]
    signal = _estimator_with(observations).estimate_price("species-id", "juvenile")

    assert signal.evidence_status == "observed_range"
    assert signal.contributor_count == 12
    assert signal.estimated_high is not None
    # The 10000 report must not survive into the band.
    assert signal.estimated_high < Decimal("500")


def test_concentrated_prices_are_disclosed_and_downgrade_quality():
    """Twelve contributors all reporting the same round number is ordinary
    hobby-market clustering, not proof of coordination — but it IS weaker
    evidence than twelve distinct observations, and must say so."""
    observations = [
        _observation(f"user-{index}", "100", f"Vendor {index}") for index in range(1, 13)
    ]
    signal = _estimator_with(observations).estimate_price("species-id", "juvenile")

    assert signal.evidence_status == "observed_range"
    assert signal.evidence_quality == "limited"  # downgraded from moderate
    assert any("distinct price" in limitation for limitation in signal.limitations)


def test_life_stage_is_not_inferred_from_time_owned():
    estimator = PricingEstimator(_FakeDb())
    animal = SimpleNamespace(life_stage=None, date_acquired=date(2010, 1, 1))

    assert estimator._determine_size_category(animal) is None

def test_purchase_reports_are_private_by_default():
    from app.schemas.pricing import PricingSubmissionCreate

    report = PricingSubmissionCreate(
        species_id="species-id",
        size_category="juvenile",
        price_paid=Decimal("125.00"),
        purchase_date=date(2026, 1, 1),
    )

    assert report.is_public is False
    assert report.currency == "USD"


def test_future_purchase_dates_are_rejected():
    import pytest
    from pydantic import ValidationError
    from app.schemas.pricing import PricingSubmissionCreate

    with pytest.raises(ValidationError, match="cannot be in the future"):
        PricingSubmissionCreate(
            species_id="species-id",
            size_category="juvenile",
            price_paid=Decimal("125.00"),
            purchase_date=date(2099, 1, 1),
        )
