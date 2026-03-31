"""
System settings service with in-memory cache.

Settings are read frequently (every request for maintenance mode, feature
flags, etc.) but written rarely (only when an admin changes something).
An in-memory dict avoids a DB round-trip on every request.  The cache
is invalidated whenever a setting is updated.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.system_setting import SystemSetting

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory cache  (process-local, invalidated on write)
# ---------------------------------------------------------------------------
_cache: Dict[str, Dict[str, Any]] = {}
_cache_loaded: bool = False


def _coerce(raw_value: str, value_type: str) -> Any:
    """Convert the stored string to a typed Python value."""
    if value_type == "bool":
        return raw_value.lower() in ("true", "1", "yes")
    if value_type == "int":
        return int(raw_value)
    if value_type == "float":
        return float(raw_value)
    if value_type == "json":
        return json.loads(raw_value)
    return raw_value  # string


def _to_raw(value: Any, value_type: str) -> str:
    """Convert a Python value back to a storage string."""
    if value_type == "bool":
        return "true" if value else "false"
    if value_type == "json":
        return json.dumps(value)
    return str(value)


# ---------------------------------------------------------------------------
# Cache management
# ---------------------------------------------------------------------------

def _load_cache(db: Session) -> None:
    """Load all settings into the process-local cache."""
    global _cache, _cache_loaded
    rows = db.query(SystemSetting).all()
    _cache = {
        row.key: {
            "value": _coerce(row.value, row.value_type),
            "raw": row.value,
            "value_type": row.value_type,
            "category": row.category,
            "label": row.label,
            "description": row.description,
            "is_sensitive": row.is_sensitive,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    }
    _cache_loaded = True
    logger.info(f"[settings] Loaded {len(_cache)} settings into cache")


def invalidate_cache() -> None:
    """Force the next read to reload from DB."""
    global _cache_loaded
    _cache_loaded = False


def _ensure_cache(db: Session) -> None:
    if not _cache_loaded:
        _load_cache(db)


# ---------------------------------------------------------------------------
# Public read API
# ---------------------------------------------------------------------------

def get(db: Session, key: str, default: Any = None) -> Any:
    """Get a single setting value by key (typed)."""
    _ensure_cache(db)
    entry = _cache.get(key)
    if entry is None:
        return default
    return entry["value"]


def get_all(db: Session) -> Dict[str, Any]:
    """Return all settings grouped by category (for admin UI)."""
    _ensure_cache(db)
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for key, entry in _cache.items():
        cat = entry["category"]
        grouped.setdefault(cat, []).append({
            "key": key,
            "value": entry["raw"],
            "value_type": entry["value_type"],
            "label": entry["label"],
            "description": entry["description"],
            "is_sensitive": entry["is_sensitive"],
            "updated_at": entry["updated_at"],
        })
    return grouped


def get_by_category(db: Session, category: str) -> List[Dict[str, Any]]:
    """Return settings for a specific category."""
    all_settings = get_all(db)
    return all_settings.get(category, [])


# ---------------------------------------------------------------------------
# Public write API (admin only — caller must verify)
# ---------------------------------------------------------------------------

def update(db: Session, key: str, new_value: Any, admin_id: Optional[UUID] = None) -> Dict[str, Any]:
    """
    Update a single setting. Returns the updated entry dict.
    Raises ValueError if the key doesn't exist.
    """
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row is None:
        raise ValueError(f"Unknown setting key: {key}")

    row.value = _to_raw(new_value, row.value_type)
    row.updated_by_id = admin_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)

    invalidate_cache()
    logger.info(f"[settings] Updated {key} = {row.value} (by {admin_id})")

    return {
        "key": row.key,
        "value": row.value,
        "value_type": row.value_type,
        "label": row.label,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def bulk_update(
    db: Session,
    updates: Dict[str, Any],
    admin_id: Optional[UUID] = None,
) -> List[Dict[str, Any]]:
    """
    Update multiple settings at once. Returns list of updated entries.
    Raises ValueError if any key is unknown.
    """
    results = []
    for key, new_value in updates.items():
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row is None:
            raise ValueError(f"Unknown setting key: {key}")
        row.value = _to_raw(new_value, row.value_type)
        row.updated_by_id = admin_id
        row.updated_at = datetime.now(timezone.utc)
        results.append({
            "key": row.key,
            "value": row.value,
            "value_type": row.value_type,
            "label": row.label,
        })

    db.commit()
    invalidate_cache()
    logger.info(f"[settings] Bulk-updated {len(results)} settings (by {admin_id})")
    return results


# ---------------------------------------------------------------------------
# Convenience helpers for hot-path checks
# ---------------------------------------------------------------------------

def is_maintenance_mode(db: Session) -> bool:
    return get(db, "maintenance.enabled", False)


def get_maintenance_message(db: Session) -> str:
    return get(db, "maintenance.message", "We'll be back shortly!")


def is_feature_enabled(db: Session, feature: str) -> bool:
    """Check a feature flag. feature = 'breeding', 'forums', etc."""
    return get(db, f"feature.{feature}_enabled", True)


def get_free_tier_limit(db: Session, limit_key: str) -> int:
    """Get a platform limit. limit_key = 'free_max_tarantulas', etc."""
    return get(db, f"limits.{limit_key}", 15)
