"""
One-shot migration: legacy communal *enclosures* -> Colony records (ADR-010).

Background: before colony mode, communal keepers had to fake a colony by
setting `enclosures.is_communal` + `population_count` — a lone integer with no
lifecycle. Colony mode replaces that with a first-class `colonies` entry. This
script converts each surviving communal enclosure into a Colony so no keeper's
communal is stranded, then leaves the enclosure row untouched (dormant) per the
ADR (no destructive change).

Idempotent: re-running skips any enclosure that already has a Colony linked to
it (matched on colony.enclosure_id). Safe to run multiple times.

Run on the Render shell (writes to prod):
    cd apps/api && python migrate_communal_enclosures_to_colonies.py
Add --dry-run to preview without writing.

Mapping decisions (honesty-first):
* taxon: 'tarantula' when the enclosure purpose is 'tarantula' (the only
  communal enclosures in the wild today are communal Ts, e.g. M. balfouri);
  'other' otherwise. Never guessed from the free-text name.
* population_count -> stage_counts {"mixed": N}. We don't invent a life-stage
  split we don't have. count_is_estimated=False (the keeper typed a number).
* species_id: resolved only if the enclosure had a real species link whose
  scientific name matches an invert_species row. Otherwise left NULL — the
  keeper can set it from the colony edit screen. No fuzzy name matching.
"""
import argparse
import sys

from app.database import SessionLocal
from app.models.enclosure import Enclosure
from app.models.colony import Colony
from app.models.species import Species
from app.models.invert_species import InvertSpecies


def _resolve_invert_species_id(db, legacy_species_id):
    """Map a legacy `species` row to an `invert_species` row by scientific name."""
    if not legacy_species_id:
        return None
    legacy = db.query(Species).filter(Species.id == legacy_species_id).first()
    if legacy is None or not legacy.scientific_name:
        return None
    match = (
        db.query(InvertSpecies)
        .filter(InvertSpecies.scientific_name_lower == legacy.scientific_name.strip().lower())
        .first()
    )
    return match.id if match else None


def main(dry_run: bool = False) -> None:
    db = SessionLocal()
    created = 0
    skipped = 0
    try:
        # Candidates: any enclosure flagged communal or carrying a population.
        candidates = (
            db.query(Enclosure)
            .filter(
                (Enclosure.is_communal.is_(True))
                | (Enclosure.population_count.isnot(None))
            )
            .all()
        )
        print(f"Found {len(candidates)} candidate communal enclosure(s).")

        for enc in candidates:
            # Feeder enclosures are not pet colonies — leave them to the
            # FeederColony system.
            if (enc.purpose or "tarantula") == "feeder":
                skipped += 1
                print(f"  skip (feeder purpose): {enc.name} [{enc.id}]")
                continue

            existing = (
                db.query(Colony).filter(Colony.enclosure_id == enc.id).first()
            )
            if existing is not None:
                skipped += 1
                print(f"  skip (already migrated): {enc.name} [{enc.id}]")
                continue

            pop = enc.population_count or 0
            taxon = "tarantula" if (enc.purpose or "tarantula") == "tarantula" else "other"
            species_id = _resolve_invert_species_id(db, enc.species_id)

            colony = Colony(
                user_id=enc.user_id,
                taxon=taxon,
                species_id=species_id,
                enclosure_id=enc.id,
                name=enc.name or "Communal colony",
                stage_counts={"mixed": int(pop)} if pop else {},
                count_is_estimated=False,
                substrate_type=enc.substrate_type,
                substrate_depth=enc.substrate_depth,
                last_substrate_change=enc.last_substrate_change,
                target_temp_min=enc.target_temp_min,
                target_temp_max=enc.target_temp_max,
                target_humidity_min=enc.target_humidity_min,
                target_humidity_max=enc.target_humidity_max,
                water_dish=enc.water_dish,
                notes=enc.notes,
                photo_url=enc.photo_url,
                visibility="private",
                is_active=True,
            )
            created += 1
            print(
                f"  {'WOULD CREATE' if dry_run else 'CREATE'} colony: "
                f"{colony.name} taxon={taxon} pop={pop} "
                f"species_id={'linked' if species_id else 'none'}"
            )
            if not dry_run:
                db.add(colony)

        if dry_run:
            print(f"\nDry run: would create {created}, skip {skipped}. No changes written.")
            db.rollback()
        else:
            db.commit()
            print(f"\nDone: created {created} colony record(s), skipped {skipped}.")
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
