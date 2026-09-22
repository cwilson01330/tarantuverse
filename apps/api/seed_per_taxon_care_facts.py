"""
Fill in the per-taxon care facts that are true of a whole group.

    python3 seed_per_taxon_care_facts.py            # dry run, prints every change
    python3 seed_per_taxon_care_facts.py --apply

Dry run by default. Idempotent — only writes fields that are currently NULL,
so anything you've edited by hand in the care-guides admin is left alone.

WHAT THIS WILL AND WON'T CLAIM
------------------------------
Only facts that hold for an entire order or class go in here. Anything that
varies species by species is left NULL for a human to fill in, because NULL
renders as nothing while `false` renders as "No" — a wrong "No" on a safety
field is worse than a blank one.

So, deliberately NOT seeded:

  can_fly / can_climb_smooth   Varies enormously between roach species, and
                               these are the two facts a roach keeper most
                               needs to be right. Guessing them wholesale
                               would be asserting containment advice from a
                               taxon-level average.
  typical_instars_to_maturity  Species-specific (mantids run ~5–9).
  bioactive_suitable on Cubaris  Biologically fine, but they're expensive
                               display animals. Marking them as clean-up crew
                               invites a beginner to spend $200 on springtail
                               work.

MILLIPEDE CHEMISTRY IS KEYED ON ORDER, NOT GUESSED
--------------------------------------------------
This is the reason the script exists rather than a bulk UPDATE. Millipede
defensive chemistry splits cleanly by order and the difference matters:

  Polydesmida (flat-backed)    hydrogen cyanide
  Spirobolida / Spirostreptida benzoquinones — stain skin, burn eyes

Labelling Harpaphe haydeniana — the cyanide millipede — as a quinone producer
would be exactly the kind of confident wrong answer these fields exist to
prevent. Orders outside those three are left NULL.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.invert_species import InvertSpecies


# Isopods sold and kept specifically as clean-up crew. Cubaris are omitted on
# purpose — see the module docstring.
CUC_ISOPODS = {
    "trichorhina tomentosa",
    "porcellionides pruinosus",
    "porcellio laevis",
    "armadillidium vulgare",
}

MILLIPEDE_SECRETION_BY_ORDER = {
    "polydesmida": "hydrogen_cyanide",
    "spirobolida": "benzoquinone",
    "spirostreptida": "benzoquinone",
}


def facts_for(s: InvertSpecies) -> dict:
    """Everything this script is willing to assert about one species."""
    out: dict = {}
    order = (s.order_name or "").strip().lower()
    name = (s.scientific_name or "").strip().lower()

    if s.taxon == "millipede":
        secretion = MILLIPEDE_SECRETION_BY_ORDER.get(order)
        if secretion:
            out["defensive_secretion"] = secretion
        # True of the class: millipedes add segments with each moult, need
        # calcium to harden the new exoskeleton, and die in a tub that is wet
        # or dry end to end.
        out["developmental_class"] = "anamorphic"
        out["supplemental_calcium_required"] = True
        out["moisture_gradient_required"] = True
        # Counted in body rings, not numbered instars.
        out["stage_scheme"] = "none"

    elif s.taxon == "vinegaroon":
        # Thelyphonida — the acetic-acid spray is what the group is named for.
        if order == "thelyphonida" or (s.family or "").lower() == "thelyphonidae":
            out["defensive_secretion"] = "acetic_acid"
        out["stage_scheme"] = "instar"

    elif s.taxon == "isopod":
        out["supplemental_calcium_required"] = True
        out["moisture_gradient_required"] = True
        out["stage_scheme"] = "none"
        # No chemical defence — recorded as a checked "none" rather than left
        # blank, because "we looked, it hasn't" is useful information.
        out["defensive_secretion"] = "none"
        if name in CUC_ISOPODS:
            out["bioactive_suitable"] = True

    elif s.taxon in ("mantis", "scorpion", "centipede", "whip_spider", "roach"):
        # L1–L7, 2i–7i, and nymphal instars respectively — none of these use
        # sling/juvenile/adult. Roaches and whip spiders were missed on the
        # first pass, which showed up as 39 species getting no stage_scheme
        # at all in the dry run; 38 of those genuinely count in instars.
        out["stage_scheme"] = "instar"

    elif s.taxon in ("tarantula", "true_spider"):
        out["stage_scheme"] = "sling_juvenile_adult"

    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--taxon", help="limit to one taxon")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        q = db.query(InvertSpecies)
        if args.taxon:
            q = q.filter(InvertSpecies.taxon == args.taxon)
        rows = q.order_by(InvertSpecies.taxon, InvertSpecies.scientific_name).all()

        changed = 0
        touched_fields: dict[str, int] = {}
        print(f"{'APPLY' if args.apply else 'DRY RUN'} — {len(rows)} species\n")

        for s in rows:
            wanted = facts_for(s)
            # Only fill gaps. A hand-edited value is a human decision and
            # outranks this script's group-level default.
            diff = {
                k: v for k, v in wanted.items() if getattr(s, k, None) is None
            }
            if not diff:
                continue
            changed += 1
            for k in diff:
                touched_fields[k] = touched_fields.get(k, 0) + 1
            print(f"  {s.taxon:<12} {s.scientific_name}")
            for k, v in diff.items():
                print(f"       {k} = {v}")
            if args.apply:
                for k, v in diff.items():
                    setattr(s, k, v)

        if args.apply:
            db.commit()

        print(f"\n{changed} species {'updated' if args.apply else 'would change'}")
        for k, n in sorted(touched_fields.items(), key=lambda kv: -kv[1]):
            print(f"  {k:<32} {n}")
        if not args.apply and changed:
            print("\n  (re-run with --apply)")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
