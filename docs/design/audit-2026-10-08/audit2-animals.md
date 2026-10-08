# Audit 2: individual animals (TV web + mobile + API), 2026-10-08

Read-only code audit. Everything below was verified by reading the cited file and line; nothing was run. Items on the 2026-10-05 "Intentional differences" list (colonies out of Feeding Day, premolt tarantula-only, detritivores without feeding stats) are not reported. All paths are under `apps/`.

Journeys walked for mantis, isopod, true_spider, millipede, other against tarantula: add, species picker, detail, logs, photos, pause, visibility, share, QR and /i, transfer, died/restore, edit, locations, Feeding Day, collection, search, dashboard, analytics, notifications, breeding, export/import.

## HIGH

**H1. Deceased and transferred centipedes, whip spiders and (deceased) scorpions stay in the collection grid.**
- The web and mobile collection lists read the legacy per-taxon facades, not `/inverts/`: web `web/src/app/dashboard/tarantulas/page.tsx:89-91,251`, mobile `mobile/app/(tabs)/collection.tsx:342-367` via `mobile/src/lib/centipedes.ts:305`.
- `api/app/routers/centipedes.py:104-117` and `whip_spiders.py:93-106` filter on neither `died_at` nor `transferred_out_at`. `scorpions.py:93-137` filters transferred only.
- `/tarantulas/` does filter both (`tarantulas.py:94-110`), which is the exact bug its comment describes.
- Effect: a centipede marked died stays in the grid, the taxon-chip counts and the cap notice (`totalCollectionCount`, tarantulas/page.tsx:544). On mobile it also shows under the Died chip. A transferred centipede or whip spider stays too.
- Fix: point the list at `/inverts/?taxon=` (already used for the other 7 taxa), or add `active_inverts_query` to these three routes.

**H2. Public keeper profile shows tarantulas only, and not even the right tarantulas.**
- `api/app/routers/keepers.py:100-148` (`/collection/`) and `:150-240` (`/stats/`) query the legacy `Tarantula` table only.
- Consumers: web `keeper/[username]/page.tsx:135-142`, `community/[username]/page.tsx:299,319`, mobile `community/[username].tsx:188,209`.
- Every non-tarantula animal (about 190 animals, about 80 keepers) is invisible on a public profile. Stats ("total_public", unique species, sex split) count tarantulas only.
- Neither endpoint filters `died_at` or `transferred_out_at`, so dead and sold tarantulas are listed and counted, on the keeper's own profile and for visitors.
- The detail page promises the opposite: `web/.../inverts/[id]/page.tsx:918` says "Public animals are listed on your keeper profile".

**H3. The web app has no way to see animals that died.**
- `web/src/lib/animal-lifecycle.ts:142` `listDeceasedInverts` is defined and never called. The collection page (`tarantulas/page.tsx`) has no Died view, chip or link, though mobile has the Died chip and `DeceasedArchive`.
- After "Mark as died" (`inverts/[id]/page.tsx:693`) the animal disappears from web. Restore (:686) is reachable only by remembering the URL. This affects every taxon, tarantula included.

**H4. Notification settings toggles control nothing, and the daily digest has no settings at all.**
- The Feeding, Substrate, Molt Prediction and Maintenance reminder switches (mobile `app/settings/notifications.tsx:287-340`, web `dashboard/settings/notifications/page.tsx:208+`) save preferences that only `mobile/app/tarantula/add-feeding.tsx:151` and `add-substrate-change.tsx:103` read.
- Nothing navigates to those screens any more; `app/tarantula/[id].tsx` redirects and `invert/add-feeding.tsx:40` only mentions them in a comment.
- The server reads none of them. The only real reminder is the daily "N animals are due" push (`api/app/services/digest_service.py:112-198`). It is on by default (`models/notification_preferences.py:54-55`), and `daily_digest_enabled` and `digest_hour` appear in no schema or client.
- A keeper cannot turn the digest off or move its hour. The previous audit listed the helpers as "dead code" but left the settings UI that depends on them.

## MEDIUM

**M1. Web collection shows feeding status for tarantulas only.**
- Cards show "No data" for tarantulas without stats and just a taxon label for every other taxon (`tarantulas/page.tsx:694-704`). The list view prints "—" under Last Fed for non-tarantulas (:620-621).
- The page already fetches `/inverts/feeding-status` for every taxon (:164) but only uses it for locations.
- Tarantula status still costs one `/tarantulas/{id}/feeding-stats` request per animal (:305-333), the N+1 that mobile removed.
- Mobile shows the status footer and the Fed / Refused buttons for predator taxa (`collection.tsx:489-496,925-960`).

**M2. Web collection ignores the animal's nickname.**
- Cards, list rows and search use `common_name`, then scientific name (`tarantulas/page.tsx:256-263,468-475,712-714`). `Tarantula` has no `name`, and other taxa use `r.common_name || r.name`.
- A mantis called "Gerald" can't be found by that name and is titled "Orchid mantis". The detail page (`inverts/[id]/page.tsx:796`) and mobile use `name || common_name`.

**M3. Web detail page cuts every history at 8 entries with no "show all".**
- `.slice(0, 8)` on feedings, molts, water and substrate (`inverts/[id]/page.tsx:853,878,1079,1096`).
- Older entries are unreachable on web, so a tarantula with 60 feedings loses its history. Mobile pages its timeline (`mobile/app/invert/[id].tsx:87,647`).
- Instar taxa can still see all molts in the Stages card; nobody else can.

**M4. Web has no health events (injury, illness, bad molt, escape, vet visit, observation).**
- The API and mobile have them for every taxon (`mobile/app/invert/[id].tsx:180,1088`, `invert/add-event.tsx`).
- Web only carries unused client helpers (`animal-lifecycle.ts:211-250`); no page calls them.

**M5. Web feeding form dropped prey size (regression from retiring the tarantula page).**
- `web/.../inverts/[id]/add-feeding/page.tsx` posts no `food_size`. The feeding rows show none either (`inverts/[id]/page.tsx:855`).
- Mobile has a Prey size chip (`mobile/app/invert/add-feeding.tsx:17-23,98-115`), added after a keeper complaint (comment at :40).
- Editing a feeding on web does not send size, so the stored value is not touched; only entry and display are lost.

**M6. The food picker is a tarantula-feeder list for every taxon.**
- Cricket, Dubia Roach, Red Runner, Mealworm, Superworm, Other, defaulting to Cricket: web `add-feeding/page.tsx:15`, mobile `invert/add-feeding.tsx:15`.
- There is no fruit fly or housefly (mantis, jumping spiders, whip spiders' hatchlings) and no leaf litter or vegetable (millipede, isopod, roach). "Other" has no free-text field, so the only place to say what was fed is notes. The previous audit fixed wording but not this.

**M7. Web "Add animal" form lacks what mobile's add flow does.**
- It ignores the species' enclosure type, size, temperature, humidity and water-dish values (`web/.../inverts/add/page.tsx:124-132` only sets names). Mobile applies them (`mobile/app/add.tsx:281-300`).
- It hard-codes enclosure type to terrestrial and water dish to yes (:58,67) for every taxon. Mobile uses a per-taxon `defaultEnclosureType` (`mobile/src/lib/inverts.ts:62-126`); a new mantis or arboreal true spider is saved terrestrial on web.
- It has no life stage field (see M8). It falls back to `scorpion` when the `taxon` param is missing or invalid (:42).
- The tarantula form (`tarantulas/add/page.tsx`) is a separate older page with required common and scientific names, no "did you mean", and `enclosure_id` ignored (see M10).

**M8. Web life stage control exists for tarantulas only.**
- `inverts/[id]/edit/page.tsx:251` wraps it in `form.taxon === 'tarantula'`. The API uses `life_stage` for every taxon's feeding interval (`api/app/routers/inverts.py:296-372`). Mobile offers it for all (`mobile/app/invert/edit.tsx:172-196`).
- A mantis or scorpion keeper on web can't set the stage, so the cadence falls to the generic 7-day default.

**M9. Mobile has no per-animal public/private control for non-tarantulas.**
- `mobile/app/invert/edit.tsx` and `invert/[id].tsx` have no visibility control. The only one is in the legacy `app/tarantula/edit.tsx:584`.
- Per-animal visibility is now enforced on `/i`, `/t` and link previews, and web has the toggle (`inverts/[id]/page.tsx:910-943`, `edit/page.tsx:319`). A mobile-only mantis keeper with a public collection cannot hide an animal.

**M10. Mobile collection long-press sheet is tarantula-only, and its Edit opens a different, older form.**
- Only tarantula cards and rows have `onLongPress` (`collection.tsx:897,996`); `renderInvertCard` (:925+) has none.
- The sheet's Edit goes to `/tarantula/edit` (`collection.tsx:874`), a 740-line legacy screen that PUTs `/tarantulas/{id}` and has no location, instar or size fields. The detail screen's Edit goes to `/invert/edit` (`invert/[id].tsx:352`). One tarantula therefore has two edit forms with different fields.

**M11. Web invert care sheets have no "Add to collection".**
- `web/src/app/species/inverts/[id]/InvertCareSheetClient.tsx:255-300` has only Shortlist. The tarantula sheet has the button (`species/[id]/SpeciesDetailClient.tsx:107-118,284`). Mobile's invert care sheet has it (`mobile/app/invert-species/[id].tsx:516-530`).
- `/dashboard/inverts/add` also reads no `speciesId` param, so a link couldn't prefill anyway.

**M12. Enclosures are tarantula-only in the API, and web can't put anything in one.**
- `api/app/routers/enclosures.py:46-52` (inhabitant count), `:245-274` (list), `:277-318` (add), `:234-236` (delete clears only `Tarantula`) never look at other taxa.
- Mobile's "Add inhabitant" (`mobile/app/enclosure/[id].tsx:341` to `app/add.tsx`) creates a non-tarantula with `enclosure_id` that the enclosure never lists or counts.
- Web's "+ Add Tracked Member" links to `/dashboard/tarantulas/add?enclosure_id=` (`enclosures/[id]/page.tsx:543`), but that page never reads the param. The empty-state copy at :637 says "Assign animals from their individual detail pages", and no detail page has such a control. No client calls `POST /enclosures/{id}/inhabitants/{id}`.

**M13. Scanning a non-tarantula label gives the owner no quick log.**
- `/t/[id]` has owner Log Feeding with a bottom sheet and Log Molt (`t/[id]/TarantulaPublicClient.tsx:127-136,448-455,672-769`), "the whole point of an enclosure QR".
- `/i/[id]` offers only "Open in my collection" (`i/[id]/InvertPublicClient.tsx:309-316`), no quick feed, no log molt, no follow or "Add yours". The file's header says it is "deliberately smaller", but the scan-and-feed flow is the label's purpose.

**M14. Server decides "detritivore" only from a linked species, so unlinked millipedes, isopods and roaches get overdue flags and pushes that mobile hides.**
- `inverts.py:326-331` returns no interval only when `species.feeding_mode == 'detritivore'`; with no species it falls to the 7-day default (:371-383). There is no taxon check, and `Invert` has no `feeding_mode`.
- `/inverts/feeding-status` (:440-460), web dashboard "Needs Feeding", web Feeding Day and the digest (`digest_service.py:60-79`) therefore flag them once any feeding is logged.
- Roach is `omnivore` in the registry, but the server only special-cases `detritivore`. Mobile suppresses status by registry taxon (`collection.tsx:489-496`), so mobile and the push disagree.

**M15. Basic analytics are cross-taxon but copy and filter are not.**
- `api/app/routers/analytics.py:171-175` excludes transferred but not deceased animals, so dead animals count in totals, species and sex splits.
- Web `dashboard/analytics/page.tsx:150-168,313,401` and mobile `analytics/index.tsx:383-399,501`: "No tarantulas in your collection yet!", "Add Your First Tarantula" (to the tarantula-only form), "Notable Tarantulas", "Avg Feedings Per Tarantula".

**M16. Global search's tarantula-species common-name match never matches.**
- `api/app/routers/search.py:116` `Species.common_names.any(search_term)` compares each array element for equality with `'%q%'`; the invert catalog branch just below uses `array_to_string(...).ilike` correctly.
- Searching "curly hair" finds no tarantula species by common name; "orchid mantis" works. Scientific-name search is fine.

## LOW

- **Empty-state and shortcut CTAs are hard-wired to the tarantula add page, skipping the taxon picker:** `dashboard/analytics/page.tsx:165`, `collection-value/page.tsx:137`, `feeding-day/page.tsx:469`, `tarantulas/page.tsx:200`, `t/[id]/TarantulaPublicClient.tsx:645`.
- **Collection Value is tarantula-only** (`api/app/routers/pricing.py:292`, legacy table, includes dead and sold animals). A mantis keeper is told "Add a tarantula before exploring collection market signals" (`collection-value/page.tsx:134`).
- **Tarantula wording in shared UI:** "tarantula keeping journey" (`achievements/page.tsx:139`); Sidebar spider icon on "Collection" (`Sidebar.tsx:58`); transfer placeholder "0.0.1 sling, last molt 6/1" (`inverts/[id]/page.tsx:1438`); pause helper "She's in premolt, common for slings" (`mobile/src/components/PauseFeedingSheet.tsx:45`); life stage chip "Sling" for all taxa (`mobile/app/invert/edit.tsx:178`); location placeholder "Spider room" (`LocationPicker.tsx:139`).
- **Size label on web detail says "Size" for tarantula and true_spider** (only whip_spider gets "Leg span", `inverts/[id]/page.tsx:812`), while the add form, share card and growth chart say Leg span.
- **Final-molt flag is offered for isopod, millipede, vinegaroon and other** (default branch of `finalMoltCopy`, `lib/inverts.ts`), though isopods molt through adulthood. Centipede and whip spider were excluded for that reason.
- **Profile share card has no instar or stage** (`api/app/services/share_card.py:27-28` allow-list: molts, size only). A mantis at L5 with no logged molts shows nothing.
- **Web photos:** thumbnails aren't clickable, so there is no full-size view (`inverts/[id]/page.tsx:1112-1137`). The free 5-photo cap shows a plain alert on web (`add-photo/page.tsx:50-58`); mobile shows the upgrade sheet (`mobile/app/invert/add-photo.tsx:54-95`).
- **Web cadence dialog is opened with `derivedDays={null}`** (`inverts/[id]/page.tsx:1163-1167`), so the keeper never sees the care-sheet interval they're overriding; mobile passes it (`invert/[id].tsx:1422`). The "Feeding schedule" hero button also shows for taxa with no feeding module (:701-708).
- **Substrate-change edit and delete don't recompute `last_substrate_change`** on the animal (`api/app/routers/substrate_changes.py:372-416`).
- **Discover:** "popular species" reads only the tarantula catalog and the platform stat counts the legacy table (`discover.py:116-133,168`).
- **Web molt form keeps a manual "Molt number" field** (`add-molt/page.tsx`) that now duplicates the auto instar count and appends "Molt #n" to notes.
- **Dead code:** `mobile/app/tarantula/add-feeding.tsx`, `add-molt.tsx`, `add-substrate-change.tsx` are unreachable; `GET /feedings/reminders` (`feedings.py:~708`) has no client.

## Checked and fine (no finding)

Web detail page now covers pause, visibility, QR, share card, transfer, died/restore, feeding cadence, stages, growth, breeding gating by registry. Edit/delete on every log type works on web. Generic log endpoints, instar auto-count, locations (add, edit, group, rename), global search for animals, ZIP export, advanced analytics, achievements and import are cross-taxon. No remaining links to removed pages other than redirects: `/dashboard/tarantulas/[id]`, `/edit` and `/husbandry` are redirects; the tarantula-only add page is still live.
