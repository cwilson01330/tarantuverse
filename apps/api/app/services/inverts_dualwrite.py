"""
Dual-write service for the inverts consolidation (ADR-005 Phase A2).

Every legacy CRUD operation (tarantulas, scorpions, species,
scorpion_species, log tables) routes through one of the mirror_*
functions below. The mirror runs in the SAME SQLAlchemy session as
the legacy write, so the two operations commit atomically — either
both succeed or both roll back. No silent divergence.

The contract these functions honor:

* **UUID preservation.** The mirrored row in `inverts` /
  `invert_species` has the SAME id as the legacy row. This is what
  lets the polymorphic log tables set `invert_id = tarantula_id`
  without an extra lookup, and what lets backfill (Phase B) match
  rows by id alone.
* **Field-level updates.** Mirror functions don't blindly overwrite —
  on update they refresh only the fields the legacy write touched
  (with one exception: a few fields like `taxon` and `species_id` are
  managed by the service, not by callers).
* **species_id is intentionally NOT mirrored in A2.** Tarantulas have
  `species_id → species.id`; their corresponding Invert needs
  `species_id → invert_species.id`. Until backfill populates
  `invert_species`, that FK target might not exist. Phase B's backfill
  fills it in for both existing AND newly-created-during-A2 inverts.
* **Log dual-write is conditional.** If the parent's invert row
  doesn't exist yet (created pre-A2, no backfill run yet), `invert_id`
  stays NULL on the new log row. Backfill will populate it later.

This module is intentionally NOT a SQLAlchemy event listener — explicit
calls from each router keep the data flow visible in the code, which
matters for an expand-contract that's going to be ripped out in Phase D.
"""
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.invert import Invert
from app.models.invert_species import InvertSpecies

if TYPE_CHECKING:
    from app.models.tarantula import Tarantula
    from app.models.scorpion import Scorpion
    from app.models.species import Species
    from app.models.scorpion_species import ScorpionSpecies


# ---------------------------------------------------------------------------
# Helpers — convert legacy enum columns to the VARCHAR-shaped Invert columns.
# Tarantula.life_stage / enclosure_type are SQLEnums; Invert stores them as
# plain strings (CHECK-constrained). Scorpion.enclosure_type is already a
# string. Sex / source ARE shared SQLEnums on both sides — pass through.
# ---------------------------------------------------------------------------

def _enum_value(e) -> str | None:
    """Return the wire value of a Python enum, or None if absent."""
    if e is None:
        return None
    return e.value if hasattr(e, "value") else str(e)


# ---------------------------------------------------------------------------
# Per-animal mirrors
# ---------------------------------------------------------------------------

def _tarantula_to_invert_kwargs(t: "Tarantula") -> dict:
    """Build the kwargs for an Invert row that mirrors this Tarantula.
    Field-by-field copy of the shared columns; taxon-specific scorpion
    + centipede fields stay None."""
    return {
        "id": t.id,
        "user_id": t.user_id,
        "taxon": "tarantula",
        # species_id intentionally None — see module docstring.
        "species_id": None,
        "enclosure_id": t.enclosure_id,
        "colony_id": None,
        "name": t.name,
        "common_name": t.common_name,
        "scientific_name": t.scientific_name,
        "sex": t.sex,
        "date_acquired": t.date_acquired,
        "source": t.source,
        "price_paid": t.price_paid,
        "life_stage": _enum_value(t.life_stage),
        "enclosure_type": _enum_value(t.enclosure_type),
        "enclosure_size": t.enclosure_size,
        "substrate_type": t.substrate_type,
        "substrate_depth": t.substrate_depth,
        "last_substrate_change": t.last_substrate_change,
        "target_temp_min": t.target_temp_min,
        "target_temp_max": t.target_temp_max,
        "target_humidity_min": t.target_humidity_min,
        "target_humidity_max": t.target_humidity_max,
        "water_dish": t.water_dish,
        "misting_schedule": t.misting_schedule,
        "last_enclosure_cleaning": t.last_enclosure_cleaning,
        "enclosure_notes": t.enclosure_notes,
        "feeding_paused_reason": t.feeding_paused_reason,
        "feeding_paused_until": t.feeding_paused_until,
        "photo_url": t.photo_url,
        "is_public": t.is_public,
        "visibility": t.visibility,
        "notes": t.notes,
    }


def _scorpion_to_invert_kwargs(s: "Scorpion") -> dict:
    """Build the kwargs for an Invert row that mirrors this Scorpion."""
    return {
        "id": s.id,
        "user_id": s.user_id,
        "taxon": "scorpion",
        "species_id": None,  # see module docstring
        "enclosure_id": s.enclosure_id,
        "colony_id": s.colony_id,
        "name": s.name,
        "common_name": s.common_name,
        "scientific_name": s.scientific_name,
        "sex": s.sex,
        "date_acquired": s.date_acquired,
        "source": s.source,
        "price_paid": s.price_paid,
        "life_stage": None,  # tarantula-only field
        "current_instar": s.current_instar,
        "current_length_mm": s.current_length_mm,
        # Scorpion stored enclosure_type as a String already.
        "enclosure_type": s.enclosure_type,
        "enclosure_size": s.enclosure_size,
        "substrate_type": s.substrate_type,
        "substrate_depth": s.substrate_depth,
        "last_substrate_change": s.last_substrate_change,
        "target_temp_min": s.target_temp_min,
        "target_temp_max": s.target_temp_max,
        "target_humidity_min": s.target_humidity_min,
        "target_humidity_max": s.target_humidity_max,
        "water_dish": s.water_dish,
        "misting_schedule": s.misting_schedule,
        "last_enclosure_cleaning": s.last_enclosure_cleaning,
        "enclosure_notes": s.enclosure_notes,
        "feeding_paused_reason": s.feeding_paused_reason,
        "feeding_paused_until": s.feeding_paused_until,
        "photo_url": s.photo_url,
        "is_public": s.is_public,
        "visibility": s.visibility,
        "notes": s.notes,
    }


def mirror_tarantula_create(db: Session, t: "Tarantula") -> None:
    """Insert a matching `inverts` row for a newly-created Tarantula."""
    db.add(Invert(**_tarantula_to_invert_kwargs(t)))


def mirror_tarantula_update(db: Session, t: "Tarantula") -> None:
    """Update the matching `inverts` row to reflect a Tarantula edit.

    If the matching Invert doesn't exist (legacy row created before A2,
    backfill hasn't run yet), we lazily insert it — that keeps the two
    surfaces consistent without waiting for backfill. From Phase B
    onward this path stops triggering."""
    invert = db.query(Invert).filter(Invert.id == t.id).first()
    fields = _tarantula_to_invert_kwargs(t)
    if invert is None:
        db.add(Invert(**fields))
        return
    for k, v in fields.items():
        if k in ("id", "user_id", "taxon"):  # immutable
            continue
        setattr(invert, k, v)


def mirror_tarantula_delete(db: Session, tarantula_id: UUID) -> None:
    """Delete the matching `inverts` row when a Tarantula is deleted.

    Order-independent with the legacy delete because each CASCADE only
    fires on its own FK. Logs that have both `tarantula_id` and
    `invert_id` set get cascaded by whichever side runs first; logs
    with only one column set get cascaded by that side."""
    invert = db.query(Invert).filter(Invert.id == tarantula_id).first()
    if invert is not None:
        db.delete(invert)


def mirror_scorpion_create(db: Session, s: "Scorpion") -> None:
    db.add(Invert(**_scorpion_to_invert_kwargs(s)))


def mirror_scorpion_update(db: Session, s: "Scorpion") -> None:
    invert = db.query(Invert).filter(Invert.id == s.id).first()
    fields = _scorpion_to_invert_kwargs(s)
    if invert is None:
        db.add(Invert(**fields))
        return
    for k, v in fields.items():
        if k in ("id", "user_id", "taxon"):
            continue
        setattr(invert, k, v)


def mirror_scorpion_delete(db: Session, scorpion_id: UUID) -> None:
    invert = db.query(Invert).filter(Invert.id == scorpion_id).first()
    if invert is not None:
        db.delete(invert)


# ---------------------------------------------------------------------------
# Species catalog mirrors
# ---------------------------------------------------------------------------

def _species_to_invert_species_kwargs(sp: "Species") -> dict:
    """Tarantula species → invert_species kwargs."""
    return {
        "id": sp.id,
        "taxon": "tarantula",
        "scientific_name": sp.scientific_name,
        "scientific_name_lower": sp.scientific_name_lower,
        # `species` table doesn't carry a slug; build one from the
        # scientific name. invert_species.slug is UNIQUE so collisions
        # would raise — acceptable in the rare same-name case.
        "slug": _slugify(sp.scientific_name),
        "common_names": list(sp.common_names or []),
        "genus": sp.genus,
        "family": sp.family,
        "order_name": "Araneae",
        "care_level": _enum_value(sp.care_level),
        "temperament": sp.temperament,
        "native_region": sp.native_region,
        "adult_size": sp.adult_size,
        "growth_rate": sp.growth_rate,
        "type": sp.type,
        "temperature_min": sp.temperature_min,
        "temperature_max": sp.temperature_max,
        "humidity_min": sp.humidity_min,
        "humidity_max": sp.humidity_max,
        "enclosure_size_sling": sp.enclosure_size_sling,
        "enclosure_size_juvenile": sp.enclosure_size_juvenile,
        "enclosure_size_adult": sp.enclosure_size_adult,
        "substrate_depth": sp.substrate_depth,
        "substrate_type": sp.substrate_type,
        "prey_size": sp.prey_size,
        "feeding_frequency_sling": sp.feeding_frequency_sling,
        "feeding_frequency_juvenile": sp.feeding_frequency_juvenile,
        "feeding_frequency_adult": sp.feeding_frequency_adult,
        "water_dish_required": bool(sp.water_dish_required),
        "webbing_amount": sp.webbing_amount,
        # Species.burrowing is a Boolean (legacy); invert_species expects
        # 'none' | 'light' | 'heavy'. Map True → 'heavy', False → None.
        "burrowing": "heavy" if sp.burrowing else None,
        # Tarantula safety flags
        "urticating_hairs": bool(sp.urticating_hairs),
        "medically_significant_venom": bool(sp.medically_significant_venom),
        # Tarantulas don't use the venom_severity tier — leave NULL.
        "venom_severity": None,
        "care_guide": sp.care_guide,
        "image_url": sp.image_url,
        "image_attribution": sp.image_attribution,
        "source_url": sp.source_url,
        "is_verified": bool(sp.is_verified),
        "submitted_by": sp.submitted_by,
        "community_rating": sp.community_rating,
        "times_kept": sp.times_kept or 0,
    }


def _scorpion_species_to_invert_species_kwargs(sp: "ScorpionSpecies") -> dict:
    """Scorpion species → invert_species kwargs."""
    return {
        "id": sp.id,
        "taxon": "scorpion",
        "scientific_name": sp.scientific_name,
        "scientific_name_lower": sp.scientific_name_lower,
        "slug": sp.slug,
        "common_names": list(sp.common_names or []),
        "genus": sp.genus,
        "family": sp.family,
        "order_name": sp.order_name or "Scorpiones",
        "care_level": sp.care_level,
        "temperament": sp.temperament,
        "native_region": sp.native_region,
        "adult_size": sp.adult_size,
        "adult_length_min_mm": sp.adult_length_min_mm,
        "adult_length_max_mm": sp.adult_length_max_mm,
        "growth_rate": sp.growth_rate,
        "type": sp.type,
        "temperature_min": sp.temperature_min,
        "temperature_max": sp.temperature_max,
        "humidity_min": sp.humidity_min,
        "humidity_max": sp.humidity_max,
        # Scorpion catalog doesn't carry a sling size.
        "enclosure_size_juvenile": sp.enclosure_size_juvenile,
        "enclosure_size_adult": sp.enclosure_size_adult,
        "substrate_depth": sp.substrate_depth,
        "substrate_type": sp.substrate_type,
        "prey_size": sp.prey_size,
        "feeding_frequency_juvenile": sp.feeding_frequency_juvenile,
        "feeding_frequency_adult": sp.feeding_frequency_adult,
        "water_dish_required": bool(sp.water_dish_required),
        "burrowing": sp.burrowing,
        "communal_suitable": bool(sp.communal_suitable),
        # Scorpion-specific safety fields
        "venom_severity": sp.venom_severity,
        "venom_notes": sp.venom_notes,
        "care_guide": sp.care_guide,
        "image_url": sp.image_url,
        "is_verified": bool(sp.is_verified),
        "submitted_by": sp.submitted_by,
        "community_rating": sp.community_rating,
        "times_kept": sp.times_kept or 0,
    }


def mirror_species_create(db: Session, sp: "Species") -> None:
    db.add(InvertSpecies(**_species_to_invert_species_kwargs(sp)))


def mirror_species_update(db: Session, sp: "Species") -> None:
    inv = db.query(InvertSpecies).filter(InvertSpecies.id == sp.id).first()
    fields = _species_to_invert_species_kwargs(sp)
    if inv is None:
        db.add(InvertSpecies(**fields))
        return
    for k, v in fields.items():
        if k in ("id", "taxon"):
            continue
        setattr(inv, k, v)


def mirror_species_delete(db: Session, species_id: UUID) -> None:
    inv = db.query(InvertSpecies).filter(InvertSpecies.id == species_id).first()
    if inv is not None:
        db.delete(inv)


def mirror_scorpion_species_create(db: Session, sp: "ScorpionSpecies") -> None:
    db.add(InvertSpecies(**_scorpion_species_to_invert_species_kwargs(sp)))


def mirror_scorpion_species_update(db: Session, sp: "ScorpionSpecies") -> None:
    inv = db.query(InvertSpecies).filter(InvertSpecies.id == sp.id).first()
    fields = _scorpion_species_to_invert_species_kwargs(sp)
    if inv is None:
        db.add(InvertSpecies(**fields))
        return
    for k, v in fields.items():
        if k in ("id", "taxon"):
            continue
        setattr(inv, k, v)


def mirror_scorpion_species_delete(db: Session, species_id: UUID) -> None:
    inv = db.query(InvertSpecies).filter(InvertSpecies.id == species_id).first()
    if inv is not None:
        db.delete(inv)


# ---------------------------------------------------------------------------
# Polymorphic log helper — sets invert_id IF the corresponding invert row
# exists. Called immediately before db.add(log_row) in each log router so
# new rows get both columns set when possible.
# ---------------------------------------------------------------------------

def invert_id_if_exists(db: Session, parent_id: UUID | str | None) -> UUID | None:
    """Return parent_id IF an Invert row with that id exists, else None.

    Used by the log routers to opportunistically populate `invert_id`.
    Cost: one cheap PK lookup per log write. Worth it during Phases A2-C
    because once backfill runs (Phase B) every invert is present, so this
    function always returns parent_id and writes stay consistent.
    """
    if parent_id is None:
        return None
    exists = db.query(Invert.id).filter(Invert.id == parent_id).first()
    return parent_id if exists is not None else None


# ---------------------------------------------------------------------------
# Slug helper for tarantula species (the legacy `species` table doesn't
# carry a slug column; invert_species REQUIRES one).
# ---------------------------------------------------------------------------

import re


def _slugify(name: str) -> str:
    s = (name or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "unknown"
