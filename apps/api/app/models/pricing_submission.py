"""
Pricing Submission Model
Community-submitted pricing data for tarantulas
"""
from sqlalchemy import Column, String, Numeric, Date, Boolean, Text, ForeignKey, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class PricingSubmission(Base):
    __tablename__ = 'pricing_submissions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    species_id = Column(UUID(as_uuid=True), ForeignKey('species.id', ondelete='SET NULL'), nullable=True)
    tarantula_id = Column(UUID(as_uuid=True), ForeignKey('tarantulas.id', ondelete='SET NULL'), nullable=True)

    # Size/age information
    size_category = Column(String(20), nullable=False)  # sling, juvenile, subadult, adult
    approximate_size = Column(String(50), nullable=True)

    # Price and purchase details
    price_paid = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, server_default='USD')
    purchase_date = Column(Date, nullable=True)
    sex = Column(String(10), nullable=True)  # male, female, unknown

    # Vendor/source information
    vendor_name = Column(String(255), nullable=True)
    vendor_type = Column(String(50), nullable=True)  # breeder, dealer, expo, online, local
    location = Column(String(100), nullable=True)

    # Quality/condition
    notes = Column(Text, nullable=True)
    is_public = Column(Boolean, nullable=False, server_default='true')

    # Moderation
    is_verified = Column(Boolean, nullable=False, server_default='false')
    verified_by = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    flagged_as_outlier = Column(Boolean, nullable=False, server_default='false')

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship('User', foreign_keys=[user_id], backref='pricing_submissions')
    species = relationship('Species', backref='pricing_submissions')
    tarantula = relationship('Tarantula', backref='pricing_submissions')
    verifier = relationship('User', foreign_keys=[verified_by])

    # Indexes for performance
    __table_args__ = (
        Index('ix_pricing_submissions_species_size', 'species_id', 'size_category', 'sex'),
    )

    def __repr__(self):
        return f"<PricingSubmission {self.species_id} - ${self.price_paid} - {self.size_category}>"
