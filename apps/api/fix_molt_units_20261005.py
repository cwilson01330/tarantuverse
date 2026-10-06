"""One-off: convert four molt measurements that were typed in centimetres.

WHY
---
From 2026-06-15 the shared molt forms (web + mobile) labelled the size fields
"(cm)", while the column, the website's tarantula form, public pages, QR
labels and share cards all treat the value as inches. On 2026-10-05 the forms
were changed to inches. This fixes the rows we can PROVE were entered in cm.

Evidence: one keeper measures in centimetres. Their two July entries went
through the old inches form and are exact cm→inch conversions (0.79 = 2.0 cm,
1.18 = 3.0 cm), so they converted by hand. Their four Aug–Sep entries went
through the "(cm)" form and continue the same animals' growth only when read
as cm (e.g. 31cca64e: 1.20 in in July, then "3.00 → 3.50" in September =
1.18 → 1.38 in). Every other measurement in the table reads as inches
(quarter-inch steps, typical tarantula sizes), so nothing else is touched.

SAFE TO RE-RUN: each row is only updated while it still holds the original cm
values, so a second run changes nothing.

Run on the Render shell:
    python fix_molt_units_20261005.py            # dry run, changes nothing
    python fix_molt_units_20261005.py --apply
"""
import sys
from decimal import Decimal, ROUND_HALF_UP

from app.database import SessionLocal
from app.models.molt_log import MoltLog

CM_PER_INCH = Decimal("2.54")

# molt_log id -> (leg_span_before in cm, leg_span_after in cm), as stored today
ROWS = {
    "39a541e8-afdc-4023-b141-9a4d15d2571a": (Decimal("8.00"), Decimal("9.00")),
    "bd19e2e7-ed16-4602-ba5b-395b1191d381": (Decimal("2.00"), Decimal("2.50")),
    "26b08797-711f-4a4c-9064-d0d611f12ae7": (Decimal("3.00"), Decimal("3.50")),
    "29f43b08-630e-4c4d-876d-f723e5af78f6": (Decimal("1.50"), Decimal("2.00")),
}


def to_inches(cm: Decimal) -> Decimal:
    return (cm / CM_PER_INCH).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    changed = skipped = 0
    try:
        for molt_id, (cm_before, cm_after) in ROWS.items():
            m = db.query(MoltLog).filter(MoltLog.id == molt_id).first()
            if m is None:
                print(f"  - {molt_id}: not found (deleted?) — skipped")
                skipped += 1
                continue
            if m.leg_span_before != cm_before or m.leg_span_after != cm_after:
                print(f"  - {molt_id}: now {m.leg_span_before} → {m.leg_span_after}, "
                      f"not the original cm values — already fixed or edited, skipped")
                skipped += 1
                continue
            new_b, new_a = to_inches(cm_before), to_inches(cm_after)
            print(f"  {'✓' if apply else '·'} {molt_id}: {cm_before} → {cm_after} cm  "
                  f"=>  {new_b} → {new_a} in")
            if apply:
                m.leg_span_before, m.leg_span_after = new_b, new_a
            changed += 1
        if apply:
            db.commit()
    finally:
        db.close()
    verb = "converted" if apply else "would convert (dry run — nothing written)"
    print(f"Done. {changed} {verb}, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
