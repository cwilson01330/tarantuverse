# Audit 2: Colony lifecycle (web vs mobile parity, correctness)

Read-only code audit, 2026-10-08. No HIGH findings. All paths are relative to `apps/`.
Intentional differences from `docs/design/TAXON_CONSISTENCY_AUDIT_2026-10-05.md` were left alone
(colonies out of Feeding Day/overdue/digest, colony photos uncapped).

Checked and found sound: every colony write route's policy level matches the equivalent invert route
(create/update/end/reopen = keeper, events/feedings/molts/substrate/care/photo upload = logger, delete/transfer/QR session = owner_only;
`api/app/routers/colonies.py`, `transfers.py:326-494`, `qr.py:360`); by-id edit/delete of logs resolves through `load_log_parent`
(colony branch, `utils/access.py:186-190`) with logger own-only rule; full/partial transfer math is internally consistent
(`transfers.py:205-236`, `717-937`, claim re-checks counts under row lock); cap exclusion is consistent
(`utils/limits.py:82-97` excludes archived/ended/transferred); unarchive is cap-checked, reopen deliberately is not
(`colonies.py:330-336`); public `/col`, link preview, card links and og image all 404 for ended/transferred
(`qr.py:1112-1117`, `share_cards.py:160-196, 531-545`); husbandry temps are unit-converted on web+mobile detail and edit/add
(`useUnitField` keeps the stored value when untouched); import goes through `create_colony_row` so cap/location/visibility match manual create.

---

## MEDIUM

### M1. Web dashboard animal count and cap gate ignore colonies
`web/src/app/dashboard/page.tsx:343` sets `animalCount = totalAnimals ?? tarantulas.length`, where `totalAnimals` is `/inverts/` length (line ~190). Colonies are not added.
That value feeds the cap notice (`:404`), the "My collection: N animals" tile (`:420-429`) and the add gate `canAddTarantula(animalCount)` (`:348`).
The server cap counts each active colony as 1 (`utils/limits.py:138-141`), and the Collection page does add them (`tarantulas/page.tsx:543-544`).
Effect: a free keeper at 14 animals + 1 colony sees 14, no at-cap notice, and the Add button skips the upgrade modal (server then 402s).

### M2. Web `updateColony` shows "[object Object]" when the cap blocks an unarchive
`web/src/lib/colonies.ts:514` does `new Error(body?.detail || ...)`. The unarchive cap error is a dict (`colonies.py:336` -> `limits.py:147-158`), and a 422 is an array.
Hits the detail-page Archive/Unarchive button (`dashboard/colonies/[id]/page.tsx:435-438`, shown via `archiveError`) and the edit page save (`edit/page.tsx:235`).
`createColony` has a 402 branch (`:491`), `updateColony` does not. Mobile is fine (`utils/errors.ts:45-47` reads `detail.message`).

### M3. Archived colonies stay publicly reachable
`GET /col/{id}` (`api/app/routers/qr.py:1097-1117`), `/public-card/tarantuverse/colonies/{id}` (`share_cards.py:532-545`) and existing card links (`_colony_live`, `share_cards.py:184-193`) check ended/transferred but never `is_active`.
The UI says an archived colony is "hidden from your collection". A public colony with a printed QR label keeps showing its headcount and stages to anyone after it is archived.

### M4. Event sign handling differs between web and mobile (count math)
Mobile forces the sign from the event type (`mobile/app/colony/[id].tsx:118-119, 302-306`; quick log `ColonyQuickLogSheet.tsx:41-46, 100`).
Web only blocks negatives on birth/added/merge (`web/src/lib/colonies.ts:941-951`, `dashboard/colonies/[id]/page.tsx:772`); for death/removed/cannibalism/split it accepts either sign, and the form says "enter a negative number".
Typing `5` for a death on web raises the population by 5; the same entry on mobile lowers it. The server has no sign-by-type validation (`schemas/colony.py:253-275`, `colonies.py:_apply_delta`). Same on web event edit (`page.tsx:575`).

### M5. Bucket-key casing/vocabulary differs per surface, so one stage can split into two buckets
Server default bucket is lowercase `mixed` (`colonies.py:121-129`); import writes lowercase keys (`colony_import_service.py:_STAGE_KEYS`, `"mixed"`); mobile add/edit lowercase typed or tapped names (`mobile/app/colony/add.tsx:121`, `edit.tsx:189-196`); web add seeds lowercase `adults/juveniles/nymphs` (`web/.../add/page.tsx:37`) but keeps whatever case is typed (`:179`).
Mobile quick-log offers the raw capitalised suggestions ("Unsexed", "Females", "Adult females", "Mixed", `colony-buckets.ts:37-52`) and sends them as the event stage (`ColonyQuickLogSheet.tsx:75, 80, 100`), and falls back to `'Mixed'` (`:80`).
`_apply_delta` is case-sensitive, so "Unsexed" and "unsexed" (or "Mixed" vs the web "- mixed -" option, which sends blank = `mixed`) become separate buckets that both count toward the total, and the duplicate check on edit (`stageCounts[k] !== undefined`) does not catch case variants.

### M6. Population history is incomplete from day one for every created or imported colony
Create (web `add/page.tsx:217`, mobile `add.tsx:149`) and import (`colony_import_service.py` -> `create_colony_row`) write `stage_counts` directly with no baseline `added` event. Only transfer claims write one (`transfers.py:826-838`).
`_replay` starts from zero (`colony_history_service.py:56-72`), so the chart's absolute totals are short by the starting headcount, `first_total/last_total` are wrong, and `history_complete` is false (`:148`) until the keeper sees the small-print caveat (`web ColonyPopulationChart.tsx:129`).

### M7. Editing buckets can change the population with no event
Both edit screens send `count_correction` events only for buckets that exist in the new map, then overwrite `stage_counts` to drop removed buckets (`web .../edit/page.tsx:192-214`, `mobile .../edit.tsx:237-276`).
Deleting a non-empty bucket drops its animals silently (no event), and renaming a bucket logs a `+N` correction on the new name while the old name's events stay in the replay, so the chart double counts. This contradicts the comment that the edit screen has "one write path, and a trail worth reading".

### M8. Web colony edit cannot set or change the species; mobile can
`web/src/app/dashboard/colonies/[id]/edit/page.tsx` has no species field (0 matches); web add has the picker (`add/page.tsx:119-160, 323`). Mobile edit sends `species_id` / clears it (`mobile/app/colony/[id]/edit.tsx:278-280`).
A web keeper who skipped species at create (or picked a wrong one) has no way to fix it, so the care sheet link, share card species line and species match stay empty.

### M9. Web add has no per-taxon bucket suggestions or hints
`web/src/lib/colony-presets.ts` mirrors `suggestedBuckets` and `bucketHint` but only `showsEnclosureOrientation` / `enclosureSizePlaceholder` are imported (`add/page.tsx:28`, `edit/page.tsx:27`).
Web add seeds `['adults','juveniles','nymphs']` for every taxon (`add/page.tsx:37`); mobile offers Unsexed/Females/Males for communal tarantulas and spiders, Adult females/Adult males/Nymphs for roaches, etc. The documented per-taxon vocabulary only exists on mobile.

### M10. Colony export drops husbandry fields
`api/app/services/export_service.py:189-198` `COLONY_FIELDS` omits `enclosure_type`, `enclosure_size` (and `sitter_note`), although both are on the model and in the edit forms. JSON/CSV/full ZIP exports lose them, and a re-import cannot restore them. `COLONY_EVENT_FIELDS` (`:200`) also omits `logged_by_user_id`.

---

## LOW

### L1. Closed state is UI-only
Ended/transferred colonies still accept events, feedings, molts, substrate, care logs, photos, QR sessions and edits through the API (`colonies.py:478-499` has no state guard; same in `feedings.py:~545`, `photos.py:746`, `qr.py:360-400`). The web/mobile UIs hide the buttons (`canLog/canKeep`). Same as deceased inverts, so a parity choice, but "Logging is closed" is not true at the API.

### L2. Location lists count phantom colonies
`utils/locations.py:140` only filters transferred/died when the model has `died_at`; `Colony` has none, so ended and transferred-out colonies still count in `GET /inverts/locations` (and the group counts/picker). `existing_locations` also keeps their spellings alive.
`inverts.py:583-585` `bulk-location` for `colony_ids` has no active/untransferred filter either, although its docstring says "living, untransferred".

### L3. Web "Transfer claimed" notification does nothing on TV
`transfers.py:925` (colony claim) and `:686, :1125` send `deeplink="/transfers"`. Neither TV resolver maps it (`web/src/lib/deeplinks.ts:17-21`, `mobile/src/lib/deeplinks.ts:31-42`). Web now has a sent-links list at `/dashboard/sharing` (`sharing/page.tsx:285-346`), so `/transfers -> /dashboard/sharing` could be mapped. Mobile has no sent-transfers list at all; links are only visible per colony inside the transfer sheet (`ColonyTransferSheet.tsx:98`).

### L4. Pending transfer links outlive the colony state
Ending a colony or full-transferring it leaves other pending links "pending" (claim page `claim/[token]/page.tsx:170` shows a normal offer; claim then 409s, `transfers.py:763-772`). Archiving after creating a link leaves it claimable (claim checks ended/transferred only), and the transfer UI is hidden for archived/ended colonies on both platforms (`page.tsx:2228`, `mobile [id].tsx:1619`), so on mobile the link cannot be cancelled without unarchiving. Web can still cancel on `/dashboard/sharing`.

### L5. QR button stays on ended/transferred colonies
`web page.tsx:996` and `mobile [id].tsx:398` show QR for `isOwner` regardless of state; the printed label's `/col` link then 404s for everyone but the owner. Transfer button correctly requires running+active.

### L6. Mobile has no Archive/Unarchive button on the detail screen
Web has it (`page.tsx:971-978`); mobile only has the Active switch inside Edit (`mobile edit.tsx:524-526`).

### L7. Collection card parity and dead data
`GET /colonies/` computes `last_feeding_date`, `days_since_last_feeding` ("so the card can say Fed 4d ago", `colonies.py:186-204, 237`) but neither client reads them. Web card shows photo but not `change_30d` or the stage bar (`tarantulas/page.tsx:741-805`); mobile row shows both but no photo (`ColonyRow.tsx`).

### L8. Event list capped at 100, no pagination
`colonies.py:456` default `limit=100`; both clients call without params (`web lib/colonies.ts:878`, `mobile lib/colonies.ts:332`). Older events cannot be seen, edited or deleted from the app, though the chart replays all of them.

### L9. Reversal after a clamped removal over-restores
`_apply_delta` clamps at 0 on write (`colonies.py:121-129`); `_reverse_delta` reverses the full delta (`:132-142`) and its `clamped` flag is ignored by callers. Removing 50 from a bucket of 20 then deleting that event leaves 50.

### L10. Stage key length is unbounded but event stage is 40
`schemas/colony.py:_validate_stage_counts` allows any key length; `ColonyEvent.stage` is `String(40)` and `ColonyEventCreate.stage` max 40. A long bucket name makes quick-log 422 and a transfer claim (`transfers.py:829-838`) write a 41+ char stage, which would fail the insert.

### L11. Public colony page messaging and mobile card detail
`/col` returns 403 for both "collection private" and "this colony is private"; web maps every 403 to "This keeper's collection is private" (`ColonyPublicClient.tsx:112`) and mobile to the same (`PublicLabelCard.tsx`). Mobile public card omits stage breakdown and care at a glance that web shows.

### L12. Server does not validate species taxon against colony taxon
`colonies.py:96-101, 319-320` only check the species exists. Web add scopes search by taxon and import checks it, so only API clients can mismatch.

### L13. Substrate edit/delete do not recompute `colony.last_substrate_change`
Create rolls up onto the colony (`substrate_changes.py:463-470`); update/delete (`:372-405`) leave it stale. Same as inverts.

### L14. Advanced analytics ignore colony logs
`api/app/routers/analytics.py` has no colony references, so colony feedings (now with `quantity`) and molts are absent from cost/heatmap views.

### L15. Import dedupe ignores archived/ended colonies; claim vs event write race
`existing_colony_keys` uses `active_colonies_query` (`colony_import_service.py:~540`), so re-importing a sheet after archiving creates a duplicate. `create_event` loads the colony without a lock (`colonies.py:484-497`), so an event committed during a claim that holds the row `FOR UPDATE` (`transfers.py:754-760`) can overwrite the claim's decrement with a stale JSONB.

### L16. Dead UI branch on claim page
`claim/[token]/page.tsx:255` renders "Out of N in the colony" for partial transfers, but the API deliberately sends `colony_total = None` for partial (`transfers.py:303`).
