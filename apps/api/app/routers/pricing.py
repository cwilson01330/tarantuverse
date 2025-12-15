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
    SpeciesPricing,
    CollectionValue,
    PricingStats
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

    # Verify tarantula ownership if provided
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

    # Create new pricing submission
    new_submission = PricingSubmission(
        user_id=current_user.id,
        **submission.model_dump()
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
    """Get a specific pricing submission"""
    submission = db.query(PricingSubmission).filter(
        PricingSubmission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pricing submission not found"
        )

    # Only allow viewing own submissions or public submissions
    if submission.user_id != current_user.id and not submission.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this submission"
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


@router.get("/species/{species_id}", response_model=PriceEstimate)
async def get_species_pricing(
    species_id: str,
    size_category: str,
    sex: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get pricing estimate for a species
    Public endpoint - no authentication required
    """
    estimator = PricingEstimator(db)

    try:
        low, high, confidence, data_points = estimator.estimate_price(
            species_id=species_id,
            size_category=size_category,
            sex=sex,
            use_community_data=True
        )

        return PriceEstimate(
            estimated_low=low,
            estimated_high=high,
            confidence=confidence,
            data_points=data_points,
            factors_used=["species_data", "community_average", "estimation_algorithm"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error estimating price: {str(e)}"
        )


@router.get("/tarantulas/{tarantula_id}/value", response_model=PriceEstimate)
async def get_tarantula_value(
    tarantula_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get estimated value for a specific tarantula
    Requires authentication and ownership
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

    # Determine size category (this is a simplified version)
    # In production, you might want to enhance this based on molt logs
    size_category = estimator._determine_size_category(tarantula)
    sex = tarantula.sex or "unknown"

    try:
        low, high, confidence, data_points = estimator.estimate_price(
            species_id=str(tarantula.species_id),
            size_category=size_category,
            sex=sex,
            use_community_data=True
        )

        return PriceEstimate(
            estimated_low=low,
            estimated_high=high,
            confidence=confidence,
            data_points=data_points,
            factors_used=["species_data", "community_average", "size", "sex"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error estimating value: {str(e)}"
        )


@router.get("/collection/value", response_model=CollectionValue)
async def get_collection_value(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get total estimated value of user's collection
    Requires authentication
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
            confidence="low"
        )

    estimator = PricingEstimator(db)

    try:
        total_low, total_high, valued_count, breakdown = estimator.calculate_collection_value(tarantulas)

        # Find most valuable tarantula
        most_valuable = None
        if breakdown:
            most_valuable = max(breakdown, key=lambda x: x["value_high"])

        # Calculate overall confidence
        if valued_count >= len(tarantulas) * 0.8:
            overall_confidence = "high"
        elif valued_count >= len(tarantulas) * 0.5:
            overall_confidence = "medium"
        else:
            overall_confidence = "low"

        return CollectionValue(
            total_low=total_low,
            total_high=total_high,
            total_tarantulas=len(tarantulas),
            valued_tarantulas=valued_count,
            most_valuable=most_valuable,
            by_species=breakdown,
            confidence=overall_confidence
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating collection value: {str(e)}"
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
        PricingSubmission.is_verified == True
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

    # Average price per category
    avg_prices = {}
    for category in ["sling", "juvenile", "subadult", "adult"]:
        avg = db.query(func.avg(PricingSubmission.price_paid)).filter(
            PricingSubmission.size_category == category,
            PricingSubmission.flagged_as_outlier == False
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
