# Jumping spiders — egg sacs to sling groups, care guides, everyday logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any keeper can log an egg sac (no pairing needed), hatch it into a sling group (a colony), and split slings out into individual animals with parentage; plus missing true-spider care guides and four small logging improvements.

**Architecture:** Additive migration on `egg_sacs` (+ `mother_invert_id`, `outcome`, nullable `pairing_id`) and `colonies` (+ `egg_sac_id`). New routes reuse `create_colony_row` and `create_invert_row` inside one transaction each; parentage reuses `offspring` rows. Clients gain one registry module (`eggSacs`), two small shared libs per platform, and new cards/sheets on existing screens.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + pytest (apps/api); Next.js 14 + Tailwind (apps/web); Expo Router + React Native (apps/mobile), jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-13-jumping-spiders-design.md` (read it first; this plan argues from it).

## Global Constraints

- TV only; never touch `apps/web-herpetoverse` or `apps/mobile-herpetoverse`.
- `BROOD_TAXA = ('true_spider','mantis','tarantula','scorpion')`. Buckets: `true_spider`/`tarantula` → `slings`, `mantis` → `nymphs`, `scorpion` → `scorplings`.
- Sac, hatch, fail and split-out are free (no 402 for Premium); pairings and offspring routes keep their gates. The pairing-based `POST /egg-sacs/` loses its 402.
- Access: owner + co-keepers with role `keeper` for every write; logger/viewer 403; strangers 404 (`app/utils/access.py`).
- Hatch `count` 1..2000; split `count` 1..50; split `life_stage` ∈ `sling|juvenile|adult`, default `sling`.
- Never show time remaining for a mature animal (rule in `alembic/versions/ult_20260911_ultimate_molt.py`). Mature-male sentence only for `tarantula`, text "Mature males typically live a few months to a couple of years after their final molt." with source `https://www.thebiodude.com/blogs/helpful-husbandry-faqs/how-to-sex-male-vs-female-tarantulas`. True spiders get no sentence (no reliable source found — ruling 2026-11-13).
- Copy rules: plain words, no emoji in new UI, no prices, no other platforms; dark mode on every new web element (`dark:`), mobile uses ThemeContext + `src/theme/tokens.ts` (design-token gate `apps/mobile/scripts/check-design-tokens.js` must pass without re-baselining).
- Mobile: no new native modules (OTA-safe).
- Repo rules: no git writes by agents — "commit" steps are shadow snapshots via the SDD env (`/sessions/<session>/mnt/outputs/sdd/day-one/env/snap.sh "<msg>"`); API tests run through `with-pg.sh` (Postgres test DB); never install into the repo.
- Trailing slashes on collection endpoints in client calls.

## Review Focus

1. A died mother (common: jumper females die after laying) must still hatch and split; only NEW sacs are refused — tests in Task 1 and Task 2.
2. A split that exceeds the free cap must write nothing (no partial batch of animals) and say how many fit — Task 2 test `test_split_over_cap_writes_nothing`.
3. Re-hatching an already hatched sac (double tap, two phones) must not create a second group — Task 2 test `test_hatch_twice_409` plus the UNIQUE index.
4. Split naming must continue after earlier splits ("Sally slings #4" after #1–#3), even if the keeper renamed one — Task 2 test `test_split_numbering_continues`.
5. Public pages must not leak mother/sac names — Task 2 test `test_public_routes_carry_no_parentage`.

---

### Task 1: Egg sacs without a pairing (API)

**Files:**
- Create: `apps/api/alembic/versions/brd_20261113_egg_sac_groups.py` (down_revision `eff_20261110_effortless_logging`)
- Create: `apps/api/app/utils/broods.py`
- Modify: `apps/api/app/models/egg_sac.py`, `apps/api/app/models/colony.py`, `apps/api/app/schemas/egg_sac.py`, `apps/api/app/routers/egg_sacs.py`, `apps/api/app/services/export_service.py` (`EGG_SAC_FIELDS`, `COLONY_FIELDS`)
- Test: `apps/api/tests/test_egg_sacs_mother.py`; update `apps/api/tests/test_taxon_lists_in_sync.py` (`_py_subsets`: register `BROOD_TAXA` with reason "taxa whose females lay sacs/oothecae or bear broods the keeper groups").

**Interfaces:**
- Produces (utils/broods.py): `BROOD_TAXA: tuple[str, ...]`; `BROOD_BUCKET: dict[str, str]`; `EGG_SAC_OUTCOMES = ('hatched', 'failed')`; `def load_egg_sac(db: Session, user: User, egg_sac_id: UUID, need: str) -> tuple[EggSac, Access]` (mother set → access via `load_invert(db, user, sac.mother_invert_id, need)`; no mother → owner-only by `user_id`, else 404).
- Produces (models): `EggSac.mother_invert_id`, `EggSac.outcome`, `EggSac.mother` relationship; `Colony.egg_sac_id`.
- Produces (schemas): `InvertEggSacCreate` (EggSacBase minus `pairing_id`; `laid_date` required); `EggSacResponse` gains `mother_invert_id: Optional[UUID]`, `outcome: Optional[str]`, `hatched_colony: Optional[ColonyRef]` where `ColonyRef = {id: UUID, name: str}`; `pairing_id` Optional in Base/Response.
- Routes: `GET/POST /api/v1/inverts/{id}/egg-sacs`, `POST /api/v1/egg-sacs/{id}/fail`; PUT/DELETE `/egg-sacs/{id}` switch to `load_egg_sac(..., "keeper")` with `@policy("keeper")`.

- [ ] **Step 1: Write failing tests** in `test_egg_sacs_mother.py` (`pytestmark = pytest.mark.requires_postgres`, autouse `limiter.reset()`, helpers as in `tests/test_reminder_actions.py`: `mk_user`, `hdr`, `mk_animal`, `_make_premium`, `_member`):
  - `test_free_keeper_logs_sac_on_female` — free user, true_spider female; POST `/inverts/{id}/egg-sacs` `{laid_date}` → 201, body `mother_invert_id == id`, `pairing_id is None`, `outcome is None`.
  - `test_list_newest_first_includes_pairing_sacs` — premium owner, pairing (female=this animal) + a pairing-based sac via `POST /egg-sacs/` and a mother sac; GET lists both, newest `laid_date` first.
  - `test_pairing_sac_no_longer_402s_and_sets_mother` — a now-free user with an existing pairing creates via `POST /egg-sacs/` → 201 and `mother_invert_id == pairing.female_invert_id`.
  - `test_refuses_wrong_taxon_and_male` — centipede female → 400; true_spider male → 400; unknown sex → 201.
  - `test_refuses_new_sac_on_died_mother` — mark died → POST 409; existing sac PUT still 200.
  - `test_roles` — keeper co-keeper 201; logger 403; stranger 404 (owner premium so roles stick).
  - `test_fail_sets_outcome` — POST `/egg-sacs/{id}/fail` `{notes:"mould"}` → `outcome=='failed'`, notes appended.
  - `test_export_has_new_columns` — `"mother_invert_id" in EGG_SAC_FIELDS and "outcome" in EGG_SAC_FIELDS and "egg_sac_id" in COLONY_FIELDS`.
  - In `test_taxon_lists_in_sync.py`: BROOD_TAXA registered (runs green once Task 3 adds the TS side — until then assert only the Python registration).
- [ ] **Step 2: Run** `with-pg.sh pytest tests/test_egg_sacs_mother.py -q` → FAIL (404 route / missing columns).
- [ ] **Step 3: Migration** — `pairing_id` DROP NOT NULL; add `mother_invert_id` (FK inverts CASCADE, index `ix_egg_sacs_mother_invert_id`), `outcome VARCHAR(20)`, CHECKs `egg_sacs_parent_check` and `egg_sacs_outcome_check`; `colonies.egg_sac_id` (FK egg_sacs SET NULL) + UNIQUE index `uq_colonies_egg_sac_id`. Downgrade reverses (re-adding NOT NULL only if no NULL rows, else raise). Declare the CHECKs/index on the models too.
- [ ] **Step 4: Implement** utils/broods.py, schemas, routes. Mother-based create validates taxon ∈ BROOD_TAXA (400 "Egg sacs aren't tracked for this animal"), sex != male (400), `refuse_if_closed_invert`; `photo_url` through the existing allowed-photo check used by invert photo fields. Pairing-based create/update fills `mother_invert_id` from `female_invert_id or female_id`. Rate limit 60/hour on the two POSTs. `hatched_colony` resolved with one query (`Colony.egg_sac_id.in_(ids)`). Export field lists gain the three columns.
- [ ] **Step 5: Run** the new file + `tests/test_breeding_taxon_support.py tests/test_access_policies.py tests/test_taxon_lists_in_sync.py` → PASS.
- [ ] **Step 6: Snapshot** `snap.sh "T1: egg sacs without a pairing"`.

### Task 2: Hatch, split-out, parentage, card fields (API)

**Files:**
- Modify: `apps/api/app/utils/limits.py` (`enforce_collection_limit(db, user, adding: int = 1)`), `apps/api/app/routers/colonies.py` (`create_colony_row(..., egg_sac_id=None)`, `_build_response` → `from_egg_sac`, new route `split_out`), `apps/api/app/routers/egg_sacs.py` (hatch route), `apps/api/app/routers/inverts.py` (`create_invert_row(..., commit: bool = True)`, `get_invert` fills `parentage`), `apps/api/app/schemas/colony.py`, `apps/api/app/schemas/egg_sac.py`, `apps/api/app/schemas/invert.py` (`InvertFeedingStatusItem.current_instar`, `.matured_at`; `InvertResponse.parentage`), `apps/api/app/services/feeding_status.py`
- Test: `apps/api/tests/test_egg_sac_hatch_split.py`

**Interfaces:**
- Consumes: Task 1 `load_egg_sac`, `BROOD_TAXA`, `BROOD_BUCKET`.
- Produces: `POST /egg-sacs/{id}/hatch` body `EggSacHatch {count:int 1..2000, count_is_estimated:bool=False, hatched_on:date, name:Optional[str≤100]}` → `EggSacHatchResponse {egg_sac: EggSacResponse, colony: ColonyResponse}` (201). `POST /colonies/{id}/split-out` body `ColonySplitOut {count:int 1..50, split_on:date, life_stage:Literal['sling','juvenile','adult']='sling'}` → `ColonySplitOutResponse {created: list[{id,name}], colony_total:int}` (201). 402 detail gains `can_add: int` (= max(0, limit − current_count)). `ColonyResponse.from_egg_sac: Optional[{id, laid_date, mother: Optional[{id,name}]}]`. `InvertResponse.parentage: Optional[{egg_sac_id, mother: Optional[{id,name}], colony: Optional[{id,name}]}]` (detail only; lists leave None). Feeding-status rows: `current_instar: Optional[int]`, `matured_at: Optional[date]`.

- [ ] **Step 1: Write failing tests** (same helpers):
  - `test_hatch_creates_group` — colony taxon/species/location from mother, name "{mother name} slings", `stage_counts == {"slings": 40}`, `source == "bred"`, `founded_date == hatched_on`, one `added` event with note "Hatched from egg sac"; sac `outcome=='hatched'`, `hatch_date`, `spiderling_count == 40`; mantis mother → bucket `nymphs`; scorpion → `scorplings`.
  - `test_hatch_twice_409` and `test_failed_sac_can_hatch`.
  - `test_hatch_works_on_died_mother`.
  - `test_hatch_at_cap_402` — free user at 15 → 402, no colony, sac unchanged.
  - `test_split_creates_animals_and_event` — group of 10 → split 3: 3 inverts named "… #1..#3", sex unknown, life_stage sling, `date_acquired == split_on`, source bred; group total 7; one `split` event `count_delta == -3`, destination "Split out into individual enclosures"; 3 offspring rows status kept with `egg_sac_id`.
  - `test_split_numbering_continues` — split 3, rename "#2", split 2 → names "#4", "#5".
  - `test_split_takes_largest_bucket_first` — buckets {slings:2, juveniles:5}, split 6 → events juveniles −5 then slings −1.
  - `test_split_over_total_409` and `test_split_over_cap_writes_nothing` (free user with 13 animals, split 5 → 402 with `can_add == 2`, zero new inverts, counts unchanged).
  - `test_split_non_brood_colony_400` (isopod) and `test_split_bought_group_no_parentage` (tarantula colony without sac → animals created, no offspring rows).
  - `test_split_refused_on_ended_colony_409`.
  - `test_detail_parentage_and_group_banner` — split animal `GET /inverts/{id}` has `parentage.mother.name`; group detail has `from_egg_sac.mother`; unrelated animal `parentage is None`.
  - `test_feeding_status_carries_instar_and_maturity` — invert with `current_instar=5` and an `is_ultimate` molt → row `current_instar == 5`, `matured_at` == molt date.
  - `test_public_routes_carry_no_parentage` — make the split animal + group public; responses of the public invert and colony endpoints behind `/i/{id}` and `/col/{id}` (find them in `routers/qr.py` / colonies public route) contain no `parentage`, `from_egg_sac`, or mother name.
  - Keeper co-keeper can hatch and split; logger 403.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Hatch: set sac fields on the session, then `create_colony_row(db, access.owner, ColonyCreate(...), logged_by_user_id=access.logged_by_user_id, starting_note="Hatched from egg sac", egg_sac_id=sac.id)` so ONE commit covers both (`egg_sac_id` assigned before that function's commit). Split: `enforce_collection_limit(db, owner, adding=count)` first; validate (taxon, closed, total); compute numbering with a regex `^{re.escape(colony.name)} #(\d+)$` over the owner's inverts; `create_invert_row(..., enforce_limit=False, commit=False)` per animal (with `commit=False` it flushes, mirrors, and bumps `times_kept` without committing); events + `_apply_delta` per bucket; offspring rows when `colony.egg_sac_id`; single `db.commit()`. `matured_at`: one grouped query `max(molted_at) where is_ultimate group by invert_id` over the page's ids (or extend `_newest_molts`).
- [ ] **Step 4: Run** the new file plus `tests/test_colonies*.py tests/test_expenses.py tests/test_reminder_actions.py tests/test_first_feeding_rule.py tests/test_effortless_rules.py` → PASS.
- [ ] **Step 5: Snapshot** `snap.sh "T2: hatch, split-out, parentage"`.

### Task 3: Client registries and shared helpers (web + mobile)

**Files:**
- Modify: `apps/web/src/lib/inverts.ts`, `apps/mobile/src/lib/taxon-modules.ts`, `apps/mobile/src/lib/inverts.ts` (only if `countsPrey` sits next to `FOOD_VOCABULARY` there — keep it beside the web copy's equivalent)
- Create: `apps/web/src/lib/broods.ts`, `apps/mobile/src/lib/broods.ts`, `apps/web/src/lib/everydayLogging.ts`, `apps/mobile/src/lib/everyday-logging.ts` — each identical below `// ---- shared below: keep identical in both copies ----`
- Test: `apps/mobile/src/lib/__tests__/broods.test.ts`, `apps/mobile/src/lib/__tests__/everyday-logging.test.ts`, `apps/web/tests/broods.test.mts`, `apps/api/tests/test_jumper_libs_in_sync.py` (marker-identity check, same shape as `tests/test_analytics_view_in_sync.py`), `test_taxon_lists_in_sync.py` (register `COUNTS_PREY_TAXA`; assert the taxa with `'eggSacs'` in `TAXON_MODULES` equal Python `BROOD_TAXA`).

**Interfaces (Produces):**
- Registries: `FeatureModule` gains `'eggSacs'`; added to `tarantula`, `true_spider`, `mantis`, `scorpion` in `TAXON_MODULES`. `const COUNTS_PREY_TAXA = new Set<string>(['true_spider', 'mantis'])`, `countsPrey(taxon: string): boolean`. `broodBucket(taxon: string): string` (`slings|nymphs|scorplings`, fallback `young`). `isLiveBirth(taxon: string): boolean` (vocabulary `liveBirth != null`). `hatchButtonLabel(taxon: string): string` → "Hatched: start a sling group" | "Hatched: start a nymph group" | scorpion "Start a scorpling group". Scorpion `liveBirth.offspring` = `'scorplings'`.
- broods.ts: `type SacStatus = 'waiting' | 'hatched' | 'hatched_removed' | 'failed'`; `sacStatus(sac: { outcome: string | null; hatched_colony: { id: string; name: string } | null }): SacStatus`; `sacStatusLabel(status: SacStatus, liveBirth: boolean): string` → "Waiting" (live birth: "Not grouped yet") | "Hatched" (live birth: "Grouped") | "Hatched (group removed)" | "Didn't hatch"; `splitMax(total: number): number` = clamp(total, 0, 50); `splitNoun(taxon: string): string` → true_spider/tarantula "spiders", mantis "mantids", scorpion "scorpions", else "animals"; `splitCapText(canAdd: number): string` → "You can add {n} more on the free plan" (n=0: "You're at the free plan's limit").
- everydayLogging: `elapsedShort(fromIso: string, now: Date): string` (local calendar days; 0 → "today", 1–59 → "{n} d", <24 months → "{n} mo", else "{n} yr"); `matureBadge(maturedAt: string | null, now: Date): string | null` → "Mature · {elapsed}" (today → "Mature · today"); `matureMaleNote(taxon: string, sex: string | null): { text: string; sourceUrl: string } | null` (tarantula + male only, text/URL from Global Constraints; sex compared case-insensitively); `stageChip(taxon: string, currentInstar: number | null | undefined): string | null` (`tracksInstars` && n ≥ 1 → `formatStage`); `MOLT_PHOTO_PROMPT_KEY = 'molt_photo_prompt_v1'`; `offerMoltPhoto(taxon: string, isClosed: boolean, dismissed: boolean): boolean` (false for millipede, closed, or dismissed); `preyLabel(food: string | null, quantity: number | null | undefined): string` (q > 1 → "{q} × {food}", missing food → "{q} prey items").

- [ ] **Step 1: Write failing jest/node tests** pinning every helper above, e.g. `expect(hatchButtonLabel('mantis')).toBe('Hatched: start a nymph group')`, `expect(sacStatus({outcome:'hatched', hatched_colony:null})).toBe('hatched_removed')`, `expect(splitMax(73)).toBe(50)`, `expect(elapsedShort('2026-08-13', new Date('2026-11-13T12:00'))).toBe('3 mo')`, `expect(matureMaleNote('true_spider','male')).toBeNull()`, `expect(stageChip('tarantula', 7)).toBeNull()`, `expect(stageChip('mantis', 5)).toBe('L5')`, `expect(offerMoltPhoto('millipede', false, false)).toBe(false)`, `expect(preyLabel('House fly', 3)).toBe('3 × House fly')`.
- [ ] **Step 2: Run** `cd apps/mobile && pnpm test -- broods everyday-logging` and `cd apps/web && node --test --experimental-strip-types tests/broods.test.mts` → FAIL.
- [ ] **Step 3: Implement** helpers + registry entries (both platforms, lockstep).
- [ ] **Step 4: Run** the tests above + `with-pg.sh pytest tests/test_taxon_lists_in_sync.py tests/test_jumper_libs_in_sync.py -q` + `tsc --noEmit` in apps/web and apps/mobile → PASS.
- [ ] **Step 5: Snapshot** `snap.sh "T3: registries + shared helpers"`.

### Task 4: Egg sac → group screens, mobile

**Files:**
- Create: `apps/mobile/src/components/EggSacsCard.tsx`, `apps/mobile/app/invert/add-egg-sac.tsx`, `apps/mobile/src/components/HatchSheet.tsx`, `apps/mobile/src/components/SplitOutSheet.tsx`
- Modify: `apps/mobile/app/invert/[id].tsx` (card under the existing Breeding section, ~line 1363; parentage line under `heroName` ~line 817), `apps/mobile/app/breeding/egg-sacs/[id].tsx` (works without a pairing; hatch + "Didn't hatch"; group link), `apps/mobile/app/colony/[id].tsx` (banner near the top; "Split out" in the bottom actions near Transfer ~line 1654, keeper only, taxon in eggSacs module), `apps/mobile/app/breeding/index.tsx` ("No pairing recorded" on sac rows with `pairing_id == null`), `apps/mobile/src/lib/upgrade-tracking.ts` (`'split_out'` source)

**Interfaces:** Consumes Task 1–3 routes/helpers. EggSacsCard props `{ invert: { id: string; taxon: string; sex: string | null; name: string }, canKeep: boolean, isClosed: boolean }`; fetches `GET /inverts/{id}/egg-sacs` once per detail load (part of the detail's focus reload; not refetched by `refreshSlices` unless a sac action ran).

- [ ] **Step 1:** Implement EggSacsCard (shown when `taxonHasModule(taxon,'eggSacs')` and sex is not male and viewer is keeper+; title `clutchSectionLabel(taxon)`; rows date + `sacStatusLabel` + "No pairing recorded"; "Log {clutchNoun}" button hidden when closed → `/invert/add-egg-sac?id=`).
- [ ] **Step 2:** add-egg-sac screen: laid/born date (`DateInput`), expected hatch (sacs only), count (live birth only), notes, photo (existing upload helper); POST; back to detail.
- [ ] **Step 3:** Sac detail: render without pairing block; while `waiting|failed` show `hatchButtonLabel` → HatchSheet (count, "about" checkbox, date) → POST hatch → `router.replace('/colony/{id}')`; "Didn't hatch" → confirm → POST fail. A hatch 402 shows the same collection-limit message and upgrade path the add-animal screen uses (source unchanged from that screen).
- [ ] **Step 4:** Colony screen: banner "From {mother}'s {clutch noun lowercase} · laid {date}" when `from_egg_sac` (links to sac); SplitOutSheet (stepper max `splitMax(total)`, date, life stage chips) → POST split-out → toast "{n} {splitNoun(taxon)} added" with a link to Collection; 402 → `splitCapText(detail.can_add)` + UpgradeModal source `split_out`.
- [ ] **Step 5:** Invert detail parentage line "From {colony} · mother {mother}" (each a link when present).
- [ ] **Step 6: Verify** `cd apps/mobile && npx tsc --noEmit && pnpm test && node scripts/check-design-tokens.js` → PASS; manual both themes checklist noted in the report.
- [ ] **Step 7: Snapshot** `snap.sh "T4: mobile egg sac screens"`.

### Task 5: Egg sac → group screens, web

**Files:**
- Create: `apps/web/src/components/EggSacsCard.tsx`, `apps/web/src/app/dashboard/inverts/[id]/add-egg-sac/page.tsx`, `apps/web/src/components/HatchDialog.tsx`, `apps/web/src/components/SplitOutDialog.tsx`
- Modify: `apps/web/src/app/dashboard/inverts/[id]/page.tsx` (card after the Breeding `<Section>` ~line 1201; parentage line under the `<h1>` ~line 920), `apps/web/src/app/dashboard/breeding/egg-sacs/[id]/page.tsx`, `apps/web/src/app/dashboard/colonies/[id]/page.tsx` (banner; "Split out" in the header action row ~lines 972–1015 gated by `canKeep`), `apps/web/src/app/dashboard/breeding/page.tsx` ("No pairing recorded"), `apps/web/src/lib/upgrade-tracking.ts` (`'split_out'`)

**Interfaces:** same behaviour and copy as Task 4 (web uses `<input type="date">`, modal dialogs, `refreshSlices` on the invert detail after a sac action).

- [ ] **Step 1–5:** Mirror Task 4 Steps 1–5 on web with `dark:` variants on every element.
- [ ] **Step 6: Verify** `cd apps/web && npx tsc --noEmit && pnpm lint && node --test --experimental-strip-types tests/*.test.mts` → PASS.
- [ ] **Step 7: Snapshot** `snap.sh "T5: web egg sac screens"`.

### Task 6: Everyday logging, mobile

**Files:**
- Create: `apps/mobile/src/components/MoltPhotoPrompt.tsx`
- Modify: `apps/mobile/src/components/AnimalCard.tsx` (stage chip + mature badge in the status footer row ~lines 278–290, NOT as a third overlay), `apps/mobile/app/(tabs)/collection.tsx` (pass `current_instar`, `matured_at` from feeding-status), `apps/mobile/app/invert/[id].tsx` (mature badge beside the stage in the hero; `matureMaleNote` line with a "Source" link on the Matured card area; feeding history uses `preyLabel`), `apps/mobile/app/invert/add-molt.tsx` (after a successful NEW non-fatal molt, show MoltPhotoPrompt before leaving; keep the existing "Molt saved / Make a card" flow order: prompt first, then that alert), `apps/mobile/app/invert/add-feeding.tsx` (stepper 1–20 when `countsPrey(taxon)`, sends `quantity`; edit mode seeds it)

**Interfaces:** Consumes Task 2 feeding-status fields, Task 3 helpers. MoltPhotoPrompt props `{ visible: boolean; onTake: () => void; onChoose: () => void; onClose: (dontAskAgain: boolean) => void }`; storage read/write of `MOLT_PHOTO_PROMPT_KEY` in try/catch (errors = keep asking). Take/Choose route to the existing invert photo-add flow for that animal (find the screen the detail's "Add photo" uses and reuse its params).

- [ ] **Step 1:** Implement the four items.
- [ ] **Step 2: Verify** `npx tsc --noEmit && pnpm test && node scripts/check-design-tokens.js` → PASS.
- [ ] **Step 3: Snapshot** `snap.sh "T6: mobile everyday logging"`.

### Task 7: Everyday logging, web

**Files:**
- Create: `apps/web/src/components/MoltPhotoPrompt.tsx`
- Modify: `apps/web/src/app/dashboard/tarantulas/page.tsx` (card badges ~lines 740–760), `apps/web/src/app/dashboard/inverts/[id]/page.tsx` (badge by the `<h1>`; mature-male note with source link; feeding list `preyLabel`), `apps/web/src/app/dashboard/inverts/[id]/add-molt/page.tsx` (prompt after a successful new non-fatal molt instead of the immediate `router.push`, ~line 141; "Choose photo" opens the existing invert photo upload; no "Take photo" on web), `apps/web/src/app/dashboard/inverts/[id]/add-feeding/page.tsx` (stepper; edit mode via `?logId=` seeds it)

- [ ] **Step 1:** Implement, `dark:` on everything; localStorage in try/catch.
- [ ] **Step 2: Verify** `npx tsc --noEmit && pnpm lint && node --test --experimental-strip-types tests/*.test.mts` → PASS.
- [ ] **Step 3: Snapshot** `snap.sh "T7: web everyday logging"`.

### Task 8: Care guides batch 3

**Files:**
- Create: `apps/api/seed_care_true_spiders_batch3.py` (shape: `seed_care_expansion_true_spiders_batch2.py`; `--dry-run` default, `--apply` to write; idempotent on `scientific_name_lower`), `docs/design/species_images_batch3.csv` (rows for the existing R2 upload → apply pipeline; only CC0/CC BY/CC BY-SA with author + licence + source URL)
- Test: `apps/api/tests/test_seed_true_spiders_batch3.py` (static: every species has `source_url`, `taxon == 'true_spider'`, family set; no field filled without a source note; `typical_instars_to_maturity` only where the entry records its source)

- [ ] **Step 1:** Check which candidates already exist (read-only Neon or the API species search); keep the rest of: *Platycryptus undatus*, *Maevia inclemens*, *Pelegrina proterva*, *Menemerus semilimbatus*, *Eresus ruficapillus*, *Eresus balcanicus*, *Gandanameno echinata*, *Kukulcania arizonica*, *Eratigena atrica*.
- [ ] **Step 2:** Research each from stated sources (care sheets, museum/university pages, WSC for names); write the entries; unsourced fields NULL. Write the failing static test first, then the data.
- [ ] **Step 3: Verify** `with-pg.sh pytest tests/test_seed_true_spiders_batch3.py -q` and `python seed_care_true_spiders_batch3.py --dry-run` against the test DB → PASS / prints the planned inserts.
- [ ] **Step 4: Snapshot** `snap.sh "T8: true spider care guides batch 3"`.

### Task 9: Report, What's new, docs, final verification

**Files:**
- Create: `apps/api/report_broods.py` (read-only; prints the measures in spec §9; `--since YYYY-MM-DD`, default release day), `apps/api/tests/test_report_broods.py` (runs it against seeded test data; asserts it issues no writes — same approach as `tests/test_report_reminder_logging.py`)
- Modify: `apps/api/app/content/whats_new.json` (one `tarantuverse` entry, id `YYYY-MM-DD-egg-sacs-to-sling-groups`, `published_on` = the first Monday after the API, web and OTA are all live — 2026-11-23 if live by 2026-11-22, else the following Monday; title ≤60, body ≤220, `premium: false`, action target `collection`; body mentions sacs/oothecae/broods → groups → individual animals, stage + mature badges, prey count; no prices/other platforms), `CLAUDE.md` (new bullet "Egg sacs → sling groups (2026-11-13)" summarising tables, routes, free gating, registry module, helper files, report; note true spiders have no mature-male sentence by design)

- [ ] **Step 1:** Report + test (failing first), What's new entry (`tests/test_whats_new.py` must pass, incl. the Monday rule), CLAUDE.md bullet.
- [ ] **Step 2: Full verification:** API suite in 4 chunks (`run-suite.sh 1..4`), `tsc --noEmit` web + mobile, `pnpm lint` web, mobile `pnpm test`, web node tests, design-token gate, `cd apps/mobile && pnpm run check:bundle` → all PASS; record outputs in the ledger.
- [ ] **Step 3: Snapshot** `snap.sh "T9: report, what's new, docs"`; hand Cory PowerShell-safe git commands (one per line, never CLAUDE.md in `git add`), Render shell steps for the seed (dry run first), and `eas update --branch production` after `check:bundle`.
