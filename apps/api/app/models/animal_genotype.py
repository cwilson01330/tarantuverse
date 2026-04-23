"""Animal genotype model — per-gene zygosity record for a single animal.

Data layer for the morph calculator (PRD §5.4). Each row represents a
single gene on a single animal at a specific zygosity. Multiple rows per
animal = the animal's full genotype.

Polymorphic parent: exactly one of `snake_id` / `lizard_id` is set.
Originally snake-only with NOT NULL on snake_id; extended to polymorphic
in lzp_20260423_extend_polymorphic_tables. Ball python / boa / colubrid
morph math runs through snake_id; gecko morph math (leopard gecko,
crested gecko) runs through lizard_id.

`gene_id` references genes.id but doesn't enforce the FK at this layer —
see gns_20260422 for the historical reason (genes table arrived after).
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database import Base


class AnimalGenotype(Base):
    __tablename__ = "animal_genotypes"
    __table_args__ = (
        CheckConstraint(
            'num_nonnulls(snake_id, lizard_id) = 1',
            name='animal_genotypes_must_have_exactly_one_parent',
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    snake_id = Column(
        UUID(as_uuid=True),
        ForeignKey("snakes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    lizard_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lizards.id", ondelete="CASCADE"),
        nullable=True,
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
    lizard = relationship("Lizard", backref="genotypes")

    def __repr__(self):
        parent = self.snake_id or self.lizard_id
        return f"<AnimalGenotype parent={parent} gene={self.gene_id} {self.zygosity}>"
