"""
Premolt prediction API routes for tarantulas
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.tarantula import Tarantula
from app.utils.dependencies import get_current_user
from app.schemas.premolt import PremoltPrediction, PremoltSummary
from app.services.premolt_service import predict_premolt, predict_premolt_batch

router = APIRouter()


@router.get(
    "/tarantulas/{tarantula_id}/prediction",
    response_model=PremoltPrediction,
    summary="Get premolt prediction for a single tarantula",
    description="Returns comprehensive premolt prediction including refusal streak, molt interval progress, and confidence level"
)
async def get_premolt_prediction(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get premolt prediction for a single tarantula.

    Requires authentication. User must own the tarantula.

    Returns prediction data including:
    - is_premolt_likely: Boolean prediction
    - confidence: 'high', 'medium', or 'low'
    - days_since_last_molt: Days since most recent molt
    - average_molt_interval: Average days between molts (if 2+ molts)
    - molt_interval_progress: Percentage of average molt interval elapsed
    - recent_refusal_streak: Consecutive refused feedings
    - refusal_rate_last_30_days: Percentage of refused feedings in last 30 days
    - estimated_molt_window_days: Estimated days until next molt
    - data_quality: 'good', 'fair', or 'insufficient'
    """
    # Verify tarantula exists and belongs to current user
    tarantula = db.query(Tarantula).filter(
        Tarantula.id == tarantula_id,
        Tarantula.user_id == current_user.id
    ).first()

    if not tarantula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tarantula not found"
        )

    # Get prediction
    prediction = predict_premolt(db, tarantula_id)

    # Check for error in prediction
    if "error" in prediction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=prediction["error"]
        )

    return PremoltPrediction(**prediction)


@router.get(
    "/dashboard",
    response_model=PremoltSummary,
    summary="Get premolt predictions for user's collection",
    description="Returns premolt predictions for all tarantulas in the user's collection, sorted by likelihood and confidence"
)
async def get_collection_premolt_predictions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get premolt predictions for all tarantulas in user's collection.

    Requires authentication.

    Returns summary including:
    - total_tarantulas: Total count of user's tarantulas
    - premolt_likely_count: Number of tarantulas likely in premolt
    - predictions: List of all predictions, sorted by likelihood and confidence

    Predictions are sorted to show:
    1. Premolt likely (high confidence first)
    2. Premolt possible (medium/low confidence)
    3. Unlikely (not premolt)
    """
    summary = predict_premolt_batch(db, current_user.id)

    return PremoltSummary(**summary)
