"""
Pricing Estimator
Intelligent pricing estimation based on species, size, sex, and community data
"""
from decimal import Decimal
from typing import Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.species import Species
from app.models.pricing_submission import PricingSubmission


class PricingEstimator:
    """Estimates tarantula prices based on multiple factors"""

    # Base multipliers for size categories (relative to sling)
    SIZE_MULTIPLIERS = {
        "sling": Decimal("1.0"),
        "juvenile": Decimal("1.5"),
        "subadult": Decimal("2.5"),
        "adult": Decimal("3.0"),
    }

    # Sex multipliers (adult females are typically worth more)
    SEX_MULTIPLIERS = {
        "sling": {"male": Decimal("1.0"), "female": Decimal("1.0"), "unknown": Decimal("1.0")},
        "juvenile": {"male": Decimal("1.0"), "female": Decimal("1.1"), "unknown": Decimal("1.0")},
        "subadult": {"male": Decimal("0.7"), "female": Decimal("1.3"), "unknown": Decimal("1.0")},
        "adult": {"male": Decimal("0.4"), "female": Decimal("1.5"), "unknown": Decimal("0.9")},
    }

    def __init__(self, db: Session):
        self.db = db

    def estimate_price(
        self,
        species_id: str,
        size_category: str,
        sex: Optional[str] = None,
        use_community_data: bool = True
    ) -> Tuple[Decimal, Decimal, str, int]:
        """
        Estimate price range for a tarantula

        Returns:
            (low_estimate, high_estimate, confidence, data_points)
        """
        species = self.db.query(Species).filter(Species.id == species_id).first()
        if not species:
            return (Decimal("0"), Decimal("0"), "low", 0)

        # Try to get pricing from species pricing_data (manual/seeded)
        if species.pricing_data:
            price_range = self._get_manual_pricing(species.pricing_data, size_category, sex)
            if price_range:
                return (*price_range, "high", 1)

        # Try to get community pricing data
        if use_community_data:
            community_price = self._get_community_pricing(species_id, size_category, sex)
            if community_price:
                data_points, avg_price, std_dev = community_price
                low = max(Decimal("1"), avg_price - std_dev)
                high = avg_price + std_dev
                confidence = self._calculate_confidence(data_points)
                return (low, high, confidence, data_points)

        # Fall back to estimation algorithm
        estimated_price = self._estimate_from_factors(species, size_category, sex)
        return (
            estimated_price * Decimal("0.8"),  # Low estimate
            estimated_price * Decimal("1.2"),  # High estimate
            "low",
            0
        )

    def _get_manual_pricing(
        self,
        pricing_data: dict,
        size_category: str,
        sex: Optional[str]
    ) -> Optional[Tuple[Decimal, Decimal]]:
        """Get pricing from manually seeded data"""
        sex_suffix = ""
        if size_category in ["subadult", "adult"] and sex in ["male", "female"]:
            sex_suffix = f"_{sex}"

        low_key = f"{size_category}{sex_suffix}_low"
        high_key = f"{size_category}{sex_suffix}_high"

        low = pricing_data.get(low_key)
        high = pricing_data.get(high_key)

        if low is not None and high is not None:
            return (Decimal(str(low)), Decimal(str(high)))

        return None

    def _get_community_pricing(
        self,
        species_id: str,
        size_category: str,
        sex: Optional[str]
    ) -> Optional[Tuple[int, Decimal, Decimal]]:
        """
        Get average pricing from community submissions

        Returns:
            (count, average_price, std_deviation) or None
        """
        # Query for matching submissions in the last 2 years
        cutoff_date = datetime.now() - timedelta(days=730)

        query = self.db.query(
            func.count(PricingSubmission.id).label("count"),
            func.avg(PricingSubmission.price_paid).label("avg"),
            func.stddev(PricingSubmission.price_paid).label("stddev")
        ).filter(
            PricingSubmission.species_id == species_id,
            PricingSubmission.size_category == size_category,
            PricingSubmission.flagged_as_outlier == False,  # noqa
            PricingSubmission.created_at >= cutoff_date
        )

        # Filter by sex for subadults and adults
        if size_category in ["subadult", "adult"] and sex:
            query = query.filter(PricingSubmission.sex == sex)

        result = query.first()

        if result and result.count > 0 and result.avg:
            avg = Decimal(str(result.avg))
            stddev = Decimal(str(result.stddev or 0))
            return (result.count, avg, stddev)

        return None

    def _estimate_from_factors(
        self,
        species: Species,
        size_category: str,
        sex: Optional[str]
    ) -> Decimal:
        """
        Estimate price based on species characteristics

        Factors:
        - Care level (beginner species cheaper)
        - Type (arboreal often more expensive)
        - Growth rate (slow growers worth more as adults)
        - Rarity (from pricing_data if available)
        """
        # Base price for a common sling
        base_price = Decimal("20.00")

        # Care level multiplier
        care_multipliers = {
            "beginner": Decimal("1.0"),
            "intermediate": Decimal("1.3"),
            "advanced": Decimal("1.8")
        }
        care_mult = care_multipliers.get(species.care_level, Decimal("1.0"))

        # Type multiplier
        type_multipliers = {
            "terrestrial": Decimal("1.0"),
            "arboreal": Decimal("1.2"),
            "fossorial": Decimal("0.9")
        }
        type_mult = type_multipliers.get(species.type, Decimal("1.0"))

        # Growth rate affects adult pricing
        growth_rate_mult = Decimal("1.0")
        if size_category == "adult" and species.growth_rate:
            if "slow" in species.growth_rate.lower():
                growth_rate_mult = Decimal("1.3")
            elif "fast" in species.growth_rate.lower():
                growth_rate_mult = Decimal("0.9")

        # Get rarity multiplier from pricing_data if available
        rarity_mult = Decimal("1.0")
        if species.pricing_data and "rarity_multiplier" in species.pricing_data:
            rarity_mult = Decimal(str(species.pricing_data["rarity_multiplier"]))

        # Apply size multiplier
        size_mult = self.SIZE_MULTIPLIERS.get(size_category, Decimal("1.0"))

        # Apply sex multiplier
        sex_mult = Decimal("1.0")
        if sex:
            sex_mult = self.SEX_MULTIPLIERS[size_category].get(sex, Decimal("1.0"))

        # Calculate estimated price
        estimated = base_price * care_mult * type_mult * growth_rate_mult * rarity_mult * size_mult * sex_mult

        return round(estimated, 2)

    def _calculate_confidence(self, data_points: int) -> str:
        """Calculate confidence level based on number of data points"""
        if data_points >= 10:
            return "high"
        elif data_points >= 3:
            return "medium"
        else:
            return "low"

    def calculate_collection_value(
        self,
        tarantulas: list
    ) -> Tuple[Decimal, Decimal, int, dict]:
        """
        Calculate total estimated value of a collection

        Returns:
            (total_low, total_high, valued_count, breakdown)
        """
        total_low = Decimal("0")
        total_high = Decimal("0")
        valued_count = 0
        breakdown = []

        for t in tarantulas:
            if not t.species_id:
                continue

            # Determine size category from available data
            size_category = self._determine_size_category(t)
            sex = t.sex or "unknown"

            low, high, confidence, data_points = self.estimate_price(
                t.species_id,
                size_category,
                sex
            )

            if low > 0 or high > 0:
                valued_count += 1
                total_low += low
                total_high += high

                breakdown.append({
                    "id": str(t.id),
                    "name": t.common_name,
                    "scientific_name": t.scientific_name,
                    "value_low": float(low),
                    "value_high": float(high),
                    "confidence": confidence
                })

        return (total_low, total_high, valued_count, breakdown)

    def _determine_size_category(self, tarantula) -> str:
        """
        Determine size category from tarantula data

        Uses molt logs if available, otherwise makes educated guess
        """
        # TODO: This could be enhanced with molt log data
        # For now, use a simple heuristic based on date acquired
        if hasattr(tarantula, 'date_acquired') and tarantula.date_acquired:
            from datetime import date
            days_owned = (date.today() - tarantula.date_acquired).days

            # Rough estimates based on typical growth rates
            if days_owned < 180:
                return "sling"
            elif days_owned < 730:  # 2 years
                return "juvenile"
            elif days_owned < 1460:  # 4 years
                return "subadult"
            else:
                return "adult"

        # Default to juvenile if unknown
        return "juvenile"
