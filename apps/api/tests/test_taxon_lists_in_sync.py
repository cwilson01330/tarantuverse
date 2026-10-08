"""Every hand-copied list of taxa must agree with the canonical one.

The canonical set is `INVERT_TAXON_VALUES` (models/invert_species.py). The same
list is copied by hand into the schemas, CHECK constraints, the importers, the
export folder map and, on the clients, into registries, species browsers,
collection filters, label maps and more. Every time a taxon was added, a few
copies were missed (isopod was missing from five places at once; see
docs/design/TAXON_CONSISTENCY_AUDIT_2026-10-05.md). This test makes the next
taxon fail loudly instead.

How it works
------------
* COMPLETE lists must equal the canonical set (minus a stated exemption, e.g.
  "other" has no species catalog). A missing OR extra taxon fails, with the file
  and the taxon named.
* SUBSET lists are deliberate (instar taxa, no-prey taxa, ...). Each is
  registered below WITH a reason, and must stay inside the canonical set. Some
  are also pinned against a second copy so web and mobile cannot drift apart.
* A stray-list scan reads every source file for anything that LOOKS like a
  taxon list and fails if the file is not registered or allow-listed, so a new
  copy cannot appear silently.

Adding a taxon: add it to the migration + `INVERT_TAXON_VALUES` first, then run
this test and fix what it names. If a new list is a deliberate subset, register
it in SUBSETS with a one-line reason.

The TypeScript checks read source files from the repo and SKIP when they are
not there (an API-only checkout, e.g. on Render). The Python checks always run.
"""
from __future__ import annotations

import inspect
import re
from pathlib import Path

import pytest
from sqlalchemy import CheckConstraint

from app.models.colony import Colony
from app.models.invert import Invert
from app.models.invert_species import INVERT_TAXON_VALUES, InvertSpecies

CANONICAL = set(INVERT_TAXON_VALUES)

REPO = Path(__file__).resolve().parents[3]
API_APP = REPO / "apps" / "api" / "app"

WEB_INVERTS = "apps/web/src/lib/inverts.ts"
MOB_INVERTS = "apps/mobile/src/lib/inverts.ts"
WEB_MODULES = WEB_INVERTS  # the web registry keeps modules in the same file
MOB_MODULES = "apps/mobile/src/lib/taxon-modules.ts"


# ---------------------------------------------------------------------------
# TypeScript reading helpers (no TS toolchain needed)
# ---------------------------------------------------------------------------

def _strip_comments(src: str) -> str:
    """Blank out // and /* */ comments, leaving strings alone. Quoted strings
    end at a newline so an apostrophe in JSX text cannot swallow the file."""
    out: list[str] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        two = src[i:i + 2]
        if two == "//":
            while i < n and src[i] != "\n":
                i += 1
        elif two == "/*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join("\n" if ch == "\n" else " " for ch in src[i:j]))
            i = j
        elif c in "'\"":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
        elif c == "`":
            j = i + 1
            while j < n and src[j] != "`":
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


_CACHE: dict[str, str] = {}


def _ts(rel: str) -> str:
    """Comment-stripped source of a repo file; skips the test if absent."""
    path = REPO / rel
    if not path.is_file():
        pytest.skip(f"{rel} not present (API-only checkout)")
    if rel not in _CACHE:
        _CACHE[rel] = _strip_comments(path.read_text(encoding="utf-8"))
    return _CACHE[rel]


def _block(rel: str, anchor: str) -> str:
    """Text between the bracket that ends `anchor` (a regex whose last char is
    the opening { [ or () and its matching close."""
    src = _ts(rel)
    m = re.search(anchor, src, re.S)
    assert m, (
        f"{rel}: could not find /{anchor}/ - the file was restructured. "
        f"Update the extractor in test_taxon_lists_in_sync.py."
    )
    start = m.end() - 1
    depth, i, n = 0, start, len(src)
    while i < n:
        c = src[i]
        if c in "'\"`":
            j = i + 1
            while j < n and src[j] != c and (c == "`" or src[j] != "\n"):
                j += 2 if src[j] == "\\" else 1
            i = j + 1
            continue
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
        i += 1
    raise AssertionError(f"{rel}: unbalanced brackets after /{anchor}/")


def _depth1(block: str) -> str:
    """The block with every nested {..}/[..]/(..) collapsed to '~'."""
    out, depth, i, n = [], 0, 0, len(block)
    while i < n:
        c = block[i]
        if c in "'\"`":
            j = i + 1
            while j < n and block[j] != c and (c == "`" or block[j] != "\n"):
                j += 2 if block[j] == "\\" else 1
            if depth == 0:
                out.append(block[i:j + 1])
            i = j + 1
            continue
        if c in "{[(":
            if depth == 0:
                out.append("~")
            depth += 1
        elif c in "}])":
            depth -= 1
        elif depth == 0:
            out.append(c)
        i += 1
    return "".join(out)


def _found(what: str, rel: str, taxa: set[str]) -> set[str]:
    assert taxa, f"{rel}: extractor for {what} found nothing - update test_taxon_lists_in_sync.py"
    return taxa


def ts_union(rel: str, name: str) -> set[str]:
    m = re.search(rf"type\s+{name}\s*=\s*((?:\|\s*)?'\w+'(?:\s*\|\s*'\w+')*)", _ts(rel))
    assert m, f"{rel}: type {name} not found"
    return _found(name, rel, set(re.findall(r"'(\w+)'", m.group(1))))


def ts_obj_keys(rel: str, anchor: str) -> set[str]:
    flat = _depth1(_block(rel, anchor))
    return _found(anchor, rel, set(re.findall(r"(?:^|,)\s*['\"]?(\w+)['\"]?\s*:", flat)))


def ts_str_list(rel: str, anchor: str) -> set[str]:
    flat = _depth1(_block(rel, anchor))
    return _found(anchor, rel, set(re.findall(r"'(\w+)'", flat)))


def ts_objs_field(rel: str, anchor: str, field: str) -> set[str]:
    return _found(anchor, rel, set(re.findall(rf"\b{field}:\s*'(\w+)'", _block(rel, anchor))))


def ts_cases(rel: str, anchor: str) -> set[str]:
    return _found(anchor, rel, set(re.findall(r"case\s+'(\w+)'\s*:", _block(rel, anchor))))


def ts_equals(rel: str, anchor: str) -> set[str]:
    return _found(anchor, rel, set(re.findall(r"taxon\s*===\s*'(\w+)'", _block(rel, anchor))))


def ts_module_lists(rel: str, anchor: str) -> dict[str, frozenset[str]]:
    block = _block(rel, anchor)
    return {k: frozenset(re.findall(r"'(\w+)'", v)) for k, v in re.findall(r"(\w+):\s*\[([^\]]*)\]", block)}


def mobile_feeding_modes() -> dict[str, str]:
    block = _block(MOB_INVERTS, r"export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = \{")
    return {k: v for k, v in re.findall(r"key:\s*'(\w+)'.*?feedingMode:\s*'(\w+)'", block, re.S)}


# ---------------------------------------------------------------------------
# Python-side lists
# ---------------------------------------------------------------------------

def _pattern_taxa(pattern: str) -> set[str]:
    m = re.fullmatch(r"\^\(([a-z_|]+)\)\$", pattern)
    assert m, f"not a taxon alternation: {pattern!r}"
    return set(m.group(1).split("|"))


def _check_taxa(model) -> set[str]:
    for c in model.__table__.constraints:
        if isinstance(c, CheckConstraint) and re.search(r"\btaxon IN \(", str(c.sqltext)):
            return set(re.findall(r"'(\w+)'", str(c.sqltext)))
    raise AssertionError(f"{model.__name__} has no taxon CHECK constraint")


def _py_complete() -> list[tuple[str, str, set[str], set[str], str]]:
    """(label, where, taxa, exempt, why-exempt)"""
    from app.schemas import invert as schema_invert
    from app.schemas import invert_species as schema_species
    from app.services import export_service, import_service

    rows = [
        ("TAXON_PATTERN", "apps/api/app/schemas/invert.py", _pattern_taxa(schema_invert.TAXON_PATTERN), set(), ""),
        ("TAXON_PATTERN", "apps/api/app/schemas/invert_species.py", _pattern_taxa(schema_species.TAXON_PATTERN), set(), ""),
        ("taxon CHECK", "apps/api/app/models/invert.py (Invert)", _check_taxa(Invert), set(), ""),
        ("taxon CHECK", "apps/api/app/models/invert_species.py (InvertSpecies)", _check_taxa(InvertSpecies), set(), ""),
        ("taxon CHECK", "apps/api/app/models/colony.py (Colony)", _check_taxa(Colony), set(), ""),
        ("TAXA (importer)", "apps/api/app/services/import_service.py", set(import_service.TAXA), set(), ""),
        ("TAXON_FOLDERS (ZIP export)", "apps/api/app/services/export_service.py", set(export_service.TAXON_FOLDERS), set(), ""),
    ]
    try:  # owned by another workstream; read-only import
        from app.services import share_card
        rows.append((
            "_POPULATION_NOUN (colony share card)", "apps/api/app/services/share_card.py",
            set(share_card._POPULATION_NOUN), {"other"},
            '"other" stays neutral on purpose (see the comment on the dict)',
        ))
    except Exception:  # pragma: no cover
        pass
    return rows


@pytest.mark.parametrize("label,where,taxa,exempt,why", _py_complete(), ids=lambda v: v if isinstance(v, str) and len(v) < 40 else None)
def test_python_complete_lists(label, where, taxa, exempt, why):
    _assert_complete(label, where, taxa, exempt, why)


def test_every_inline_taxon_pattern_in_the_api_is_complete():
    """Catches a new `Query(pattern="^(tarantula|scorpion|...)$")` copy, e.g.
    routers/inverts.py, that nobody registered."""
    seen = 0
    for path in API_APP.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"\^\(((?:[a-z_]+\|)+[a-z_]+)\)\$", text):
            taxa = set(m.group(1).split("|"))
            if {"tarantula", "scorpion", "centipede"} <= taxa:
                seen += 1
                _assert_complete("inline taxon pattern", str(path.relative_to(REPO)), taxa)
    assert seen >= 3, "expected the inline patterns in schemas/ and routers/inverts.py"


def test_every_raw_taxon_in_clause_in_the_api_is_complete():
    """A `taxon IN ('a', 'b', ...)` string anywhere under app/ that lists most
    taxa is a copy of the CHECK and must be complete."""
    for path in API_APP.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"taxon\s+IN\s*\(([^)]*)\)", text):
            taxa = set(re.findall(r"'(\w+)'", m.group(1)))
            if len(taxa & CANONICAL) >= 6:
                _assert_complete("taxon IN (...) clause", str(path.relative_to(REPO)), taxa)


def test_canonical_list_has_no_duplicates():
    assert len(INVERT_TAXON_VALUES) == len(CANONICAL)


# ---------------------------------------------------------------------------
# TypeScript lists that must be complete
# ---------------------------------------------------------------------------

_NO_OTHER_SPECIES = {"other"}
_NO_OTHER_REASON = '"other" is the freeform catch-all and has no species catalog'
_NO_OTHER_VOCAB = {"other"}
_NO_OTHER_VOCAB_REASON = '"other" deliberately falls through to FALLBACK_VOCABULARY'


def _ts_complete():
    I = "apps/web/src/lib/inverts.ts"
    M = "apps/mobile/src/lib/inverts.ts"
    TM = "apps/mobile/src/lib/taxon-modules.ts"
    W_COLL = "apps/web/src/app/dashboard/tarantulas/page.tsx"
    M_COLL = "apps/mobile/app/(tabs)/collection.tsx"
    W_BROWSER = "apps/web/src/app/species/SpeciesBrowserClient.tsx"
    return [
        # label, file, extractor(lambda), exempt, why
        ("InvertTaxon (type)", I, lambda: ts_union(I, "InvertTaxon"), set(), ""),
        ("INVERT_TAXA", I, lambda: ts_obj_keys(I, r"INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = \{"), set(), ""),
        ("TAXON_MODULES", I, lambda: ts_obj_keys(I, r"export const TAXON_MODULES: Record<InvertTaxon, FeatureModule\[\]> = \{"), set(), ""),
        ("BREEDING_VOCABULARY", I, lambda: ts_obj_keys(I, r"export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = \{"), _NO_OTHER_VOCAB, _NO_OTHER_VOCAB_REASON),
        ("InvertTaxon (type)", M, lambda: ts_union(M, "InvertTaxon"), set(), ""),
        ("INVERT_TAXA", M, lambda: ts_obj_keys(M, r"export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = \{"), set(), ""),
        ("INVERT_TAXON_ORDER", M, lambda: ts_str_list(M, r"export const INVERT_TAXON_ORDER: InvertTaxon\[\] = \["), set(), ""),
        ("taxonMdiIcon cases", M, lambda: ts_cases(M, r"function taxonMdiIcon\([^)]*\)[^{]*\{"), {"other"}, '"other" takes the default (paw) icon'),
        ("TAXON_MODULES", TM, lambda: ts_obj_keys(TM, r"export const TAXON_MODULES: Record<string, FeatureModule\[\]> = \{"), set(), ""),
        ("BREEDING_VOCABULARY", TM, lambda: ts_obj_keys(TM, r"export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = \{"), _NO_OTHER_VOCAB, _NO_OTHER_VOCAB_REASON),
        # collection filters
        ("TaxonKey (type)", W_COLL, lambda: ts_union(W_COLL, "TaxonKey"), set(), ""),
        ("TAXA (collection filter)", W_COLL, lambda: ts_objs_field(W_COLL, r"const TAXA: \{.*?\}\[\] = \[", "key"), set(), ""),
        ("TAXON_CHIPS (collection filter)", M_COLL, lambda: ts_objs_field(M_COLL, r"const TAXON_CHIPS: \{.*?\}\[\] = \[", "taxon"), set(), ""),
        # species browsers
        ("TAXA (species browser)", W_BROWSER, lambda: ts_objs_field(W_BROWSER, r"const TAXA = \[", "key"), _NO_OTHER_SPECIES, _NO_OTHER_REASON),
        # taxon pickers / label maps
        ("TAXON_ORDER (change-taxon dialog)", "apps/web/src/components/ChangeTaxonDialog.tsx",
         lambda: ts_str_list("apps/web/src/components/ChangeTaxonDialog.tsx", r"const TAXON_ORDER: InvertTaxon\[\] = \["), set(), ""),
        ("COLONY_TAXA (colony import)", "apps/web/src/app/dashboard/tarantulas/import/page.tsx",
         lambda: ts_str_list("apps/web/src/app/dashboard/tarantulas/import/page.tsx", r"const COLONY_TAXA = \["), set(), ""),
        ("COLONY_TAXA (colony import)", "apps/mobile/app/import.tsx",
         lambda: ts_str_list("apps/mobile/app/import.tsx", r"const COLONY_TAXA = \["), set(), ""),
        ("ColonyTaxon (type)", "apps/web/src/lib/colonies.ts", lambda: ts_union("apps/web/src/lib/colonies.ts", "ColonyTaxon"), set(), ""),
        ("COLONY_EMOJI (dashboard)", "apps/web/src/app/dashboard/page.tsx",
         lambda: ts_obj_keys("apps/web/src/app/dashboard/page.tsx", r"const COLONY_EMOJI: Record<string, string> = \{"), set(), ""),
        ("TAXON_LABEL (public colony page)", "apps/web/src/app/col/[id]/ColonyPublicClient.tsx",
         lambda: ts_obj_keys("apps/web/src/app/col/[id]/ColonyPublicClient.tsx", r"const TAXON_LABEL: Record<string, string> = \{"), set(), ""),
        ("TAXON_LABEL (public animal page)", "apps/web/src/app/i/[id]/InvertPublicClient.tsx",
         lambda: ts_obj_keys("apps/web/src/app/i/[id]/InvertPublicClient.tsx", r"const TAXON_LABEL: Record<string, string> = \{"), set(), ""),
        ("TAXON_LABELS (care sheet SEO)", "apps/web/src/app/species/inverts/[id]/page.tsx",
         lambda: ts_obj_keys("apps/web/src/app/species/inverts/[id]/page.tsx", r"const TAXON_LABELS: Record<string, string> = \{"), set(), ""),
        ("TAXON_LABELS (care sheet)", "apps/web/src/app/species/inverts/[id]/InvertCareSheetClient.tsx",
         lambda: ts_obj_keys("apps/web/src/app/species/inverts/[id]/InvertCareSheetClient.tsx", r"const TAXON_LABELS: Record<string, string> = \{"), set(), ""),
    ]


def _ts_ids():
    return [f"{label} @ {file}" for label, file, *_ in _ts_complete()]


@pytest.mark.parametrize("label,file,extract,exempt,why", _ts_complete(), ids=_ts_ids())
def test_typescript_complete_lists(label, file, extract, exempt, why):
    _assert_complete(label, file, extract(), exempt, why)


# ---------------------------------------------------------------------------
# Deliberate subsets: each one needs a reason. A new taxon forces a decision.
# ---------------------------------------------------------------------------

def _py_subsets():
    from app.routers import analytics
    from app.services import import_service, species_match
    out = [
        ("NO_PREY_TAXA", "apps/api/app/routers/analytics.py", set(analytics.NO_PREY_TAXA),
         "taxa whose keepers don't feed counted live prey (feeding-cost fallback); pinned to the non-predator feeding modes below"),
        ("HIGHER_TAXA values", "apps/api/app/services/species_match.py", set(species_match.HIGHER_TAXA.values()),
         "family/order names only exist for taxa the matcher knows; add a taxon here only when its higher-taxon names are established"),
        ("importer taxon aliases", "apps/api/app/services/import_service.py",
         set(re.findall(r':\s*"(\w+)"', inspect.getsource(import_service._normalize_taxon))),
         "free-text spellings (pillbug, mantid) that map onto a taxon"),
    ]
    try:
        from app.services import share_card
        out.append(("_LEG_SPAN_TAXA", "apps/api/app/services/share_card.py", set(share_card._LEG_SPAN_TAXA),
                    "spider-shaped taxa measured by leg span; pinned to the client labels below"))
    except Exception:  # pragma: no cover
        pass
    return out


@pytest.mark.parametrize("label,where,taxa,why", _py_subsets(), ids=lambda v: v if isinstance(v, str) and len(v) < 40 else None)
def test_python_deliberate_subsets(label, where, taxa, why):
    _assert_subset(label, where, taxa)


def _ts_subsets():
    I, M, TM = WEB_INVERTS, MOB_INVERTS, MOB_MODULES
    return [
        ("INSTAR_TAXA", I, lambda: ts_str_list(I, r"const INSTAR_TAXA = new Set<string>\(\["),
         "taxa whose keepers count instars (the others count molts or nothing)"),
        ("INSTAR_TAXA", TM, lambda: ts_str_list(TM, r"const INSTAR_TAXA = new Set<string>\(\["), "same, mobile copy"),
        ("GROWTH_NEEDS_MEASUREMENT", I, lambda: ts_str_list(I, r"const GROWTH_NEEDS_MEASUREMENT = new Set<string>\(\["),
         "taxa that rarely get measured: the growth chart waits for a measurement"),
        ("GROWTH_NEEDS_MEASUREMENT", TM, lambda: ts_str_list(TM, r"const GROWTH_NEEDS_MEASUREMENT = new Set<string>\(\["), "same, mobile copy"),
        ("GROWTH_LENGTH_LABELS", TM, lambda: ts_obj_keys(TM, r"const GROWTH_LENGTH_LABELS: Record<string, string> = \{"),
         "spider-shaped taxa measured by leg span; everything else is body length"),
        ("growthLengthLabel", I, lambda: ts_equals(I, r"export function growthLengthLabel\([^)]*\)[^{]*\{"),
         "same, web copy"),
        ("BUCKETS_BY_TAXON", "apps/web/src/lib/colony-presets.ts",
         lambda: ts_obj_keys("apps/web/src/lib/colony-presets.ts", r"const BUCKETS_BY_TAXON: Record<string, string\[\]> = \{"),
         "taxa with their own colony stage presets; the rest use GENERIC_BUCKETS"),
        ("BUCKETS_BY_TAXON", "apps/mobile/src/lib/colony-buckets.ts",
         lambda: ts_obj_keys("apps/mobile/src/lib/colony-buckets.ts", r"const BUCKETS_BY_TAXON: Partial<Record<InvertTaxon, string\[\]>> = \{"),
         "same, mobile copy"),
        ("HARMLESS_COPY", "apps/web/src/app/species/inverts/[id]/InvertCareSheetClient.tsx",
         lambda: ts_obj_keys("apps/web/src/app/species/inverts/[id]/InvertCareSheetClient.tsx", r"const HARMLESS_COPY: Record<string, \{ title: string; body: string \}> = \{"),
         "safety callout wording for taxa that can be harmless (venomous taxa show venom info instead)"),
        ("HARMLESS_COPY", "apps/mobile/app/invert-species/[id].tsx",
         lambda: ts_obj_keys("apps/mobile/app/invert-species/[id].tsx", r"const HARMLESS_COPY: Record<string, \{ title: string; body: string \}> = \{"),
         "same, mobile copy"),
        ("GENERIC_TAXA (collection fetch)", "apps/mobile/app/(tabs)/collection.tsx",
         lambda: ts_str_list("apps/mobile/app/(tabs)/collection.tsx", r"const GENERIC_TAXA: InvertTaxon\[\] = \["),
         "taxa without a per-taxon list lib; the four legacy taxa are fetched separately (see test_generic_taxa_plus_legacy_is_complete)"),
        ("colonyFoodTypes (detritivore branch)", "apps/web/src/lib/colonies.ts",
         lambda: ts_equals("apps/web/src/lib/colonies.ts", r"export function colonyFoodTypes\([^)]*\)[^{]*\{"),
         "colony taxa fed greens, not live prey; pinned to the non-predator feeding modes below"),
        ("foodTypesFor (detritivore branch)", "apps/mobile/app/colony/add-feeding.tsx",
         lambda: ts_equals("apps/mobile/app/colony/add-feeding.tsx", r"function foodTypesFor\([^)]*\)[^{]*\{"),
         "same, mobile copy"),
    ]


@pytest.mark.parametrize("label,file,extract,why", _ts_subsets(), ids=[f"{s[0]} @ {s[1]}" for s in _ts_subsets()])
def test_typescript_deliberate_subsets(label, file, extract, why):
    _assert_subset(label, file, extract())


# ---------------------------------------------------------------------------
# Pins between copies that must agree with each other
# ---------------------------------------------------------------------------

def test_web_and_mobile_module_registries_agree():
    web = ts_module_lists(WEB_MODULES, r"export const TAXON_MODULES: Record<InvertTaxon, FeatureModule\[\]> = \{")
    mob = ts_module_lists(MOB_MODULES, r"export const TAXON_MODULES: Record<string, FeatureModule\[\]> = \{")
    for taxon in sorted(CANONICAL):
        assert taxon in web, f"{WEB_MODULES}: TAXON_MODULES has no entry for {taxon!r}"
        assert taxon in mob, f"{MOB_MODULES}: TAXON_MODULES has no entry for {taxon!r}"
        assert web[taxon] == mob[taxon], (
            f"TAXON_MODULES[{taxon!r}] differs: web {sorted(web[taxon])} vs mobile {sorted(mob[taxon])} "
            f"({WEB_MODULES} vs {MOB_MODULES}). The CLAUDE.md rule is to keep them in lockstep."
        )


@pytest.mark.parametrize("name,anchor_web,anchor_mob", [
    ("INSTAR_TAXA", r"const INSTAR_TAXA = new Set<string>\(\[", r"const INSTAR_TAXA = new Set<string>\(\["),
    ("GROWTH_NEEDS_MEASUREMENT", r"const GROWTH_NEEDS_MEASUREMENT = new Set<string>\(\[", r"const GROWTH_NEEDS_MEASUREMENT = new Set<string>\(\["),
    ("BREEDING_VOCABULARY",
     r"export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = \{",
     r"export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = \{"),
])
def test_web_and_mobile_copies_agree(name, anchor_web, anchor_mob):
    fn = ts_obj_keys if name == "BREEDING_VOCABULARY" else ts_str_list
    web, mob = fn(WEB_MODULES, anchor_web), fn(MOB_MODULES, anchor_mob)
    assert web == mob, (
        f"{name} differs between {WEB_MODULES} and {MOB_MODULES}: "
        f"only on web {sorted(web - mob)}, only on mobile {sorted(mob - web)}"
    )


def test_colony_bucket_presets_agree_between_web_and_mobile():
    web = ts_obj_keys("apps/web/src/lib/colony-presets.ts", r"const BUCKETS_BY_TAXON: Record<string, string\[\]> = \{")
    mob = ts_obj_keys("apps/mobile/src/lib/colony-buckets.ts", r"const BUCKETS_BY_TAXON: Partial<Record<InvertTaxon, string\[\]>> = \{")
    assert web == mob, f"colony BUCKETS_BY_TAXON differs: only web {sorted(web - mob)}, only mobile {sorted(mob - web)}"


def test_leg_span_taxa_agree_across_api_web_and_mobile():
    from app.services import share_card
    api = set(share_card._LEG_SPAN_TAXA)
    web = ts_equals(WEB_INVERTS, r"export function growthLengthLabel\([^)]*\)[^{]*\{")
    mob = ts_obj_keys(MOB_MODULES, r"const GROWTH_LENGTH_LABELS: Record<string, string> = \{")
    assert api == web == mob, (
        f"Leg-span taxa differ: API share_card {sorted(api)}, web growthLengthLabel {sorted(web)}, "
        f"mobile GROWTH_LENGTH_LABELS {sorted(mob)}"
    )


def test_non_predator_taxa_agree_across_api_and_colony_feeding_forms():
    from app.routers import analytics
    modes = mobile_feeding_modes()
    missing = CANONICAL - set(modes)
    assert not missing, f"{MOB_INVERTS}: INVERT_TAXA entries without a feedingMode for {sorted(missing)}"
    non_predator = {t for t, m in modes.items() if m != "predator"}
    assert set(analytics.NO_PREY_TAXA) == non_predator, (
        f"apps/api/app/routers/analytics.py NO_PREY_TAXA {sorted(analytics.NO_PREY_TAXA)} != taxa that are not "
        f"predators in {MOB_INVERTS} {sorted(non_predator)}"
    )
    web = ts_equals("apps/web/src/lib/colonies.ts", r"export function colonyFoodTypes\([^)]*\)[^{]*\{")
    mob = ts_equals("apps/mobile/app/colony/add-feeding.tsx", r"function foodTypesFor\([^)]*\)[^{]*\{")
    assert web == non_predator, (
        f"apps/web/src/lib/colonies.ts colonyFoodTypes treats {sorted(web)} as detritivores but the "
        f"non-predator taxa are {sorted(non_predator)}: a colony of {sorted(non_predator - web)} is offered live-prey foods"
    )
    assert mob == non_predator, (
        f"apps/mobile/app/colony/add-feeding.tsx foodTypesFor treats {sorted(mob)} as detritivores but the "
        f"non-predator taxa are {sorted(non_predator)}"
    )


def test_generic_taxa_plus_legacy_is_complete():
    """Collection fetch on mobile: four legacy taxa have their own list libs,
    everything else goes through GENERIC_TAXA. Together they must be all taxa."""
    legacy = {"tarantula", "scorpion", "centipede", "whip_spider"}
    generic = ts_str_list("apps/mobile/app/(tabs)/collection.tsx", r"const GENERIC_TAXA: InvertTaxon\[\] = \[")
    assert not (generic & legacy), f"GENERIC_TAXA must not repeat the legacy taxa: {sorted(generic & legacy)}"
    _assert_complete("GENERIC_TAXA + legacy taxa", "apps/mobile/app/(tabs)/collection.tsx", generic | legacy)


# ---------------------------------------------------------------------------
# Stray-list scan: a NEW copy of the list must be registered or allow-listed
# ---------------------------------------------------------------------------

# Files holding a cluster of taxon names that the registry above does not
# check, each with the reason that is fine.
KNOWN_NON_LISTS = {
    "apps/api/app/services/colony_import_service.py":
        "_young_bucket: per-taxon wording for 'young', falls back to 'juveniles'",
    "apps/api/app/models/invert_species.py":
        "holds INVERT_TAXON_VALUES (the canonical list) and the species CHECK, both checked here",
    "apps/web/src/app/dashboard/inverts/add/page.tsx":
        "builds its picker from INVERT_TAXA / PICKER_TAXA rather than a copy",
}

_STRAY_SCAN_ROOTS = [
    (REPO / "apps/api/app", "*.py"),
    (REPO / "apps/web/src", "*.ts*"),
    (REPO / "apps/mobile/app", "*.ts*"),
    (REPO / "apps/mobile/src", "*.ts*"),
]
_TAXA_NAMES = sorted(CANONICAL - {"other"})
_TOKEN = re.compile(
    r"(?<![=!]=\s)(?<![=!]==\s)['\"](%s)['\"]|\b(%s)\s*:" % ("|".join(_TAXA_NAMES), "|".join(_TAXA_NAMES))
)


def _registered_files() -> set[str]:
    files = set()
    for rows in (_ts_complete(), _ts_subsets()):
        for row in rows:
            files.add(row[1])
    for label, where, *_ in _py_complete():
        files.add(where.split(" ")[0])
    for label, where, *_ in _py_subsets():
        files.add(where)
    return files


def test_no_unregistered_taxon_lists():
    if not (REPO / "apps/web/src").is_dir():
        pytest.skip("web sources not present (API-only checkout)")
    registered = _registered_files() | set(KNOWN_NON_LISTS)
    stray: list[str] = []
    for root, pattern in _STRAY_SCAN_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob(pattern):
            rel = path.relative_to(REPO).as_posix()
            if rel in registered or "/__pycache__/" in rel:
                continue
            src = path.read_text(encoding="utf-8", errors="ignore")
            src = _strip_comments(src) if path.suffix != ".py" else re.sub(r"(?m)#.*$", "", src)
            hits = [(m.start(), m.group(1) or m.group(2)) for m in _TOKEN.finditer(src)]
            cluster: list[tuple[int, str]] = []
            clusters = []
            for pos, name in hits:
                if cluster and pos - cluster[-1][0] > 350:
                    clusters.append(cluster)
                    cluster = []
                cluster.append((pos, name))
            if cluster:
                clusters.append(cluster)
            for c in clusters:
                names = {n for _, n in c}
                if len(names) >= 5:
                    line = src.count("\n", 0, c[0][0]) + 1
                    stray.append(f"{rel}:{line} ({len(names)} taxa)")
    assert not stray, (
        "These files contain what looks like a hand-copied list of taxa that this test does not check. "
        "Either derive it from the registry, register it in test_taxon_lists_in_sync.py (complete or "
        "deliberate subset, with a reason), or add the file to KNOWN_NON_LISTS with a reason:\n  "
        + "\n  ".join(stray)
    )


# ---------------------------------------------------------------------------
# Assertions with useful messages
# ---------------------------------------------------------------------------

def _assert_complete(label: str, where: str, taxa: set[str], exempt: set[str] = frozenset(), why: str = "") -> None:
    expected = CANONICAL - set(exempt)
    missing = expected - taxa
    extra = taxa - CANONICAL
    problems = []
    if missing:
        problems.append(f"missing {sorted(missing)}")
    if extra:
        problems.append(f"unknown taxa {sorted(extra)}")
    if exempt & taxa:
        problems.append(f"contains {sorted(exempt & taxa)}, which is exempt ({why}); update the exemption if that changed")
    assert not problems, (
        f"{where}: {label} is out of sync with INVERT_TAXON_VALUES: {'; '.join(problems)}. "
        f"Add the taxon there (or, if it is intentionally absent, register an exemption with a reason "
        f"in tests/test_taxon_lists_in_sync.py)."
    )


def _assert_subset(label: str, where: str, taxa: set[str]) -> None:
    extra = taxa - CANONICAL
    assert not extra, f"{where}: {label} names {sorted(extra)}, which are not in INVERT_TAXON_VALUES (typo or a removed taxon)"
    assert taxa, f"{where}: {label} is empty"
