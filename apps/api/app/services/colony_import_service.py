"""
Colony import — turn a keeper's spreadsheet into population colonies.

The colony counterpart of `import_service` (individual animals). Same two
phases and the same confirm-screen shape, so both clients render it with the
same code:

  analyze_colonies(...)       parse, auto-map columns, match species, flag
                              duplicates / problems per row. NO writes.
  normalize_colony_row(...)   apply the (possibly corrected) mapping to one
                              row -> a ColonyCreate-shaped payload plus
                              per-row errors and warnings.

The router creates rows through `routers.colonies.create_colony_row`, the same
helper the create endpoint uses, so the cap, species times_kept bump, location
canonicalisation and default visibility behave exactly as for a colony added
by hand.

Honesty rules (a colony's numbers are what the keeper reads their whole
collection by):
  * A count is only ever what the sheet says. Nothing is guessed from a
    column we can't place: an unrecognised headcount column is left out of the
    numbers, saved to notes and called out in a warning.
  * "~200", "200+", "approx. 200" etc. set count_is_estimated; a plain number
    does not.
  * An unknown taxon is an error on that row, never a silent fall back to the
    default -- a colony's taxon can't be changed afterwards.
  * A matched species from a different taxon than the row is not linked.
"""
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.invert_species import InvertSpecies
from app.services.import_service import (
    TAXA,
    _coerce,
    _normalize_taxon,
    match_species,
    parse_bytes,
)
from app.utils.limits import active_colonies_query

COLONY_DEFAULT_TAXON = "isopod"

# Longest name the colonies table holds (schemas.colony.ColonyBase.name).
MAX_NAME_LEN = 100

# Counts above this are a typo or a phone number, not a headcount.
MAX_COUNT = 10_000_000

# A visible example for the clients to show / offer as a template.
COLONY_EXAMPLE_HEADERS = [
    "name", "species", "taxon", "adults", "juveniles", "count",
    "estimated", "founded", "source", "location", "notes",
]
COLONY_EXAMPLE_ROWS = [
    ["Dairy cow bin 1", "Porcellio laevis", "isopod", "40", "~150", "", "", "2025-03-01", "bred", "Rack A", ""],
    ["Dubia breeder tub", "Blaptica dubia", "roach", "", "", "~1200", "yes", "", "bought", "Garage", "Feeder line"],
]

# ── Fields ───────────────────────────────────────────────────────────────────

# stage field -> stored bucket key. Keys are lowercase, matching what the add
# screens write and what colony events (stage="mixed" default) address.
# "stage_young" is resolved per taxon, see _young_bucket.
_STAGE_KEYS: Dict[str, str] = {
    "stage_adults": "adults",
    "stage_juveniles": "juveniles",
    "stage_nymphs": "nymphs",
    "stage_mancae": "mancae",
    "stage_unsexed": "unsexed",
    "stage_females": "females",
    "stage_males": "males",
    "stage_adult_females": "adult females",
    "stage_adult_males": "adult males",
}
_YOUNG_FIELD = "stage_young"

COLONY_IMPORT_FIELDS: List[Dict[str, str]] = [
    {"field": "name", "label": "Colony name", "type": "str"},
    {"field": "scientific_name", "label": "Species (scientific name)", "type": "str"},
    {"field": "common_name", "label": "Species (common name)", "type": "str"},
    {"field": "taxon", "label": "Taxon (group)", "type": "taxon"},
    {"field": "count", "label": "Total count", "type": "count"},
    {"field": "count_is_estimated", "label": "Count is an estimate (yes/no)", "type": "bool"},
    {"field": "stage_adults", "label": "Count: adults", "type": "stage"},
    {"field": "stage_juveniles", "label": "Count: juveniles", "type": "stage"},
    {"field": "stage_nymphs", "label": "Count: nymphs", "type": "stage"},
    {"field": "stage_mancae", "label": "Count: mancae", "type": "stage"},
    {"field": _YOUNG_FIELD, "label": "Count: babies / young", "type": "stage"},
    {"field": "stage_unsexed", "label": "Count: unsexed", "type": "stage"},
    {"field": "stage_females", "label": "Count: females", "type": "stage"},
    {"field": "stage_males", "label": "Count: males", "type": "stage"},
    {"field": "stage_adult_females", "label": "Count: adult females", "type": "stage"},
    {"field": "stage_adult_males", "label": "Count: adult males", "type": "stage"},
    {"field": "stage_counts", "label": "Stage counts (JSON, from an export)", "type": "json"},
    {"field": "founded_date", "label": "Founded date", "type": "date"},
    {"field": "date_acquired", "label": "Date acquired", "type": "date"},
    {"field": "source", "label": "Source", "type": "source"},
    {"field": "location", "label": "Location (room / rack / shelf)", "type": "str"},
    {"field": "notes", "label": "Notes", "type": "str"},
]
COLONY_FIELD_TYPE = {f["field"]: f["type"] for f in COLONY_IMPORT_FIELDS}

# Exact header (after _clean_colony_header) -> field. Exact on purpose: a loose
# "contains" match files "female" under "male", and a headcount in the wrong
# bucket is worse than an unmapped column the keeper can fix on the confirm
# screen. NB no "id" alias -- an export's UUID `id` must not claim the name.
COLONY_HEADER_SYNONYMS: Dict[str, str] = {
    "name": "name", "colony": "name", "colony name": "name", "culture": "name",
    "bin": "name", "label": "name", "nickname": "name", "pet name": "name",
    "scientific name": "scientific_name", "species": "scientific_name",
    "latin name": "scientific_name", "scientific": "scientific_name", "sp": "scientific_name",
    "species scientific name": "scientific_name",
    "common name": "common_name", "common": "common_name",
    "species display name": "common_name",
    "taxon": "taxon", "type": "taxon", "group": "taxon", "kind": "taxon", "category": "taxon",
    "count": "count", "total": "count", "total count": "count", "population": "count",
    "pop": "count", "headcount": "count", "head count": "count", "animals": "count",
    "individuals": "count", "quantity": "count", "qty": "count", "number": "count",
    "approx count": "count",
    "estimated": "count_is_estimated", "is estimated": "count_is_estimated",
    "estimate": "count_is_estimated", "approximate": "count_is_estimated",
    "approx": "count_is_estimated", "count estimated": "count_is_estimated",
    "count is estimated": "count_is_estimated", "est": "count_is_estimated",
    "adults": "stage_adults", "adult": "stage_adults",
    "juveniles": "stage_juveniles", "juvenile": "stage_juveniles",
    "juvies": "stage_juveniles", "juvie": "stage_juveniles", "juvs": "stage_juveniles",
    "nymphs": "stage_nymphs", "nymph": "stage_nymphs",
    "mancae": "stage_mancae", "manca": "stage_mancae",
    "babies": _YOUNG_FIELD, "baby": _YOUNG_FIELD, "young": _YOUNG_FIELD,
    "hatchlings": _YOUNG_FIELD, "newborns": _YOUNG_FIELD,
    "slings": _YOUNG_FIELD, "spiderlings": _YOUNG_FIELD,
    "unsexed": "stage_unsexed",
    "females": "stage_females", "female": "stage_females",
    "males": "stage_males", "male": "stage_males",
    "adult females": "stage_adult_females", "adult female": "stage_adult_females",
    "adult males": "stage_adult_males", "adult male": "stage_adult_males",
    "stage counts": "stage_counts", "buckets": "stage_counts",
    "founded": "founded_date", "founded date": "founded_date", "date founded": "founded_date",
    "started": "founded_date", "start date": "founded_date", "established": "founded_date",
    "colony started": "founded_date",
    "date acquired": "date_acquired", "acquired": "date_acquired",
    "acquired date": "date_acquired", "purchase date": "date_acquired",
    "date": "date_acquired", "acquired on": "date_acquired",
    "source": "source", "origin": "source", "acquired from": "source",
    "location": "location", "room": "location", "rack": "location", "shelf": "location",
    "where": "location", "area": "location", "spot": "location",
    "notes": "notes", "comments": "notes", "remarks": "notes", "description": "notes",
}

# Words stripped from a header before a second alias attempt, so "Number of
# adults" / "Adult count" / "Total adults" all land on adults. Only ever used
# to find a STAGE field.
_FILLER_WORDS = {
    "of", "count", "counts", "number", "num", "no", "qty", "quantity", "total",
    "the", "current", "approx", "est",
}
# "Genus species" with the capital: stricter than the animal importer's check,
# which accepts any two words ("leaf litter") as a scientific name.
_BINOMIAL_CASED_RE = re.compile(r"^[A-Z][a-z]+\s+[a-z][a-z.'-]+")
_STAGE_WORD_RE = re.compile(
    r"(adult|juv|nymph|sling|manca|instar|baby|babies|young|larva|egg|pupa|"
    r"neonate|hatchling|newborn|male|female)",
    re.I,
)
_COUNT_WORD_RE = re.compile(
    r"\b(count|counts|number|qty|quantity|pop|population|total|headcount|animals|individuals)\b"
)


def _clean_colony_header(h: Any) -> str:
    s = str(h or "").strip().lower()
    s = re.sub(r"[_\-/]+", " ", s)
    s = re.sub(r"[#?:()*]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _header_field(h: Any) -> Optional[str]:
    ch = _clean_colony_header(h)
    if ch in COLONY_HEADER_SYNONYMS:
        return COLONY_HEADER_SYNONYMS[ch]
    stripped = " ".join(w for w in ch.split() if w not in _FILLER_WORDS)
    if stripped and stripped != ch:
        fld = COLONY_HEADER_SYNONYMS.get(stripped)
        if fld and (fld in _STAGE_KEYS or fld == _YOUNG_FIELD):
            return fld
    return None


# ── Value parsing ────────────────────────────────────────────────────────────

# Words / marks that say "this number is a guess".
_EST_MARK = re.compile(
    r"[~≈?]|\b(?:approx(?:imately)?|about|around|est(?:imated)?|circa|ca|c)\b\.?|\+\s*$",
    re.I,
)
_TRUE_WORDS = {
    "yes", "y", "true", "t", "1", "1.0", "est", "estimated", "estimate",
    "approx", "approximate", "approximately", "~", "≈", "guess", "rough",
}
_FALSE_WORDS = {"no", "n", "false", "f", "0", "0.0", "exact", "counted"}


def _is_blank(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _parse_count(value: Any) -> Tuple[Optional[int], bool, bool]:
    """(count, estimated, ok). ok=False means a value was present but isn't a
    count we can read ("lots", "100-150", "1.5") -- the caller warns and leaves
    it out rather than guessing."""
    if _is_blank(value):
        return None, False, True
    if isinstance(value, bool):
        return None, False, False
    if isinstance(value, int):
        return (value, False, True) if 0 <= value <= MAX_COUNT else (None, False, False)
    if isinstance(value, float):
        if value.is_integer() and 0 <= value <= MAX_COUNT:
            return int(value), False, True
        return None, False, False
    s = str(value).strip()
    est = bool(_EST_MARK.search(s))
    core = re.sub(r"\s+", "", _EST_MARK.sub(" ", s))
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+", core):
        core = core.replace(",", "")
    m = re.fullmatch(r"(\d+)(?:\.0+)?", core)
    if not m:
        return None, est, False
    n = int(m.group(1))
    if n > MAX_COUNT:
        return None, est, False
    return n, est, True


def _parse_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower().rstrip(".?!")
    if s in _TRUE_WORDS:
        return True
    if s in _FALSE_WORDS:
        return False
    return None


def _parse_stage_json(value: Any) -> Optional[Dict[str, int]]:
    """A {"adults": 10, ...} map from a colony export. All or nothing."""
    obj = value
    if isinstance(value, str):
        try:
            obj = json.loads(value)
        except Exception:
            return None
    if not isinstance(obj, dict):
        return None
    out: Dict[str, int] = {}
    for k, v in obj.items():
        key = str(k).strip().lower()
        n, _est, ok = _parse_count(v)
        if not key or not ok or n is None:
            return None
        out[key] = out.get(key, 0) + n
    return out


def _young_bucket(taxon: str) -> str:
    """Which bucket "babies / young" belongs in, per taxon -- the same
    vocabulary the add screens suggest (colony-buckets). Communal spiders keep
    slings unsexed; isopod young are mancae; roach and mantis young are
    nymphs; everything else juveniles."""
    if taxon in ("tarantula", "true_spider"):
        return "unsexed"
    if taxon == "isopod":
        return "mancae"
    if taxon in ("roach", "mantis"):
        return "nymphs"
    return "juveniles"


# ── Species ──────────────────────────────────────────────────────────────────

def match_species_by_common_name(
    db: Session, name: Optional[str], taxon: Optional[str] = None
) -> Optional[InvertSpecies]:
    """A species whose common name equals `name` (case-insensitive). Only a
    UNIQUE hit counts: two catalog species sharing a common name ("pill bug")
    is a question for the keeper, not a coin flip."""
    low = (name or "").strip().lower()
    if not low:
        return None
    rows = (
        db.query(InvertSpecies)
        .filter(
            func.lower(func.array_to_string(InvertSpecies.common_names, "||")).contains(
                low, autoescape=True
            )
        )
        .limit(50)
        .all()
    )
    hits = [
        s for s in rows
        if any((c or "").strip().lower() == low for c in (s.common_names or []))
    ]
    if taxon:
        same = [s for s in hits if s.taxon == taxon]
        if same:
            hits = same
    return hits[0] if len(hits) == 1 else None


def _find_species(
    db: Session, scientific: Optional[str], common: Optional[str], taxon: Optional[str]
) -> Optional[InvertSpecies]:
    # Scientific first (exactly what the animal import does), then common
    # names; a "species" column often holds "Dairy Cow" rather than a binomial.
    for text in (scientific, common):
        if text:
            hit = match_species(db, text)
            if hit is not None:
                return hit
    for text in (scientific, common):
        if text:
            hit = match_species_by_common_name(db, text, taxon)
            if hit is not None:
                return hit
    return None


# ── Mapping ──────────────────────────────────────────────────────────────────

def _samples(rows: List[Dict[str, Any]], h: str) -> List[Any]:
    return [r.get(h) for r in rows[:25] if not _is_blank(r.get(h))][:3]


def _mostly_counts(values: List[Any]) -> bool:
    vals = [v for v in values if not _is_blank(v)]
    if not vals:
        return False
    ok = sum(1 for v in vals if _parse_count(v)[2])
    return ok / len(vals) >= 0.7


def suggest_colony_mapping(
    headers: List[str], rows: List[Dict[str, Any]]
) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    """(header -> {field, confidence, sample_values}, column warnings).

    Never maps two headers to the same field. Stage and count columns are
    matched by exact header only; a headcount-looking column we can't place is
    reported, not quietly added to the totals."""
    taken: set = set()
    out: Dict[str, Dict[str, Any]] = {}
    warnings: List[str] = []

    pending: List[str] = []
    for h in headers:
        fld = _header_field(h)
        if fld and fld not in taken:
            out[h] = {"field": fld, "confidence": "high",
                      "sample_values": [str(s) for s in _samples(rows, h)]}
            taken.add(fld)
        else:
            pending.append(h)

    for h in pending:
        col_vals = [r.get(h) for r in rows[:40]]
        samples = [str(s) for s in _samples(rows, h)]
        ch = _clean_colony_header(h)
        countish = bool(_COUNT_WORD_RE.search(ch)) or "#" in str(h)
        stagish = bool(_STAGE_WORD_RE.search(ch))
        numeric = _mostly_counts(col_vals)

        field: Optional[str] = None
        confidence = "none"
        if countish and not stagish and numeric and "count" not in taken:
            # "Population density"-style false positives are possible, so this
            # is offered at low confidence for the keeper to confirm.
            field, confidence = "count", "low"
        elif (stagish or countish) and numeric:
            warnings.append(
                f"Column “{h}” looks like a headcount but isn’t one we can "
                "place, so it isn’t added to the colony numbers. It will be saved to "
                "notes — map it to a stage if you want it counted."
            )
        else:
            vals = [str(v).strip() for v in col_vals if not _is_blank(v)]
            if vals:
                n = len(vals)
                if "taxon" not in taken and sum(
                    1 for v in vals if _normalize_taxon(v) is not None) / n >= 0.7:
                    field, confidence = "taxon", "medium"
                elif "scientific_name" not in taken and sum(
                    1 for v in vals if _BINOMIAL_CASED_RE.match(v)) / n >= 0.6:
                    field, confidence = "scientific_name", "medium"
        if field and field not in taken:
            taken.add(field)
            out[h] = {"field": field, "confidence": confidence, "sample_values": samples}
        else:
            out[h] = {"field": None, "confidence": "none", "sample_values": samples}
    return out, warnings


# ── Row normalisation ────────────────────────────────────────────────────────

def normalize_colony_row(
    db: Session,
    raw: Dict[str, Any],
    mapping: Dict[str, Optional[str]],
    default_taxon: str,
    unmapped_to_notes: bool = True,
) -> Dict[str, Any]:
    """Apply the mapping to one row -> a ColonyCreate-shaped payload, the
    resolved taxon (+ where it came from), the matched species, and any
    per-row errors (row can't be imported) and warnings (row imports, but the
    keeper should know)."""
    errors: List[str] = []
    warnings: List[str] = []
    extra_notes: List[str] = []

    text: Dict[str, str] = {}
    total: Optional[int] = None
    estimated = False
    est_column: Optional[bool] = None
    stage_cells: List[Tuple[str, int]] = []  # (stage field, count)
    json_buckets: Dict[str, int] = {}
    taxon_text: Optional[str] = None
    dates: Dict[str, str] = {}
    source: Optional[str] = None

    for header, value in raw.items():
        field = mapping.get(header)
        if not field:
            if unmapped_to_notes and not _is_blank(value):
                extra_notes.append(f"{header}: {value}")
            continue
        if _is_blank(value):
            continue
        ftype = COLONY_FIELD_TYPE.get(field, "str")

        if ftype == "count":
            n, est, ok = _parse_count(value)
            if not ok:
                warnings.append(f"couldn’t read the count “{value}” — left out")
                continue
            total, estimated = n, estimated or est
        elif ftype == "stage":
            n, est, ok = _parse_count(value)
            if not ok:
                warnings.append(f"couldn’t read “{header}” value “{value}” — left out")
                continue
            if n is not None:
                stage_cells.append((field, n))
            estimated = estimated or est
        elif ftype == "bool":
            b = _parse_bool(value)
            if b is None:
                warnings.append(f"couldn’t read “{value}” as yes/no for the estimate flag — ignored")
            else:
                est_column = b
        elif ftype == "json":
            parsed = _parse_stage_json(value)
            if parsed is None:
                warnings.append("couldn’t read the stage counts — left out")
            else:
                for k, n in parsed.items():
                    json_buckets[k] = json_buckets.get(k, 0) + n
        elif ftype == "taxon":
            taxon_text = str(value).strip()
        elif ftype == "date":
            coerced = _coerce(field, value)
            if coerced is None:
                warnings.append(f"couldn’t read the date “{value}” — left out")
            else:
                dates[field] = coerced
        elif ftype == "source":
            source = _coerce("source", value)
            if source is None:
                warnings.append(f"didn’t recognise the source “{value}” — left out")
        else:
            text[field] = str(value).strip()

    # ── taxon ──
    column_taxon = _normalize_taxon(taxon_text) if taxon_text else None
    if taxon_text and column_taxon is None:
        errors.append(f"unknown taxon ‘{taxon_text}’")

    # ── species ──
    species = _find_species(
        db, text.get("scientific_name"), text.get("common_name"), column_taxon
    )
    if column_taxon:
        taxon, taxon_source = column_taxon, "column"
    elif species is not None and getattr(species, "taxon", None) in TAXA:
        taxon, taxon_source = species.taxon, "species"
    else:
        taxon, taxon_source = default_taxon, "default"
    if not taxon_text and taxon not in TAXA:
        errors.append(f"unknown taxon ‘{taxon}’")

    species_name: Optional[str] = None
    species_id: Optional[str] = None
    unlinked_species_text = text.get("scientific_name") or text.get("common_name")
    if species is not None:
        if getattr(species, "taxon", None) != taxon:
            warnings.append(
                f"{species.scientific_name} is a {species.taxon} care sheet, not {taxon} "
                "— not linked, species kept in notes"
            )
            species = None
        else:
            species_id, species_name = str(species.id), species.scientific_name
    elif unlinked_species_text:
        warnings.append(
            f"species “{unlinked_species_text}” isn’t in the care-sheet catalog "
            "— kept in notes"
        )

    # ── name ──
    display = None
    if species is not None:
        names = getattr(species, "common_names", None) or []
        display = (names[0] if names else None) or species.scientific_name
    name = (
        text.get("name") or text.get("common_name") or display
        or text.get("scientific_name") or ""
    ).strip()
    if not name:
        errors.append("needs a name or a species")
    elif len(name) > MAX_NAME_LEN:
        errors.append(f"name is longer than {MAX_NAME_LEN} characters")

    # ── counts ──
    buckets: Dict[str, int] = dict(json_buckets)
    for field, n in stage_cells:
        key = _young_bucket(taxon) if field == _YOUNG_FIELD else _STAGE_KEYS[field]
        buckets[key] = buckets.get(key, 0) + n
    if total is not None:
        if buckets:
            staged = sum(buckets.values())
            if total > staged:
                rest = total - staged
                buckets["mixed"] = buckets.get("mixed", 0) + rest
                warnings.append(
                    f"total {total} is more than the stage columns add up to ({staged}) "
                    f"— the other {rest} are in “mixed”"
                )
            elif total < staged:
                warnings.append(
                    f"total {total} is less than the stage columns add up to ({staged}) "
                    "— used the stage columns"
                )
        else:
            buckets = {"mixed": total}
    if not buckets:
        warnings.append("no count given — the colony will start empty")
    if est_column is True:
        estimated = True

    # ── notes ──
    notes_parts: List[str] = []
    if text.get("notes"):
        notes_parts.append(text["notes"])
    if species is None and unlinked_species_text:
        notes_parts.append(f"Species: {unlinked_species_text}")
    notes_parts.extend(extra_notes)

    payload: Dict[str, Any] = {
        "name": name,
        "taxon": taxon,
        "stage_counts": buckets or None,
        "count_is_estimated": estimated,
    }
    if species_id:
        payload["species_id"] = species_id
    for k, v in dates.items():
        payload[k] = v
    if source:
        payload["source"] = source
    if text.get("location"):
        payload["location"] = text["location"]
    if notes_parts:
        payload["notes"] = "\n".join(notes_parts)

    return {
        "payload": payload,
        "taxon": taxon,
        "taxon_source": taxon_source,
        "species_matched": species_id is not None,
        "species_name": species_name,
        "display_name": name or "(unnamed)",
        "total_count": sum(buckets.values()) if buckets else 0,
        "stage_counts": buckets or {},
        "count_is_estimated": estimated,
        "errors": errors,
        "warnings": warnings,
    }


def colony_key(payload: Dict[str, Any]) -> Tuple[str, str]:
    """Dedupe key: the same name in the same taxon is the same colony."""
    return ((payload.get("name") or "").strip().lower(), payload.get("taxon") or "")


def existing_colony_keys(db: Session, user_id) -> set:
    return {
        ((c.name or "").strip().lower(), c.taxon or "")
        for c in active_colonies_query(db, user_id).all()
    }


# ── Analyze ──────────────────────────────────────────────────────────────────

def analyze_colonies(
    db: Session,
    user,
    content: bytes,
    filename: str,
    default_taxon: str = COLONY_DEFAULT_TAXON,
    preview_limit: int = 20,
) -> Dict[str, Any]:
    headers, rows = parse_bytes(content, filename, json_keys=("colonies",))
    mapping_info, column_warnings = suggest_colony_mapping(headers, rows)
    simple_mapping = {h: mapping_info[h]["field"] for h in headers}

    existing = existing_colony_keys(db, user.id)
    in_file: set = set()

    preview: List[Dict[str, Any]] = []
    new_count = dup_count = err_count = matched_count = warn_rows = 0
    population = 0
    for i, raw in enumerate(rows):
        norm = normalize_colony_row(db, raw, simple_mapping, default_taxon)
        key = colony_key(norm["payload"])
        if norm["errors"]:
            status = "error"
            err_count += 1
        elif key != ("", "") and (key in existing or key in in_file):
            status = "duplicate"
            dup_count += 1
        else:
            status = "new"
            new_count += 1
            population += norm["total_count"]
        if status != "error":
            in_file.add(key)
        if norm["species_matched"]:
            matched_count += 1
        if norm["warnings"] and status != "error":
            warn_rows += 1
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
                "warnings": norm["warnings"],
                "total_count": norm["total_count"],
                "stage_counts": norm["stage_counts"],
                "count_is_estimated": norm["count_is_estimated"],
            })

    columns = [{
        "header": h,
        "suggested_field": mapping_info[h]["field"],
        "confidence": mapping_info[h]["confidence"],
        "sample_values": mapping_info[h]["sample_values"],
    } for h in headers]

    unmapped = [h for h in headers if not simple_mapping.get(h)]
    return {
        "target": "colony",
        "row_count": len(rows),
        "columns": columns,
        "fields": COLONY_IMPORT_FIELDS,
        "taxa": TAXA,
        "default_taxon": default_taxon,
        "preview": preview,
        "summary": {
            "new": new_count,
            "duplicate": dup_count,
            "error_rows": err_count,
            "species_matched": matched_count,
            "unmapped_columns": unmapped,
            "warning_rows": warn_rows,
            "column_warnings": column_warnings,
            "population_total": population,
        },
    }
