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
        # ADR-015 — keep death in step in BOTH directions.
        "died_at": t.died_at,
        "death_cause": t.death_cause,
        "death_notes": t.death_notes,
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
        "died_at": s.died_at,
        "death_cause": s.death_cause,
        "death_notes": s.death_notes,
        "photo_url": s.photo_url,
        "is_public": s.is_public,
        "visibility": s.visibility,
        "notes": s.notes,
    }


# Never reassigned by a mirror, on create or update.
_IMMUTABLE = frozenset({"id", "user_id", "taxon"})

# Columns the kwargs builders hardcode to None because the LEGACY row has
# nothing to say about them. Per-taxon, because what's hardcoded differs:
# `colony_id` is a real scorpion column but always None for tarantulas, and
# `life_stage` is the mirror image of that.
#
# Hardcoding None is correct on INSERT — it means "not known yet". On UPDATE it
# is destructive, because these columns are OWNED by the invert side: the Phase
# B backfill resolved species links, and the generic UI writes them directly.
# Applying the whole kwargs dict meant every PUT /tarantulas/{id} silently
# nulled `inverts.species_id`. The care sheet link vanished from the detail
# screen and the feeding cadence quietly downgraded from species-backed to a
# generic default, with nothing on screen to say anything had happened.
_INVERT_OWNED_TARANTULA = frozenset({"species_id", "colony_id"})
_INVERT_OWNED_SCORPION = frozenset({"species_id", "life_stage"})


def _apply_forward(invert: "Invert", fields: dict, owned: frozenset) -> None:
    """Copy the legacy row's values onto its mirror, leaving invert-owned
    columns alone."""
    for k, v in fields.items():
        if k in _IMMUTABLE or k in owned:
            continue
        setattr(invert, k, v)


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
    _apply_forward(invert, fields, _INVERT_OWNED_TARANTULA)


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
    _apply_forward(invert, fields, _INVERT_OWNED_SCORPION)


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


# ---------------------------------------------------------------------------
# REVERSE mirror: inverts → legacy.
#
# Everything above flows legacy → inverts, which was correct while the legacy
# routers were the only write path. ADR-013 changed that: merging the detail
# screens means tarantula edits now go through PUT /inverts/{id}, and nothing
# propagated them back. Meanwhile GET /tarantulas/ still reads the legacy table
# (the C1 read cutover hasn't happened), so the collection grid kept showing
# pre-edit values indefinitely.
#
# Reported by a keeper 2026-07-29: renamed a communal from "Communal of 6" to
# "Communal of 11"; the detail screen showed the new name, the collection card
# showed the old one. Name was just the visible symptom — sex, species,
# husbandry and notes diverged the same way.
#
# This is a stopgap for the expand-contract window. When C1 lands and the
# collection reads /inverts/, this whole direction can be deleted along with
# the rest of the module.
# ---------------------------------------------------------------------------

# Columns that exist on BOTH Invert and the legacy per-taxon tables and are
# safe to copy back verbatim. Deliberately explicit rather than introspected:
# id/user_id/taxon are immutable, so they're excluded.
#
# `species_id` is also absent here, but NOT because it shouldn't sync — it
# is carried explicitly by mirror_invert_update_to_legacy, which runs it
# through _legacy_species_id() to guard the FK. It can't live in this tuple
# because every other field copies straight across, and this one needs the
# existence check. Do not "fix" the omission by adding it here.
_REVERSE_SHARED_FIELDS = (
    "enclosure_id",
    "name",
    "common_name",
    "scientific_name",
    "sex",
    "date_acquired",
    "source",
    "price_paid",
    "enclosure_size",
    "substrate_type",
    "substrate_depth",
    "last_substrate_change",
    "target_temp_min",
    "target_temp_max",
    "target_humidity_min",
    "target_humidity_max",
    "water_dish",
    "misting_schedule",
    "last_enclosure_cleaning",
    "enclosure_notes",
    "feeding_paused_reason",
    "feeding_paused_until",
    # ADR-015 — a death must reach the legacy twin, or the animal stays alive
    # on any read path that hasn't cut over to `inverts`.
    "died_at",
    "death_cause",
    "death_notes",
    "photo_url",
    "is_public",
    "visibility",
    "notes",
    # Scorpion-only columns. The loop below guards with hasattr(), so they're
    # skipped harmlessly for tarantulas. Without them, moving a scorpion
    # between communals or recording an instar on the generic screen left the
    # legacy row on its old value — and `GET /scorpions/?colony_id=` filters on
    # both surfaces, so the same animal could appear in two colonies.
    "colony_id",
    "current_instar",
    "current_length_mm",
)

# Legacy tables that still back a read path. Taxa absent here (centipede,
# mantis, roach …) live only on `inverts`, so there's nothing to mirror to.
_LEGACY_MODEL_BY_TAXON = {
    "tarantula": "app.models.tarantula:Tarantula",
    "scorpion": "app.models.scorpion:Scorpion",
}


def _legacy_model_for(taxon: str):
    """Resolve the legacy model class for a taxon, or None if it lives only on
    `inverts` (centipede, mantis, and everything added after the per-taxon
    tables stopped being written)."""
    target = _LEGACY_MODEL_BY_TAXON.get(taxon)
    if target is None:
        return None

    module_path, class_name = target.split(":")
    import importlib

    return getattr(importlib.import_module(module_path), class_name)


def _apply_reverse(row, invert: Invert) -> None:
    """Copy an invert's shared columns onto its legacy row.

    `life_stage` and `enclosure_type` are handled separately: they're SQLEnum
    columns on Tarantula but plain CHECK-constrained strings on Invert, and
    assigning an out-of-range string would raise on flush. We assign only when
    the value is a valid member of the legacy enum, and skip otherwise rather
    than failing the whole edit over a display field.
    """
    for field in _REVERSE_SHARED_FIELDS:
        if hasattr(row, field):
            setattr(row, field, getattr(invert, field))

    for field in ("life_stage", "enclosure_type"):
        value = getattr(invert, field, None)
        column = getattr(type(row), field, None)
        if column is None:
            continue
        if value is None:
            setattr(row, field, None)
            continue
        enum_cls = getattr(column.type, "enum_class", None)
        if enum_cls is None:
            setattr(row, field, value)  # plain string column (Scorpion)
        elif value in {e.value for e in enum_cls}:
            setattr(row, field, value)


def _legacy_species_id(db: Session, invert: Invert):
    """The species id to put on the legacy row, or None.

    The catalogs share primary keys for mirrored species — Phase B preserved
    the id when copying `species` into `invert_species` — so the value can be
    copied directly. But the FKs target different tables, and a species created
    natively on `invert_species` has no legacy counterpart, so copying blindly
    would raise a foreign key violation. Guard on existence, exactly as
    backfill_inverts.py step 5 does.
    """
    if invert.species_id is None:
        return None

    if invert.taxon == "tarantula":
        from app.models.species import Species as LegacyCatalog
    elif invert.taxon == "scorpion":
        from app.models.scorpion_species import ScorpionSpecies as LegacyCatalog
    else:
        return None

    exists = (
        db.query(LegacyCatalog.id)
        .filter(LegacyCatalog.id == invert.species_id)
        .first()
    )
    return invert.species_id if exists else None


_SPECIES_REVERSE_EXCLUDE = frozenset({
    "id",             # immutable identity, shared across both catalogs
    "created_at",
    "updated_at",
    # Species.burrowing is a Boolean; invert_species.burrowing is
    # 'none' | 'light' | 'heavy'. The forward map collapses True → 'heavy', so
    # a reverse copy followed by a forward copy would silently promote 'light'
    # to 'heavy'. Leaving it stale is recoverable; corrupting it on every round
    # trip is not.
    "burrowing",
    # SQLEnum on Species, plain string on InvertSpecies — handled separately
    # below so an out-of-range value skips instead of raising.
    "care_level",
})


def _species_reverse_fields(legacy_model) -> tuple:
    """Columns safe to copy from `invert_species` back onto a legacy catalog row.

    Derived from the model intersection rather than hand-listed: the catalogs
    have 40 columns in common and a maintained list would drift. A column added
    to both tables is mirrored automatically; one that needs special handling
    goes in _SPECIES_REVERSE_EXCLUDE with a reason.
    """
    from app.models.invert_species import InvertSpecies

    shared = {c.key for c in legacy_model.__table__.columns} & {
        c.key for c in InvertSpecies.__table__.columns
    }
    return tuple(sorted(shared - _SPECIES_REVERSE_EXCLUDE))


def mirror_invert_species_update_to_legacy(db: Session, species) -> None:
    """Push an `invert_species` edit back onto its legacy catalog row.

    The legacy `species` / `scorpion_species` tables still back real reads: the
    tarantula feeding-stats route, the public species pages, and the
    Appalachian Tarantulas storefront care guides, which fetch this API. Editing
    a care sheet on the unified surface updated none of them.

    Note the feeding-interval columns are NOT part of this — they exist only on
    `species` and can't be set through `invert_species` at all, so the feeding
    prediction was never at risk from this gap.

    No-op for taxa with no legacy catalog (centipede, mantis, and the rest).
    """
    from app.models.scorpion_species import ScorpionSpecies
    from app.models.species import Species

    if species.taxon == "tarantula":
        legacy_model = Species
    elif species.taxon == "scorpion":
        legacy_model = ScorpionSpecies
    else:
        return

    row = db.query(legacy_model).filter(legacy_model.id == species.id).first()
    if row is None:
        return  # catalog entry born on the unified surface; no legacy twin

    for field in _species_reverse_fields(legacy_model):
        setattr(row, field, getattr(species, field))

    # care_level: enum-typed on the legacy row. Assign only a valid member,
    # rather than failing the whole edit over one display field.
    value = getattr(species, "care_level", None)
    column = getattr(legacy_model, "care_level", None)
    if column is not None:
        enum_cls = getattr(column.type, "enum_class", None)
        if value is None or enum_cls is None:
            row.care_level = value
        elif value in {e.value for e in enum_cls}:
            row.care_level = value


def mirror_invert_create_to_legacy(db: Session, invert: Invert) -> None:
    """Create the legacy row for an invert born on the unified surface.

    Until the C1 read cutover, an animal with no legacy row is invisible to
    every read path that hasn't moved yet: the web collection, keeper profiles,
    search, dashboard analytics, premolt, achievements, enclosure assignment and
    the data export. Transfer claims and CSV imports both created inverts
    directly, so a claimed or imported tarantula showed up on mobile and simply
    wasn't there on web — which reads as an import that half-worked.

    Idempotent: no-ops when the row already exists, so it's safe to call from a
    path that may or may not have gone through a legacy create.
    """
    model = _legacy_model_for(invert.taxon)
    if model is None:
        return  # invert-native taxon; there is no legacy table to write

    existing = db.query(model.id).filter(model.id == invert.id).first()
    if existing:
        return

    # Shares the primary key with the invert — that identity is what lets every
    # other mirror in this module find its twin.
    row = model(id=invert.id, user_id=invert.user_id)
    _apply_reverse(row, invert)
    row.species_id = _legacy_species_id(db, invert)
    db.add(row)


def mirror_invert_update_to_legacy(db: Session, invert: Invert) -> None:
    """Push an `inverts` edit back onto its legacy row, if one exists.

    No-ops for taxa with no legacy table, and for inverts created after the
    per-taxon tables stopped being written. Never creates a legacy row — see
    mirror_invert_create_to_legacy for that; keeping them separate means an
    edit can't silently resurrect a row someone deliberately deleted.
    """
    model = _legacy_model_for(invert.taxon)
    if model is None:
        return

    row = db.query(model).filter(model.id == invert.id).first()
    if row is None:
        return  # invert-native animal; nothing legacy to keep in sync

    _apply_reverse(row, invert)

    # species_id is NOT in _REVERSE_SHARED_FIELDS, so carry it explicitly.
    #
    # It was excluded on the grounds that "the two surfaces reference
    # different catalogs". That reasoning is stale: Phase B preserved
    # primary keys, so a given species has the SAME id in `species` /
    # `scorpion_species` and in `invert_species` — which is why
    # mirror_invert_create_to_legacy has always set it on create, through
    # the same guard used here.
    #
    # Leaving it off the UPDATE path meant a keeper who corrected an
    # animal's species on the generic invert screen updated `inverts` and
    # left the legacy row pointing at the old species forever. Web reads
    # the legacy tarantula page, so they kept seeing the previous species'
    # care sheet. Found 2026-09-01: a live Avicularia avicularia whose
    # legacy row still claimed Grammostola pulchra — an arboreal New World
    # tarantula showing terrestrial husbandry.
    #
    # _legacy_species_id returns None when the id isn't present in the
    # legacy catalog, so a species that exists only on the unified side
    # clears the stale link rather than writing a dangling FK.
    row.species_id = _legacy_species_id(db, invert)


def mirror_invert_delete_to_legacy(db: Session, invert: Invert) -> None:
    """Delete the legacy tarantulas/scorpions row alongside an invert delete.

    Without this, deleting through the unified detail screen removes the
    `inverts` row while GET /tarantulas/ keeps returning the legacy one — the
    animal appears not to delete at all, which is worse than the stale-name
    symptom because the keeper will just try again.

    Safe to call before or after `db.delete(invert)`: each CASCADE fires on its
    own FK, and logs carrying both parent ids get cleaned up by whichever side
    runs first (same reasoning as mirror_tarantula_delete).
    """
    model = _legacy_model_for(invert.taxon)
    if model is None:
        return

    row = db.query(model).filter(model.id == invert.id).first()
    if row is not None:
        db.delete(row)
