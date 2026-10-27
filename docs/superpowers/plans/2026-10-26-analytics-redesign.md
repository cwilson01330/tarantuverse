# Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tarantuverse's two analytics pages (free + Premium "Advanced") with the single Analytics page from the design handoff, on web and mobile, with new entry points and one chart grammar.

**Architecture:** The API grows the `/analytics/collection` response by the handoff's §7 fields (computed through a feeding-status service extracted from `/inverts/feeding-status`, so "due" means the same thing everywhere) and adds `/analytics/molts` for the full per-animal list. All copy, sentence and geometry logic lives in one pure TypeScript view lib kept identical on web and mobile (jest-tested on mobile). Each platform renders that lib through its own components: `react-native-svg` charts on mobile, recharts + plain divs on web.

**Tech Stack:** FastAPI/SQLAlchemy/pytest (API) · Next.js 14 + Tailwind + recharts (web) · Expo Router + react-native-svg + jest (mobile).

**Spec:** `design_handoff_analytics/README.md` and `design_handoff_analytics/Analytics Redesign.dc.html` (sections 1a–1f). Read both before your task; the README is authoritative for numbers and copy, the HTML for layout.

## Global Constraints

- Tarantuverse only. Herpetoverse, admin analytics, Collection Value / market signals: untouched.
- Light + dark, Keeper + Hobbyist, both platforms. Mobile colours only from `useTheme().colors`, radii/elevation from `useTheme().layout` (`radius.lg` cards, `md` tiles, `sm` chips), spacing/type from `src/theme/tokens.ts`. Web: Tailwind theme classes (`bg-surface`, `border-theme`, `text-theme-secondary`, `text-primary`, `bg-gradient-brand`) + `dark:`; the web preset switch exists (`data-preset` in `globals.css`), so ship both presets.
- Fixed semantic colours (README §5): error `#ef4444`, warning `#eab308`, success `#22c55e`, info `#3b82f6`, male `#3b82f6`, female `#ec4899`, molt purple `#8b5cf6`, Premium lilac `#c9a2ff` (dark) / `#7c3aed` (light).
- Money: plain numbers, thousands separators, two decimals only when fractional, **no currency symbol**. "your currency" appears once on the page (Money card caption on both; web units line too).
- Never render: `$0`, `N/A`, `Advanced Analytics`, `✨`, any emoji, a `0` while loading, empty-state copy after a failed fetch. Missing value = `—`.
- Labels: `average_age_months` is **"with you, avg"** (never "age"); `total_value` is **"Paid in total"** / **"paid for animals"**.
- Mobile ships OTA: no new native modules. `react-native-svg` only (already in the binary); no blur library.
- Requests: free keeper → one call (`/analytics/collection`); Premium → two, fired together; a 402 on `/advanced/` switches the Premium block to the preview. Home/dashboard Insights card makes no extra call.
- Money never in the Insights card, never on anything shareable.
- Touch targets ≥ 44pt; every chart has `accessibilityLabel` / `aria-label` stating the series in words.

## Review Focus

- A keeper with **one animal and no logs** (the median is 3): every card must show its designed empty line, never a broken chart or `NaN`. → Task 2 tests `rightNowTiles`/`feedingSentence`/`moltsCard` with a one-animal, zero-log fixture.
- **Never-fed and paused animals** must not count as due or as the longest gap (same rule as Feeding Day). → Task 1 test `test_due_excludes_never_fed_and_paused`.
- **Detritivores** (millipede/isopod/roach, no cadence) never appear as due or longest gap. → Task 1 test `test_detritivores_never_due`.
- **Large collections** (1,200 animals): thousands separators, species capped at 5 + "n more", molts at 3 + "All n", nothing slow. → Task 2 test `formatCount(1221) === '1,221'`; Task 1 test `/molts` returns every active animal without N+1 (one grouped query).
- **Old API responses** (client ships before or without the new fields, or an older cached response): new fields absent → tiles `—` + `not available yet`, Molts falls back to `most_active_molter`. → Task 2 test `rightNowTiles(legacyFixture)`.

---

### Task 1: API — collection additions + `/analytics/molts`

**Files:**
- Create: `apps/api/app/services/feeding_status.py`
- Modify: `apps/api/app/routers/inverts.py` (`list_feeding_status` delegates to the service, behaviour unchanged)
- Modify: `apps/api/app/routers/analytics.py` (`get_collection_analytics`, new `get_molts_list`)
- Modify: `apps/api/app/schemas/analytics.py`
- Test: `apps/api/tests/test_analytics_collection_v2.py`

**Interfaces:**
- Produces: `compute_feeding_status(db, inverts: list[Invert], tz_offset_minutes: int | None) -> list[InvertFeedingStatusItem]` (moved verbatim from `list_feeding_status`, same sort).
- Produces on `CollectionAnalytics` (all `Optional`, default `None` except where noted):
  `feeding_due_today: int`, `feeding_overdue: int`,
  `longest_gap: LongestGap | None` = `{tarantula_id: str, name: str, sex: str | None, days: int, usual_interval_days: int | None}`,
  `last_molt: LastMolt | None` = `{tarantula_id: str, name: str, sex: str | None, date: date, molt_number: int, avg_interval_days: int | None}`,
  `priced_count: int`, `molts_per_animal: list[MoltRow]` (cap 10), `total_animals: int` (= `total_tarantulas`), `average_months_in_collection: float` (= `average_age_months`).
  `MoltRow` = `{tarantula_id: str, name: str, sex: str | None, count: int, last_date: date | None}`.
- Produces: `GET /api/v1/analytics/molts` → `list[MoltRow]`, every active animal, `@policy("owner_only")`.
- `GET /analytics/collection` accepts optional `tz_offset_minutes: int` (same meaning as feeding-status).

Rules (decided; README §7 plus rulings):
- due = not paused, has interval, fed at least once, `days >= interval`; overdue = same with `days > interval`. Exactly `compute_feeding_status`'s `is_overdue` for "due"; overdue is the strict subset.
- `longest_gap` = among items that have an interval, aren't paused and have been fed: max `days_since_last_feeding`; ties → name. `None` when no such animal.
- `last_molt` = newest molt among active animals (molt logs matched on `invert_id`); `molt_number` = that animal's molts up to and including it; `avg_interval_days` = mean days between that animal's consecutive molts, `None` with < 2.
- `molts_per_animal` / `/molts` rows include zero-molt animals; sort count desc, then `last_date` desc (nulls last), then name. One grouped query (`count`, `max(molted_at)` group by `invert_id`).
- `name` = `name or common_name or scientific_name or "Unnamed"` (existing `get_display_name`).
- `sex` is the lowercase string value (`male`/`female`/`unknown`) or `None`.

- [ ] **Step 1: Write the failing tests** in `test_analytics_collection_v2.py` (`@pytest.mark.requires_postgres`, use `client`, `auth_headers`, `db_session` fixtures; create animals via `POST /api/v1/inverts/` and logs via the generic `/inverts/{id}/feedings|molts` routes):
  - `test_due_and_overdue_counts` — species/interval 7 days (set `feeding_interval_days=7`): A fed 7 days ago → due not overdue; B fed 9 days ago → due + overdue; C fed 2 days ago → neither. Assert `feeding_due_today == 2`, `feeding_overdue == 1`.
  - `test_due_excludes_never_fed_and_paused` — never-fed animal and a paused animal fed 30 days ago → both `0`; `longest_gap` is `None`.
  - `test_detritivores_never_due` — millipede fed 40 days ago → not due, not `longest_gap`.
  - `test_longest_gap_fields` — `longest_gap == {"tarantula_id": str(B.id), "name": "B", "sex": "female", "days": 9, "usual_interval_days": 7}`.
  - `test_last_molt_number_and_interval` — A molts on day −100, −40, −10 → `last_molt.molt_number == 3`, `avg_interval_days == 45`, `date` = day −10.
  - `test_molts_rows_include_zero_and_sort` — rows ordered A(3), C(1), B(0) with B `last_date is None`; `/analytics/molts` returns all, `/collection` caps at 10 (create 12 animals).
  - `test_priced_count_and_aliases` — 2 of 3 priced → `priced_count == 2`; `total_animals == total_tarantulas`; `average_months_in_collection == average_age_months`.
  - `test_feeding_status_route_unchanged` — `/inverts/feeding-status` output for the fixture equals the pre-refactor expectations (ids, `is_overdue`, order).
  - `test_molts_list_owner_only` — another user's token gets only their own rows (empty list).

- [ ] **Step 2:** `bash /tmp/tv/with-pg.sh python3 -m pytest -q tests/test_analytics_collection_v2.py` → FAIL (fields missing / 404).
- [ ] **Step 3:** Extract `compute_feeding_status`, add schemas, extend `get_collection_analytics` (pass `tz_offset_minutes`), add `get_molts_list`. Static route `/molts` must not collide with any dynamic analytics route.
- [ ] **Step 4:** Same command → PASS; then the full API suite `bash /tmp/tv/with-pg.sh python3 -m pytest -q tests` → all pass.
- [ ] **Step 5: Commit** `feat(api): analytics collection right-now fields + /analytics/molts`

### Task 2: Shared view lib (web + mobile copies) + tests

**Files:**
- Create: `apps/mobile/src/lib/analytics-view.ts`, `apps/web/src/lib/analyticsView.ts` (identical below the line `// ---- shared below: keep identical in both copies ----`)
- Test: `apps/mobile/src/lib/__tests__/analytics-view.test.ts`, `apps/api/tests/test_analytics_view_in_sync.py` (asserts both copies are identical below the marker)
- Modify: `apps/web/src/lib/whatsNew.ts`, `apps/mobile/src/lib/whats-new.ts`, `apps/mobile/src/lib/__tests__/whats-new.test.ts` — `analytics_advanced` now routes to `/dashboard/analytics#premium` (web) and `/analytics` (mobile). Keep the target key; live content uses it.

**Interfaces (all pure; `now: Date` injected everywhere):**
- Types mirroring Task 1: `CollectionAnalytics`, `AdvancedAnalytics`, `MoltRow`, `LongestGap`, `LastMolt` (all new fields optional).
- `formatCount(n: number): string` (`1221 → "1,221"`); `formatMoney(n: number | null | undefined): string` (`—` for null/undefined, `12 → "12"`, `12.5 → "12.50"`, `1234.5 → "1,234.50"`).
- `monthsWithYou(months: number | null): string` (`16 → "1y 4m"`, `3 → "3m"`, `0 → "—"`).
- `relativeShort(iso: string, now: Date): string` (`2h`, `3d`, `7mo`, `1y`); `relativeLong(iso, now)` (`2 hours ago`, `3 days ago`, `7 months ago`).
- `ordinal(n: number): string` (1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st 111th).
- `pronoun(sex?: string | null): 'she' | 'he' | 'they'`; `possessive(sex): 'her' | 'his' | 'their'`.
- `rightNowTiles(c: CollectionAnalytics, now, long: boolean): RightNowTile[]` — three tiles `{key: 'due'|'molt'|'gap', label, value, caption, target: {kind: 'feeding_day'} | {kind: 'animal', id} | null, a11y}`; copy per README §3 "Right now tiles"; field absent → `value '—'`, `caption 'not available yet'`; zero animals → `[]`.
- `feedingFigures(c)` → `{feedings, between, perAnimal}` strings (`'0', '—', '—'` when no feedings); `feedingSentence(c): string | null` (README §3 Feeding card, all three branches; `null` when `total_feedings == 0`).
- `moltsCard(c, now, long)` → `{rows: RankedRow[], moreCount: number, emptyLine: string | null, trailing: string}`; ≤5 animals → all rows, >5 → top 3 + `moreCount`; legacy fallback to `most_active_molter` as one row; zero molts → `emptyLine` README copy.
- `speciesRows(c)` → `{rows, moreCount}` (≤5 all, else top 5).
- `paidFooter(c)` → `{value, caption | null}` per README §3 Collection footer incl. the no-ask fallback.
- `recentRows(c, now)` → up to 3 `{kind, name, verb, rel}` (`"Juniper molted"`, `"Pepper ate a cricket"` from `description`, `"Rosie substrate changed"`).
- `insight(c, now): {sentence, support | null, link} | null` — README §3 Insights rotation rule; feeding branch support line is `"{total_feedings} feedings logged across {n} animals."` (ruling: no per-month counts exist).
- `barsModel(series: {month: string, count: number}[], width: number)` → `{bars: {x, w, h, isMax, label, value}[], total, sentence, a11y}` (README §6 Bars; gap 6; height 70; 0/1/many rules).
- `stepModel(series, width, height)` → `{points, area, first, last, sentence, a11y}` (README §6 StepLine + Collection growth sentences).
- `splitModel(parts: {key, count, color}[])` → `{segments: {flex, color}[], legend, sentence | null}`; one non-zero category → `sentence`, no segments.
- `previewFromCollection(c, now)` → `{moltSeries, growthSeries, money}` for the free preview (README §3 "Premium preview").
- `SAMPLE_ADVANCED: AdvancedAnalytics` — the grey sample for zero-animal free keepers ("six tarantulas").

- [ ] **Step 1: Write failing jest tests** covering every function above with README values, including: `ordinal(11)==='11th'`, `ordinal(22)==='22nd'`; `formatMoney(0)==='0'`; `monthsWithYou(16)==='1y 4m'`; one-animal zero-log fixture → `rightNowTiles` due tile `'0'`, `feedingSentence === null`, `moltsCard.emptyLine` = `"No molts logged yet. Each one you log shows up here with how long it's been."`; legacy fixture (no new fields) → tiles `'—'`/`'not available yet'`; `barsModel` all-zero → `bars.length === 0` and sentence `"No molts logged in the last year. The chart appears after the first one."`; `insight` for each `recent_activity[0].type` and the no-activity and zero-animal cases; `previewFromCollection` buckets molts by month.
- [ ] **Step 2:** `cd /tmp/tv/repo/apps/mobile && CI=true node_modules/.bin/jest src/lib/__tests__/analytics-view.test.ts` (after `bash /tmp/tv/js-sync.sh`) → FAIL.
- [ ] **Step 3:** Implement in the mobile copy; copy the shared half to web.
- [ ] **Step 4:** jest → PASS; `pytest tests/test_analytics_view_in_sync.py tests/test_whats_new_targets_in_sync.py` → PASS; jest `whats-new.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: analytics view lib (web + mobile)`

### Task 3: Mobile chart components

**Files:**
- Create: `apps/mobile/src/components/charts/{Bars,StepLine,SplitBar,RankedRows}.tsx`, `apps/mobile/src/components/charts/index.ts`

**Interfaces:**
- Consumes: `barsModel`, `stepModel`, `splitModel`, `RankedRow` from Task 2.
- Produces: `<Bars series width?>`, `<StepLine series width?>`, `<SplitBar parts>`, `<RankedRows rows labelWidth={64} onPressRow?>` — each measures its own width via `onLayout` when `width` is omitted, renders the model's `sentence` underneath, sets `accessibilityLabel={model.a11y}`, and takes a `muted?: boolean` prop (40% opacity strokes, `#4b5563` bars) for the preview/sample states.
- Visual spec: README §6 exactly (radius 3, max bar `colors.secondary` with value above in 11/600, zero stub 2pt `colors.border`, month initials 10/400 `textTertiary`; step 2.5pt `primary`, 14% area, end dot r4 with 2pt `surface` ring; split 8pt tall, 2pt gaps, radius 4; ranked track 8pt `surfaceElevated`).

- [ ] **Step 1:** Implement the four components on `react-native-svg` (`Svg`, `Rect`, `Path`, `Circle`, `Text`), colours from `useTheme().colors`.
- [ ] **Step 2:** `cd /tmp/tv/repo/apps/mobile && node_modules/.bin/tsc --noEmit -p .` → 0 errors.
- [ ] **Step 3: Commit** `feat(mobile): analytics chart components`

### Task 4: Mobile Analytics page + list screens + route cleanup

**Files:**
- Rewrite: `apps/mobile/app/analytics/index.tsx` (one page, README §2 order)
- Create: `apps/mobile/src/components/analytics/{RightNow,CollectionCard,FeedingCard,MoltsCard,RecentCard,PremiumSection,MoneyCard,AnalyticsSkeleton}.tsx`
- Replace: `apps/mobile/app/analytics/advanced.tsx` → `<Redirect href="/analytics" />` only
- Create: `apps/mobile/app/analytics/species.tsx` (sorted list + search from `species_counts`), `apps/mobile/app/analytics/molts.tsx` (from `GET /analytics/molts`, rows tap → `/invert/{id}`)

**Interfaces:**
- Consumes: Task 1 endpoints (`/analytics/collection?tz_offset_minutes=`, `/analytics/advanced/`, `/analytics/molts`, `PUT /analytics/feeding-cost/`), Task 2 lib, Task 3 charts, existing `AppHeader`, `UpgradeModal` (`source="advanced_analytics"`), `trackUpgrade(UPGRADE_EVENTS.shown, 'advanced_analytics')` from `src/lib/upgrade-tracking.ts` once per view when the preview is visible, and `UPGRADE_EVENTS.clicked` on tap (check `trackUpgrade`'s exact signature there), the existing feeding-cost edit sheet from the old `advanced.tsx` (move it into `MoneyCard`).
- Navigation targets: Due tile → `/feeding-day`; molt/gap tiles and rows → `/invert/{id}`; "n more species" → `/analytics/species`; "All n" → `/analytics/molts`; empty state "Add to collection" → the existing add flow used by Home's add button.

- [ ] **Step 1:** Build the page: header per README §3 (Hobbyist gradient 130pt / Keeper flat 56pt via `AppHeader` + `layout`), subtitle states; parallel fetch (`Promise.allSettled`), 402 → preview, `/advanced/` error → the one-card Premium error; pull to refresh refetches both; loading skeleton (three 74pt tiles, 200, 120, 120, pulse 1.4s .55↔1); error card; empty state + grey sample. Preview: real Premium cards rendered from `previewFromCollection` with `muted` charts under an `opacity .35` overlay in `colors.surfaceElevated`, `pointerEvents="none"`, unlock card centred (README copy, button 44pt min, Hobbyist gradient / Keeper `primary`).
- [ ] **Step 2:** Species and Molts list screens; `advanced.tsx` redirect.
- [ ] **Step 3:** `tsc` 0 errors; jest all pass; `pnpm run check:bundle` equivalent in the mirror (`expo export --platform android --dump-sourcemap --output-dir ../../.bundle-check` + `node ../../tools/check-single-react-native.js ../../.bundle-check`) → OK.
- [ ] **Step 4: Commit** `feat(mobile): one Analytics page`

### Task 5: Mobile entry points

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx` — Insights card as the second card under the feeding hero, built from the `/analytics/collection` response Home already loads (no new request); Analytics tools-grid tile stays.
- Modify: `apps/mobile/app/(tabs)/profile.tsx` — new "YOUR COLLECTION" group, first row Analytics (`chart-line` 20pt `accent`, `Analytics` 14/600, trailing `"{n} animals"`, chevron, 52pt), then the existing Feeders, Expenses (Premium badge), Export rows moved into it.
- Create: `apps/mobile/src/components/analytics/InsightsCard.tsx`

**Interfaces:** Consumes `insight(c, now)` (Task 2). Card hidden when it returns `null` or the collection call failed.

- [ ] **Step 1:** Implement per README §3 "Insights card" / "You · Analytics row".
- [ ] **Step 2:** `tsc` 0; jest pass.
- [ ] **Step 3: Commit** `feat(mobile): analytics entry points`

### Task 6: Web Analytics page + list pages + redirect

**Files:**
- Rewrite: `apps/web/src/app/dashboard/analytics/page.tsx`
- Create: `apps/web/src/components/analytics/{RightNow,CollectionCard,FeedingCard,MoltsCard,RecentCard,PremiumSection,MoneyCard,Charts,AnalyticsSkeleton}.tsx`
- Replace: `apps/web/src/app/dashboard/analytics/advanced/page.tsx` → server `redirect('/dashboard/analytics#premium')`
- Create: `apps/web/src/app/dashboard/analytics/species/page.tsx`, `apps/web/src/app/dashboard/analytics/molts/page.tsx`

**Interfaces:** Same as Task 4 with web routes (`/dashboard/feeding-day`, `/dashboard/inverts/{id}`, `/dashboard/analytics/species|molts`), `apiClient`, `UpgradeModal` (`source: 'advanced_analytics'`), `trackUpgrade` / `UPGRADE_EVENTS` from `web/src/lib/upgrade-tracking.ts` (same use as Task 4). `Charts.tsx` exports `Bars`, `StepLine` (recharts configured to README §6: no axes/grid, max bar `secondary` with label, step line `type="stepAfter"`, area 14%), `SplitBar`, `RankedRows` (divs). Premium block wrapper has `id="premium"`.

- [ ] **Step 1:** Build the page per README §2 web layout (3-up Right now; Collection | Feeding+Molts; Recent under Collection; Premium 3-up), sticky title, units line top-right (`"Inches · grams · your currency"` from `useUnits()`), preview with CSS `blur(5px)` + `pointer-events-none` + centred unlock card, all states, no "← Back to Dashboard".
- [ ] **Step 2:** Species/Molts pages; advanced redirect.
- [ ] **Step 3:** `tsc --noEmit` 0; `next lint` clean for the touched files.
- [ ] **Step 4: Commit** `feat(web): one Analytics page`

### Task 7: Web entry point

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx` — Insights card (from the `/analytics/collection` response the dashboard already fetches); no new request.
- Create: `apps/web/src/components/analytics/InsightsCard.tsx`
- Sidebar row unchanged.

- [ ] **Step 1:** Implement (radius 16, 15/21 sentence).
- [ ] **Step 2:** `tsc` 0; lint clean.
- [ ] **Step 3: Commit** `feat(web): dashboard Insights card`

### Task 8: Per-animal chart restyle

**Files:**
- Modify: `apps/web/src/components/GrowthChart.tsx`, `apps/web/src/components/FeedingStatsCard.tsx`, `apps/mobile/src/components/GrowthChart.tsx`, `apps/mobile/src/components/FeedingStatsCard.tsx`

**Interfaces:** Same props and data as today; visual only (README §6 StepLine/Bars stroke, fill, dot, label sizes; no gridlines/y-axis; sentence under; lengths still through the units helpers). Mobile may switch GrowthChart from `react-native-chart-kit` to the Task 3 components.

- [ ] **Step 1:** Restyle.
- [ ] **Step 2:** `tsc` both apps 0; mobile jest pass.
- [ ] **Step 3: Commit** `style: per-animal charts follow the analytics chart grammar`

### Task 9: Docs + verification

**Files:** `CLAUDE.md` (Analytics section: one page, endpoints, view lib lockstep, no currency symbol rule), `design_handoff_analytics/` stays in the repo.

- [ ] **Step 1:** Full API suite, tsc ×4, mobile jest, bundle check both apps, web lint.
- [ ] **Step 2: Commit** `docs: analytics redesign`
