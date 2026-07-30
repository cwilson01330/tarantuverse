"""Evidence-first market signals for tarantula purchase prices.

Only recent, public, comparable purchase reports can produce a range. Synthetic
trait-based prices and unprovenanced seed ranges are intentionally excluded.
The governing decision is docs/design/ADR-014-evidence-first-market-signals.md.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.pricing_submission import PricingSubmission
from app.models.species import Species


@dataclass
class MarketSignal:
    estimated_low: Optional[Decimal] = None
    estimated_high: Optional[Decimal] = None
    evidence_status: str = "insufficient_evidence"
    evidence_quality: str = "insufficient"
    data_points: int = 0
    contributor_count: int = 0
    vendor_count: int = 0
    verified_points: int = 0
    currency: str = "USD"
    observation_start: Optional[date] = None
    observation_end: Optional[date] = None
    last_updated: Optional[date] = None
    source_type: str = "community_reported_purchase"
    limitations: list[str] = field(default_factory=list)

    @property
    def has_range(self) -> bool:
        return self.estimated_low is not None and self.estimated_high is not None


class PricingEstimator:
    """Build descriptive signals from attributable community observations."""

    LOOKBACK_DAYS = 730
    # Below this, nothing is reported at all.
    MIN_CONTRIBUTORS = 5
    # Below this, evidence is acknowledged but NO numeric band is shown. See
    # the emerging-evidence branch: percentile language at n=5 asserts more
    # than five self-reported numbers can support.
    MIN_NUMERIC_CONTRIBUTORS = 12
    MODERATE_QUALITY_CONTRIBUTORS = 12

    def __init__(self, db: Session):
        self.db = db

    def estimate_price(
        self,
        species_id: str,
        size_category: Optional[str],
        sex: Optional[str] = None,
        use_community_data: bool = True,
    ) -> MarketSignal:
        species = self.db.query(Species.id).filter(Species.id == species_id).first()
        if not species:
            return self._insufficient("Species not found.")
        if not size_category:
            return self._insufficient(
                "Life stage is unknown; Tarantuverse will not infer it from time owned."
            )
        if not use_community_data:
            return self._insufficient("Community purchase observations were not requested.")

        observations = self._get_community_observations(species_id, size_category, sex)
        if not observations:
            return self._insufficient(
                "No recent public USD purchase reports match this species and life stage."
            )

        # One latest report per contributor limits manipulation by repeat submissions.
        latest_by_contributor = {}
        for observation in observations:
            latest_by_contributor.setdefault(str(observation.user_id), observation)

        deduplicated = list(latest_by_contributor.values())
        prices = [Decimal(str(item.price_paid)) for item in deduplicated]
        retained_prices, indexes = self._exclude_statistical_outliers(prices)
        retained = [deduplicated[index] for index in indexes]
        contributor_count = len(retained)
        vendor_keys = {
            item.vendor_name.strip().casefold()
            for item in retained
            if item.vendor_name and item.vendor_name.strip()
        }
        verified_points = sum(1 for item in retained if item.is_verified)
        dates = [item.purchase_date for item in retained if item.purchase_date]
        metadata = {
            "data_points": len(retained_prices),
            "contributor_count": contributor_count,
            "vendor_count": len(vendor_keys),
            "verified_points": verified_points,
            "observation_start": min(dates) if dates else None,
            "observation_end": max(dates) if dates else None,
            "last_updated": max(dates) if dates else None,
        }

        if contributor_count < self.MIN_CONTRIBUTORS:
            plural = "s" if contributor_count != 1 else ""
            return self._insufficient(
                f"Only {contributor_count} independent contributor{plural} remain after "
                f"quality checks; at least {self.MIN_CONTRIBUTORS} are required.",
                **metadata,
            )

        limitations = [
            "Based on community-reported prices paid, not independently confirmed sales.",
            "Condition, locality, shipping, and regional availability may not be comparable.",
            "Contributor accounts do not prove separate, independent transactions.",
        ]
        if not vendor_keys:
            limitations.append("No vendor names were supplied, so vendor diversity is unknown.")
        if verified_points == 0:
            limitations.append("None of the included reports has been reviewed by a moderator.")

        # ── Emerging evidence: 5–11 contributors, NO numeric band ──────────
        #
        # A numeric range used to appear here at 5 contributors, described as a
        # "20th–80th percentile range". At n=5 that phrase describes the 2nd
        # through 4th of five numbers while sounding like a population
        # statistic, and a single manipulated report moves it. Numbers are
        # withheld until MIN_NUMERIC_CONTRIBUTORS; below that we report
        # progress toward the threshold, which is honest and still gives the
        # keeper a reason to contribute.
        if contributor_count < self.MIN_NUMERIC_CONTRIBUTORS:
            return MarketSignal(
                estimated_low=None,
                estimated_high=None,
                evidence_status="emerging_evidence",
                evidence_quality="limited",
                limitations=limitations
                + [
                    f"{contributor_count} of {self.MIN_NUMERIC_CONTRIBUTORS} contributors "
                    "needed before a reported-price band is shown.",
                ],
                **metadata,
            )

        # ── Price concentration ────────────────────────────────────────────
        #
        # Reported separately from outlier handling, and deliberately NOT
        # called an abuse signal. Hobby prices cluster on round numbers, so
        # identical reports are usually ordinary. It's disclosed because a
        # band derived from three distinct values is weaker evidence than one
        # derived from twenty, whatever the cause.
        distinct_prices = len(set(retained_prices))
        concentrated = distinct_prices <= max(2, len(retained_prices) // 4)
        if concentrated:
            limitations.append(
                f"Reports cluster on {distinct_prices} distinct price"
                f"{'s' if distinct_prices != 1 else ''} — the band reflects less "
                "price variation than the contributor count suggests."
            )

        quality = (
            "moderate"
            if contributor_count >= self.MODERATE_QUALITY_CONTRIBUTORS and not concentrated
            else "limited"
        )
        return MarketSignal(
            estimated_low=self._percentile(retained_prices, Decimal("0.20")).quantize(
                Decimal("0.01")
            ),
            estimated_high=self._percentile(retained_prices, Decimal("0.80")).quantize(
                Decimal("0.01")
            ),
            evidence_status="observed_range",
            evidence_quality=quality,
            limitations=limitations,
            **metadata,
        )

    def _get_community_observations(
        self, species_id: str, size_category: str, sex: Optional[str]
    ) -> list[PricingSubmission]:
        cutoff_date = date.today() - timedelta(days=self.LOOKBACK_DAYS)
        query = self.db.query(PricingSubmission).filter(
            PricingSubmission.species_id == species_id,
            PricingSubmission.size_category == size_category,
            PricingSubmission.is_public.is_(True),
            PricingSubmission.flagged_as_outlier.is_(False),
            PricingSubmission.price_paid > 0,
            func.upper(PricingSubmission.currency) == "USD",
            PricingSubmission.purchase_date.isnot(None),
            PricingSubmission.purchase_date >= cutoff_date,
            PricingSubmission.purchase_date <= date.today(),
        )
        normalized_sex = self._enum_value(sex)
        if size_category in {"subadult", "adult"}:
            if normalized_sex in {"male", "female"}:
                query = query.filter(PricingSubmission.sex == normalized_sex)
            else:
                query = query.filter(
                    or_(
                        PricingSubmission.sex.is_(None),
                        PricingSubmission.sex == "unknown",
                    )
                )
        return query.order_by(
            PricingSubmission.purchase_date.desc(), PricingSubmission.created_at.desc()
        ).all()

    @staticmethod
    def _enum_value(value) -> Optional[str]:
        return None if value is None else getattr(value, "value", value)

    @classmethod
    def _exclude_statistical_outliers(
        cls, prices: list[Decimal]
    ) -> tuple[list[Decimal], list[int]]:
        if len(prices) < cls.MIN_CONTRIBUTORS:
            return prices, list(range(len(prices)))
        q1 = cls._percentile(prices, Decimal("0.25"))
        q3 = cls._percentile(prices, Decimal("0.75"))
        iqr = q3 - q1
        if iqr == 0:
            return prices, list(range(len(prices)))
        low = q1 - Decimal("1.5") * iqr
        high = q3 + Decimal("1.5") * iqr
        indexes = [i for i, price in enumerate(prices) if low <= price <= high]
        return [prices[i] for i in indexes], indexes

    @staticmethod
    def _percentile(values: list[Decimal], percentile: Decimal) -> Decimal:
        ordered = sorted(values)
        if len(ordered) == 1:
            return ordered[0]
        position = Decimal(len(ordered) - 1) * percentile
        lower_index = int(position)
        upper_index = min(lower_index + 1, len(ordered) - 1)
        fraction = position - Decimal(lower_index)
        return ordered[lower_index] + (
            ordered[upper_index] - ordered[lower_index]
        ) * fraction

    @staticmethod
    def _insufficient(reason: str, **metadata) -> MarketSignal:
        return MarketSignal(limitations=[reason], **metadata)

    def calculate_collection_value(self, tarantulas: list):
        total_low = Decimal("0")
        total_high = Decimal("0")
        breakdown = []
        for tarantula in tarantulas:
            if not tarantula.species_id:
                continue
            signal = self.estimate_price(
                str(tarantula.species_id),
                self._determine_size_category(tarantula),
                self._enum_value(tarantula.sex),
            )
            if not signal.has_range:
                continue
            total_low += signal.estimated_low
            total_high += signal.estimated_high
            breakdown.append(
                {
                    "id": str(tarantula.id),
                    "name": tarantula.common_name or tarantula.name or "Unnamed tarantula",
                    "scientific_name": tarantula.scientific_name or "Unknown species",
                    "value_low": float(signal.estimated_low),
                    "value_high": float(signal.estimated_high),
                    "evidence_quality": signal.evidence_quality,
                    "data_points": signal.data_points,
                    "contributor_count": signal.contributor_count,
                }
            )
        return total_low, total_high, len(breakdown), breakdown

    def _determine_size_category(self, tarantula) -> Optional[str]:
        """Use only a keeper-recorded life stage, never time owned."""
        return self._enum_value(getattr(tarantula, "life_stage", None))
