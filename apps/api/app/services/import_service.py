"""
Import inference engine — turn any keeper's spreadsheet into mapped inverts.

Two phases:
  analyze(...)  -> parse a file/sheet, auto-map columns (header synonyms +
                   value inference), match species against the care-sheet
                   catalog, infer taxon, flag new-vs-duplicate rows, and return
                   a preview for the confirm screen. NO writes.
  normalize_rows(...) -> apply the (possibly user-corrected) mapping to every
                   row and return InvertCreate payloads + per-row status; the
                   router creates them via inverts.create_invert_row.

Design goals (see COMPETITIVE-BRIEF-2026-07): frictionless on a clean sheet,
flexible on a messy one, honest (nothing dropped silently — unmapped columns can
roll into notes), and multi-taxon on the unified `inverts` surface.
"""
import csv
import io
import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from sqlalchemy.orm import Session

from app.models.invert import Invert
from app.models.invert_species import InvertSpecies
from app.utils.limits import active_inverts_query

# Canonical taxa (keep in lockstep with models/invert.py INVERT_TAXON_VALUES).
TAXA = [
    "tarantula", "scorpion", "centipede", "whip_spider", "vinegaroon",
    "true_spider", "millipede", "mantis", "roach", "other",
]

# Target fields a column can map to, with a friendly label + coercion type.
# Order = display order on the confirm screen.
IMPORT_FIELDS: List[Dict[str, str]] = [
    {"field": "name", "label": "Name / nickname", "type": "str"},
    {"field": "scientific_name", "label": "Scientific name", "type": "str"},
    {"field": "common_name", "label": "Common name", "type": "str"},
    {"field": "taxon", "label": "Taxon (group)", "type": "taxon"},
    {"field": "sex", "label": "Sex", "type": "sex"},
    {"field": "life_stage", "label": "Life stage", "type": "life_stage"},
    {"field": "date_acquired", "label": "Date acquired", "type": "date"},
    {"field": "source", "label": "Source", "type": "source"},
    {"field": "price_paid", "label": "Price paid", "type": "decimal"},
    {"field": "enclosure_type", "label": "Enclosure type", "type": "enclosure_type"},
    {"field": "enclosure_size", "label": "Enclosure size", "type": "str"},
    {"field": "substrate_type", "label": "Substrate", "type": "str"},
    {"field": "substrate_depth", "label": "Substrate depth", "type": "str"},
    {"field": "target_temp_min", "label": "Temp min (°F)", "type": "decimal"},
    {"field": "target_temp_max", "label": "Temp max (°F)", "type": "decimal"},
    {"field": "target_humidity_min", "label": "Humidity min (%)", "type": "decimal"},
    {"field": "target_humidity_max", "label": "Humidity max (%)", "type": "decimal"},
    {"field": "notes", "label": "Notes", "type": "str"},
]
FIELD_TYPE = {f["field"]: f["type"] for f in IMPORT_FIELDS}

# Header synonyms → field (lowercased, punctuation-insensitive).
HEADER_SYNONYMS: Dict[str, str] = {
    "name": "name", "pet name": "name", "nickname": "name", "id": "name", "label": "name",
    "scientific name": "scientific_name", "species": "scientific_name",
    "latin name": "scientific_name", "scientific": "scientific_name", "sp": "scientific_name",
    "common name": "common_name", "common": "common_name",
    "taxon": "taxon", "type": "taxon", "group": "taxon", "kind": "taxon", "category": "taxon",
    "sex": "sex", "gender": "sex",
    "life stage": "life_stage", "stage": "life_stage", "age": "life_stage",
    "date acquired": "date_acquired", "acquired": "date_acquired",
    "acquired date": "date_acquired", "purchase date": "date_acquired",
    "date": "date_acquired", "acquired on": "date_acquired",
    "source": "source", "origin": "source", "acquired from": "source",
    "price": "price_paid", "price paid": "price_paid", "cost": "price_paid", "paid": "price_paid",
    "enclosure type": "enclosure_type", "habitat": "enclosure_type", "habitat type": "enclosure_type",
    "enclosure size": "enclosure_size", "size": "enclosure_size", "enclosure": "enclosure_size",
    "substrate": "substrate_type", "substrate type": "substrate_type",
    "substrate depth": "substrate_depth",
    "temp min": "target_temp_min", "temperature min": "target_temp_min", "min temp": "target_temp_min",
    "temp max": "target_temp_max", "temperature max": "target_temp_max", "max temp": "target_temp_max",
    "humidity min": "target_humidity_min", "min humidity": "target_humidity_min",
    "humidity max": "target_humidity_max", "max humidity": "target_humidity_max",
    "notes": "notes", "comments": "notes", "remarks": "notes", "description": "notes",
}

_SEX_VALUES = {"m", "f", "male", "female", "unknown", "unsexed", "?", "female?", "male?"}
_LIFE_VALUES = {"sling", "spiderling", "s", "juvenile", "juvie", "juv", "sub-adult",
                "subadult", "sub", "adult", "a"}
_SOURCE_VALUES = {"bought", "purchased", "purchase", "store", "bred", "captive bred",
                  "captive-bred", "cb", "wild caught", "wild-caught", "wild", "wc"}
_ENCL_VALUES = {"terrestrial", "arboreal", "fossorial", "terr", "arb", "foss"}
_BINOMIAL_RE = re.compile(r"^[A-Za-z][A-Za-z.]+\s+[A-Za-z][A-Za-z.'-]+")


def _clean_header(h: Any) -> str:
    return re.sub(r"[_\-/]+", " ", str(h or "").strip().lower()).strip()


# ── Parsing ──────────────────────────────────────────────────────────────────

def parse_bytes(content: bytes, filename: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Return (headers, rows) from csv / xlsx / json bytes."""
    name = (filename or "").lower()
    if name.endswith(".json"):
        raw = json.loads(content.decode("utf-8"))
        if isinstance(raw, dict):
            raw = raw.get("tarantulas") or raw.get("animals") or raw.get("inverts") or [raw]
        rows = [dict(r) for r in raw if isinstance(r, dict)]
        headers = list({k for r in rows for k in r.keys()})
        return headers, rows
    if name.endswith(".xlsx") or name.endswith(".xls"):
        wb = openpyxl.load_workbook(filename=io.BytesIO(content), data_only=True)
        sheet = wb.active
        grid = list(sheet.iter_rows(values_only=True))
        if not grid:
            return [], []
        headers = [str(h) if h is not None else f"Column {i+1}" for i, h in enumerate(grid[0])]
        rows = []
        for r in grid[1:]:
            if r is None or all(c is None for c in r):
                continue
            rows.append({headers[i]: r[i] for i in range(len(headers)) if i < len(r)})
        return headers, rows
    # default: CSV
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows = [dict(r) for r in reader]
    return headers, rows


# ── Column → field suggestion ────────────────────────────────────────────────

def _infer_from_values(samples: List[str]) -> Optional[Tuple[str, str]]:
    """Guess a field from a column's values. Returns (field, confidence)."""
    vals = [str(v).strip().lower() for v in samples if v not in (None, "")]
    if not vals:
        return None
    n = len(vals)

    def frac(pred) -> float:
        return sum(1 for v in vals if pred(v)) / n

    if frac(lambda v: v in _SEX_VALUES) >= 0.7:
        return ("sex", "medium")
    if frac(lambda v: v in _LIFE_VALUES) >= 0.7:
        return ("life_stage", "medium")
    if frac(lambda v: any(s in v for s in _SOURCE_VALUES)) >= 0.7:
        return ("source", "medium")
    if frac(lambda v: v in _ENCL_VALUES) >= 0.7:
        return ("enclosure_type", "medium")
    if frac(lambda v: _normalize_taxon(v) is not None) >= 0.7:
        return ("taxon", "medium")
    if frac(lambda v: bool(_BINOMIAL_RE.match(v))) >= 0.6:
        return ("scientific_name", "medium")
    if frac(_looks_like_date) >= 0.6:
        return ("date_acquired", "low")
    return None


def suggest_mapping(headers: List[str], rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """header -> {field, confidence, sample_values}. Never maps two headers to
    the same field (first/high-confidence wins; later dupes fall back or drop)."""
    taken: set = set()
    out: Dict[str, Dict[str, Any]] = {}

    # Pass 1: header synonym matches (high). Pass 2: value inference (medium/low).
    def samples_for(h):
        return [r.get(h) for r in rows[:25] if r.get(h) not in (None, "")][:3]

    # sort so exact-synonym headers claim their field first
    def header_field(h):
        ch = _clean_header(h)
        if ch in HEADER_SYNONYMS:
            return HEADER_SYNONYMS[ch], "high"
        # loose contains match against synonym keys
        for key, fld in HEADER_SYNONYMS.items():
            if key in ch or ch in key:
                return fld, "medium"
        return None

    pending_value_infer = []
    for h in headers:
        hf = header_field(h)
        if hf and hf[0] not in taken:
            out[h] = {"field": hf[0], "confidence": hf[1], "sample_values": [str(s) for s in samples_for(h)]}
            taken.add(hf[0])
        else:
            pending_value_infer.append(h)

    for h in pending_value_infer:
        inferred = _infer_from_values([r.get(h) for r in rows[:40]])
        if inferred and inferred[0] not in taken:
            out[h] = {"field": inferred[0], "confidence": inferred[1], "sample_values": [str(s) for s in samples_for(h)]}
            taken.add(inferred[0])
        else:
            out[h] = {"field": None, "confidence": "none", "sample_values": [str(s) for s in samples_for(h)]}

    return out


# ── Value coercion ───────────────────────────────────────────────────────────

def _looks_like_date(v: str) -> bool:
    return _parse_date(v) is not None


def _parse_date(v: Any) -> Optional[date]:
    if isinstance(v, (datetime, date)):
        return v.date() if isinstance(v, datetime) else v
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y", "%b %d, %Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_decimal(v: Any) -> Optional[Decimal]:
    try:
        return Decimal(re.sub(r"[^0-9.\-]", "", str(v)))
    except Exception:
        return None


def _normalize_taxon(v: Any) -> Optional[str]:
    s = _clean_header(v)
    if not s:
        return None
    s2 = s.replace(" ", "_")
    if s2 in TAXA:
        return s2
    aliases = {
        "true spider": "true_spider", "jumping spider": "true_spider", "spider": "true_spider",
        "whip spider": "whip_spider", "amblypygid": "whip_spider", "tailless whip scorpion": "whip_spider",
        "vinegaroon": "vinegaroon", "uropygid": "vinegaroon", "whip scorpion": "vinegaroon",
        "hisser": "roach", "roaches": "roach", "cockroach": "roach",
        "t": "tarantula", "tarantulas": "tarantula",
        "scorpions": "scorpion", "centipedes": "centipede", "millipedes": "millipede",
        "mantid": "mantis", "praying mantis": "mantis",
    }
    return aliases.get(s)


def _coerce(field: str, value: Any) -> Any:
    if value in (None, ""):
        return None
    t = FIELD_TYPE.get(field, "str")
    s = str(value).strip()
    if t == "sex":
        low = s.lower()
        if low in ("m", "male"):
            return "male"
        if low in ("f", "female"):
            return "female"
        return "unknown"
    if t == "source":
        low = s.lower()
        if "bred" in low or low == "cb":
            return "bred"
        if "wild" in low or low == "wc":
            return "wild_caught"
        if any(k in low for k in ("bought", "purchase", "store", "buy")):
            return "bought"
        return None
    if t == "life_stage":
        low = s.lower()
        if low.startswith("s"):
            return "sling"
        if low.startswith("a"):
            return "adult"
        if low.startswith("j") or "sub" in low:
            return "juvenile"
        return None
    if t == "enclosure_type":
        low = s.lower()
        if low.startswith("terr"):
            return "terrestrial"
        if low.startswith("arb"):
            return "arboreal"
        if low.startswith("foss"):
            return "fossorial"
        return None
    if t == "taxon":
        return _normalize_taxon(s)
    if t == "date":
        d = _parse_date(value)
        return d.isoformat() if d else None
    if t == "decimal":
        d = _parse_decimal(value)
        return float(d) if d is not None else None
    return s


# ── Species matching ─────────────────────────────────────────────────────────

def match_species(db: Session, scientific_name: Optional[str]) -> Optional[InvertSpecies]:
    if not scientific_name:
        return None
    sci = scientific_name.strip().lower()
    if not sci:
        return None
    exact = db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == sci).first()
    if exact:
        return exact
    # genus + species prefix fallback (handles trailing authority/notes)
    like = db.query(InvertSpecies).filter(
        InvertSpecies.scientific_name_lower.ilike(f"{sci.split()[0]} {sci.split()[1]}%")
    ).first() if len(sci.split()) >= 2 else None
    return like


# ── Row normalization + analysis ─────────────────────────────────────────────

def normalize_row(
    db: Session,
    raw: Dict[str, Any],
    mapping: Dict[str, Optional[str]],
    default_taxon: str,
    unmapped_to_notes: bool = True,
) -> Dict[str, Any]:
    """Apply mapping to one raw row → dict with the invert payload, resolved
    taxon (+ source), matched species, and any per-row errors."""
    payload: Dict[str, Any] = {}
    extra_notes: List[str] = []

    for header, value in raw.items():
        field = mapping.get(header)
        if not field:
            if unmapped_to_notes and value not in (None, ""):
                extra_notes.append(f"{header}: {value}")
            continue
        coerced = _coerce(field, value)
        if coerced is not None:
            # last non-empty wins if two columns map to the same field
            payload[field] = coerced

    # Merge any unmapped columns into notes (labeled, never silently dropped).
    if extra_notes:
        base = payload.get("notes")
        payload["notes"] = (base + "\n" if base else "") + "\n".join(extra_notes)

    # Species match + taxon resolution
    species = match_species(db, payload.get("scientific_name"))
    if payload.get("taxon"):
        taxon, taxon_source = payload["taxon"], "column"
    elif species is not None and getattr(species, "taxon", None):
        taxon, taxon_source = species.taxon, "species"
    else:
        taxon, taxon_source = default_taxon, "default"
    payload["taxon"] = taxon
    if species is not None:
        payload["species_id"] = str(species.id)

    errors: List[str] = []
    if not payload.get("name") and not payload.get("scientific_name"):
        errors.append("needs a name or a scientific name")
    if taxon not in TAXA:
        errors.append(f"unknown taxon '{taxon}'")

    display = payload.get("name") or payload.get("scientific_name") or "(unnamed)"
    return {
        "payload": payload,
        "taxon": taxon,
        "taxon_source": taxon_source,
        "species_matched": species is not None,
        "species_name": species.scientific_name if species else None,
        "display_name": display,
        "errors": errors,
    }


def analyze(
    db: Session,
    user,
    content: bytes,
    filename: str,
    default_taxon: str = "tarantula",
    preview_limit: int = 20,
) -> Dict[str, Any]:
    headers, rows = parse_bytes(content, filename)
    mapping_info = suggest_mapping(headers, rows)
    simple_mapping = {h: mapping_info[h]["field"] for h in headers}

    # existing (name_lower, sci_lower) for dedupe
    existing = set()
    for inv in active_inverts_query(db, user.id).all():
        existing.add(((inv.name or "").strip().lower(), (inv.scientific_name or "").strip().lower()))

    preview: List[Dict[str, Any]] = []
    new_count = dup_count = err_count = matched_count = 0
    for i, raw in enumerate(rows):
        norm = normalize_row(db, raw, simple_mapping, default_taxon)
        key = (
            (norm["payload"].get("name") or "").strip().lower(),
            (norm["payload"].get("scientific_name") or "").strip().lower(),
        )
        is_dup = key in existing and key != ("", "")
        status = "error" if norm["errors"] else ("duplicate" if is_dup else "new")
        if status == "error":
            err_count += 1
        elif status == "duplicate":
            dup_count += 1
        else:
            new_count += 1
        if norm["species_matched"]:
            matched_count += 1
        if i < preview_limit:
            preview.append({
                "row": i + 1,
                "display_name": norm["display_name"],
                "taxon": norm["taxon"],
                "taxon_source": norm["taxon_source"],
                "species_matched": norm["species_matched"],
                "species_name": norm["species_name"],
                "status": status,
                "errors": norm["errors"],
            })

    columns = [{
        "header": h,
        "suggested_field": mapping_info[h]["field"],
        "confidence": mapping_info[h]["confidence"],
        "sample_values": mapping_info[h]["sample_values"],
    } for h in headers]

    unmapped = [h for h in headers if not simple_mapping.get(h)]
    return {
        "row_count": len(rows),
        "columns": columns,
        "fields": IMPORT_FIELDS,
        "taxa": TAXA,
        "default_taxon": default_taxon,
        "preview": preview,
        "summary": {
            "new": new_count,
            "duplicate": dup_count,
            "error_rows": err_count,
            "species_matched": matched_count,
            "unmapped_columns": unmapped,
        },
    }
