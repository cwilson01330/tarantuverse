# Verify the audit-2 groups 2–4 batch before pushing

Written 2026-10-08 while the build workspace was out of disk, so none of this
has been type-checked or tested yet. Run everything below (a fresh agent
session can do it), fix any failure, then push.

```
# from the repo root, in a clean copy
cd apps/api && python -m pytest -q -p no:cacheprovider tests
cd apps/web && npx tsc --noEmit -p .
cd apps/web-herpetoverse && npx tsc --noEmit -p .
cd apps/mobile && npx tsc --noEmit -p . && node scripts/check-design-tokens.js
cd apps/mobile-herpetoverse && npx tsc --noEmit -p .
cd apps/web && npx next lint --file <each changed web file>
```

New tests that have never run:
`tests/test_hv_audit2_animals.py`, `tests/test_d_enclosures_every_taxon.py`,
`tests/test_d_add_form_defaults.py`, `tests/test_reminders_*.py`,
`tests/test_food_*.py` (whichever agent C created), plus the edited
`tests/test_taxon_lists_in_sync.py`.

Hand checks worth doing in a browser / on a device:
- HV web species page `/app/species/<id>` renders (server page; it used to read a
  client-module value).
- HV delete confirm shows pairing/clutch/offspring counts.
- Web collection: Deceased (N) entry; feeding badges on non-tarantulas;
  nickname search.
- Web detail: Health section, Show all (N) on logs, prey size on feeding rows.
- Notification settings (web + mobile): digest on/off + hour, quiet hours.
- Add feeding for a mantis / isopod: taxon-appropriate food list + Other.
- Mobile: visibility switch on invert edit; long-press sheet on a non-tarantula.
- Sharing pages (TV web + HV web): Card links list + Turn off.
- Enclosure detail (web + mobile) with a colony assigned: listed, opens the colony.
