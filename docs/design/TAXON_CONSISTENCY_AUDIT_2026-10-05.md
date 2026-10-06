# Taxon consistency audit — 2026-10-05

Prompted by: "I can't print QR labels for isopod colonies", and "there is some shock between
screens — consistency has broken down along the taxon additions."

Method: three read-only code sweeps (colonies vs individual animals; each invert taxon vs
tarantula; Herpetoverse vs Tarantuverse) plus live usage counts. Two findings were
re-verified by hand (molt units, global search). Everything else is from code reading, not
from running the apps.

## Who is affected (active animals, real keepers only, 2026-10-05)

| Kind | Taxon | Animals | Keepers |
| --- | --- | ---: | ---: |
| Invert | tarantula | 1,924 | 115 |
| Invert | true_spider | 108 | 29 |
| Invert | other | 28 | 10 |
| Invert | mantis | 24 | 6 |
| Invert | scorpion | 16 | 11 |
| Invert | centipede | 10 | 4 |
| Invert | whip_spider / roach / vinegaroon | 5 | 5 |
| Colony | isopod / tarantula / true_spider / millipede | 7 | 5 |
| HV | snake / lizard / frog / other | 39 | ~20 |

About 80 keepers keep something other than a tarantula. They are the ones who hit the seams.

## Why it feels like a shock between screens

The code has two generations living side by side, and every new taxon was added to the
newer one while the older one kept serving tarantulas:

1. **Web still has a bespoke tarantula detail page** (`dashboard/tarantulas/[id]`, ~3,000
   lines) next to the generic invert page (~1,300 lines). Mobile converged to one screen
   (ADR-013); web never did. Pause feeding, the public/private toggle, the share link and
   the inches-based molt form exist only on the tarantula page.
2. **Colonies are a separate table with separate screens** (ADR-010, deliberate). Features
   built for individual animals since then (QR labels, share cards, transfers, mark-died,
   feeding edit) were never carried across.
3. **Several shared services still read the legacy `tarantulas` table**: global search,
   premium analytics, the full ZIP export, the Discover count.
4. **Taxon lists are copied into many files.** The registries agree, but secondary lists
   (change-taxon dialog, SEO labels, emoji maps, safety copy, import aliases, landing copy)
   drifted when isopod and roach shipped.

## Findings, ranked

### A. Correctness (wrong data or wrong output)

| # | Finding | Who | Size |
| --- | --- | --- | --- |
| A1 | **[FIXED 2026-10-05: everything says inches; 4 proven-cm rows converted]** **Molt measurements are stored in two units in the same column.** The web tarantula molt form says inches; the generic invert molt forms (web + mobile, which mobile tarantulas now use too) say cm; growth charts label cm; the share card prints " in". A keeper's growth chart can mix the two. Needs a decision on one unit, then a data look at existing rows before any conversion. | everyone who logs molt sizes | M |
| A2 | **Global search only searches the legacy tarantula table** (`routers/search.py`). A mantis, isopod or scorpion can't be found. | all non-tarantula | M |
| A3 | **Full ZIP export only bundles tarantulas** (`export_service.py`); other taxa get no folder and no photos. The mobile export screen shows only a "Tarantulas" count. JSON/CSV are fine. | all non-tarantula | M |
| A4 | **Premium advanced analytics read only tarantulas** (`routers/analytics.py`). A premium mantis keeper gets an empty page. | premium non-tarantula | M |
| A5 | Colony event edit/delete doesn't reverse its population change, so counts drift. | colony keepers | S |

### B. Missing capability for a group

| # | Finding | Size |
| --- | --- | --- |
| B1 | **Colonies: no QR label, no QR photo upload, no public page** (the reported bug). Needs `colony_id` on upload sessions, a colony upload-session route, a public colony page, and colony support in `QRModal` / `QRSheet`. | M |
| B2 | **Scanning any non-tarantula label opens the browser, not the app.** Universal/App Links only cover `/t/*`. Adding `/i/*` (and the colony path) needs a native build. | S + build |
| B3 | Colonies on web: no photo gallery/upload, no archive toggle. | S–M |
| B4 | Colonies: feeding rows can't be edited or deleted; event edit not wired; molt/water/substrate entries can't be edited. API already supports all of it. | S |
| B5 | Web invert page lacks pause feeding and the public/private toggle that the tarantula page has. | M |
| B6 | Colonies: no share card, no mark-died, no transfer, no import. | M–L |
| B7 | HV: no rack/room locations; breeding limited to snake/lizard/frog; no mark-died on HV web; no shed/weight share card; no growth chart on HV mobile. | M each |

### C. Copy and small drift (cheap, removes most of the "this screen is from another app" feel)

- Isopod missing from the web change-taxon dialog, species SEO labels, claim/feeding-day emoji maps, care-sheet "harmless" copy and import aliases (`pillbug`, `woodlouse`, `isopods`).
- Tarantula-only wording: notification settings ("Tarantula Care Reminders"), search placeholder, Discover/community strings, web dashboard "Add Tarantula" quick action, landing meta description, "QR codes for each tarantula".
- Web care sheet labels true spiders' size "Length" while growth and cards say "Leg span".
- Whip spider and vinegaroon have no growth module, and centipede has no breeding module, with no recorded reason. Decide and record.
- Dead code: local feeding/substrate reminder helpers are only called from retired tarantula screens.

## Intentional differences (leave as they are)

Colonies are left out of Feeding Day, the overdue badge and the daily digest (ADR-010
Phase 3). Premolt prediction stays tarantula-only, since it isn't validated for other taxa.
Colony photos are uncapped. Detritivores (millipede, roach, isopod) have no feeding-stats
module.

## Suggested order

1. **Consistency sweep (S, one pass):** every item in C, plus B4 and A5.
2. **QR for colonies (B1)** together with **deep links for `/i/*` (B2)**, timed with the
   next app build.
3. **Shared services off the legacy table:** A2, A3 and A4.
4. **Molt unit decision (A1):** check the existing data first, then pick one unit.
5. **Retire the bespoke web tarantula page:** move its extras (pause, public toggle, share)
   onto the generic page (B5), then redirect, as mobile already does. This removes the
   biggest source of drift for good.
6. Colony and HV capability gaps (B3, B6, B7) by demand.

## Follow-up: units preference (requested 2026-10-05)

UK and most non-US keepers measure in centimetres. Plan:
- Storage stays inches (one source of truth).
- `users.measurement_units` = `imperial` | `metric`. It defaults from the device region on first launch (US, Liberia and Myanmar → imperial, everywhere else → metric), syncs across devices, and can be switched in Settings on web and mobile.
- Convert at the edges: molt forms (input), growth charts, molt history, share cards, QR labels, public pages and exports. One helper per platform (`formatLength`, `parseLength`), plus a server helper for share cards and exports.
- Herpetoverse weight/length fields should follow the same setting.

To stop the drift recurring: one shared taxon registry module that the secondary lists
import, rather than copy; a test that fails when a taxon value is missing from any list;
and a rule that new collection features must name their colony and HV story in the plan.
