"""
Content reports API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.models.content_report import ContentReport, ReportStatus
from app.schemas.content_report import (
    ContentReportCreate,
    ContentReportResponse,
    ContentReportUpdate
)
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/", response_model=ContentReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    report_data: ContentReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Report objectionable content or abusive users"""
    # Create report
    new_report = ContentReport(
        reporter_id=current_user.id,
        reported_user_id=report_data.reported_user_id,
        report_type=report_data.report_type,
        content_id=report_data.content_id,
        content_url=report_data.content_url,
        reason=report_data.reason,
        description=report_data.description,
        status=ReportStatus.PENDING
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    return new_report


@router.get("/", response_model=List[ContentReportResponse])
def get_my_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reports submitted by the current user"""
    reports = db.query(ContentReport).filter(
        ContentReport.reporter_id == current_user.id
    ).order_by(ContentReport.created_at.desc()).all()

    return reports


@router.get("/admin/pending", response_model=List[ContentReportResponse])
def get_pending_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all pending reports (admin only)"""
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    reports = db.query(ContentReport).filter(
        ContentReport.status == ReportStatus.PENDING
    ).order_by(ContentReport.created_at.asc()).all()

    return reports


@router.get("/admin/all", response_model=List[ContentReportResponse])
def get_all_reports(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reports with optional status filter (admin only)"""
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    query = db.query(ContentReport)

    if status_filter:
        query = query.filter(ContentReport.status == status_filter)

    reports = query.order_by(ContentReport.created_at.desc()).all()

    return reports


@router.get("/{report_id}", response_model=ContentReportResponse)
def get_report(
    report_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific report"""
    report = db.query(ContentReport).filter(ContentReport.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Only allow reporter or admins to view
    if report.reporter_id != current_user.id and not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Access denied")

    return report


@router.put("/{report_id}", response_model=ContentReportResponse)
def update_report(
    report_id: UUID,
    update_data: ContentReportUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a report (admin only - for moderation)"""
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    report = db.query(ContentReport).filter(ContentReport.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Update fields
    if update_data.status:
        report.status = update_data.status
        report.reviewed_by = current_user.id
        report.reviewed_at = datetime.utcnow()

    if update_data.moderation_notes:
        report.moderation_notes = update_data.moderation_notes

    if update_data.action_taken:
        report.action_taken = update_data.action_taken

    db.commit()
    db.refresh(report)

    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a report (admin only)"""
    if not current_user.is_admin and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    report = db.query(ContentReport).filter(ContentReport.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db.delete(report)
    db.commit()

    return None
