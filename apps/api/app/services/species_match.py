"""Match a species name a keeper typed against the catalog.

Why this exists (2026-10-07): ~20 live animals were filed as "Other" with a
species name typed freehand. Six of those names were already in the catalog
exactly ("PTERINOCHILUS MURINUS", "Hogna Maderiana "), and several more were
a typo away ("Archispirostreptis Giga's"). Filed as Other, they lose the
feeding card, the care sheet and, for tarantulas, molt prediction. The
autocomplete only matched substrings, so capitals, stray spaces, curly quotes
or one wrong letter meant "not in our list".

This module answers one question: "is this the same species as something we
already have?" It never writes anything; callers offer the match and the
keeper decides.

Pure functions over plain rows so it can be tested without a database.
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

# Close enough to be the same name with a typo, not a different species.
# Measured on the real cases: "archispirostreptis gigas" vs
# "archispirostreptus gigas" scores ~0.96; two genuinely different species
# in one genus ("avicularia avicularia" vs "avicularia variegata") ~0.6.
CLOSE_NAME = 0.88
CLOSE_GENUS = 0.85
# A lone epithet is short, so one slip costs more score ("iherengi" vs
# "iheringi" is 0.875); in exchange it must win by a wide margin.
CLOSE_EPITHET = 0.85

_QUOTES = "'\"‘’“”`´"


def normalize(name: Optional[str]) -> str:
    """Lowercase, accents and quotes off, punctuation-insensitive.

    "Cyriocosmus sp. “Oronegro”" and "cyriocosmus sp oronegro" normalise the
    same; so do "PTERINOCHILUS  MURINUS " and "Pterinochilus murinus".
    """
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = "".join(c for c in s if c not in _QUOTES)
    s = re.sub(r"[.,;:()\[\]]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def genus_of(name: Optional[str]) -> str:
    n = normalize(name)
    return n.split(" ", 1)[0] if n else ""


@dataclass
class CatalogRow:
    id: object
    scientific_name: str
    taxon: str
    common_name: Optional[str] = None
    slug: Optional[str] = None


@dataclass
class Match:
    row: CatalogRow
    # "exact": same name, ignoring case/spacing/quotes
    # "close": a typo away
    # "epithet": only the second word was typed ("minatrix"), and exactly one
    #            species of the animal's own taxon carries it
    kind: str


@dataclass
class MatchResult:
    match: Optional[Match]
    # The genus we recognised (catalog spelling) and its taxon when every
    # species we list in it shares one. Lets the app say "Avicularia is a
    # tarantula genus" even when this exact species isn't in the list.
    genus: Optional[str]
    genus_taxon: Optional[str]
    # "genus", or "group" when the name recognised is a family / subfamily
    # ("Theraphosinae sp. Mandarina"): the app then says "a tarantula group".
    rank: Optional[str] = None


# Renames keepers still use. Only certain, published ones; each maps to the
# current catalog name and only applies when that name is in the catalog.
SYNONYMS: dict[str, str] = {
    "haploclastus devamatha": "Cilantica psychedelicus",   # Mirza 2024
    "thrigmopoeus psychedelicus": "Cilantica psychedelicus",
    "devamatha": "Cilantica psychedelicus",                # bare old epithet
    "pterinopelma sazimai": "Lasiocyano sazimai",
    "brachypelma albopilosum": "Tliltocatl albopilosus",   # Mendoza & Francke 2020
    "brachypelma albopilosus": "Tliltocatl albopilosus",
    "brachypelma vagans": "Tliltocatl vagans",
    "brachypelma kahlenbergi": "Tliltocatl kahlenbergi",
    "avicularia versicolor": "Caribena versicolor",        # Fukushima & Bertani 2017
    "haplopelma lividum": "Cyriopagopus lividus",
    "haplopelma schmidti": "Cyriopagopus schmidti",
    # Surfaced while researching the 2026-10-07 care-sheet batch.
    "selenobrachys philippinus": "Orphnaecus philippinus",
    "brachypelma epicureanum": "Tliltocatl epicureanus",
    "euathlus vulpinus": "Phrixotrichus vulpinus",
    "aphonopelma jungi": "Aphonopelma vorhiesi",        # Hamilton et al. 2016
    "aphonopelma punzoi": "Aphonopelma vorhiesi",
    "selenotypus arndsti": "Selenocosmia arndsti",
    "chilocosmia arndsti": "Selenocosmia arndsti",
    # Hoang et al. 2025 (Zootaxa 5701): the 2002 name and the hobby trade name.
    "citharognathus tongmianensis": "Magnacrus tongmianensis",
    "ornithoctoninae sp vendula": "Magnacrus tongmianensis",
    "citharognathus sp vendula": "Magnacrus tongmianensis",
}

# Family and subfamily names keepers file undescribed animals under
# ("Theraphosinae sp. Mandarina", "Ornithoctoninae sp 'Vietnam Silver'").
# Each belongs wholly to one taxon here, so it's enough to say "this is a
# tarantula" — never which species. Only established names: hobby labels whose
# rank we couldn't confirm ("Lobellini") are left out.
HIGHER_TAXA: dict[str, str] = {
    # Theraphosidae and its subfamilies
    "theraphosidae": "tarantula", "theraphosinae": "tarantula", "ornithoctoninae": "tarantula",
    "selenocosmiinae": "tarantula", "harpactirinae": "tarantula", "eumenophorinae": "tarantula",
    "poecilotheriinae": "tarantula", "stromatopelminae": "tarantula", "aviculariinae": "tarantula",
    "psalmopoeinae": "tarantula", "ischnocolinae": "tarantula", "schismatothelinae": "tarantula",
    "thrigmopoeinae": "tarantula", "selenogyrinae": "tarantula",
    # Scorpion families
    "buthidae": "scorpion", "scorpionidae": "scorpion", "hormuridae": "scorpion",
    "vaejovidae": "scorpion", "hadruridae": "scorpion", "euscorpiidae": "scorpion",
    "bothriuridae": "scorpion", "diplocentridae": "scorpion",
    # Other groups
    "scolopendridae": "centipede", "scolopendromorpha": "centipede",
    "phrynidae": "whip_spider", "damonidae": "whip_spider", "charinidae": "whip_spider",
    "amblypygi": "whip_spider", "thelyphonidae": "vinegaroon", "uropygi": "vinegaroon",
    "salticidae": "true_spider", "lycosidae": "true_spider", "sparassidae": "true_spider",
    "theridiidae": "true_spider", "araneidae": "true_spider", "eresidae": "true_spider",
    "mantodea": "mantis", "mantidae": "mantis", "hymenopodidae": "mantis", "empusidae": "mantis",
    "blaberidae": "roach", "blattodea": "roach",
}

# Words that mark an undescribed or uncertain form ("Pamphobeteus sp.
# 'mascara'", "cf.", "aff."). Their trade names are localities and colour
# forms: one letter apart is a different animal ("Cascada" vs "mascara",
# "Green Gold" vs "Green"), so forms are never fuzzy-matched.
_FORM_WORDS = {"sp", "spp", "cf", "aff"}
_COLOUR_WORDS = {"blue", "green", "black", "red", "orange", "purple", "white", "gold", "golden",
                 "silver", "yellow", "brown", "grey", "gray", "pink", "dark", "light"}


def _is_form(n: str) -> bool:
    return any(t in _FORM_WORDS for t in n.split(" ")[1:]) or n.split(" ", 1)[0] in _FORM_WORDS


def _form_key(n: str) -> str:
    """Normalised name without the form words or spaces:
    "tapinauchenius sp yasuni" and "tapinauchenius yasuni" -> "tapinaucheniusyasuni"."""
    return "".join(t for t in n.split(" ") if t not in _FORM_WORDS)


def _trade_key(n: str) -> str:
    """Just the trade name of a form, without genus: "hatihati", "dominicanpurple"."""
    toks = n.split(" ")
    if toks and toks[0] not in _FORM_WORDS:
        toks = toks[1:]
    return "".join(t for t in toks if t not in _FORM_WORDS)


def _bare_trade_match(target: str, rows: list[CatalogRow], taxon: Optional[str]) -> Optional[Match]:
    """A form's trade name typed without its genus ("sp. Dominican Purple",
    "HatiHati"). Same guard as a bare epithet: the animal's own taxon only,
    and only when exactly one form there carries that name."""
    if not taxon or taxon == "other":
        return None
    key = _trade_key(target) if target.split(" ", 1)[0] in _FORM_WORDS else target.replace(" ", "")
    # A bare colour ("sp. Blue", "sp. Green") is what keepers call many
    # different animals; being the only one we list doesn't make it theirs.
    words = [t for t in target.split(" ") if t not in _FORM_WORDS]
    if len(key) < 6 or all(w in _COLOUR_WORDS for w in words):
        return None
    hits = [r for r in rows if r.taxon == taxon and _is_form(normalize(r.scientific_name))
            and _trade_key(normalize(r.scientific_name)) == key]
    return Match(hits[0], "epithet") if len(hits) == 1 else None


def _synonym_match(target: str, rows: list[CatalogRow]) -> Optional[Match]:
    canonical = SYNONYMS.get(target)
    if not canonical:
        return None
    want = normalize(canonical)
    hit = next((r for r in rows if normalize(r.scientific_name) == want), None)
    return Match(hit, "close") if hit else None


def _epithet_match(word: str, rows: list[CatalogRow], taxon: Optional[str]) -> Optional[Match]:
    """A lone word like "minatrix". Common in older records, which stored the
    species epithet without the genus. Only ever answered within the animal's
    own taxon, and only when the word is unambiguous there: "murinus" is two
    tarantulas, and "regius" on a tarantula must not become a jumping spider."""
    if not taxon or taxon == "other" or len(word) < 4:
        return None
    pool = [(normalize(r.scientific_name).split(" ")[1:2], r) for r in rows if r.taxon == taxon]
    pool = [(ep[0], r) for ep, r in pool if ep]
    hits = [r for ep, r in pool if ep == word]
    if hits:
        if len(hits) != 1:
            return None
        # A near-twin epithet in the same taxon ("auratus" vs Brachypelma
        # "auratum") means the keeper may have meant the other one.
        twins = [ep for ep, r in pool if r is not hits[0] and difflib.SequenceMatcher(None, word, ep).ratio() >= CLOSE_EPITHET]
        return None if twins else Match(hits[0], "epithet")
    # One slip ("braunshaseni", "iherengi"): accept only a clear winner.
    scored = sorted(((difflib.SequenceMatcher(None, word, ep).ratio(), r) for ep, r in pool), key=lambda t: t[0], reverse=True)
    if not scored:
        return None
    best_score, best = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    if best_score >= CLOSE_EPITHET and best_score - runner_up >= 0.15:
        return Match(best, "epithet")
    return None


def match_name(name: str, rows: Iterable[CatalogRow], taxon: Optional[str] = None) -> MatchResult:
    """`taxon` is the animal's current taxon, when there is one. It's only
    used to answer a bare epithet; full names match across every taxon (that
    is how an "Other" gets told it's a tarantula)."""
    target = normalize(name)
    rows = list(rows)
    if not target or not rows:
        return MatchResult(None, None, None)

    by_genus: dict[str, list[CatalogRow]] = {}
    for r in rows:
        by_genus.setdefault(genus_of(r.scientific_name), []).append(r)

    def found(m: Match) -> MatchResult:
        return MatchResult(m, m.row.scientific_name.split(" ", 1)[0], m.row.taxon, "genus")

    syn = _synonym_match(target, rows)
    if syn:
        return found(syn)

    g = genus_of(target)
    if g not in by_genus and g in HIGHER_TAXA:
        group = name.strip().split()[0]
        return MatchResult(None, group[:1].upper() + group[1:].lower(), HIGHER_TAXA[g], "group")
    if g not in by_genus and (" " not in target or g in _FORM_WORDS):
        m = _epithet_match(target, rows, taxon) if " " not in target else None
        m = m or _bare_trade_match(target, rows, taxon)
        return found(m) if m else MatchResult(None, None, None)
    if g not in by_genus:
        # A misspelt genus ("archispirostreptis") still finds its family.
        close = difflib.get_close_matches(g, list(by_genus), n=1, cutoff=CLOSE_GENUS)
        g = close[0] if close else ""
    candidates = by_genus.get(g, [])

    match: Optional[Match] = None
    for r in candidates:
        if normalize(r.scientific_name) == target:
            match = Match(r, "exact")
            break
    if match is None and candidates:
        # Forms match on their name alone, never on spelling distance.
        key = _form_key(target)
        forms = [r for r in candidates if _is_form(normalize(r.scientific_name))]
        same = [r for r in forms if _form_key(normalize(r.scientific_name)) == key]
        if len(same) == 1:
            match = Match(same[0], "close")
    named = [r for r in candidates if not _is_form(normalize(r.scientific_name))]
    if match is None and named and not _is_form(target):
        scored = sorted(
            ((difflib.SequenceMatcher(None, target, normalize(r.scientific_name)).ratio(), r) for r in named),
            key=lambda t: t[0],
            reverse=True,
        )
        best_score, best = scored[0]
        # Only when it's clearly the best: two near-ties mean we can't tell.
        runner_up = scored[1][0] if len(scored) > 1 else 0.0
        if best_score >= CLOSE_NAME and best_score - runner_up >= 0.03:
            match = Match(best, "close")

    genus_name = genus_taxon = None
    if candidates:
        genus_name = candidates[0].scientific_name.split(" ", 1)[0]
        taxa = {r.taxon for r in candidates}
        genus_taxon = taxa.pop() if len(taxa) == 1 else None
    return MatchResult(match, genus_name, genus_taxon, "genus" if genus_name else None)
