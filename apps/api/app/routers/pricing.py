"""
Pricing Router
API endpoints for pricing submissions and estimates
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal

from app.database import get_db
from app.models.user import User
from app.models.species import Species
from app.models.tarantula import Tarantula
from app.models.pricing_submission import PricingSubmission
from app.schemas.pricing import (
    PricingSubmissionCreate,
    PricingSubmissionUpdate,
    PricingSubmissionResponse,
    PriceEstimate,
    CollectionValue,
    PricingStats,
    SizeCategory,
)
from app.utils.dependencies import get_current_user
from app.utils.pricing_estimator import PricingEstimator

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/submit", response_model=PricingSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_pricing_data(
    submission: PricingSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit community pricing data
    Users can contribute pricing information they've encountered
    """
    # Verify species exists if provided
    if submission.species_id:
        species = db.query(Species).filter(Species.id == submission.species_id).first()
        if not species:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Species not found"
            )

    submission_data = submission.model_dump()

    # When a report references an owned animal, the server-recorded taxonomy,
    # life stage, and sex are authoritative. Clients cannot relabel an animal to
    # influence a different comparison group.
    if submission.tarantula_id:
        tarantula = db.query(Tarantula).filter(
            Tarantula.id == submission.tarantula_id,
            Tarantula.user_id == current_user.id
        ).first()
        if not tarantula:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tarantula not found or you don't have permission"
            )
        if not tarantula.species_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The referenced tarantula must have a species before contributing."
            )
        recorded_stage = PricingEstimator._enum_value(tarantula.life_stage)
        if not recorded_stage:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The referenced tarantula must have a keeper-recorded life stage."
            )
        if submission.species_id and str(tarantula.species_id) != submission.species_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submitted species does not match the referenced tarantula."
            )
        if submission.size_category != recorded_stage:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submitted life stage does not match the referenced tarantula."
            )

        submission_data["species_id"] = str(tarantula.species_id)
        submission_data["size_category"] = recorded_stage
        submission_data["sex"] = PricingEstimator._enum_value(tarantula.sex) or "unknown"

    new_submission = PricingSubmission(
        user_id=current_user.id,
        **submission_data
    )

    db.add(new_submission)
    db.commit()
    db.refresh(new_submission)

    return new_submission


@router.get("/submissions", response_model=List[PricingSubmissionResponse])
async def get_my_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pricing submissions by the current user"""
    submissions = db.query(PricingSubmission).filter(
        PricingSubmission.user_id == current_user.id
    ).order_by(PricingSubmission.created_at.desc()).all()

    return submissions


@router.get("/submissions/{submission_id}", response_model=PricingSubmissionResponse)
async def get_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get one of the current user's submissions; public means aggregate-only."""
    submission = db.query(PricingSubmission).filter(
        PricingSubmission.id == submission_id,
        PricingSubmission.user_id == current_user.id,
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pricing submission not found or you don't have permission",
        )

    return submission


@router.put("/submissions/{submission_id}", response_model=PricingSubmissionResponse)
async def update_submission(
    submission_id: str,
    update_data: PricingSubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a pricing submission (only your own)"""
    submission = db.query(PricingSubmission).filter(
        PricingSubmission.id == submission_id,
        PricingSubmission.user_id == current_user.id
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pricing submission not found or you don't have permission"
        )

    # Update fields
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(submission, key, value)

    db.commit()
    db.refresh(submission)

    return submission


@router.delete("/submissions/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a pricing submission (only your own)"""
    submission = db.query(PricingSubmission).filter(
        PricingSubmission.id == submission_id,
        PricingSubmission.user_id == current_user.id
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pricing submission not found or you don't have permission"
        )

    db.delete(submission)
    db.commit()

    return None


@router.get("/market-signals/species/{species_id}", response_model=PriceEstimate)
async def get_species_pricing(
    species_id: str,
    size_category: SizeCategory,
    sex: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get an evidence summary for comparable reported purchase prices.
    Public endpoint; no authentication is required.
    """
    estimator = PricingEstimator(db)

    try:
        signal = estimator.estimate_price(
            species_id=species_id,
            size_category=size_category,
            sex=sex,
            use_community_data=True
        )

        return PriceEstimate(
            **signal.__dict__,
            factors_used=[
                "recent_public_usd_reports",
                "contributor_deduplication",
                "robust_percentile_range",
            ],
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error estimating price: {str(e)}"
        )


@router.get("/market-signals/tarantulas/{tarantula_id}", response_model=PriceEstimate)
async def get_tarantula_value(
    tarantula_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get market evidence for a specific tarantula.
    Requires authentication and ownership.
    """
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found or you don't have permission"
        )

    if not tarantula.species_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tarantula must have a species assigned to estimate value"
        )

    estimator = PricingEstimator(db)

    # Use only a keeper-recorded life stage. Ownership duration is not evidence
    # of an animal's stage.
    size_category = estimator._determine_size_category(tarantula)
    sex = tarantula.sex or "unknown"

    try:
        signal = estimator.estimate_price(
            species_id=str(tarantula.species_id),
            size_category=size_category,
            sex=sex,
            use_community_data=True
        )

        return PriceEstimate(
            **signal.__dict__,
            factors_used=[
                "keeper_recorded_life_stage",
                "recent_public_usd_reports",
                "contributor_deduplication",
                "robust_percentile_range",
            ],
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error estimating value: {str(e)}"
        )


@router.get("/market-signals/collection", response_model=CollectionValue)
async def get_collection_value(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sum only supported observed ranges across the user's collection.
    Requires authentication.
    """
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == current_user.id
    ).all()

    if not tarantulas:
        return CollectionValue(
            total_low=Decimal("0"),
            total_high=Decimal("0"),
            total_tarantulas=0,
            valued_tarantulas=0,
            by_species=[],
            evidence_status="insufficient_evidence",
            evidence_quality="insufficient",
            limitations=["The collection is empty; no market evidence was evaluated."],
        )

    estimator = PricingEstimator(db)

    try:
        total_low, total_high, valued_count, breakdown = estimator.calculate_collection_value(tarantulas)

        # Find most valuable tarantula
        most_valuable = None
        if breakdown:
            most_valuable = max(breakdown, key=lambda x: x["value_high"])

        if valued_count == 0:
            evidence_status = "insufficient_evidence"
            evidence_quality = "insufficient"
            response_low = None
            response_high = None
        else:
            evidence_status = (
                "observed_range"
                if valued_count == len(tarantulas)
                else "partial_observed_range"
            )
            evidence_quality = (
                "moderate"
                if all(item["evidence_quality"] == "moderate" for item in breakdown)
                else "limited"
            )
            response_low = total_low
            response_high = total_high

        limitations = [
            "Totals include only animals with enough recent public USD purchase reports.",
            "Community reports are not independently confirmed sales and are not appraisals.",
        ]
        if valued_count != len(tarantulas):
            limitations.append(
                f"{len(tarantulas) - valued_count} of {len(tarantulas)} animals "
                "were excluded for insufficient evidence."
            )

        return CollectionValue(
            total_low=response_low,
            total_high=response_high,
            total_tarantulas=len(tarantulas),
            valued_tarantulas=valued_count,
            most_valuable=most_valuable,
            by_species=breakdown,
            evidence_status=evidence_status,
            evidence_quality=evidence_quality,
            limitations=limitations,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating collection value: {str(e)}"
        )


@router.get("/species/{species_id}", deprecated=True)
async def deprecated_species_pricing(species_id: str):
    """Retired because the endpoint could return synthetic price estimates."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "This synthetic valuation endpoint has been retired. "
            "Use /pricing/market-signals/species/{species_id}."
        ),
    )


@router.get("/tarantulas/{tarantula_id}/value", deprecated=True)
async def deprecated_tarantula_value(
    tarantula_id: str,
    current_user: User = Depends(get_current_user),
):
    """Retired because the endpoint could return synthetic price estimates."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "This synthetic valuation endpoint has been retired. "
            "Use /pricing/market-signals/tarantulas/{tarantula_id}."
        ),
    )


@router.get("/collection/value", deprecated=True)
async def deprecated_collection_value(
    current_user: User = Depends(get_current_user),
):
    """Retired because the endpoint could return synthetic collection totals."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "This synthetic valuation endpoint has been retired. "
            "Use /pricing/market-signals/collection."
        ),
    )

@router.get("/stats", response_model=PricingStats)
async def get_pricing_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get pricing statistics
    Admin only endpoint
    """
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    from sqlalchemy import func
    from datetime import datetime, timedelta

    # Total submissions
    total_submissions = db.query(func.count(PricingSubmission.id)).scalar()

    # Verified submissions
    verified_submissions = db.query(func.count(PricingSubmission.id)).filter(
        PricingSubmission.is_verified.is_(True)
    ).scalar()

    # Species with pricing data
    species_with_pricing = db.query(func.count(Species.id)).filter(
        Species.pricing_data.isnot(None)
    ).scalar()

    # Recent submissions (30 days)
    cutoff_date = datetime.now() - timedelta(days=30)
    recent_submissions = db.query(func.count(PricingSubmission.id)).filter(
        PricingSubmission.created_at >= cutoff_date
    ).scalar()

    # Descriptive averages use the same eligible evidence pool as market signals.
    pricing_cutoff_date = (datetime.now() - timedelta(days=730)).date()
    today = datetime.now().date()
    avg_prices = {}
    for category in ["sling", "juvenile", "subadult", "adult"]:
        avg = db.query(func.avg(PricingSubmission.price_paid)).filter(
            PricingSubmission.size_category == category,
            PricingSubmission.is_public.is_(True),
            PricingSubmission.flagged_as_outlier.is_(False),
            func.upper(PricingSubmission.currency) == "USD",
            PricingSubmission.purchase_date.isnot(None),
            PricingSubmission.purchase_date >= pricing_cutoff_date,
            PricingSubmission.purchase_date <= today,
        ).scalar()
        if avg:
            avg_prices[category] = float(avg)

    return PricingStats(
        total_submissions=total_submissions or 0,
        verified_submissions=verified_submissions or 0,
        species_with_pricing=species_with_pricing or 0,
        recent_submissions_30d=recent_submissions or 0,
        avg_price_per_category=avg_prices
    )
