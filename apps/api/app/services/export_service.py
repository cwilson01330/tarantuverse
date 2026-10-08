"""
Data export service for Tarantuverse.

Generates JSON, CSV, and ZIP exports of user data matching the existing
Pydantic response schemas. All exports are available to free and premium
users for GDPR compliance.
"""
import csv
import io
import json
import zipfile
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.tarantula import Tarantula
# The unified multi-taxon animal table (ADR-005). Exporting from `tarantulas`
# alone meant a keeper whose collection was mantises or isopods received an
# export with no animals in it.
from app.models.invert import Invert
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.substrate_change import SubstrateChange
from app.models.care_log import CareLog
from app.models.photo import Photo
from app.models.enclosure import Enclosure
from app.models.pairing import Pairing
from app.models.egg_sac import EggSac
from app.models.offspring import Offspring
# Colony mode (ADR-010) — population-level tracking. Included so a colony
# keeper's export is complete (GDPR data portability).
from app.models.colony import Colony, ColonyEvent
# Herpetoverse (reptile) models — included so a reptile keeper's export
# actually contains their data (GDPR data-portability + HV/TV parity).
from app.models.animal import Animal
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.animal_genotype import AnimalGenotype
from app.models.reptile_pairing import ReptilePairing
from app.models.clutch import Clutch
from app.models.reptile_offspring import ReptileOffspring
# Herpetoverse feeder stock (ADR-012) — live colonies and frozen inventory.
from app.models.hv_feeder import HvFeederLog, HvFeederStock
# Tarantuverse feeder colonies (crickets, roaches, ...) and their care log.
from app.models.feeder_colony import FeederColony
from app.models.feeder_care_log import FeederCareLog
from app.utils.units import EXPORT_UNITS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(value: Any) -> Any:
    """Convert non-JSON-serializable types to strings."""
    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "value"):  # Enum
        return value.value
    return value


def _row_to_dict(obj: Any, fields: List[str]) -> Dict[str, Any]:
    """Extract *fields* from an ORM object, serializing each value."""
    return {f: _serialize(getattr(obj, f, None)) for f in fields}


# ---------------------------------------------------------------------------
# Field lists — mirror the Pydantic *Response* schemas exactly
# ---------------------------------------------------------------------------

TARANTULA_FIELDS = [
    "id", "user_id", "name", "common_name", "scientific_name", "species_id",
    "sex", "date_acquired", "source", "price_paid", "photo_url", "notes",
    "is_public", "visibility", "enclosure_id",
    # Husbandry
    "enclosure_type", "enclosure_size", "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "misting_schedule", "last_enclosure_cleaning", "enclosure_notes",
    "created_at", "updated_at",
]

# `invert_id` and `colony_id` are not decoration: a mantis or isopod log
# carries NO `tarantula_id`, so without them every non-tarantula log row would
# export with a null parent — an orphan the keeper couldn't match to an animal
# and the importer couldn't re-attach.
FEEDING_FIELDS = [
    "id", "tarantula_id", "invert_id", "colony_id", "animal_id", "enclosure_id",
    "fed_at", "food_type", "food_size", "quantity", "accepted", "notes",
    "created_at",
    # Who logged it, when it wasn't the keeper (PRD-shared-keeping). Blank for
    # the keeper's own entries. `sitter_name` is the pass label, so the export
    # says "Sam" rather than an id the keeper can't look up.
    "logged_via_pass_id", "logged_by_user_id", "sitter_name",
]

MOLT_FIELDS = [
    "id", "tarantula_id", "invert_id", "colony_id", "enclosure_id",
    "molted_at", "premolt_started_at",
    "is_unidentified", "leg_span_before", "leg_span_after",
    "weight_before", "weight_after", "notes", "image_url", "created_at",
]

SUBSTRATE_CHANGE_FIELDS = [
    "id", "tarantula_id", "invert_id", "colony_id", "enclosure_id",
    "changed_at", "substrate_type",
    "substrate_depth", "reason", "notes", "created_at",
]

PHOTO_FIELDS = [
    "id", "tarantula_id", "invert_id", "colony_id", "animal_id", "url",
    "thumbnail_url", "caption", "taken_at", "created_at",
]

# The unified animal surface (ADR-005). Every taxon lives here, including
# tarantulas — `inverts` is a SUPERSET of the legacy `tarantulas` export
# section, not a sibling of it.
INVERT_FIELDS = [
    "id", "user_id", "taxon", "name", "common_name", "scientific_name",
    "species_id", "sex", "date_acquired", "source", "price_paid",
    "photo_url", "notes", "is_public", "visibility", "enclosure_id",
    "colony_id", "location",
    # Growth / stage — instar and length carry the taxa that don't use
    # sling/juvenile/adult.
    "life_stage", "current_instar", "current_length_mm",
    "current_segment_count", "current_leg_pair_count",
    # Husbandry
    "enclosure_type", "enclosure_size", "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "misting_schedule", "last_enclosure_cleaning", "enclosure_notes",
    # Feeding cadence (ADR-017) + pause state
    "feeding_interval_days", "feeding_paused_reason", "feeding_paused_until",
    # Provenance / lifecycle
    "bred_by_user_id", "origin_keeper_name", "source_transfer_id",
    "transferred_out_at", "died_at", "death_cause", "death_notes",
    "created_at", "updated_at",
]

ENCLOSURE_FIELDS = [
    "id", "user_id", "name", "is_communal", "species_id", "population_count",
    "enclosure_type", "enclosure_size", "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "misting_schedule", "last_enclosure_cleaning", "notes", "photo_url",
    "created_at", "updated_at",
]

# The *_invert_id columns are not optional extras — they are the ONLY parent
# reference a non-tarantula pairing has (male_id/female_id stay NULL for
# inverts). Omitting them meant a scorpion or jumping spider pairing exported
# with blank parents: the lineage silently vanished from the keeper's own data,
# which for a GDPR export is a correctness problem, not a cosmetic one.
PAIRING_FIELDS = [
    "id", "user_id", "male_id", "female_id",
    "male_invert_id", "female_invert_id",
    "paired_date", "separated_date",
    "pairing_type", "outcome", "notes", "created_at",
]

EGG_SAC_FIELDS = [
    "id", "pairing_id", "user_id", "laid_date", "pulled_date",
    # expected_hatch_date was missing — a real column the keeper fills in and
    # then couldn't get back out.
    "expected_hatch_date", "hatch_date",
    "incubation_temp_min", "incubation_temp_max",
    "incubation_humidity_min", "incubation_humidity_max",
    "spiderling_count", "viable_count", "notes", "photo_url", "created_at",
]

OFFSPRING_FIELDS = [
    # invert_id is the kept-link for every taxon; tarantula_id is the legacy
    # mirror and is NULL for anything else.
    "id", "egg_sac_id", "user_id", "invert_id", "tarantula_id",
    "status", "status_date",
    "buyer_info", "price_sold", "notes", "created_at",
]

COLONY_FIELDS = [
    "id", "user_id", "taxon", "species_id", "enclosure_id", "name",
    "date_acquired", "founded_date", "source", "stage_counts",
    "count_is_estimated", "enclosure_type", "enclosure_size",
    "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "notes", "sitter_note", "photo_url", "visibility", "is_active", "transferred_out_at",
    "ended_at", "end_reason", "end_notes", "location",
    "created_at", "updated_at",
]

COLONY_EVENT_FIELDS = [
    "id", "colony_id", "user_id", "event_type", "stage", "count_delta",
    "occurred_at", "severity", "destination", "notes", "logged_by_user_id",
    "created_at",
]

# Hydration events (car_20260909). Parented on inverts rather than tarantulas,
# so this is queried by invert id — unlike the older log exports above, which
# all still key off legacy tarantula ids.
CARE_LOG_FIELDS = [
    "id", "invert_id", "colony_id", "user_id", "log_type", "logged_at",
    "notes", "created_at",
]

USER_PROFILE_FIELDS = [
    "id", "email", "username", "display_name", "avatar_url", "bio",
    "profile_bio", "profile_location", "profile_experience_level",
    "profile_years_keeping", "profile_specialties", "social_links",
    "is_breeder", "collection_visibility", "measurement_units", "created_at",
]

# --- Herpetoverse (reptile/amphibian) field lists ---

ANIMAL_FIELDS = [
    "id", "user_id", "herp_species_id", "enclosure_id", "taxon", "name",
    "common_name", "scientific_name", "sex", "date_acquired", "hatch_date",
    "source", "source_breeder", "price_paid", "current_weight_g",
    "current_length_in", "feeding_schedule", "last_fed_at", "last_shed_at",
    "brumation_active", "brumation_started_at", "feeding_paused_reason",
    "feeding_paused_until", "feeds_on_cgd_override", "photo_url", "is_public",
    "visibility", "notes", "location", "died_at", "death_cause", "death_notes",
    "transferred_out_at", "created_at", "updated_at",
]

SHED_FIELDS = [
    "id", "animal_id", "shed_at", "in_blue_started_at", "weight_before_g",
    "weight_after_g", "length_before_in", "length_after_in",
    "is_complete_shed", "has_retained_shed", "retained_shed_notes", "notes",
    "image_url", "created_at",
]

WEIGHT_FIELDS = [
    "id", "animal_id", "weighed_at", "weight_g", "context", "notes",
    "created_at",
]

GENOTYPE_FIELDS = [
    "id", "animal_id", "gene_id", "zygosity", "poss_het_percentage",
    "proven", "notes", "created_at",
]

REPTILE_PAIRING_FIELDS = [
    "id", "user_id", "male_animal_id", "female_animal_id", "taxon",
    "paired_date", "separated_date", "pairing_type", "outcome", "notes",
    "created_at", "updated_at",
]

CLUTCH_FIELDS = [
    "id", "pairing_id", "user_id", "laid_date", "pulled_date",
    "expected_hatch_date", "hatch_date", "incubation_temp_min_f",
    "incubation_temp_max_f", "incubation_humidity_min_pct",
    "incubation_humidity_max_pct", "expected_count", "fertile_count",
    "slug_count", "hatched_count", "viable_count", "notes", "photo_url",
    "created_at", "updated_at",
]

REPTILE_OFFSPRING_FIELDS = [
    "id", "clutch_id", "user_id", "animal_id", "morph_label",
    "recorded_genotype", "status", "status_date", "buyer_info", "price_sold",
    "hatch_weight_g", "hatch_length_in", "notes", "photo_url", "created_at",
    "updated_at",
]

# Herpetoverse feeder stock (ADR-012). `species_scientific_name` is not a
# column: it is filled from the catalog row so the export is readable without
# the catalog's ids.
HV_FEEDER_STOCK_FIELDS = [
    "id", "user_id", "hv_feeder_species_id", "species_scientific_name", "name",
    "form", "inventory_mode", "count", "sized_counts", "storage_location",
    "last_restocked", "last_used", "last_cleaned", "low_threshold", "notes",
    "is_active", "created_at", "updated_at",
]

HV_FEEDER_LOG_FIELDS = [
    "id", "hv_feeder_stock_id", "user_id", "log_type", "size", "count_delta",
    "logged_at", "notes", "created_at",
]

# Tarantuverse feeder colonies. `species_scientific_name` is not a column:
# it is filled from the feeder_species catalog row, as for HV stock.
FEEDER_COLONY_FIELDS = [
    "id", "user_id", "feeder_species_id", "species_scientific_name",
    "enclosure_id", "name", "inventory_mode", "count", "life_stage_counts",
    "last_restocked", "last_cleaned", "last_fed_date", "food_notes", "notes",
    "low_threshold", "is_active", "created_at", "updated_at",
]

FEEDER_CARE_LOG_FIELDS = [
    "id", "feeder_colony_id", "user_id", "log_type", "logged_at",
    "count_delta", "notes", "created_at",
]


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def _get_user_tarantulas(db: Session, user_id: UUID) -> List[Tarantula]:
    return db.query(Tarantula).filter(Tarantula.user_id == user_id).order_by(Tarantula.created_at).all()


def _get_user_inverts(db: Session, user_id: UUID) -> List[Invert]:
    """Every animal the keeper owns, across all eleven taxa.

    This is the complete list; `_get_user_tarantulas` returns a subset of the
    same rows (shared primary keys, ADR-005).
    """
    return db.query(Invert).filter(Invert.user_id == user_id).order_by(Invert.created_at).all()


def _get_tarantula_ids(tarantulas: List[Tarantula]) -> List[UUID]:
    return [t.id for t in tarantulas]


def _owned_logs(db: Session, model, user_id: UUID, order_col):
    """Every row of a polymorphic log table belonging to this user.

    Filtering by OWNER rather than by a list of tarantula ids is the whole
    fix. The old form dropped, silently and completely, every log belonging to
    a scorpion, mantis, jumper, isopod or colony — which for a keeper with no
    tarantulas meant an export containing none of their husbandry records at
    all. `_get_care_logs` below already worked this way and says why.

    `or_` over one table, rather than joins, so a dual-written tarantula log
    carrying both `tarantula_id` and `invert_id` appears exactly once.
    """
    return (
        db.query(model)
        .filter(
            or_(
                model.invert_id.in_(
                    select(Invert.id).where(Invert.user_id == user_id)
                ),
                model.tarantula_id.in_(
                    select(Tarantula.id).where(Tarantula.user_id == user_id)
                ),
                model.colony_id.in_(
                    select(Colony.id).where(Colony.user_id == user_id)
                ),
            )
        )
        .order_by(order_col)
        .all()
    )


def _get_feeding_logs(db: Session, user_id: UUID) -> List[FeedingLog]:
    return _owned_logs(db, FeedingLog, user_id, FeedingLog.fed_at)


def _get_molt_logs(db: Session, user_id: UUID) -> List[MoltLog]:
    return _owned_logs(db, MoltLog, user_id, MoltLog.molted_at)


def _get_substrate_changes(db: Session, user_id: UUID) -> List[SubstrateChange]:
    return _owned_logs(db, SubstrateChange, user_id, SubstrateChange.changed_at)


def _get_care_logs(db: Session, user_id: UUID) -> List[CareLog]:
    """Queried by user rather than by animal id.

    Every other log export here filters on a list of tarantula ids, which
    silently drops anything belonging to a non-tarantula invert. Care logs are
    invert-parented from the start, and filtering by owner means a keeper's
    scorpion and centipede hydration records land in the export too — which is
    the point of a GDPR export.
    """
    return (
        db.query(CareLog)
        .filter(CareLog.user_id == user_id)
        .order_by(CareLog.logged_at)
        .all()
    )


def _get_photos(db: Session, user_id: UUID) -> List[Photo]:
    return _owned_logs(db, Photo, user_id, Photo.created_at)


def _get_enclosures(db: Session, user_id: UUID) -> List[Enclosure]:
    return db.query(Enclosure).filter(Enclosure.user_id == user_id).order_by(Enclosure.created_at).all()


def _get_pairings(db: Session, user_id: UUID) -> List[Pairing]:
    return db.query(Pairing).filter(Pairing.user_id == user_id).order_by(Pairing.created_at).all()


def _get_egg_sacs(db: Session, user_id: UUID) -> List[EggSac]:
    return db.query(EggSac).filter(EggSac.user_id == user_id).order_by(EggSac.created_at).all()


def _get_offspring(db: Session, user_id: UUID) -> List[Offspring]:
    return db.query(Offspring).filter(Offspring.user_id == user_id).order_by(Offspring.created_at).all()


def _get_colonies(db: Session, user_id: UUID) -> List[Colony]:
    return db.query(Colony).filter(Colony.user_id == user_id).order_by(Colony.created_at).all()


def _get_colony_events(db: Session, colony_ids: List[UUID]) -> List[ColonyEvent]:
    if not colony_ids:
        return []
    return (
        db.query(ColonyEvent)
        .filter(ColonyEvent.colony_id.in_(colony_ids))
        .order_by(ColonyEvent.occurred_at)
        .all()
    )


# --- Herpetoverse query helpers ---

def _get_user_animals(db: Session, user_id: UUID) -> List[Animal]:
    return db.query(Animal).filter(Animal.user_id == user_id).order_by(Animal.created_at).all()


def _get_animal_feeding_logs(db: Session, animal_ids: List[UUID]) -> List[FeedingLog]:
    if not animal_ids:
        return []
    return db.query(FeedingLog).filter(FeedingLog.animal_id.in_(animal_ids)).order_by(FeedingLog.fed_at).all()


def _get_shed_logs(db: Session, animal_ids: List[UUID]) -> List[ShedLog]:
    if not animal_ids:
        return []
    return db.query(ShedLog).filter(ShedLog.animal_id.in_(animal_ids)).order_by(ShedLog.shed_at).all()


def _get_weight_logs(db: Session, animal_ids: List[UUID]) -> List[WeightLog]:
    if not animal_ids:
        return []
    return db.query(WeightLog).filter(WeightLog.animal_id.in_(animal_ids)).order_by(WeightLog.weighed_at).all()


def _get_genotypes(db: Session, animal_ids: List[UUID]) -> List[AnimalGenotype]:
    if not animal_ids:
        return []
    return db.query(AnimalGenotype).filter(AnimalGenotype.animal_id.in_(animal_ids)).order_by(AnimalGenotype.created_at).all()


def _get_animal_photos(db: Session, animal_ids: List[UUID]) -> List[Photo]:
    if not animal_ids:
        return []
    return db.query(Photo).filter(Photo.animal_id.in_(animal_ids)).order_by(Photo.created_at).all()


def _get_reptile_pairings(db: Session, user_id: UUID) -> List[ReptilePairing]:
    return db.query(ReptilePairing).filter(ReptilePairing.user_id == user_id).order_by(ReptilePairing.created_at).all()


def _get_clutches(db: Session, user_id: UUID) -> List[Clutch]:
    return db.query(Clutch).filter(Clutch.user_id == user_id).order_by(Clutch.created_at).all()


def _get_reptile_offspring(db: Session, user_id: UUID) -> List[ReptileOffspring]:
    return db.query(ReptileOffspring).filter(ReptileOffspring.user_id == user_id).order_by(ReptileOffspring.created_at).all()


def _get_hv_feeder_stocks(db: Session, user_id: UUID) -> List[HvFeederStock]:
    """Every feeder stock the keeper owns, archived (is_active=False) included."""
    return db.query(HvFeederStock).filter(HvFeederStock.user_id == user_id).order_by(HvFeederStock.created_at).all()


def _get_hv_feeder_logs(db: Session, user_id: UUID) -> List[HvFeederLog]:
    """Logs on the keeper's own stocks — by stock owner, so a log can't be
    exported to anyone but the owner of the stock it belongs to."""
    return (
        db.query(HvFeederLog)
        .filter(
            HvFeederLog.hv_feeder_stock_id.in_(
                select(HvFeederStock.id).where(HvFeederStock.user_id == user_id)
            )
        )
        .order_by(HvFeederLog.logged_at, HvFeederLog.created_at)
        .all()
    )


def _get_feeder_colonies(db: Session, user_id: UUID) -> List[FeederColony]:
    """Every TV feeder colony the keeper owns, archived (is_active=False) included."""
    return db.query(FeederColony).filter(FeederColony.user_id == user_id).order_by(FeederColony.created_at).all()


def _get_feeder_care_logs(db: Session, user_id: UUID) -> List[FeederCareLog]:
    """Care logs on the keeper's own colonies — by colony owner, like HV
    feeder logs, so a log is only ever exported to its colony's owner."""
    return (
        db.query(FeederCareLog)
        .filter(
            FeederCareLog.feeder_colony_id.in_(
                select(FeederColony.id).where(FeederColony.user_id == user_id)
            )
        )
        .order_by(FeederCareLog.logged_at, FeederCareLog.created_at)
        .all()
    )


def _feeder_colony_dict(colony: FeederColony) -> Dict[str, Any]:
    row = _row_to_dict(colony, [f for f in FEEDER_COLONY_FIELDS if f != "species_scientific_name"])
    species = colony.feeder_species
    row["species_scientific_name"] = species.scientific_name if species else None
    return {f: row.get(f) for f in FEEDER_COLONY_FIELDS}


def _hv_feeder_stock_dict(stock: HvFeederStock) -> Dict[str, Any]:
    row = _row_to_dict(stock, [f for f in HV_FEEDER_STOCK_FIELDS if f != "species_scientific_name"])
    species = stock.hv_feeder_species
    row["species_scientific_name"] = species.scientific_name if species else None
    return {f: row.get(f) for f in HV_FEEDER_STOCK_FIELDS}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class ExportService:
    """Generates user-data exports in JSON, CSV, and ZIP formats."""

    # ---- gather all data once -------------------------------------------

    @staticmethod
    def _gather(db: Session, user: User) -> Dict[str, Any]:
        tarantulas = _get_user_tarantulas(db, user.id)

        # The complete animal list, every taxon. `tarantulas` above is a
        # subset of these same rows (shared primary keys) and is kept only so
        # existing consumers of the export format don't break.
        inverts = _get_user_inverts(db, user.id)

        # Herpetoverse reptiles/amphibians (the `animals` table). Included
        # unconditionally so a keeper who uses both apps gets one complete
        # export, and an HV-only keeper's export isn't empty.
        animals = _get_user_animals(db, user.id)
        a_ids = [a.id for a in animals]

        # Colony mode (ADR-010) — population entries + their event log.
        colonies = _get_colonies(db, user.id)
        c_ids = [c.id for c in colonies]

        return {
            "profile": _row_to_dict(user, USER_PROFILE_FIELDS),
            "tarantulas": [_row_to_dict(t, TARANTULA_FIELDS) for t in tarantulas],
            "inverts": [_row_to_dict(i, INVERT_FIELDS) for i in inverts],
            "feeding_logs": [_row_to_dict(f, FEEDING_FIELDS) for f in _get_feeding_logs(db, user.id)],
            "molt_logs": [_row_to_dict(m, MOLT_FIELDS) for m in _get_molt_logs(db, user.id)],
            "substrate_changes": [_row_to_dict(s, SUBSTRATE_CHANGE_FIELDS) for s in _get_substrate_changes(db, user.id)],
            "photos": [_row_to_dict(p, PHOTO_FIELDS) for p in _get_photos(db, user.id)],
            "enclosures": [_row_to_dict(e, ENCLOSURE_FIELDS) for e in _get_enclosures(db, user.id)],
            "pairings": [_row_to_dict(p, PAIRING_FIELDS) for p in _get_pairings(db, user.id)],
            "egg_sacs": [_row_to_dict(e, EGG_SAC_FIELDS) for e in _get_egg_sacs(db, user.id)],
            "offspring": [_row_to_dict(o, OFFSPRING_FIELDS) for o in _get_offspring(db, user.id)],
            # --- Herpetoverse ---
            "animals": [_row_to_dict(a, ANIMAL_FIELDS) for a in animals],
            "animal_feeding_logs": [_row_to_dict(f, FEEDING_FIELDS) for f in _get_animal_feeding_logs(db, a_ids)],
            "shed_logs": [_row_to_dict(s, SHED_FIELDS) for s in _get_shed_logs(db, a_ids)],
            "weight_logs": [_row_to_dict(w, WEIGHT_FIELDS) for w in _get_weight_logs(db, a_ids)],
            "genotypes": [_row_to_dict(g, GENOTYPE_FIELDS) for g in _get_genotypes(db, a_ids)],
            "animal_photos": [_row_to_dict(p, PHOTO_FIELDS) for p in _get_animal_photos(db, a_ids)],
            "reptile_pairings": [_row_to_dict(p, REPTILE_PAIRING_FIELDS) for p in _get_reptile_pairings(db, user.id)],
            "clutches": [_row_to_dict(c, CLUTCH_FIELDS) for c in _get_clutches(db, user.id)],
            "reptile_offspring": [_row_to_dict(o, REPTILE_OFFSPRING_FIELDS) for o in _get_reptile_offspring(db, user.id)],
            # --- Herpetoverse feeder stock (ADR-012) ---
            "hv_feeder_stocks": [_hv_feeder_stock_dict(s) for s in _get_hv_feeder_stocks(db, user.id)],
            "hv_feeder_logs": [_row_to_dict(lg, HV_FEEDER_LOG_FIELDS) for lg in _get_hv_feeder_logs(db, user.id)],
            # --- Tarantuverse feeder colonies ---
            "feeder_colonies": [_feeder_colony_dict(c) for c in _get_feeder_colonies(db, user.id)],
            "feeder_care_logs": [_row_to_dict(lg, FEEDER_CARE_LOG_FIELDS) for lg in _get_feeder_care_logs(db, user.id)],
            # --- Colony mode (ADR-010) ---
            "colonies": [_row_to_dict(c, COLONY_FIELDS) for c in colonies],
            "colony_events": [_row_to_dict(e, COLONY_EVENT_FIELDS) for e in _get_colony_events(db, c_ids)],
            # --- Hydration (car_20260909) ---
            "care_logs": [_row_to_dict(c, CARE_LOG_FIELDS) for c in _get_care_logs(db, user.id)],
        }

    # ---- JSON export ----------------------------------------------------

    @staticmethod
    def export_json(db: Session, user: User) -> bytes:
        """Return a complete JSON export of all user data."""
        data = ExportService._gather(db, user)

        envelope = {
            "export_version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "platform": "tarantuverse",
            # Exports keep storage units, whatever the keeper displays.
            "units": EXPORT_UNITS,
            "user": data["profile"],
            # `inverts` is the complete animal list across all eleven taxa.
            # `tarantulas` is the legacy tarantula-only view of the same rows,
            # retained for consumers written before the multi-taxon move.
            "inverts": data["inverts"],
            "tarantulas": data["tarantulas"],
            "feeding_logs": data["feeding_logs"],
            "molt_logs": data["molt_logs"],
            "substrate_changes": data["substrate_changes"],
            "care_logs": data["care_logs"],
            "photos": data["photos"],
            "enclosures": data["enclosures"],
            "breeding": {
                "pairings": data["pairings"],
                "egg_sacs": data["egg_sacs"],
                "offspring": data["offspring"],
            },
            # Herpetoverse reptile/amphibian data
            "animals": data["animals"],
            "animal_feeding_logs": data["animal_feeding_logs"],
            "shed_logs": data["shed_logs"],
            "weight_logs": data["weight_logs"],
            "genotypes": data["genotypes"],
            "animal_photos": data["animal_photos"],
            "reptile_breeding": {
                "pairings": data["reptile_pairings"],
                "clutches": data["clutches"],
                "offspring": data["reptile_offspring"],
            },
            # Herpetoverse feeder stock (live colonies + frozen inventory)
            "hv_feeders": {
                "stocks": data["hv_feeder_stocks"],
                "logs": data["hv_feeder_logs"],
            },
            # Tarantuverse feeder colonies (crickets, roaches, ...) + care logs.
            # .get(): callers that build `data` by hand may predate them.
            "feeders": {
                "colonies": data.get("feeder_colonies") or [],
                "care_logs": data.get("feeder_care_logs") or [],
            },
            # Colony mode (ADR-010) population entries + their event log
            "colonies": data["colonies"],
            "colony_events": data["colony_events"],
            "counts": {
                "inverts": len(data["inverts"]),
                "tarantulas": len(data["tarantulas"]),
                "feeding_logs": len(data["feeding_logs"]),
                "molt_logs": len(data["molt_logs"]),
                "substrate_changes": len(data["substrate_changes"]),
                "photos": len(data["photos"]),
                "enclosures": len(data["enclosures"]),
                "pairings": len(data["pairings"]),
                "egg_sacs": len(data["egg_sacs"]),
                "offspring": len(data["offspring"]),
                "animals": len(data["animals"]),
                "animal_feeding_logs": len(data["animal_feeding_logs"]),
                "shed_logs": len(data["shed_logs"]),
                "weight_logs": len(data["weight_logs"]),
                "genotypes": len(data["genotypes"]),
                "animal_photos": len(data["animal_photos"]),
                "reptile_pairings": len(data["reptile_pairings"]),
                "clutches": len(data["clutches"]),
                "reptile_offspring": len(data["reptile_offspring"]),
                "hv_feeder_stocks": len(data["hv_feeder_stocks"]),
                "hv_feeder_logs": len(data["hv_feeder_logs"]),
                "feeder_colonies": len(data.get("feeder_colonies") or []),
                "feeder_care_logs": len(data.get("feeder_care_logs") or []),
                "colonies": len(data["colonies"]),
                "colony_events": len(data["colony_events"]),
                "care_logs": len(data["care_logs"]),
            },
        }

        return json.dumps(envelope, indent=2, default=str).encode("utf-8")

    # ---- CSV export (one CSV per data type) -----------------------------

    @staticmethod
    def _to_csv_bytes(rows: List[Dict[str, Any]], fields: List[str]) -> bytes:
        """Write a list of dicts to CSV bytes using the given column order."""
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return buf.getvalue().encode("utf-8")

    @staticmethod
    def export_csv_zip(db: Session, user: User) -> bytes:
        """Return a ZIP file containing one CSV per data type."""
        data = ExportService._gather(db, user)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Every animal, every taxon. Written first because for most
            # keepers this is now the file they actually want.
            zf.writestr("animals_all_taxa.csv", ExportService._to_csv_bytes(data["inverts"], INVERT_FIELDS))
            zf.writestr("tarantulas.csv", ExportService._to_csv_bytes(data["tarantulas"], TARANTULA_FIELDS))
            zf.writestr("feeding_logs.csv", ExportService._to_csv_bytes(data["feeding_logs"], FEEDING_FIELDS))
            zf.writestr("molt_logs.csv", ExportService._to_csv_bytes(data["molt_logs"], MOLT_FIELDS))
            zf.writestr("substrate_changes.csv", ExportService._to_csv_bytes(data["substrate_changes"], SUBSTRATE_CHANGE_FIELDS))
            zf.writestr("care_logs.csv", ExportService._to_csv_bytes(data["care_logs"], CARE_LOG_FIELDS))
            zf.writestr("photos.csv", ExportService._to_csv_bytes(data["photos"], PHOTO_FIELDS))
            zf.writestr("enclosures.csv", ExportService._to_csv_bytes(data["enclosures"], ENCLOSURE_FIELDS))
            zf.writestr("pairings.csv", ExportService._to_csv_bytes(data["pairings"], PAIRING_FIELDS))
            zf.writestr("egg_sacs.csv", ExportService._to_csv_bytes(data["egg_sacs"], EGG_SAC_FIELDS))
            zf.writestr("offspring.csv", ExportService._to_csv_bytes(data["offspring"], OFFSPRING_FIELDS))

            # Herpetoverse reptile CSVs — only written when the keeper has
            # reptile data, so a tarantula-only export stays uncluttered.
            if data["animals"]:
                zf.writestr("animals.csv", ExportService._to_csv_bytes(data["animals"], ANIMAL_FIELDS))
                zf.writestr("animal_feeding_logs.csv", ExportService._to_csv_bytes(data["animal_feeding_logs"], FEEDING_FIELDS))
                zf.writestr("shed_logs.csv", ExportService._to_csv_bytes(data["shed_logs"], SHED_FIELDS))
                zf.writestr("weight_logs.csv", ExportService._to_csv_bytes(data["weight_logs"], WEIGHT_FIELDS))
                zf.writestr("genotypes.csv", ExportService._to_csv_bytes(data["genotypes"], GENOTYPE_FIELDS))
                zf.writestr("animal_photos.csv", ExportService._to_csv_bytes(data["animal_photos"], PHOTO_FIELDS))
            if data["reptile_pairings"] or data["clutches"] or data["reptile_offspring"]:
                zf.writestr("reptile_pairings.csv", ExportService._to_csv_bytes(data["reptile_pairings"], REPTILE_PAIRING_FIELDS))
                zf.writestr("clutches.csv", ExportService._to_csv_bytes(data["clutches"], CLUTCH_FIELDS))
                zf.writestr("reptile_offspring.csv", ExportService._to_csv_bytes(data["reptile_offspring"], REPTILE_OFFSPRING_FIELDS))

            # Herpetoverse feeder stock — only when the keeper has any.
            if data["hv_feeder_stocks"]:
                zf.writestr("hv_feeder_stocks.csv", ExportService._to_csv_bytes(data["hv_feeder_stocks"], HV_FEEDER_STOCK_FIELDS))
                zf.writestr("hv_feeder_logs.csv", ExportService._to_csv_bytes(data["hv_feeder_logs"], HV_FEEDER_LOG_FIELDS))

            # Tarantuverse feeder colonies — only when the keeper has any.
            if data.get("feeder_colonies"):
                zf.writestr("feeder_colonies.csv", ExportService._to_csv_bytes(data["feeder_colonies"], FEEDER_COLONY_FIELDS))
                zf.writestr("feeder_care_logs.csv", ExportService._to_csv_bytes(data.get("feeder_care_logs") or [], FEEDER_CARE_LOG_FIELDS))

            # Colony mode CSVs — only when the keeper has colonies.
            if data["colonies"]:
                zf.writestr("colonies.csv", ExportService._to_csv_bytes(data["colonies"], COLONY_FIELDS))
                zf.writestr("colony_events.csv", ExportService._to_csv_bytes(data["colony_events"], COLONY_EVENT_FIELDS))

            # Include user profile as JSON (not tabular)
            zf.writestr("profile.json", json.dumps(data["profile"], indent=2, default=str))

            # Include a README
            zf.writestr("README.txt", _CSV_ZIP_README)

        return buf.getvalue()

    # ---- Full ZIP bundle (data + photos) --------------------------------

    @staticmethod
    async def export_full_zip(db: Session, user: User, fetch_photo=None) -> bytes:
        """
        Return a complete ZIP: one folder per animal of EVERY taxon, one per
        colony, one per Herpetoverse animal, each with its logs and its
        downloaded photos, plus collection-wide CSVs.

        Until 2026-10-07 this walked the legacy `tarantulas` table only, so a
        mantis, scorpion or isopod keeper's "complete backup" held none of
        their animals or photos. It now walks `inverts` (which includes the
        tarantulas, ADR-005). `fetch_photo(url) -> bytes | None` is injectable
        for tests.
        """
        data = ExportService._gather(db, user)
        return await build_full_zip(data, user.username, fetch_photo)

    @staticmethod
    async def export_full_zip_file(db: Session, user: User):
        """Same backup, written to a spooled temp file (in memory up to 16 MB,
        then disk) so a large collection's photos never sit in RAM all at
        once on the 512 MB instance. The caller streams it and closes it."""
        import tempfile
        data = ExportService._gather(db, user)
        spool = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024)
        try:
            await build_full_zip(data, user.username, out=spool)
        except Exception:
            spool.close()
            raise
        spool.seek(0)
        return spool


TAXON_FOLDERS = {
    "tarantula": "tarantulas", "scorpion": "scorpions", "centipede": "centipedes",
    "whip_spider": "whip_spiders", "vinegaroon": "vinegaroons", "true_spider": "true_spiders",
    "millipede": "millipedes", "mantis": "mantids", "roach": "roaches", "isopod": "isopods",
    "other": "other_animals",
}


def _group(items: List[Dict], *keys: str) -> Dict[str, List[Dict]]:
    """Group rows by the first of `keys` that is set. A dual-written
    tarantula log carries both invert_id and tarantula_id with the same
    value (shared primary keys), so it lands once."""
    grouped: Dict[str, List[Dict]] = {}
    for item in items:
        parent = next((item.get(k) for k in keys if item.get(k)), None)
        if parent:
            grouped.setdefault(str(parent), []).append(item)
    return grouped


def _folder_name(row: Dict, fallback_prefix: str) -> str:
    rid = str(row["id"])
    slug = (row.get("name") or row.get("common_name") or row.get("scientific_name") or rid)[:40]
    safe = "".join(c if c.isalnum() or c in " _-" else "_" for c in slug).strip() or fallback_prefix
    return f"{safe}_{rid[:8]}"


def _photo_ext(url: str) -> str:
    tail = url.split("?", 1)[0].rsplit("/", 1)[-1]
    ext = tail.rsplit(".", 1)[-1].lower() if "." in tail else ""
    return ext if ext in {"jpg", "jpeg", "png", "gif", "webp"} else "jpg"


# A stored photo is at most a 2560 px re-encode; anything far larger isn't ours.
MAX_EXPORT_PHOTO_BYTES = 25 * 1024 * 1024


def _is_our_photo_url(url: str, base: str) -> bool:
    """Only fetch from our own storage bucket. `photos.url` is written by the
    server, but the export must never become a way to make the API fetch an
    arbitrary address (SSRF)."""
    base = (base or "").rstrip("/")
    return bool(base) and base.startswith("https://") and url.startswith(base + "/")


async def build_full_zip(data: Dict[str, Any], username: str, fetch_photo=None, out=None) -> Optional[bytes]:
    """The full backup, from already-gathered export data (pure but for
    `fetch_photo`, so it can be tested without a database or network).
    Writes to `out` (a binary file object) when given and returns None;
    otherwise returns the ZIP bytes."""
    client: Optional[httpx.AsyncClient] = None
    if fetch_photo is None:
        from app.config import settings
        storage_base = settings.R2_PUBLIC_URL
        client = httpx.AsyncClient(timeout=15.0, follow_redirects=False)

        async def fetch_photo(url: str) -> Optional[bytes]:
            if not _is_our_photo_url(url, storage_base):
                return None
            resp = await client.get(url)
            if resp.status_code != 200 or len(resp.content) > MAX_EXPORT_PHOTO_BYTES:
                return None
            return resp.content

    async def add_photos(zf: zipfile.ZipFile, folder: str, photos: List[Dict]) -> None:
        for photo in photos:
            url = photo.get("url")
            if not url:
                continue
            try:
                body = await fetch_photo(url)
            except Exception:
                body = None  # one unreachable photo never sinks the backup
            if body:
                zf.writestr(f"{folder}/photos/{str(photo['id'])[:8]}.{_photo_ext(url)}", body)

    by_parent = ("invert_id", "tarantula_id")
    feedings = _group(data["feeding_logs"], *by_parent)
    molts = _group(data["molt_logs"], *by_parent)
    substrates = _group(data["substrate_changes"], *by_parent)
    photos = _group(data["photos"], *by_parent)
    care = _group(data["care_logs"], "invert_id")
    colony_feedings = _group(data["feeding_logs"], "colony_id")
    colony_molts = _group(data["molt_logs"], "colony_id")
    colony_substrates = _group(data["substrate_changes"], "colony_id")
    colony_photos = _group(data["photos"], "colony_id")
    colony_care = _group(data["care_logs"], "colony_id")
    colony_events = _group(data["colony_events"], "colony_id")
    legacy_tarantulas = {str(t["id"]): t for t in data["tarantulas"]}

    a_feedings = _group(data["animal_feeding_logs"], "animal_id")
    sheds_by_a = _group(data["shed_logs"], "animal_id")
    weights_by_a = _group(data["weight_logs"], "animal_id")
    genos_by_a = _group(data["genotypes"], "animal_id")
    a_photos = _group(data["animal_photos"], "animal_id")

    buf = out if out is not None else io.BytesIO()
    try:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("metadata.json", json.dumps({
                "export_version": "2.0",
                "exported_at": datetime.utcnow().isoformat(),
                "platform": "tarantuverse",
                "username": username,
                # Exports keep storage units, whatever the keeper displays.
                "units": EXPORT_UNITS,
            }, indent=2))
            zf.writestr("profile.json", json.dumps(data["profile"], indent=2, default=str))

            # One folder per animal, grouped by taxon. Tarantulas keep their
            # old `tarantulas/` path. The legacy row is merged UNDER the
            # unified one so no tarantula-only field is lost.
            for inv in data["inverts"]:
                iid = str(inv["id"])
                taxon = inv.get("taxon") or "other"
                folder = f"{TAXON_FOLDERS.get(taxon, 'other_animals')}/{_folder_name(inv, taxon)}"
                bundle = {
                    **legacy_tarantulas.get(iid, {}),
                    **inv,
                    "feeding_logs": feedings.get(iid, []),
                    "molt_logs": molts.get(iid, []),
                    "substrate_changes": substrates.get(iid, []),
                    "care_logs": care.get(iid, []),
                    "photos": photos.get(iid, []),
                }
                zf.writestr(f"{folder}/data.json", json.dumps(bundle, indent=2, default=str))
                await add_photos(zf, folder, photos.get(iid, []))

            # Colonies (ADR-010): their own folders, events and photos inlined.
            for col in data["colonies"]:
                cid = str(col["id"])
                folder = f"colonies/{_folder_name(col, 'colony')}"
                bundle = {
                    **col,
                    "events": colony_events.get(cid, []),
                    "feeding_logs": colony_feedings.get(cid, []),
                    "molt_logs": colony_molts.get(cid, []),
                    "substrate_changes": colony_substrates.get(cid, []),
                    "care_logs": colony_care.get(cid, []),
                    "photos": colony_photos.get(cid, []),
                }
                zf.writestr(f"{folder}/data.json", json.dumps(bundle, indent=2, default=str))
                await add_photos(zf, folder, colony_photos.get(cid, []))

            # Herpetoverse reptiles/amphibians.
            for a in data["animals"]:
                aid = str(a["id"])
                folder = f"animals/{_folder_name(a, 'animal')}"
                bundle = {
                    **a,
                    "feeding_logs": a_feedings.get(aid, []),
                    "shed_logs": sheds_by_a.get(aid, []),
                    "weight_logs": weights_by_a.get(aid, []),
                    "genotypes": genos_by_a.get(aid, []),
                    "photos": a_photos.get(aid, []),
                }
                zf.writestr(f"{folder}/data.json", json.dumps(bundle, indent=2, default=str))
                await add_photos(zf, folder, a_photos.get(aid, []))

            reptile_breeding = {
                "pairings": data["reptile_pairings"],
                "clutches": data["clutches"],
                "offspring": data["reptile_offspring"],
            }
            if any(reptile_breeding.values()):
                zf.writestr("reptile_breeding.json", json.dumps(reptile_breeding, indent=2, default=str))

            # Herpetoverse feeder stock: one file, each stock with its logs.
            # .get(): callers that build `data` by hand may predate feeders.
            hv_stocks = data.get("hv_feeder_stocks") or []
            if hv_stocks:
                logs_by_stock = _group(data.get("hv_feeder_logs") or [], "hv_feeder_stock_id")
                zf.writestr("hv_feeders.json", json.dumps(
                    [{**s, "logs": logs_by_stock.get(str(s["id"]), [])} for s in hv_stocks],
                    indent=2, default=str,
                ))
                zf.writestr("all_hv_feeder_stocks.csv", ExportService._to_csv_bytes(hv_stocks, HV_FEEDER_STOCK_FIELDS))
                zf.writestr("all_hv_feeder_logs.csv", ExportService._to_csv_bytes(data.get("hv_feeder_logs") or [], HV_FEEDER_LOG_FIELDS))

            # Tarantuverse feeder colonies: one file, each colony with its logs.
            feeder_colonies = data.get("feeder_colonies") or []
            if feeder_colonies:
                logs_by_colony = _group(data.get("feeder_care_logs") or [], "feeder_colony_id")
                zf.writestr("feeders.json", json.dumps(
                    [{**c, "care_logs": logs_by_colony.get(str(c["id"]), [])} for c in feeder_colonies],
                    indent=2, default=str,
                ))
                zf.writestr("all_feeder_colonies.csv", ExportService._to_csv_bytes(feeder_colonies, FEEDER_COLONY_FIELDS))
                zf.writestr("all_feeder_care_logs.csv", ExportService._to_csv_bytes(data.get("feeder_care_logs") or [], FEEDER_CARE_LOG_FIELDS))
            if data["enclosures"]:
                zf.writestr("enclosures.json", json.dumps(data["enclosures"], indent=2, default=str))
            breeding = {
                "pairings": data["pairings"],
                "egg_sacs": data["egg_sacs"],
                "offspring": data["offspring"],
            }
            if any(breeding.values()):
                zf.writestr("breeding.json", json.dumps(breeding, indent=2, default=str))

            # Collection-wide CSVs for spreadsheet users.
            zf.writestr("all_animals.csv", ExportService._to_csv_bytes(data["inverts"], INVERT_FIELDS))
            zf.writestr("all_feeding_logs.csv", ExportService._to_csv_bytes(data["feeding_logs"], FEEDING_FIELDS))
            zf.writestr("all_molt_logs.csv", ExportService._to_csv_bytes(data["molt_logs"], MOLT_FIELDS))
            zf.writestr("all_substrate_changes.csv", ExportService._to_csv_bytes(data["substrate_changes"], SUBSTRATE_CHANGE_FIELDS))
            zf.writestr("all_care_logs.csv", ExportService._to_csv_bytes(data["care_logs"], CARE_LOG_FIELDS))
            if data["colonies"]:
                zf.writestr("all_colonies.csv", ExportService._to_csv_bytes(data["colonies"], COLONY_FIELDS))

            zf.writestr("README.txt", _FULL_ZIP_README)
    finally:
        if client is not None:
            await client.aclose()

    return None if out is not None else buf.getvalue()


# ---------------------------------------------------------------------------
# README contents for ZIP exports
# ---------------------------------------------------------------------------

_CSV_ZIP_README = """Tarantuverse Data Export (CSV)
==============================
Exported from https://tarantuverse.com

This archive contains your data in CSV format. Each file can be opened
in Excel, Google Sheets, or any spreadsheet application.

Files included:
  tarantulas.csv        – Your tarantula collection
  feeding_logs.csv      – All feeding records
  molt_logs.csv         – All molt records
  substrate_changes.csv – All substrate change records
  care_logs.csv         – Water dish, overflow and misting records
  photos.csv            – Photo metadata (URLs, captions, dates)
  enclosures.csv        – Enclosure information
  pairings.csv          – Breeding pairing records
  egg_sacs.csv          – Egg sac tracking records
  offspring.csv         – Offspring records
  colonies.csv          – Colony/population records (if any)
  colony_events.csv     – Colony population events (if any)
  hv_feeder_stocks.csv  – Herpetoverse feeder stock, live and frozen (if any)
  hv_feeder_logs.csv    – Feeder restock / used / cleaned records (if any)
  feeder_colonies.csv   – Feeder colonies: crickets, roaches, ... (if any)
  feeder_care_logs.csv  – Feeder colony care / restock records (if any)
  profile.json          – Your profile information

Units: every number is in the units it is stored in, whatever your
Settings > Units choice is. Lengths are in inches (molt leg span / body
length), except fields ending in _mm, which are millimetres. Temperatures
are in degrees Fahrenheit. Weights are in grams.

To re-import your tarantulas into Tarantuverse, use the Import feature
in Dashboard > Collection > Import and upload tarantulas.csv.

Questions? Contact support@tarantuverse.com
"""

_FULL_ZIP_README = """Tarantuverse Complete Backup
============================
Exported from https://tarantuverse.com

This archive contains your complete Tarantuverse data including photos.

Structure:
  metadata.json               – Export timestamp and version info
  profile.json                – Your profile information
  tarantulas/, scorpions/, mantids/, true_spiders/, isopods/, ...
    <name>_<id>/
      data.json               – The animal + all its logs + photo metadata
      photos/
        <photo-id>.jpg        – Downloaded photo files
  colonies/<name>_<id>/       – Each colony with its events, logs and photos
  animals/<name>_<id>/        – Herpetoverse reptiles and amphibians (if any)
  enclosures.json             – Enclosure data (if any)
  breeding.json               – Pairings, egg sacs, offspring (if any)
  reptile_breeding.json       – Reptile pairings, clutches, offspring (if any)
  hv_feeders.json             – Herpetoverse feeder stock with its logs (if any)
  feeders.json                – Feeder colonies with their care logs (if any)
  all_animals.csv             – Every animal, every taxon, in one sheet
  all_feeding_logs.csv        – Feeding logs in spreadsheet format
  all_molt_logs.csv           – Molt logs in spreadsheet format
  all_substrate_changes.csv   – Substrate changes in spreadsheet format
  all_care_logs.csv           – Water, overflow and misting records
  all_colonies.csv            – Colonies (if any)
  all_hv_feeder_stocks.csv    – Herpetoverse feeder stock (if any)
  all_hv_feeder_logs.csv      – Feeder stock logs (if any)
  all_feeder_colonies.csv     – Feeder colonies (if any)
  all_feeder_care_logs.csv    – Feeder colony care logs (if any)

Units: every number is in the units it is stored in, whatever your
Settings > Units choice is. Lengths are in inches (molt leg span / body
length), except fields ending in _mm, which are millimetres. Temperatures
are in degrees Fahrenheit. Weights are in grams.

To re-import your animals into Tarantuverse, use the Import feature in
Dashboard > Collection > Import and upload all_animals.csv.

Questions? Contact support@tarantuverse.com
"""
