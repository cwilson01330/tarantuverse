"""
Pricing Schemas
Pydantic models for pricing submissions and estimates
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import date, datetime
from decimal import Decimal


# Size category literals
SizeCategory = Literal["sling", "juvenile", "subadult", "adult"]
VendorType = Literal["breeder", "dealer", "expo", "online", "local", "private"]
Sex = Literal["male", "female", "unknown"]


class PricingSubmissionBase(BaseModel):
    """Base schema for pricing submissions"""
    species_id: Optional[str] = None
    tarantula_id: Optional[str] = None
    size_category: SizeCategory
    approximate_size: Optional[str] = None
    price_paid: Decimal = Field(..., gt=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    purchase_date: Optional[date] = None
    sex: Optional[Sex] = None
    vendor_name: Optional[str] = Field(None, max_length=255)
    vendor_type: Optional[VendorType] = None
    location: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    is_public: bool = False

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("purchase_date")
    @classmethod
    def validate_purchase_date(cls, value):
        if value and value > date.today():
            raise ValueError("Purchase date cannot be in the future")
        return value

    @field_validator('approximate_size')
    @classmethod
    def validate_size(cls, v):
        if v and len(v) > 50:
            raise ValueError('Approximate size must be 50 characters or less')
        return v


class PricingSubmissionCreate(PricingSubmissionBase):
    """Schema for creating a pricing submission"""
    pass


class PricingSubmissionUpdate(BaseModel):
    """Schema for updating a pricing submission"""
    approximate_size: Optional[str] = None
    price_paid: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    purchase_date: Optional[date] = None
    vendor_name: Optional[str] = None
    vendor_type: Optional[VendorType] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    is_public: Optional[bool] = None

    @field_validator("purchase_date")
    @classmethod
    def validate_purchase_date(cls, value):
        if value and value > date.today():
            raise ValueError("Purchase date cannot be in the future")
        return value


class PricingSubmissionResponse(PricingSubmissionBase):
    """Schema for pricing submission responses"""
    id: str
    user_id: str
    is_verified: bool
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    flagged_as_outlier: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PriceEstimate(BaseModel):
    """Evidence summary for recent, community-reported purchase prices."""
    estimated_low: Optional[Decimal] = None
    estimated_high: Optional[Decimal] = None
    evidence_status: Literal["insufficient_evidence", "observed_range"]
    evidence_quality: Literal["insufficient", "limited", "moderate"]
    data_points: int
    contributor_count: int
    vendor_count: int
    verified_points: int
    currency: Literal["USD"] = "USD"
    observation_start: Optional[date] = None
    observation_end: Optional[date] = None
    last_updated: Optional[date] = None
    source_type: Literal["community_reported_purchase"] = "community_reported_purchase"
    limitations: list[str] = Field(default_factory=list)
    factors_used: list[str] = Field(default_factory=list)

class SpeciesPricing(BaseModel):
    """Pricing data for a species broken down by size/sex"""
    species_id: str
    species_name: str

    # Manual/seeded pricing ranges
    sling_low: Optional[Decimal] = None
    sling_high: Optional[Decimal] = None
    juvenile_low: Optional[Decimal] = None
    juvenile_high: Optional[Decimal] = None
    subadult_female_low: Optional[Decimal] = None
    subadult_female_high: Optional[Decimal] = None
    subadult_male_low: Optional[Decimal] = None
    subadult_male_high: Optional[Decimal] = None
    adult_female_low: Optional[Decimal] = None
    adult_female_high: Optional[Decimal] = None
    adult_male_low: Optional[Decimal] = None
    adult_male_high: Optional[Decimal] = None

    # Community data
    community_submissions: int = 0
    community_average_sling: Optional[Decimal] = None
    community_average_juvenile: Optional[Decimal] = None
    community_average_subadult_female: Optional[Decimal] = None
    community_average_subadult_male: Optional[Decimal] = None
    community_average_adult_female: Optional[Decimal] = None
    community_average_adult_male: Optional[Decimal] = None

    rarity_multiplier: Decimal = Decimal("1.0")
    last_updated: Optional[datetime] = None
    data_source: Literal["manual", "community_average", "estimated", "hybrid"] = "estimated"


class CollectionValue(BaseModel):
    """Sum of animals for which an observed range is supportable."""
    total_low: Optional[Decimal] = None
    total_high: Optional[Decimal] = None
    total_tarantulas: int
    valued_tarantulas: int
    most_valuable: Optional[dict] = None
    by_species: list[dict] = Field(default_factory=list)
    evidence_status: Literal["insufficient_evidence", "partial_observed_range", "observed_range"]
    evidence_quality: Literal["insufficient", "limited", "moderate"]
    limitations: list[str] = Field(default_factory=list)

class PricingStats(BaseModel):
    """Statistics about pricing data"""
    total_submissions: int
    verified_submissions: int
    species_with_pricing: int
    recent_submissions_30d: int
    avg_price_per_category: dict = {}
    price_trends: Optional[dict] = None
