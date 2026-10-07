"""Read-only report: what the species matcher would suggest for every live
animal that has no care sheet linked (2026-10-07).

Changes nothing. Use it to sanity-check suggestions before keepers see them,
and to see which species are worth a care sheet next (the "no match" list,
most-kept first).

Run on the Render shell, from apps/api:
    python3 report_species_matches.py
    python3 report_species_matches.py --all      # list every animal, not just totals + samples
"""
import sys
from collections import Counter, defaultdict

from app.database import SessionLocal
from app.models.invert import Invert
from app.models.user import User
from app.routers.invert_species import _catalog_rows
from app.services.species_match import match_name, normalize
from app.utils.test_accounts import real_user_clause


def main() -> int:
    show_all = "--all" in sys.argv
    db = SessionLocal()
    try:
        catalog = _catalog_rows(db)
        rows = (
            db.query(Invert.id, Invert.taxon, Invert.scientific_name)
            .join(User, User.id == Invert.user_id)
            .filter(
                Invert.species_id.is_(None), Invert.died_at.is_(None),
                Invert.transferred_out_at.is_(None), Invert.scientific_name.isnot(None),
                real_user_clause(),
            )
            .all()
        )
        kinds = Counter()
        groups = defaultdict(list)
        unmatched = Counter()
        for r in rows:
            if not normalize(r.scientific_name):
                continue
            res = match_name(r.scientific_name, catalog, taxon=r.taxon)
            if res.match is None:
                kinds["no match"] += 1
                unmatched[(r.taxon, r.scientific_name.strip())] += 1
                continue
            switch = res.match.row.taxon != r.taxon
            key = f"{res.match.kind}{' + switch taxon' if switch else ''}"
            kinds[key] += 1
            groups[key].append((r.scientific_name.strip(), r.taxon, res.match.row.scientific_name, res.match.row.taxon))

        print(f"Live animals without a care sheet: {len(rows)}\n")
        for k, n in kinds.most_common():
            print(f"  {k:<28} {n}")
        for k, items in groups.items():
            print(f"\n== {k} ==")
            for typed, taxon, sci, new_taxon in (items if show_all else items[:15]):
                print(f"  {typed!r} ({taxon}) -> {sci} ({new_taxon})")
            if not show_all and len(items) > 15:
                print(f"  ... {len(items) - 15} more (--all)")
        print("\n== No match, most kept first (care-sheet candidates) ==")
        for (taxon, name), n in unmatched.most_common(40):
            print(f"  {n:>3}  {name} ({taxon})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
