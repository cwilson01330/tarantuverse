"""
Premolt prediction API routes — every predator taxon (premolt v2).

`GET /premolt/inverts/{id}` is the generic single-animal route.
`GET /premolt/tarantulas/{id}/prediction` is kept as an alias for app versions
that predate premolt v2 (a tarantula's invert row shares its id, ADR-005), and
`GET /premolt/dashboard` now covers every eligible taxon.
`POST /premolt/inverts/{id}/answer` records the keeper's answer from the card.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.utils.access import load_invert, policy, scope_collection
from app.schemas.premolt import PremoltAnswerIn, PremoltPrediction, PremoltSummary
from app.services.premolt_episodes import record_answer
from app.services.premolt_service import predict_premolt, predict_premolt_batch
from app.utils.closed_animals import refuse_if_closed_invert

router = APIRouter()


def _prediction_response(db: Session, invert_id: UUID) -> PremoltPrediction:
    """Shared body of the single-animal routes. Access is checked by the caller."""
    prediction = predict_premolt(db, invert_id)
    if "error" in prediction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=prediction["error"]
        )
    return PremoltPrediction(**prediction)


@router.get(
    "/inverts/{invert_id}",
    response_model=PremoltPrediction,
    summary="Get the premolt prediction for one animal",
    description="Premolt prediction for any taxon: eligibility, which rule fired, a reason sentence and whether to show the alert.",
)
@policy("viewer")
async def get_invert_premolt_prediction(
    invert_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The owner, or a co-keeper viewer and up."""
    load_invert(db, current_user, invert_id, "viewer")
    return _prediction_response(db, invert_id)


@router.post(
    "/inverts/{invert_id}/answer",
    response_model=PremoltPrediction,
    summary="Answer the premolt card",
    description='"yes" turns on the premolt feeding pause with no end date (the next accepted meal ends it); "not_yet" hides the alert for 14 days. Returns the updated prediction.',
)
@policy("keeper")
async def answer_invert_premolt(
    invert_id: UUID,
    payload: PremoltAnswerIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """The owner or a keeper-role co-keeper — the same role as the feeding
    pause (PUT /inverts/{id}). 409 for a died or transferred animal, then 400
    for an animal premolt doesn't apply to (grazer, matured) or one feeding-
    paused for another reason (a "Yes" would overwrite the keeper's reason).
    The same answer twice changes nothing."""
    invert, access = load_invert(db, current_user, invert_id, "keeper")
    refuse_if_closed_invert(invert)
    current = predict_premolt(db, invert_id)
    if not current.get("eligible") or current.get("paused_other"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Premolt answers aren't available for this animal.",
        )
    record_answer(db, invert, answer=payload.answer, actor_id=access.actor.id)
    db.commit()
    return _prediction_response(db, invert_id)


@router.get(
    "/tarantulas/{tarantula_id}/prediction",
    response_model=PremoltPrediction,
    summary="Get premolt prediction for a single tarantula (alias)",
    description="Kept for older app versions; same body as GET /premolt/inverts/{id}, for any taxon."
)
@policy("viewer")
async def get_premolt_prediction(
    tarantula_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Alias of GET /premolt/inverts/{id}. The tarantula's invert row shares
    its id (ADR-005), so access resolves through the unified surface."""
    load_invert(db, current_user, tarantula_id, "viewer", not_found="Tarantula not found")
    return _prediction_response(db, tarantula_id)


@router.get(
    "/dashboard",
    response_model=PremoltSummary,
    summary="Get premolt predictions for user's collection",
    description="Premolt predictions for every eligible animal in the collection (and any with an open premolt episode), likely first"
)
@policy("viewer")
async def get_collection_premolt_predictions(
    collection: Optional[UUID] = Query(None, description="Owner's user id for a shared collection."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Premolt predictions for the collection.

    Returns:
    - total_tarantulas / total_animals: number of animals listed
    - premolt_likely_count: animals whose alert shows (not paused for
      premolt, not snoozed)
    - predictions: likely first, then by confidence and interval progress
    """
    access = scope_collection(db, current_user, "tarantuverse", collection)
    summary = predict_premolt_batch(db, access.owner.id)

    return PremoltSummary(**summary)
