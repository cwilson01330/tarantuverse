# PRD — Feeder Module

**Status:** Draft
**Author:** Tarantuverse team
**Created:** 2026-04-20
**Target release:** v1.2 (after Health/Vet)
**Related docs:** [PRD-health-vet-module.md](./PRD-health-vet-module.md), [PLATFORM_DESIGN_AUDIT_2026-04-13.md](./PLATFORM_DESIGN_AUDIT_2026-04-13.md)

---

## 1. Problem Statement

Tarantula keepers maintain feeder insects — Madagascar hissing cockroaches, Dubia roaches, mealworms, superworms, crickets, lateral roaches — as living husbandry projects in their own right. These colonies need water, food, cleaning, temperature management, and periodic inventory assessment. Casual hobbyists buy feeders weekly from pet stores and want a simple stock count; serious breeders run multiple colonies and want life-stage tracking for prey-size matching. Today, none of that is tracked in Tarantuverse — keepers resort to paper notes, spreadsheets, or no records at all. The downstream pain is real: colonies crash without warning, feeders run out at inconvenient times, and there is no audit trail linking feeder health to tarantula feeding refusals or die-offs.

**Strategic context:** This module is also a deliberate model-workshop for future multi-category expansion (reptile tracking is on the long-term roadmap under a potentially different banner, same API). Getting the shared-enclosure + species-per-category + care-log patterns right here means the reptile expansion is additive, not a rewrite. No competitor (Arachnifiles, ExotiKeeper, Husbandry.Pro) ships feeder tracking — another category gap we can close.

**Evidence:** 60%+ of Arachnoboards "feeder" threads concern colony crashes, running-low emergencies, or prey-size confusion. Dubia colony care and mealworm beetle conversion are the two most repeated questions. These are documentation problems, not knowledge problems.

---

## 2. Goals

1. **Give keepers a first-class place to log feeder colonies and stocks** with care and inventory separate from their tarantula collection.
2. **Support both casual and power users** — a single count field works for the mealworm-drawer user; life-stage buckets (adults / nymphs / pinheads) work for Dubia breeders. Mode is chosen per colony.
3. **Surface care-cadence health** — last-fed, last-cleaned, running-low indicators on the colony card so a keeper notices a neglected colony before it crashes.
4. **Lay reusable scaffolding for future non-tarantula keeper categories** — shared enclosures table with a `purpose` column, category-specific species tables, pattern-first care logging — without shipping any reptile UI.
5. **Hold the honesty-first line** — no fake productivity projections, no fictional breeding-rate charts, no auto-inferred counts. Only what the keeper logs.

**Success framing:** Within 60 days of launch, 30%+ of active keepers with 3+ tarantulas have created at least one feeder colony, and 50%+ of those colonies have at least one care-log event in their second week.

---

## 3. Non-Goals

1. **No auto-decrement of feeder inventory when a tarantula feeding is logged.** Counts drift inherently, forced precision creates friction, and error states annoy users. This may become an opt-in P2 feature once we have real usage data; it is not in v1.
2. **No breeding productivity projections.** We will not ship a "your colony produces ~40 nymphs/week" chart until we have actual user-logged data to validate the claim. Estimates are dishonest and this violates `project_honesty_principle`.
3. **No supplier / price comparison.** A simple per-restock cost field is P1; multi-supplier tracking and "best price near you" is deferred indefinitely.
4. **No feeder genetics or lineage tracking.** Unlike tarantulas, feeder genetics is not a meaningful concept for keepers.
5. **No reptile, amphibian, or other non-tarantula keeper features.** The shared-enclosure pattern is designed to extend later; we are not shipping any such UI here.
6. **No IoT sensor integration in this module.** The shared enclosures table is deliberately designed to accept sensor data in a future phase; no integration work happens in this scope.
7. **No mixed feeder/tarantula list views.** Feeders live on a separate tab / route; they do not appear in the main tarantula collection grid.

---

## 4. User Stories

### Primary persona — Hobbyist colony keeper ("Cory," 15-T collection, runs hisser + mealworm colonies)

- As a keeper, I want to add a Dubia colony with an enclosure, a species, rough count, and notes on what I feed them, so that I have a real record instead of scribbled sticky notes.
- As a keeper, I want to quick-log "cleaned the bin today" or "fed the feeders" without filling out a full form, so that care logging stays frictionless.
- As a keeper, I want to set a running-low threshold (e.g., "notify me when adult count drops below 30") so that I restock before I run out.
- As a keeper, I want to link a colony to an enclosure from the existing enclosures list, so that temp/humidity/substrate tracking works the same way it does for tarantula enclosures.

### Secondary persona — Casual feeder user ("Jamie," 3-T collection, buys crickets weekly)

- As a keeper, I want to add a "cricket stock" with just a count and a last-restocked date, so that I can skip life-stage fields I do not care about.
- As a keeper, I want to manually adjust the count when I buy more or notice die-off, so that the number stays roughly accurate.
- As a keeper, I want the UI to stop asking me about life-stages when my mode is "simple count," so that the product respects my scope.

### Tertiary persona — Breeder ("Marisol," 80-T collection, 4 Dubia colonies)

- As a breeder, I want separate entries for each Dubia colony so that I can track which one is ready to prune for feeding adults.
- As a breeder, I want life-stage buckets (adults / juveniles / nymphs / pinheads) per colony so that I can match prey size to a tarantula sling's needs.
- As a breeder, I want to note which colony I pulled feeders from when I log a tarantula feeding, so that I have colony-level consumption data later.

### Edge cases

- As a keeper, I want to delete a colony after it crashes without orphaning the care logs (CASCADE handles this).
- As a keeper, I want to mark a colony as inactive rather than deleting it, so that I retain the history if I restart the species later.
- As a keeper, I want to skip the enclosure link entirely (mealworms in a Tupperware bin may not warrant their own enclosure record).

---

## 5. Requirements

### Must-Have (P0) — ships with v1.2

#### 5.1 Shared Enclosures Schema Upgrade
Extend the existing `enclosures` table to support non-tarantula use.

**Migration:**
- Add column `purpose VARCHAR(20) NOT NULL DEFAULT 'tarantula'`
- Allowed values (application-level enum): `'tarantula'`, `'feeder'`
- Add index `ix_enclosures_purpose`
- Backfill existing rows with `'tarantula'` (the default handles this)

**Rationale:** One enclosure primitive means future IoT sensor integration, photo management, and environmental tracking work across all keeper categories without duplicated code. Reptile expansion adds `'reptile'` as a new allowed value — one migration, no new table.

#### 5.2 Feeder Species Table
Separate table from the tarantula `species` table; different care profile shape.

**Data model — `feeder_species`:**
- `id` (UUID, PK)
- `scientific_name` (String, unique, indexed)
- `scientific_name_lower` (String, unique, indexed — case-insensitive search)
- `common_names` (ARRAY of String)
- `category` (String) — `'cricket'` | `'roach'` | `'larvae'` | `'other'`
- `care_level` (String) — `'easy'` | `'moderate'` | `'hard'`
- `temperature_min`, `temperature_max` (Integer, Fahrenheit)
- `humidity_min`, `humidity_max` (Integer, percent)
- `typical_adult_size_mm` (Integer, nullable)
- `supports_life_stages` (Boolean) — whether life-stage mode is meaningful for this species
- `default_life_stages` (JSONB, nullable) — array of stage names this species uses, e.g. `["adults", "nymphs", "pinheads"]` for Dubia, `["beetles", "worms", "pupae"]` for Tenebrio
- `prey_size_notes` (Text, nullable) — free-form notes on which life stage suits which tarantula size
- `care_notes` (Text, nullable) — what to feed, cleaning cadence, common failure modes
- `image_url` (String, nullable)
- `is_verified` (Boolean, default false)
- `created_at`, `updated_at`

**Seed list (v1) — 11 species:**
| Scientific | Common | Category | Life-stage default |
|---|---|---|---|
| Acheta domesticus | House cricket | cricket | `["adults", "pinheads"]` |
| Gryllodes sigillatus | Banded cricket | cricket | `["adults", "pinheads"]` |
| Blaptica dubia | Dubia roach | roach | `["adults", "juveniles", "nymphs"]` |
| Gromphadorhina portentosa | Madagascar hissing cockroach | roach | `["adults", "nymphs"]` |
| Shelfordella lateralis | Turkestan roach (red runner) | roach | `["adults", "nymphs"]` |
| Pycnoscelus surinamensis | Surinam roach | roach | `["adults", "nymphs"]` |
| Tenebrio molitor | Mealworm | larvae | `["beetles", "worms", "pupae"]` |
| Zophobas morio | Superworm | larvae | `["beetles", "worms", "pupae"]` |
| Hermetia illucens | Black soldier fly larvae (BSFL / phoenix worms) | larvae | `["larvae", "pupae"]` |
| Galleria mellonella | Waxworm | larvae | `["moths", "worms", "pupae"]` |
| Bombyx mori | Silkworm | larvae | `["moths", "worms", "pupae"]` |

**API routes:**
- `GET /api/v1/feeder-species/` — list all (public, paginated)
- `GET /api/v1/feeder-species/{id}` — detail (public)
- `GET /api/v1/feeder-species/search?q=` — autocomplete (public)
- `POST /api/v1/feeder-species/` — create (admin only, community submission deferred to P2)

#### 5.3 FeederColony Entity
A colony / stock of a single feeder species owned by a user.

**Data model — `feeder_colonies`:**
- `id` (UUID, PK)
- `user_id` (FK → users, CASCADE)
- `feeder_species_id` (FK → feeder_species, SET NULL)
- `enclosure_id` (FK → enclosures, SET NULL, nullable — skip OK)
- `name` (String) — user-friendly label, e.g. "Mealworm Drawer," "Main Dubia Colony #2"
- `inventory_mode` (String) — `'count'` | `'life_stage'`
- `count` (Integer, nullable — used when mode=`'count'`)
- `life_stage_counts` (JSONB, nullable — used when mode=`'life_stage'`) — e.g. `{"adults": 80, "nymphs": 200, "pinheads": null}`
- `last_restocked` (Date, nullable)
- `last_cleaned` (Date, nullable)
- `last_fed_date` (Date, nullable) — last time the keeper fed the feeders
- `food_notes` (Text, nullable) — what you feed them (chow, carrot, orange slice, etc.)
- `notes` (Text, nullable) — free-form colony notes
- `low_threshold` (Integer, nullable) — count below which a running-low reminder fires; in life-stage mode, interpreted against the sum of adult+juvenile counts
- `is_active` (Boolean, default true) — soft-delete; inactive colonies persist for historical queries
- `created_at`, `updated_at`

**Decisions:**
- `life_stage_counts` as JSONB (not separate columns) because life-stage vocabulary varies by species. JSONB keeps the schema generic and validates against `feeder_species.default_life_stages` at the API layer.
- `low_threshold` intentionally simple — a single number, not a per-life-stage threshold. Iterate in P2 if users ask.
- `inventory_mode` locked to the two values for v1. Keep an enum-like string rather than a boolean (`is_life_stage`) so we can add future modes (e.g., `'range'`) without migrating.

**API routes:**
- `GET /api/v1/feeder-colonies/` — list user's colonies (auth)
- `POST /api/v1/feeder-colonies/` — create (auth)
- `GET /api/v1/feeder-colonies/{id}` — detail (auth, ownership check)
- `PUT /api/v1/feeder-colonies/{id}` — update (auth, ownership check)
- `DELETE /api/v1/feeder-colonies/{id}` — hard delete (auth, ownership check)
- `POST /api/v1/feeder-colonies/{id}/deactivate` — soft delete (auth)

#### 5.4 Feeder Care Logs
Timestamped events on a colony — cleaning, feeding the feeders, restocks, count adjustments.

**Data model — `feeder_care_logs`:**
- `id` (UUID, PK)
- `feeder_colony_id` (FK → feeder_colonies, CASCADE)
- `user_id` (FK → users, CASCADE)
- `log_type` (String) — `'fed_feeders'` | `'cleaning'` | `'water_change'` | `'restock'` | `'count_update'` | `'note'`
- `logged_at` (Date, default today)
- `count_delta` (Integer, nullable) — used for restock (+N) or mortality (-N); purely informational, does not mutate colony count unless paired with a separate colony update
- `notes` (Text, nullable)
- `created_at`

**API routes:**
- `GET /api/v1/feeder-colonies/{id}/care-logs` — list (auth, ownership check, paginated with bound)
- `POST /api/v1/feeder-colonies/{id}/care-logs` — create (auth)
- `DELETE /api/v1/feeder-care-logs/{id}` — delete (auth, ownership check)

**Quick-log UX:** The colony detail page exposes one-tap buttons for the three most common types (`fed_feeders`, `cleaning`, `restock`), each creating a care log with today's date and no notes required.

#### 5.5 Colony List + Detail UI (Web + Mobile)
**Must maintain full feature parity.** Both platforms must ship the feeder UI simultaneously per the `CLAUDE.md` parity rule.

**Web:**
- New sidebar item "Feeders" between "Dashboard" and "Breeding"
- `/dashboard/feeders` — colony list grid with species icon, name, inventory summary, last-cleaned / last-fed indicators, running-low badge
- `/dashboard/feeders/add` — create form
- `/dashboard/feeders/[id]` — colony detail with inventory card, care log timeline, quick-log buttons
- `/dashboard/feeders/[id]/edit` — edit form

**Mobile:**
- Feeders lives under a new **"More" tab** in the tab bar (avoids tab-bar bloat at 6 items). The More tab becomes the hub for secondary navigation (Feeders, Analytics, Achievements, Settings, etc.) and reorganization of existing secondary screens happens as part of this work.
- `/feeders/index.tsx` — colony list
- `/feeders/add.tsx` — create form
- `/feeders/[id].tsx` — detail with quick-log buttons
- `/feeders/edit.tsx` — edit form
- Uses `AppHeader` component pattern (safe-area aware) from day one

**Dark mode:** Both platforms support both themes from day one. No exceptions.

#### 5.6 Running-Low Reminders
When `low_threshold` is set and current count (or sum of life-stage counts for meaningful stages) drops below it, a local notification fires (mobile) or a dashboard banner appears (web). Piggybacks on existing `notification_preferences` infrastructure with a new `feeder_low_stock_enabled` boolean.

**Migration:** Add `feeder_low_stock_enabled` (Boolean, default true) to `notification_preferences`.

### Should-Have (P1) — stretch for v1.2, definitely v1.3

#### 5.7 Feeding-Log Linkage
Optional `feeder_colony_id` on `feeding_logs` — when a keeper logs "fed 1 adult Dubia to T. stirmi sling," they can optionally note which colony it came from. Purely informational; does not decrement the colony count.

**Migration:** Add nullable `feeder_colony_id` (FK, SET NULL) to `feeding_logs`.

**UI:** Optional dropdown in the feeding log form, populated from the user's active colonies filtered to species matching the log's `food_type`.

#### 5.8 Per-Restock Cost
Lightweight cost field on `feeder_care_logs` for `log_type = 'restock'`.

**Migration:** Add nullable `cost_usd` (Numeric) to `feeder_care_logs`.

**UI:** Optional cost input on the restock quick-log flow. Feeds into advanced analytics as a feeder cost breakdown.

#### 5.9 Last-Cleaned / Last-Fed Status Badges on Colony Card
Color-coded badges on the list view similar to tarantula feeding-status logic (green / yellow / orange / red) based on cleaning cadence. Cadence thresholds pulled from `feeder_species` (future: store `default_cleaning_interval_days` per species).

### Nice-to-Have (P2) — deferred indefinitely

- Auto-decrement feeder inventory when tarantula feeding logs create (opt-in per colony, default off)
- Community-submitted feeder species (like tarantula species submission flow)
- Breeding productivity tracking (only after we have real usage data to design against)
- Supplier / price comparison
- Feeder colony photos (separate from enclosure photos)
- "Pull adults only" inventory-adjust helper for Dubia breeders
- Mobile widget for colony at-a-glance

---

## 6. Technical Design

### 6.1 Migrations (in order, chained off current head)

1. `{hash}_add_enclosure_purpose.py` — adds `purpose` column with default `'tarantula'`, backfills, adds index.
2. `{hash}_add_feeder_species.py` — creates `feeder_species` table.
3. `{hash}_add_feeder_colonies.py` — creates `feeder_colonies` table with FK to `feeder_species` and `enclosures`.
4. `{hash}_add_feeder_care_logs.py` — creates `feeder_care_logs` table.
5. `{hash}_add_feeder_notification_pref.py` — adds `feeder_low_stock_enabled` to `notification_preferences`.

P1 migrations (v1.3):
6. `{hash}_add_feeder_colony_to_feeding_logs.py` — adds nullable FK.
7. `{hash}_add_cost_to_feeder_care_logs.py` — adds nullable `cost_usd`.

Hashes assigned at implementation time based on current alembic head.

### 6.2 Models (SQLAlchemy)

- `apps/api/app/models/feeder_species.py` — `FeederSpecies`
- `apps/api/app/models/feeder_colony.py` — `FeederColony` with relationships to `User`, `FeederSpecies`, `Enclosure`, `FeederCareLog`
- `apps/api/app/models/feeder_care_log.py` — `FeederCareLog` with relationships to `FeederColony` and `User`

### 6.3 Schemas (Pydantic v2)

- `apps/api/app/schemas/feeder_species.py` — `FeederSpeciesBase`, `FeederSpeciesCreate`, `FeederSpeciesResponse`
- `apps/api/app/schemas/feeder_colony.py` — `FeederColonyBase`, `FeederColonyCreate`, `FeederColonyUpdate`, `FeederColonyResponse`
- `apps/api/app/schemas/feeder_care_log.py` — `FeederCareLogCreate`, `FeederCareLogResponse`

### 6.4 Routers

- `apps/api/app/routers/feeder_species.py` — public read, admin-only write
- `apps/api/app/routers/feeder_colonies.py` — authenticated CRUD, ownership checks
- `apps/api/app/routers/feeder_care_logs.py` — authenticated, nested under colony

### 6.5 Seed Script

- `apps/api/seed_feeder_species.py` — inserts the 8-species v1 list. Idempotent (upsert on `scientific_name_lower`). Run via the Render shell or a one-off migration hook.

### 6.6 Validation Rules (API layer)

- `inventory_mode='count'` → `count` required, `life_stage_counts` must be NULL
- `inventory_mode='life_stage'` → `life_stage_counts` required, keys must be a subset of the linked species' `default_life_stages`, `count` must be NULL
- `enclosure_id` (if provided) must reference an enclosure owned by the same `user_id` with `purpose='feeder'` (strict filter — tarantula enclosures cannot be linked to a colony)
- Switching `inventory_mode` on an existing colony preserves the unused field's data (a user who flips life-stage → count does not lose their stored `life_stage_counts`; the UI just hides them). Flipping back restores the stored values. No data destruction.
- `feeder_species_id` must exist and be active
- `low_threshold` must be ≥ 0

### 6.7 Reusable Patterns Flagged for Future Reptile Extension

When we eventually add reptiles, these pieces generalize:
- **Enclosures table with `purpose` column** — add `'reptile'` as allowed value.
- **Per-category species table pattern** — `reptile_species` follows the same shape as `feeder_species`.
- **Per-category care log pattern** — `reptile_care_logs` mirrors `feeder_care_logs` with a different `log_type` enum.
- **Inventory mode toggle** — likely not reused (reptiles are usually tracked as individuals, like tarantulas), but the JSONB-for-variable-vocabulary pattern is.

What is feeder-specific and does not generalize:
- `life_stage_counts` JSONB structure (reptiles are individuals, not populations)
- `low_threshold` / running-low concept (a single reptile does not have "low stock")
- `category` enum values

---

## 7. UX / Wireframes

### 7.1 Web — Colony List (`/dashboard/feeders`)

Grid of cards, one per colony. Each card shows:
- Species icon or photo (48px)
- Colony name (bold)
- Species scientific + common name
- Inventory summary: either `"~120 total"` or `"80 adults • 200 nymphs"` depending on mode
- Status row: last-cleaned badge (green/yellow/orange/red), last-fed badge, running-low badge (red, only if threshold breached)
- "+ Quick log" button opens action sheet with fed / cleaned / restocked

Top bar: page title, "+ Add Colony" primary button.

Empty state: illustration + "Track your feeders. Add your first colony."

### 7.2 Web — Colony Detail (`/dashboard/feeders/[id]`)

Sections:
- Header: name, species, enclosure link (if any), edit/delete buttons
- Inventory card: current counts, last-restocked date, adjust buttons (+/−)
- Care log timeline: most recent first, type icon + date + notes; pagination or infinite scroll
- Quick-log row (sticky): "Fed 'em" / "Cleaned" / "Restocked" one-tap buttons

### 7.3 Mobile — Colony List + Detail

Mirrors web layout. Uses `AppHeader` from day one. Bottom-sheet for quick-log actions. Pull-to-refresh. Dark mode via `ThemeContext`.

### 7.4 Add Colony Flow

Step 1: Pick species (autocomplete from feeder species)
Step 2: Choose inventory mode — toggle between "Simple count" and "Life-stage tracking" (only shown if species supports life stages; otherwise defaults to count)
Step 3: Fill in starting counts, optional enclosure link (picker filtered to `purpose='feeder'` only — with a "+ Create new feeder enclosure" quick-create option inline, matching how tarantula add flow handles enclosure creation), optional low threshold, notes
Step 4: Save → redirect to colony detail with "Colony created — quick-log your first care event?" nudge

**Species-removed graceful state:** If a linked `feeder_species_id` is later set to NULL (species deleted by admin or archive flag), the colony detail page surfaces a non-destructive banner: "Species data unavailable — relink?" with a picker to reconnect. The colony remains fully usable; only species-dependent UI (life-stage labels, care-level badges) falls back to generic language.

---

## 8. Success Metrics

### Adoption (measured 60 days post-launch)
- % of active users with 3+ tarantulas who create at least one feeder colony → target 30%
- % of created colonies with at least one care log event in their second week → target 50%
- % of created colonies still `is_active=true` at 60 days → target 75%

### Quality
- Zero user reports of misleading / fabricated feeder data
- No increase in error rate on tarantula feeding logs (P1 linkage should be zero-risk to existing flow)
- Crash-free sessions remain ≥ 99.5% on mobile after feeder UI ships

### Platform health
- Migration runs cleanly on Render with no backfill errors
- `enclosures.purpose` backfill touches 100% of existing rows with `'tarantula'`

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep into breeding productivity / auto-decrement | High | High | Explicitly P2'd in this doc; link back to this PRD when new requests surface |
| Inventory counts drift and become meaningless | High | Medium | No auto-decrement; periodic "does this count still look right?" nudge in P1; accept drift as a feature of honesty |
| Feeder tab clutters UX for casual keepers | Medium | Medium | Separate route/tab, not mixed with tarantulas. Empty state is inviting, not intrusive |
| JSONB `life_stage_counts` validation complexity | Medium | Low | Validate at API layer against species' `default_life_stages`; reject unknown keys |
| Purpose column backfill on large production DB | Low | Medium | Default value in migration handles it; no separate backfill script needed |
| Notification pref migration collides with in-flight Health/Vet work | Medium | Low | Coordinate migration hashes; Health/Vet has its own notification prefs — they don't overlap semantically |
| Reptile expansion reveals model mistakes we committed to in feeders | Medium | Medium | Keep `purpose` as a flexible String (not hard ENUM); keep species tables separate per category; don't over-abstract now |

---

## 10. Resolved Decisions (2026-04-20)

1. **Mobile tab bar:** Feeders goes under a new "More" tab. The More tab becomes the hub for secondary navigation and is part of this module's scope.
2. **Enclosure filter:** Strict filter — only enclosures with `purpose='feeder'` are selectable when linking a colony.
3. **Deleted species handling:** Surface gracefully — non-destructive "Species data unavailable — relink?" banner on colony detail. Colony remains fully functional.
4. **Life-stage switch on edit:** Always preserve. Switching `inventory_mode` hides unused data but never deletes it. Flipping back restores stored values.
5. **Quick-create enclosure from colony add flow:** Yes — must match the pattern already used by the tarantula add flow.
6. **Seed list:** Expanded to 11 species (Acheta domesticus, Gryllodes sigillatus, Blaptica dubia, Gromphadorhina portentosa, Shelfordella lateralis, Pycnoscelus surinamensis, Tenebrio molitor, Zophobas morio, Hermetia illucens, Galleria mellonella, Bombyx mori). Category enum widened from `beetle_larvae` to `larvae` to accommodate moth and fly larvae.

---

## 11. Timeline (rough)

| Week | Work |
|---|---|
| 1 | Schema + migrations + models + seed script |
| 2 | API routers + tests + `feeder_species` seed to production |
| 3 | Web colony list + add + edit + detail + dark mode polish |
| 4 | Mobile colony list + add + edit + detail with `AppHeader` + dark mode polish |
| 5 | P0 notification hookup, running-low logic, cross-platform QA |
| 6 | P1 feeding-log linkage + per-restock cost + launch |

Total: ~6 weeks single-developer. Can compress if Health/Vet shipped patterns (e.g., care-log timeline UI) are reusable.

---

## 12. Appendix

### A. Non-user-facing glossary

- **Colony** — a user-owned group of feeder insects of a single species, kept for feeding tarantulas. Distinct from "communal enclosure" (multiple tarantulas sharing an enclosure).
- **Life-stage mode** — inventory tracking that splits counts by life stage (adults, nymphs, pinheads, etc.). Alternative to simple count mode.
- **Stock** — colloquial UI term for a colony in simple-count mode; may appear in UX copy though the database entity is always `FeederColony`.

### B. Out-of-scope feeder species (for reference / future seeding)

Locusta migratoria (migratory locust), Periplaneta americana (American cockroach — feeder use rare, pest status high; likely permanent skip), Achroia grisella (lesser waxworm), Pachnoda marginata (sun beetle grubs).

### C. Related memory files

- `project_platform_expansion_vision.md` — rationale for the shared-enclosure-purpose design
- `project_honesty_principle.md` — rationale for no-auto-decrement and no-breeding-projections decisions
- `project_v1_platform_hardening.md` — v1.0 feature set context

---

**Next steps after PRD approval:**
1. Confirm open questions 1–6 with Cory
2. Schedule migration chain hashes against current alembic head
3. Begin schema + seed script (Week 1)
