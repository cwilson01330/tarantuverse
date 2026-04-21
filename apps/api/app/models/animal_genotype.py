"""Animal genotype model — per-gene zygosity record for a single animal.

Data layer for the morph calculator that lands in Sprint 5 (PRD §5.4).
Each row represents a single gene on a single animal at a specific
zygosity. Multiple rows per animal = the animal's full genotype.

Polymorphic parent: snake-only for v1 (lizard_id added in a later sprint
when the lizards table exists). See migration
gen_20260421_add_animal_genotypes_table for the rationale.

`gene_id` is a UUID column without a foreign-key constraint in v1 because
the `genes` table hasn't been created yet — that's Sprint 3. Sprint 3's
migration will add the FK retroactively. Do not add the FK here.
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class AnimalGenotype(Base):
    __tablename__ = "animal_genotypes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # gene_id references genes.id, but the genes table is Sprint 3. Typed as
    # UUID so Sprint 3 can drop the FK constraint in place.
    gene_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # 'het' | 'visual' | 'poss_het' | 'super'
    zygosity = Column(String(20), nullable=False)

    # Only meaningful for zygosity='poss_het' (e.g., 66 for "66% het Pied")
    poss_het_percentage = Column(Integer, nullable=True)

    # True if confirmed by test breeding or genetic test; False if assumed
    # from parentage. The morph calculator weights probabilities differently
    # for proven vs unproven hets.
    proven = Column(Boolean, default=False, nullable=False)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snake = relationship("Snake", backref="genotypes")

    def __repr__(self):
        return f"<AnimalGenotype snake={self.snake_id} gene={self.gene_id} {self.zygosity}>"
