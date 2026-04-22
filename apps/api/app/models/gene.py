"""Gene model — morph catalog entry for the breeding calculator.

Per PRD §5.4. One row per gene per species (e.g., "Spider" on Python regius,
"Enigma" on Eublepharis macularius). Morph calculator reads inheritance type
+ welfare flags to render Punnett squares and safety warnings.

`species_scientific_name` is stored as a String rather than an FK to
`reptile_species.scientific_name` so we can seed the gene catalog ahead of
finishing care sheets. The canonical key for morphs in the hobby is the
Latin species name, not an opaque UUID.
"""
from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


# Inheritance categories accepted by the morph calculator. Stored as a string
# column (not a Postgres enum) so the seeder and admin UI can extend this
# without a migration. The schema layer validates incoming writes.
GENE_TYPES = (
    "recessive",
    "dominant",
    "codominant",
    "incomplete_dominant",
)


# Welfare-flag taxonomy. `None` means "no known welfare concern". Any non-null
# value triggers the morph calculator warning UI.
WELFARE_FLAGS = (
    "neurological",  # Spider wobble, Enigma syndrome
    "structural",    # kinked tails, spinal defects (Caramel)
    "viability",     # lethal homozygous, reduced survival
)


class Gene(Base):
    __tablename__ = "genes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Species linkage via scientific name — see module docstring
    species_scientific_name = Column(String(255), nullable=False, index=True)

    # Hobby-facing identity
    common_name = Column(String(100), nullable=False, index=True)
    symbol = Column(String(30), nullable=True)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)

    # Inheritance type — one of GENE_TYPES; schema layer validates
    gene_type = Column(String(30), nullable=False)

    # Welfare data — load-bearing for the honesty-first content principle.
    # Content rubric requires 3+ citations whenever welfare_flag is non-null.
    welfare_flag = Column(String(30), nullable=True)
    welfare_notes = Column(Text, nullable=True)
    lethal_homozygous = Column(Boolean, default=False, nullable=False)
    # JSONB list of citation dicts. Shape documented in the migration.
    welfare_citations = Column(JSONB, nullable=True)

    # Community & verification (mirrors Species / ReptileSpecies)
    is_verified = Column(Boolean, default=False)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    # Staleness tracking — flagged genes get re-reviewed annually
    content_last_reviewed_at = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    submitted_by_user = relationship(
        "User",
        foreign_keys=[submitted_by],
        backref="submitted_genes",
    )
    verified_by_user = relationship(
        "User",
        foreign_keys=[verified_by],
        backref="verified_genes",
    )

    __table_args__ = (
        UniqueConstraint(
            "species_scientific_name",
            "common_name",
            name="uq_genes_species_common_name",
        ),
    )

    def __repr__(self):
        return f"<Gene {self.common_name} ({self.species_scientific_name})>"
