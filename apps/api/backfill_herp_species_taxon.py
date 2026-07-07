"""
One-shot backfill: set `herp_species.taxon` for existing rows (ADR-011).

The species catalog gained a `taxon` group column (htx_20260703) shipped
NULLable. This maps existing species to their herp group from `order_name` +
`family`, so the species browser can segment the catalog. Future species should
set `taxon` at seed time; this only fills the pre-ADR-011 rows.

Idempotent: only updates rows where `taxon IS NULL` and a group can be resolved.
Run on the Render shell:  cd apps/api && python backfill_herp_species_taxon.py
Add --dry-run to preview.

Mapping (verified against prod 2026-07-03 — existing rows are Squamata + Anura):
* Anura      -> frog
* Caudata    -> salamander   (future-proof; none yet)
* Testudines -> tortoise if Testudinidae else turtle  (future-proof; none yet)
* Squamata   -> snake if the family is a snake family, else lizard
Unresolvable rows are left NULL and reported.
"""
import argparse
import sys

from app.database import SessionLocal
from app.models.reptile_species import ReptileSpecies

# Snake families (Serpentes). Everything else in Squamata is treated as a
# lizard. Broad list so future snake seeds resolve without edits.
SNAKE_FAMILIES = {
    "pythonidae", "boidae", "colubridae", "elapidae", "viperidae",
    "lamprophiidae", "homalopsidae", "pareidae", "xenopeltidae",
    "leptotyphlopidae", "typhlopidae", "uropeltidae", "erycidae",
    "bolyeriidae", "acrochordidae", "aniliidae", "cylindrophiidae",
    "tropidophiidae", "loxocemidae", "xenodermidae", "natricidae",
    "dipsadidae", "pseudaspididae", "cyclocoridae", "prosymnidae",
    "psammophiidae", "atractaspididae",
}


def _taxon_for(order_name, family):
    o = (order_name or "").strip().lower()
    f = (family or "").strip().lower()
    if o == "anura":
        return "frog"
    if o == "caudata":
        return "salamander"
    if o == "testudines":
        return "tortoise" if f == "testudinidae" else "turtle"
    if o == "squamata":
        return "snake" if f in SNAKE_FAMILIES else "lizard"
    return None  # unknown order — leave NULL


def main(dry_run: bool = False) -> None:
    db = SessionLocal()
    updated = 0
    skipped = 0
    unresolved = []
    try:
        rows = db.query(ReptileSpecies).filter(ReptileSpecies.taxon.is_(None)).all()
        print(f"Found {len(rows)} species with NULL taxon.")
        for sp in rows:
            group = _taxon_for(sp.order_name, sp.family)
            if group is None:
                unresolved.append(
                    f"{sp.scientific_name} (order={sp.order_name!r}, family={sp.family!r})"
                )
                skipped += 1
                continue
            print(
                f"  {'WOULD SET' if dry_run else 'SET'} {sp.scientific_name} "
                f"[{sp.order_name}/{sp.family}] -> {group}"
            )
            if not dry_run:
                sp.taxon = group
            updated += 1

        if unresolved:
            print("\nUnresolved (left NULL — add the family to the mapping):")
            for u in unresolved:
                print(f"  - {u}")

        if dry_run:
            print(f"\nDry run: would set {updated}, skip {skipped}. No changes written.")
            db.rollback()
        else:
            db.commit()
            print(f"\nDone: set {updated} taxon value(s), skipped {skipped}.")
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing.")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
