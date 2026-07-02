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
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.substrate_change import SubstrateChange
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

FEEDING_FIELDS = [
    "id", "tarantula_id", "animal_id", "enclosure_id", "fed_at", "food_type",
    "food_size", "quantity", "accepted", "notes", "created_at",
]

MOLT_FIELDS = [
    "id", "tarantula_id", "enclosure_id", "molted_at", "premolt_started_at",
    "is_unidentified", "leg_span_before", "leg_span_after",
    "weight_before", "weight_after", "notes", "image_url", "created_at",
]

SUBSTRATE_CHANGE_FIELDS = [
    "id", "tarantula_id", "enclosure_id", "changed_at", "substrate_type",
    "substrate_depth", "reason", "notes", "created_at",
]

PHOTO_FIELDS = [
    "id", "tarantula_id", "animal_id", "url", "thumbnail_url", "caption",
    "taken_at", "created_at",
]

ENCLOSURE_FIELDS = [
    "id", "user_id", "name", "is_communal", "species_id", "population_count",
    "enclosure_type", "enclosure_size", "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "misting_schedule", "last_enclosure_cleaning", "notes", "photo_url",
    "created_at", "updated_at",
]

PAIRING_FIELDS = [
    "id", "user_id", "male_id", "female_id", "paired_date", "separated_date",
    "pairing_type", "outcome", "notes", "created_at",
]

EGG_SAC_FIELDS = [
    "id", "pairing_id", "user_id", "laid_date", "pulled_date", "hatch_date",
    "incubation_temp_min", "incubation_temp_max",
    "incubation_humidity_min", "incubation_humidity_max",
    "spiderling_count", "viable_count", "notes", "photo_url", "created_at",
]

OFFSPRING_FIELDS = [
    "id", "egg_sac_id", "user_id", "tarantula_id", "status", "status_date",
    "buyer_info", "price_sold", "notes", "created_at",
]

COLONY_FIELDS = [
    "id", "user_id", "taxon", "species_id", "enclosure_id", "name",
    "date_acquired", "founded_date", "source", "stage_counts",
    "count_is_estimated", "substrate_type", "substrate_depth",
    "last_substrate_change", "target_temp_min", "target_temp_max",
    "target_humidity_min", "target_humidity_max", "water_dish",
    "notes", "photo_url", "visibility", "is_active", "transferred_out_at",
    "created_at", "updated_at",
]

COLONY_EVENT_FIELDS = [
    "id", "colony_id", "user_id", "event_type", "stage", "count_delta",
    "occurred_at", "severity", "notes", "created_at",
]

USER_PROFILE_FIELDS = [
    "id", "email", "username", "display_name", "avatar_url", "bio",
    "profile_bio", "profile_location", "profile_experience_level",
    "profile_years_keeping", "profile_specialties", "social_links",
    "is_breeder", "collection_visibility", "created_at",
]

# --- Herpetoverse (reptile/amphibian) field lists ---

ANIMAL_FIELDS = [
    "id", "user_id", "herp_species_id", "enclosure_id", "taxon", "name",
    "common_name", "scientific_name", "sex", "date_acquired", "hatch_date",
    "source", "source_breeder", "price_paid", "current_weight_g",
    "current_length_in", "feeding_schedule", "last_fed_at", "last_shed_at",
    "brumation_active", "brumation_started_at", "feeding_paused_reason",
    "feeding_paused_until", "feeds_on_cgd_override", "photo_url", "is_public",
    "visibility", "notes", "created_at", "updated_at",
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


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def _get_user_tarantulas(db: Session, user_id: UUID) -> List[Tarantula]:
    return db.query(Tarantula).filter(Tarantula.user_id == user_id).order_by(Tarantula.created_at).all()


def _get_tarantula_ids(tarantulas: List[Tarantula]) -> List[UUID]:
    return [t.id for t in tarantulas]


def _get_feeding_logs(db: Session, tarantula_ids: List[UUID]) -> List[FeedingLog]:
    if not tarantula_ids:
        return []
    return db.query(FeedingLog).filter(FeedingLog.tarantula_id.in_(tarantula_ids)).order_by(FeedingLog.fed_at).all()


def _get_molt_logs(db: Session, tarantula_ids: List[UUID]) -> List[MoltLog]:
    if not tarantula_ids:
        return []
    return db.query(MoltLog).filter(MoltLog.tarantula_id.in_(tarantula_ids)).order_by(MoltLog.molted_at).all()


def _get_substrate_changes(db: Session, tarantula_ids: List[UUID]) -> List[SubstrateChange]:
    if not tarantula_ids:
        return []
    return db.query(SubstrateChange).filter(SubstrateChange.tarantula_id.in_(tarantula_ids)).order_by(SubstrateChange.changed_at).all()


def _get_photos(db: Session, tarantula_ids: List[UUID]) -> List[Photo]:
    if not tarantula_ids:
        return []
    return db.query(Photo).filter(Photo.tarantula_id.in_(tarantula_ids)).order_by(Photo.created_at).all()


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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class ExportService:
    """Generates user-data exports in JSON, CSV, and ZIP formats."""

    # ---- gather all data once -------------------------------------------

    @staticmethod
    def _gather(db: Session, user: User) -> Dict[str, Any]:
        tarantulas = _get_user_tarantulas(db, user.id)
        t_ids = _get_tarantula_ids(tarantulas)

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
            "feeding_logs": [_row_to_dict(f, FEEDING_FIELDS) for f in _get_feeding_logs(db, t_ids)],
            "molt_logs": [_row_to_dict(m, MOLT_FIELDS) for m in _get_molt_logs(db, t_ids)],
            "substrate_changes": [_row_to_dict(s, SUBSTRATE_CHANGE_FIELDS) for s in _get_substrate_changes(db, t_ids)],
            "photos": [_row_to_dict(p, PHOTO_FIELDS) for p in _get_photos(db, t_ids)],
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
            # --- Colony mode (ADR-010) ---
            "colonies": [_row_to_dict(c, COLONY_FIELDS) for c in colonies],
            "colony_events": [_row_to_dict(e, COLONY_EVENT_FIELDS) for e in _get_colony_events(db, c_ids)],
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
            "user": data["profile"],
            "tarantulas": data["tarantulas"],
            "feeding_logs": data["feeding_logs"],
            "molt_logs": data["molt_logs"],
            "substrate_changes": data["substrate_changes"],
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
            # Colony mode (ADR-010) population entries + their event log
            "colonies": data["colonies"],
            "colony_events": data["colony_events"],
            "counts": {
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
                "colonies": len(data["colonies"]),
                "colony_events": len(data["colony_events"]),
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
            zf.writestr("tarantulas.csv", ExportService._to_csv_bytes(data["tarantulas"], TARANTULA_FIELDS))
            zf.writestr("feeding_logs.csv", ExportService._to_csv_bytes(data["feeding_logs"], FEEDING_FIELDS))
            zf.writestr("molt_logs.csv", ExportService._to_csv_bytes(data["molt_logs"], MOLT_FIELDS))
            zf.writestr("substrate_changes.csv", ExportService._to_csv_bytes(data["substrate_changes"], SUBSTRATE_CHANGE_FIELDS))
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
    async def export_full_zip(db: Session, user: User) -> bytes:
        """
        Return a comprehensive ZIP containing JSON data organized by
        tarantula plus downloaded photo files.
        """
        data = ExportService._gather(db, user)

        # Build lookup maps for logs by tarantula_id
        def _group_by_tid(items: List[Dict], key: str = "tarantula_id") -> Dict[str, List[Dict]]:
            grouped: Dict[str, List[Dict]] = {}
            for item in items:
                tid = item.get(key)
                if tid:
                    grouped.setdefault(tid, []).append(item)
            return grouped

        feedings_by_t = _group_by_tid(data["feeding_logs"])
        molts_by_t = _group_by_tid(data["molt_logs"])
        substrates_by_t = _group_by_tid(data["substrate_changes"])
        photos_by_t = _group_by_tid(data["photos"])

        # Reptile logs grouped by animal_id
        a_feedings = _group_by_tid(data["animal_feeding_logs"], "animal_id")
        sheds_by_a = _group_by_tid(data["shed_logs"], "animal_id")
        weights_by_a = _group_by_tid(data["weight_logs"], "animal_id")
        genos_by_a = _group_by_tid(data["genotypes"], "animal_id")
        a_photos = _group_by_tid(data["animal_photos"], "animal_id")

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Metadata
            meta = {
                "export_version": "1.0",
                "exported_at": datetime.utcnow().isoformat(),
                "platform": "tarantuverse",
                "username": user.username,
            }
            zf.writestr("metadata.json", json.dumps(meta, indent=2))
            zf.writestr("profile.json", json.dumps(data["profile"], indent=2, default=str))

            # Per-tarantula folders
            for t in data["tarantulas"]:
                tid = t["id"]
                slug = (t.get("name") or t.get("common_name") or tid)[:40]
                safe_slug = "".join(c if c.isalnum() or c in " _-" else "_" for c in slug).strip()
                folder = f"tarantulas/{safe_slug}_{tid[:8]}"

                # Tarantula data bundle
                t_bundle = {
                    **t,
                    "feeding_logs": feedings_by_t.get(tid, []),
                    "molt_logs": molts_by_t.get(tid, []),
                    "substrate_changes": substrates_by_t.get(tid, []),
                    "photos": photos_by_t.get(tid, []),
                }
                zf.writestr(f"{folder}/data.json", json.dumps(t_bundle, indent=2, default=str))

                # Download and include photos
                for photo in photos_by_t.get(tid, []):
                    url = photo.get("url")
                    if url:
                        try:
                            async with httpx.AsyncClient(timeout=15.0) as client:
                                resp = await client.get(url)
                                if resp.status_code == 200:
                                    ext = url.rsplit(".", 1)[-1][:4] if "." in url else "jpg"
                                    photo_id = photo["id"][:8]
                                    zf.writestr(
                                        f"{folder}/photos/{photo_id}.{ext}",
                                        resp.content,
                                    )
                        except Exception:
                            pass  # Skip photos that can't be downloaded

            # Per-animal folders (Herpetoverse reptiles/amphibians)
            for a in data["animals"]:
                aid = a["id"]
                slug = (a.get("name") or a.get("common_name") or aid)[:40]
                safe_slug = "".join(c if c.isalnum() or c in " _-" else "_" for c in slug).strip()
                folder = f"animals/{safe_slug}_{aid[:8]}"

                a_bundle = {
                    **a,
                    "feeding_logs": a_feedings.get(aid, []),
                    "shed_logs": sheds_by_a.get(aid, []),
                    "weight_logs": weights_by_a.get(aid, []),
                    "genotypes": genos_by_a.get(aid, []),
                    "photos": a_photos.get(aid, []),
                }
                zf.writestr(f"{folder}/data.json", json.dumps(a_bundle, indent=2, default=str))

                for photo in a_photos.get(aid, []):
                    url = photo.get("url")
                    if url:
                        try:
                            async with httpx.AsyncClient(timeout=15.0) as client:
                                resp = await client.get(url)
                                if resp.status_code == 200:
                                    ext = url.rsplit(".", 1)[-1][:4] if "." in url else "jpg"
                                    photo_id = photo["id"][:8]
                                    zf.writestr(f"{folder}/photos/{photo_id}.{ext}", resp.content)
                        except Exception:
                            pass

            # Reptile breeding
            reptile_breeding = {
                "pairings": data["reptile_pairings"],
                "clutches": data["clutches"],
                "offspring": data["reptile_offspring"],
            }
            if any(reptile_breeding.values()):
                zf.writestr("reptile_breeding.json", json.dumps(reptile_breeding, indent=2, default=str))

            # Enclosures
            if data["enclosures"]:
                zf.writestr("enclosures.json", json.dumps(data["enclosures"], indent=2, default=str))

            # Colony mode (ADR-010) — each colony with its event log inlined.
            if data["colonies"]:
                events_by_colony = _group_by_tid(data["colony_events"], "colony_id")
                colonies_bundle = [
                    {**c, "events": events_by_colony.get(c["id"], [])}
                    for c in data["colonies"]
                ]
                zf.writestr("colonies.json", json.dumps(colonies_bundle, indent=2, default=str))

            # Breeding
            breeding = {
                "pairings": data["pairings"],
                "egg_sacs": data["egg_sacs"],
                "offspring": data["offspring"],
            }
            if any(breeding.values()):
                zf.writestr("breeding.json", json.dumps(breeding, indent=2, default=str))

            # Full-collection CSVs for spreadsheet users
            zf.writestr("all_feeding_logs.csv", ExportService._to_csv_bytes(data["feeding_logs"], FEEDING_FIELDS))
            zf.writestr("all_molt_logs.csv", ExportService._to_csv_bytes(data["molt_logs"], MOLT_FIELDS))

            zf.writestr("README.txt", _FULL_ZIP_README)

        return buf.getvalue()


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
  photos.csv            – Photo metadata (URLs, captions, dates)
  enclosures.csv        – Enclosure information
  pairings.csv          – Breeding pairing records
  egg_sacs.csv          – Egg sac tracking records
  offspring.csv         – Offspring records
  colonies.csv          – Colony/population records (if any)
  colony_events.csv     – Colony population events (if any)
  profile.json          – Your profile information

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
  tarantulas/
    <name>_<id>/
      data.json               – Tarantula info + all logs + photo metadata
      photos/
        <photo-id>.jpg        – Downloaded photo files
  enclosures.json             – Enclosure data (if any)
  breeding.json               – Pairings, egg sacs, offspring (if any)
  all_feeding_logs.csv        – Feeding logs in spreadsheet format
  all_molt_logs.csv           – Molt logs in spreadsheet format

To re-import your tarantulas into Tarantuverse, use the Import feature
in Dashboard > Collection > Import and upload the JSON or CSV files.

Questions? Contact support@tarantuverse.com
"""
