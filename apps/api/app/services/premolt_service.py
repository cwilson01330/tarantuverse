"""
Premolt prediction service for tarantulas.

Analyzes feeding logs, molt history, and timing to predict when a tarantula
is likely entering premolt phase. Used for care notifications and analytics.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.tarantula import Tarantula
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.user import User


def predict_premolt(db: Session, tarantula_id: UUID) -> Dict[str, Any]:
    """
    Predict whether a tarantula is likely in premolt.

    Calculates:
    - days_since_last_molt: Days since most recent molt
    - average_molt_interval: Average days between consecutive molts (requires 2+ molts)
    - molt_interval_progress: Percentage of average interval elapsed (0-100+)
    - recent_refusal_streak: Count of consecutive refused feedings from most recent
    - refusal_rate_last_30_days: Percentage of feedings refused in last 30 days
    - is_premolt_likely: Boolean prediction
    - confidence: 'high', 'medium', or 'low'
    - estimated_molt_window_days: Estimated days until next molt
    - data_quality: 'good', 'fair', or 'insufficient'

    Returns dict with all prediction data and tarantula info.
    """
    tarantula = db.query(Tarantula).filter(Tarantula.id == tarantula_id).first()
    if not tarantula:
        return {
            "tarantula_id": str(tarantula_id),
            "error": "Tarantula not found"
        }

    # Get all molt logs sorted by date (newest first)
    molt_logs = db.query(MoltLog).filter(
        MoltLog.tarantula_id == tarantula_id
    ).order_by(MoltLog.molted_at.desc()).all()

    # Get all feeding logs sorted by date (newest first)
    feeding_logs = db.query(FeedingLog).filter(
        FeedingLog.tarantula_id == tarantula_id
    ).order_by(FeedingLog.fed_at.desc()).all()

    # Calculate days since last molt
    days_since_last_molt = None
    last_molt_date = None
    if molt_logs:
        last_molt = molt_logs[0]
        last_molt_date = last_molt.molted_at.date() if last_molt.molted_at else None
        days_since_last_molt = (
            datetime.now(timezone.utc) - last_molt.molted_at
        ).days if last_molt.molted_at else None

    # Calculate average molt interval. Requires at least 3 molts (so we
    # get 2+ intervals) before we trust the average — a single interval
    # is too unreliable, especially around life-stage transitions where
    # intervals can jump from weeks to months. For keepers with just 2
    # molts logged we leave this None and the downstream branches skip
    # any interval-based prediction.
    average_molt_interval = None
    if len(molt_logs) >= 3:
        intervals = []
        for i in range(len(molt_logs) - 1):
            if molt_logs[i].molted_at and molt_logs[i + 1].molted_at:
                interval = (molt_logs[i].molted_at - molt_logs[i + 1].molted_at).days
                if interval > 0:
                    intervals.append(interval)

        if intervals:
            average_molt_interval = sum(intervals) / len(intervals)

    # Calculate molt interval progress percentage
    molt_interval_progress = None
    if average_molt_interval and days_since_last_molt is not None:
        molt_interval_progress = (days_since_last_molt / average_molt_interval) * 100

    # Calculate recent refusal streak (consecutive refusals from most
    # recent backwards). Refusals older than the cutoff don't count —
    # the cutoff is the later of (60 days ago) or (last molt date),
    # because:
    #   - refusals older than ~2 months are too stale to indicate
    #     current premolt state (the spider has probably moved on), and
    #   - refusals from before the last logged molt are definitionally
    #     obsolete — the spider has since molted.
    # Without this bound, a keeper who logged 3 refusals six months ago
    # and hasn't tried feeding since would see "3 refusals → likely
    # premolt" today, which is misleading.
    recent_refusal_streak = 0
    if feeding_logs:
        refusal_cutoff = datetime.now(timezone.utc) - timedelta(days=60)
        if molt_logs and molt_logs[0].molted_at and molt_logs[0].molted_at > refusal_cutoff:
            refusal_cutoff = molt_logs[0].molted_at

        for feeding in feeding_logs:
            if feeding.fed_at and feeding.fed_at < refusal_cutoff:
                break  # Too old to count toward current streak
            if not feeding.accepted:
                recent_refusal_streak += 1
            else:
                break  # Stop at first accepted feeding

    # Calculate refusal rate in last 30 days
    refusal_rate_last_30_days = None
    if feeding_logs:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
        recent_feedings = [f for f in feeding_logs if f.fed_at >= cutoff_date]

        if recent_feedings:
            refused_count = sum(1 for f in recent_feedings if not f.accepted)
            refusal_rate_last_30_days = (refused_count / len(recent_feedings)) * 100
        else:
            refusal_rate_last_30_days = 0.0

    # Determine if premolt is likely. Three branches:
    #   1. Strong behavioral signal: 3+ recent consecutive refusals.
    #   2. Moderate behavioral + temporal signal: 2+ refusals AND >60%
    #      through the average molt interval.
    #   3. Temporal-only signal (new): spider is meaningfully overdue
    #      (>110% of average, and at least 30 days since last molt)
    #      with no refusals logged. Some adults — particularly stockier
    #      New World females — eat right through premolt, so a strong
    #      interval signal with no refusals is still informative.
    is_premolt_likely = False
    if recent_refusal_streak >= 3:
        is_premolt_likely = True
    elif (recent_refusal_streak >= 2 and molt_interval_progress
          and molt_interval_progress >= 60):
        is_premolt_likely = True
    elif (molt_interval_progress and molt_interval_progress >= 110
          and days_since_last_molt is not None and days_since_last_molt > 30):
        is_premolt_likely = True

    # Determine confidence level. Refusal + high progress → high.
    # Refusal + moderate progress → medium. Overdue-only (no refusals)
    # → low, because adult eat-through-premolt behavior is common but
    # not universal.
    confidence = "low"
    if recent_refusal_streak >= 3 and molt_interval_progress and molt_interval_progress >= 80:
        confidence = "high"
    elif recent_refusal_streak >= 2 and molt_interval_progress and molt_interval_progress >= 60:
        confidence = "medium"

    # Estimate molt window (remaining days)
    estimated_molt_window_days = None
    if average_molt_interval and days_since_last_molt is not None:
        estimated_molt_window_days = max(0, average_molt_interval - days_since_last_molt)

    # Determine data quality
    feeding_count = len(feeding_logs)
    molt_count = len(molt_logs)
    if feeding_count >= 10 and molt_count >= 2:
        data_quality = "good"
    elif feeding_count >= 5 and molt_count >= 1:
        data_quality = "fair"
    else:
        data_quality = "insufficient"

    # Get last feeding date
    last_feeding_date = None
    if feeding_logs:
        last_feeding = feeding_logs[0]
        last_feeding_date = last_feeding.fed_at.date() if last_feeding.fed_at else None

    return {
        "tarantula_id": str(tarantula.id),
        "tarantula_name": tarantula.name or tarantula.common_name or tarantula.scientific_name or "Unnamed",
        "is_premolt_likely": is_premolt_likely,
        "confidence": confidence,
        "days_since_last_molt": days_since_last_molt,
        "average_molt_interval": round(average_molt_interval, 1) if average_molt_interval else None,
        "molt_interval_progress": round(molt_interval_progress, 1) if molt_interval_progress else None,
        "recent_refusal_streak": recent_refusal_streak,
        "refusal_rate_last_30_days": round(refusal_rate_last_30_days, 1) if refusal_rate_last_30_days is not None else None,
        "estimated_molt_window_days": round(estimated_molt_window_days, 1) if estimated_molt_window_days is not None else None,
        "data_quality": data_quality,
        "last_molt_date": last_molt_date.isoformat() if last_molt_date else None,
        "last_feeding_date": last_feeding_date.isoformat() if last_feeding_date else None,
        "feeding_count": feeding_count,
        "molt_count": molt_count,
    }


def predict_premolt_batch(db: Session, user_id: UUID) -> Dict[str, Any]:
    """
    Get premolt predictions for all tarantulas in a user's collection.

    Returns summary with total tarantulas, premolt likely count, and all predictions.
    Useful for dashboard summaries.
    """
    tarantulas = db.query(Tarantula).filter(
        Tarantula.user_id == user_id
    ).all()

    predictions = []
    premolt_likely_count = 0

    for tarantula in tarantulas:
        prediction = predict_premolt(db, tarantula.id)

        # Only include in list if no error
        if "error" not in prediction:
            predictions.append(prediction)
            if prediction.get("is_premolt_likely"):
                premolt_likely_count += 1

    # Sort by confidence (high first) then by molt interval progress (high first)
    def sort_key(p):
        confidence_order = {"high": 0, "medium": 1, "low": 2}
        confidence_val = confidence_order.get(p.get("confidence", "low"), 3)
        progress = p.get("molt_interval_progress") or 0
        return (not p.get("is_premolt_likely"), confidence_val, -progress)

    predictions.sort(key=sort_key)

    return {
        "total_tarantulas": len(tarantulas),
        "premolt_likely_count": premolt_likely_count,
        "predictions": predictions,
    }
