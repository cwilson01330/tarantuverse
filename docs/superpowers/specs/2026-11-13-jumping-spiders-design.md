# Jumping spiders (and friends): egg sacs to sling groups, care guides, everyday logging — design

Date: 2026-11-13 · Status: approved in conversation (sections 1–5), awaiting spec review
Product: Tarantuverse (TV) only. Herpetoverse (HV) is out of scope.

## 1. Why

Production data (2026-11-12, Neon, read-only):

- True spiders are the only taxon besides tarantulas growing on their own: 159 animals (144 living) across 36 keepers; 20 keepers added 69 of them in the last 60 days. One keeper holds 51.
- They are mostly jumpers: 103 Salticidae, 70 of them *Phidippus regius*. Next: Eresus (15), Hogna (6).
- They log: 881 feedings (284 in the last 30 days, 17 keepers), molts on 47 animals, photos on 122. Only 4 of 61 molts carry a size; only 26 animals have 2+ photos.
- Breeding is unused: 0 true-spider pairings, 0 egg sacs platform-wide, 2 pairings in total. Two structural reasons: an egg sac must belong to a pairing (a wild-caught gravid female, the common case for jumpers, cannot log her sac), and offspring are one row per spiderling (a jumper sac hatches 50–200).
- 22 true spiders have no species link; several are real species the catalog lacks.
- `feeding_logs.quantity` already exists (all 881 true-spider rows are 1); the invert forms just don't expose it.
- Research: `docs/research/2026-10-27-feature-research.md` opportunity #7 names "egg sacs and communal slings for jumping spiders" and advises testing breeding on a narrow taxon first.

Goal: Tarantuverse becomes the obvious app for jumping-spider keepers, so this group keeps growing and keeps logging. Other taxa benefit where it costs nothing extra.

Cory's decisions (stated in conversation):

- Scope: egg sac → sling group; care guides for missing species; jumper-tuned everyday logging (all four items in section 6).
- The egg-sac flow is switched on for **true spiders, mantids, tarantulas and scorpions**.
- **Logging a sac, hatching it into a group and splitting slings out are free.** Pairings and offspring sales/status tracking stay Premium.
- Approach A: a sac hatches into a **colony** (existing colony mode), not a new entity.

Success (section 9): keepers log sacs and hatch them; split-out spiders appear; after-molt photos and multi-prey feedings rise.

## 2. Scope

In:

1. Egg sacs without a pairing (mother-linked), for the four taxa; free.
2. Hatch a sac into a sling group (a colony linked to the sac).
3. Split slings out of any colony of the four taxa into individual animals, with parentage when the colony came from a sac.
4. Screens on web and mobile (parity), per-taxon wording.
5. Care guides for species keepers already own (seed script, sourced facts only).
6. Everyday logging: stage chip on Collection cards; photo prompt after a molt; mature badge (+ sourced note); prey count on feeding forms.
7. Measurement report, What's new entry, docs.

Non-goals: HV; centipede/other taxa sacs (registry can switch them on later); locality/form field (no demand evidence: 2 records); any lifespan countdown; changing pairing or offspring Premium gates; showing parentage on public pages; notifications for expected hatch dates; Feeding Day prey counts.

## 3. Data model (migration `brd_20261113_egg_sac_groups`, additive)

`egg_sacs`:

- `pairing_id` becomes NULLABLE.
- New `mother_invert_id UUID NULL REFERENCES inverts(id) ON DELETE CASCADE`, indexed.
- New CHECK `egg_sacs_parent_check`: `pairing_id IS NOT NULL OR mother_invert_id IS NOT NULL`.
- New `outcome VARCHAR(20) NULL` with CHECK `outcome IS NULL OR outcome IN ('hatched','failed')`. NULL = waiting.
- Backfill: none needed (0 rows in production). Code fills `mother_invert_id` from the pairing's `female_invert_id` (falling back to the legacy `female_id`, same UUID) on every create/update that sets a pairing. A free keeper at the cap cannot hatch (the group is one new colony) — the hatch sheet shows the same limit message as adding an animal.
- Live-bearing taxa (scorpion) use the same row: `laid_date` = date born; incubation/pulled fields are hidden in the UI and ignored by the API (accepted, not required).

`colonies`:

- New `egg_sac_id UUID NULL REFERENCES egg_sacs(id) ON DELETE SET NULL`, with a UNIQUE index (one group per sac).

`offspring`: no schema change. Split-out spiders from a sac-born colony get one row each: `egg_sac_id`, `invert_id`, `status='kept'`, `status_date` = split date. This reuses existing parentage reads.

Model constants, kept in lockstep with the CHECKs: `EGG_SAC_OUTCOMES = ('hatched','failed')`; `BROOD_TAXA = ('true_spider','mantis','tarantula','scorpion')` in one Python module (`app/utils/broods.py`), with the bucket name per taxon: `true_spider`/`tarantula` → `slings`, `mantis` → `nymphs`, `scorpion` → `scorplings`.

## 4. API

All new routes are TV collection routes: owner, plus co-keepers with the **keeper** role (`scope_collection(..., need="keeper")`); logger/viewer get 403, strangers 404. None is Premium-gated.

- `GET /inverts/{id}/egg-sacs` — that mother's sacs, newest `laid_date` first, including pairing-based ones (matched on `mother_invert_id`). Each row carries `outcome`, `hatched_colony` (`{id, name}` or null; null with `outcome='hatched'` means the group was deleted) and `pairing_id`.
- `POST /inverts/{id}/egg-sacs` — body: `laid_date` (required), `expected_hatch_date`, `pulled_date`, incubation fields, `spiderling_count`, `notes`, `photo_url` (allowed-photo check as elsewhere). Refusals: taxon not in `BROOD_TAXA` → 400; sex male → 400; mother died or transferred → 409 (`utils/closed_animals.refuse_if_closed_invert`). Rate limit 60/hour.
- `PUT /egg-sacs/{id}`, `DELETE /egg-sacs/{id}` — existing routes, now also resolving access through the mother when there is no pairing, and allowed on a closed mother (editing history stays open, matching TV's closed-animal rule).
- `POST /egg-sacs/` (pairing-based, existing) — **Premium gate removed** (the pairing itself is already Premium); still verifies the pairing; sets `mother_invert_id` from the pairing.
- `POST /egg-sacs/{id}/hatch` — body `{count: 1..2000, count_is_estimated: bool, hatched_on: date, name?: str≤100}`. Works on a closed mother. 409 if `outcome='hatched'` already. Checks the free cap for one new colony (`enforce_collection_limit`). Creates a colony: mother's `taxon`, `species_id`, `location`; `name` default "{mother name} {bucket}" (e.g. "Sally slings"); `source='bred'`; `founded_date=hatched_on`; `stage_counts={bucket: count}`; `count_is_estimated`; `egg_sac_id`. Writes one `added` colony event "Hatched from egg sac" (descriptive, like "Starting count" — never re-applied). Sets the sac's `hatch_date`, `spiderling_count`, `outcome='hatched'`. One transaction. Returns `{egg_sac, colony}`.
- `POST /egg-sacs/{id}/fail` — sets `outcome='failed'` (optional `notes` appended). A failed sac can still be hatched later (hatch clears `failed`).
- `POST /colonies/{id}/split-out` — body `{count: 1..50, split_on: date, life_stage?: 'sling'|'juvenile'|'adult' (default 'sling')}`. Only for colonies whose taxon is in `BROOD_TAXA` (else 400); refused for ended, archived or transferred colonies (409). 409 if `count` > the colony's total. Cap: `enforce_collection_limit(db, owner, adding=count)` — a new `adding` parameter (default 1) so the check covers the whole batch; the 402 body adds `can_add` (how many still fit). Creates `count` inverts: name "{colony name} #{n}" numbered after any existing "#n" from earlier splits of this colony, colony's taxon/species/location, `sex` unknown, `life_stage`, `date_acquired=split_on`, `source='bred'`, visibility per the owner's collection default. Writes one `split` colony event with `count_delta=-count` taken from the largest bucket first (then the next largest; one event per bucket touched), `destination="Split out into individual enclosures"`. If the colony has `egg_sac_id`, writes the offspring rows (section 3). Bumps species `times_kept` once per new animal, as invert create does. One transaction. Returns `{created: [{id,name}], colony_total}`.
- `/inverts/feeding-status` rows gain `current_instar` (already on the invert) and `matured_at` (date of the newest `is_ultimate` molt, one batched query; null otherwise).
- Invert detail (`GET /inverts/{id}`) gains `parentage`: `{egg_sac_id, mother: {id,name}|null, colony: {id,name}|null}` when an offspring row links it, else null.
- Colony detail gains `from_egg_sac`: `{id, laid_date, mother: {id,name}|null}` or null.

Errors use existing shapes; nothing here is reachable without a token.

## 5. Screens (TV web + TV mobile, parity)

Registry: new module `eggSacs` in `apps/mobile/src/lib/taxon-modules.ts` and `apps/web/src/lib/inverts.ts` (lockstep) for the four taxa; registered in `apps/api/tests/test_taxon_lists_in_sync.py` as a deliberate subset with its reason. Wording comes from `BREEDING_VOCABULARY`; scorpion `offspring` changes from "instars" to "scorplings" in both copies. New helpers (both registries): `broodBucket(taxon)`, `isLiveBirth(taxon)` (from vocabulary), `hatchButtonLabel(taxon)` ("Hatched: start a sling group" / "nymph group"; scorpion "Start a scorpling group").

- **Mother's detail** (`dashboard/inverts/[id]`, `app/invert/[id].tsx`): card titled by `clutchSectionLabel` ("Egg sacs" / "Oothecae" / "Broods") for female or unknown-sex animals of the four taxa, visible to owner + keeper co-keepers, free. Rows: date, status chip (Waiting / Hatched → group link / Hatched (group removed) / Didn't hatch), "No pairing recorded" when none. "Log egg sac" (hidden on closed animals) opens a short form: date laid/born, expected hatch (not for live birth), count (live birth only), notes, photo. The existing Premium breeding card is unchanged.
- **Sac detail** (the existing pages, extended — web `dashboard/breeding/egg-sacs/[id]`, mobile `app/breeding/egg-sacs/[id].tsx`; viewing and the actions below are never Premium-gated, a sac without a pairing renders without the pairing block): dates, counts, notes, photo, Edit, Delete (confirm). While waiting: primary hatch button opening count + "about" checkbox + date; secondary "Didn't hatch". After hatch: link to the group.
- **Sling group** (existing colony detail): banner "From {mother}'s {sac noun} · laid {date}" linking to the sac; "Split out" action for the four taxa (any colony, not only sac-born): count stepper (max = min(50, colony total)), date, life stage. Over the cap the sheet says "You can add N more on the free plan" with the upgrade button (UpgradeModal source `split_out`, added to the upgrade-source vocabularies). Success: "3 spiders added" with a link to Collection.
- **Split-out spider detail**: under the title, "From {group} · mother {name}" (links when they still exist).
- **Breeding hub**: sacs without a pairing appear in the existing egg-sac list as "No pairing recorded".
- Dark mode everywhere; mobile uses ThemeContext + tokens (design-token gate must pass); no native modules (OTA-safe).

## 6. Everyday logging

1. **Stage chip on Collection cards** (web collection grid, mobile `AnimalCard`): for `tracksInstars(taxon)` and a non-null `current_instar`, a chip with `formatStage` ("Instar 5", mantis "L5"). Tarantulas excluded (their number is a molt count). Data from feeding-status; no new request.
2. **Photo prompt after a molt**: after a successful molt save on an invert (web add-molt page, mobile add-molt screens), for every taxon except millipede and only on a living animal: sheet "Add a photo of the new look?" — Take photo (mobile only) / Choose photo / Not now, and a "Don't ask after molts" checkbox stored per device (`molt_photo_prompt_v1` in AsyncStorage / localStorage; storage errors = keep asking). Upload is the normal photo upload.
3. **Mature badge**: when `matured_at` is set, card and detail header show "Mature · {elapsed}" (elapsed via one shared helper, e.g. "3 mo", "12 d"). Never time remaining (ult_20260911 rule). On the detail page, mature **male** true spiders and tarantulas also get one sentence that males often live only months after their final molt — **only for a taxon with a cited source in code**; without a source, no sentence.
4. **Prey count**: registry flag `countsPrey` (true_spider, mantis) adds a "How many" stepper (1–20, default 1) to the invert feeding forms (add + edit), sending `quantity`. Lists show "3 × House fly" when quantity > 1. Feeding Day and reminder buttons still log 1. Feeding stats count meals, not prey.

## 7. Care guides

- `apps/api/seed_care_true_spiders_batch3.py` (idempotent, `--dry-run` default; Cory runs it in the Render shell): species keepers own but the catalog lacks — *Platycryptus undatus*, *Maevia inclemens*, *Pelegrina proterva*, *Menemerus semilimbatus*, *Eresus ruficapillus*, *Eresus balcanicus*, *Gandanameno echinata*, *Kukulcania arizonica*, *Eratigena atrica* — minus any already present (checked when the plan is written; spellings corrected).
- Every filled field has a stated source (`source_url` per species); unsourced fields stay NULL; `typical_instars_to_maturity` only when a source states it.
- Photos: CC0 / CC BY / CC BY-SA only, through the existing R2 upload → apply pipeline, with attribution.
- No automatic linking; the existing "Did you mean" offer does it. After seeding, `report_species_matches.py --all` (read-only) shows the effect. Placeholder names ("Unknown black jumping spider") stay unlinked.

## 8. Edge cases, privacy

- Mother died after laying: existing sacs hatch and split as normal; only new sacs are refused.
- Group deleted: sac shows "Hatched (group removed)".
- Mother deleted (not died): her sacs cascade away like her other logs; the group survives without its banner (`egg_sac_id` SET NULL).
- Transfers: split-out spiders and partial colony transfers behave as today; parentage is not copied to the recipient.
- Split asking for more than the group holds or the cap allows: refused before anything is written.
- Public pages (`/i`, `/col`, link previews), share cards, sitter passes and care sheets show no mother/sac details.
- Export: `egg_sacs.mother_invert_id`, `egg_sacs.outcome`, `colonies.egg_sac_id` included (existing every-column export tests enforce it).

## 9. Testing, rollout, measurement

Tests:

- API: sac create/list/edit/delete with and without pairing; refusals (taxon, male, closed mother); co-keeper roles; hatch (colony fields, event, sac outcome, 409 twice, cap, closed mother allowed); fail then hatch; split-out (count, naming continuation, event, offspring rows only for sac-born colonies, cap with `can_add`, 409 over total, taxon/closed refusals); free keeper can do all of it; pairing-based sac no longer 402s; feeding-status `current_instar`/`matured_at`; detail `parentage`/`from_egg_sac`; export columns; privacy (public routes carry no parentage).
- Sync: `eggSacs`, `countsPrey`, vocabulary change in both registries.
- Jest (mobile) + node tests (web) for new pure helpers: wording, elapsed badge text, prompt-dismiss state, split max.
- Verification gate: pytest (4 chunks), tsc ×2, design-token gate, lint, `pnpm run check:bundle` before the OTA.

Rollout: additive migration; API (Render) first, then web (Vercel), then `eas update` (no store build). One What's new entry dated the Monday after everything is live (egg sacs → sling groups for all four taxa, stage + mature badges, prey count; free; no prices or other platforms). Care-guide seed runs separately.

Measurement: `apps/api/report_broods.py` (read-only; run 2 and 6 weeks after release): sacs logged (by taxon, with/without pairing), hatched, failed, groups created, spiders split out, molts followed by a photo within 2 days, feedings with quantity > 1, true-spider keepers active in the last 30 days vs the 2026-11-12 baseline (17).
