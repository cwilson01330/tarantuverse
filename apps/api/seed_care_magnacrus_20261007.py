"""
Care sheet for Magnacrus tongmianensis (2026-10-07). Two keepers have it as
"tonogmianensis" with no care sheet to link to.

Researched with the same honesty rule as every seed: a field is filled only
when a source we read states it (or it is a hard taxonomic fact: Old World
Ornithoctoninae have no urticating hairs). Husbandry comes from a single
breeder, and the guide says so.

Run (Render shell, from apps/api):  python3 seed_care_magnacrus_20261007.py   (idempotent)
"""
import os
import re
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")


SPECIES_DATA = [
    # Magnacrus tongmianensis (Zhu, Li & Song, 2002) -- care sheet draft for Tarantuverse
    #
    # VALIDITY: valid, accepted in the World Spider Catalog (LSID urn:lsid:nmbe.ch:spidersp:038374).
    #   Spelling is "tongmianensis" (after Tongmian Township, Ningming County, Guangxi, the
    #   labelled type locality). "tonogmianensis" is a typo; no source uses it.
    #
    # SYNONYMS / OLD NAMES KEEPERS MIGHT TYPE (map all to Magnacrus tongmianensis):
    #   - Citharognathus tongmianensis        (original name, 2002; WSC lists it as the combination it was transferred from)
    #   - Ornithoctoninae sp. "Vendula"       (hobby trade name; equated with this species by the 2025 authors)
    #   - Citharognathus sp. "Vendula" / C. tongmianensis "Vendula"  (variants of the above; not individually sourced)
    #   - tonogmianensis / tongmianesis / tongmiansis (misspellings; the two filed by our users is "tonogmianensis")
    #   - Common names: "Vietnamese stout-leg earthtiger", "stout-leg earth tiger"
    # DO NOT merge: Ornithoctoninae sp. "Highland" and sp. "Highland 2" are Magnacrus taynguyenensis
    #   (already in our catalog), a different species. Citharognathus hosei is a separate species
    #   and is again the only member of Citharognathus.
    #
    # OTHER MAGNACRUS SPECIES (WSC, 2 accepted): M. taynguyenensis Hoang, Yu, Wendt, West & von Wirth, 2025
    #   (Vietnam) and M. tongmianensis (type species). No further synonyms listed in WSC.
    #
    # Sources:
    #   https://wsc.nmbe.ch/spec-data/43952
    #     -> accepted species, author/year, type species of Magnacrus, previous combination Citharognathus
    #        tongmianensis, distribution "Vietnam, China?", 2025-10-03 transfer and first male description
    #   https://wsc.nmbe.ch/species-list/6585/Magnacrus
    #     -> genus contains exactly two accepted species (M. taynguyenensis, M. tongmianensis)
    #   https://wsc.nmbe.ch/genus-detail/6585
    #     -> Magnacrus Hoang, Yu, Wendt, West & von Wirth, 2025; type species C. tongmianensis
    #   https://arachnoboards.com/threads/a-new-ornithoctoninae-genus-magnacrus-from-vietnam-is-described.374709/
    #     -> authors' announcement and abstract: sp. "Vendula" / C. tongmianensis = M. tongmianensis;
    #        sp. "Highland" and "Highland 2" = M. taynguyenensis; type locality probably wrong,
    #        species likely not in China
    #   https://www.tarantupedia.com/ornithoctoninae/magnacrus/magnacrus-tongmianensis
    #     -> type-locality doubt (Tongmian is a trade transit hub, types probably escapees), only known
    #        living population in Dak Lak Province below 600 m, Vietnam; Hoang et al. (2025) citation
    #   https://doi.org/10.11646/zootaxa.5701.3.5  (Zootaxa 5701(3): 351-381; seen via zenodo.org/records/17326120 metadata only, full text restricted)
    #     -> the 2025 revision itself (Hoang, Yu, Wendt, West & von Wirth)
    #   https://arachnoboards.com/threads/citharognathus-tongmianensis-confusion.354479/
    #     -> adult female ~5.8 in (147 mm) diagonal leg span, derived by a forum moderator from the
    #        measurements in Zhu & Zhang (2008); keepers' estimates agree. Estimate, not a measured DLS.
    #   https://arachnoeden.org/shop/spiderlings/magnacrus-tongmianensis-spiderling/
    #     -> breeder (single source): common name "Vietnamese stout-leg earthtiger"; sold before 2002 [sic]
    #        as Ornithoctoninae sp. "Vendula"; obligate burrower with thickened back legs; web-lined
    #        tunnels; ambushes prey from the entrance; slightly dampened substrate (not wet, not dry);
    #        restricted ventilation; 68-72 F, up to 80 F speeds growth; less moisture for juveniles/adults
    #   Zenodo treatment record (zenodo.org/records/17417565) -> seen only as a search-result summary
    #     (rate-limited on fetch): debris and silk around the burrow entrance rim. Not read in full.
    #
    # NOT SOURCED (left out): care_level, temperament, growth_rate, humidity %, enclosure sizes,
    #   substrate depth, prey size, feeding frequencies, water dish, communal_suitable,
    #   medically_significant_venom.
    dict(**{'taxon': 'tarantula',
 'scientific_name': 'Magnacrus tongmianensis',
 'common_names': ['Vietnamese stout-leg earthtiger',
                  'Stout-leg earth tiger',
                  "Ornithoctoninae sp. 'Vendula'"],
 'genus': 'Magnacrus',
 'family': 'Theraphosidae',
 'order_name': 'Araneae',
 'native_region': 'Central Highlands of Vietnam (Dak Lak Province, below ~600 m); Guangxi, China '
                  'record is doubtful',
 'adult_size': '~5.8 in DLS (female, estimated)',
 'type': 'fossorial',
 'temperature_min': 68,
 'temperature_max': 80,
 'substrate_type': "Slightly dampened substrate, neither wet nor dry (single breeder's advice)",
 'feeding_mode': 'predator',
 'webbing_amount': 'Thick web-lined tunnel',
 'burrowing': 'Obligate burrower',
 'urticating_hairs': False,
 'care_guide': 'Magnacrus tongmianensis is a medium-sized Old World tarantula (Ornithoctoninae) '
               'and an obligate burrower from the Central Highlands of Vietnam. It was described '
               'in 2002 as Citharognathus tongmianensis from two females labelled as coming from '
               'Guangxi, China. In 2025 it was moved to the new genus Magnacrus and the male was '
               'described for the first time; the authors doubt the Chinese locality. For years '
               "the hobby sold it as Ornithoctoninae sp. 'Vendula'. Wild animals live in web-lined "
               'burrows in Dak Lak Province below about 600 m and ambush prey from the entrance. '
               'As an Old World species it has no urticating hairs. Documentation is thin. There '
               'is no peer-reviewed care data, and the only husbandry advice we found comes from '
               'one breeder: slightly dampened substrate (not wet, not dry), restricted '
               'ventilation, 68-72 F with up to 80 F to speed growth, and less moisture for '
               'juveniles and adults. Adult females are estimated at roughly 5.8 inches diagonal '
               'leg span. Every other parameter is unknown, and venom potency is undocumented, so '
               'handle with caution.',
 'source_url': 'https://wsc.nmbe.ch/spec-data/43952'}),
]


def _check_lengths():
    """Fail before touching the database if any text is longer than its column."""
    cols = InvertSpecies.__table__.columns
    for data in SPECIES_DATA:
        for key, value in data.items():
            if key not in cols:
                raise SystemExit(f"{data['scientific_name']}: unknown column {key}")
            limit = getattr(cols[key].type, "length", None)
            if limit and isinstance(value, str) and len(value) > limit:
                raise SystemExit(f"{data['scientific_name']}: {key} is {len(value)} characters; the column allows {limit}")


def seed():
    _check_lengths()
    db = SessionLocal()
    try:
        added = skipped = 0
        for data in SPECIES_DATA:
            name = data["scientific_name"]
            if db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first():
                skipped += 1
                print(f"  Skipped (exists): {name}")
                continue
            row = dict(data)
            taxon = row.pop("taxon")
            db.add(InvertSpecies(
                id=uuid.uuid4(), taxon=taxon,
                scientific_name_lower=name.lower(), slug=_slugify(name),
                is_verified=True, **row,
            ))
            added += 1
            print(f"  Added: {taxon} {name}")
        db.commit()
        print(f"Done. Added {added}, skipped {skipped}.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
