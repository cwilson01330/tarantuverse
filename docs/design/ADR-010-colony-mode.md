# ADR-010: Colony Mode — population-level tracking for communal/colony keepers

**Status:** BUILT (Phases 1 + 2) — 2026-07-02. Backend + web + mobile shipped; ships OTA (no native deps, no store build). Phase 3 polish (export inclusion, Feeding Day/digest inclusion, migrating dormant communal-enclosure data) deferred. Closes the second competitive parity gap from COMPETITIVE-BRIEF-2026-07 (colony mode + inbound import; both now shipped).

**What shipped:** `colonies` + `colony_events` tables (migration `col_20260702_colonies`, down_revision `ntf2_20260701_digest`), `/api/v1/colonies` CRUD + events router (events with a `count_delta` adjust `stage_counts` buckets), colonies count 1 each toward the free cap (`utils/limits.py`), web colony pages under `dashboard/colonies/*` + merged into the collection list, mobile `app/colony/*` screens + merged into the Collection tab + AddPickerSheet. Taxon vocab reuses the shared invert registry (tarantula excluded from the colony picker).

## Context

Colony/communal keepers (isopods, springtails, roaches, communal Pandinus/Heterometrus, some communal true spiders) don't have "5 animals" — they have "a population of ~50, growing." Competitors serve this (Exoden's colony mode; Arachnifiles). Tarantuverse has three partial, overlapping attempts and no first-class pet-colony feature:

1. **Communal enclosure** (`enclosures.is_communal` + `species_id` + `population_count` + `communal_incidents`). An enclosure is a physical *box*; this bolted a biological *population* onto it. `population_count` is a lone int with no lifecycle; it lives in "Enclosures," not the collection; and it's torn between "track each individual (enclosure_id)" and "just a headcount." That dual identity is why it never felt right.
2. **ScorpionColony** — a clean *grouping layer* over individually-tracked scorpions (`scorpions.colony_id`; logs stay per-animal, bulk actions fan out). Good for *a few* animals you still track individually.
3. **FeederColony** — a real *population* model (count / per-life-stage JSONB buckets / adjustment care-logs), but scoped to feeders and not in the collection.

## Decision

**A colony is a population, and a population is a first-class collection entry — a dedicated `colonies` table modeled on the proven FeederColony pattern. NOT a flavor of `inverts`, NOT an enclosure.**

Why dedicated (robustness): individual-animal and population lifecycles are fundamentally different. Overloading `inverts` would force an `if colony` branch through feeding-status, growth, premolt, breeding, transfers, and analytics (the same overload that sank the enclosure attempt). FeederColony proves the dedicated model stays clean. The cost — Collection list / analytics / export must merge two sources — is additive and bounded.

**Coexistence (no destructive migration):** individual animals (`inverts`), grouping-of-individuals (`ScorpionColony`, unchanged), and population colonies (new) are three clearly-labeled modes. The communal-enclosure fields (`is_communal`, `population_count`, `CommunalIncident`) are deprecated → left dormant, data migrated into colonies later; the enclosure returns to being a pure container.

### `colonies` table (sketch)
- `id`, `user_id` (fk, cascade, index)
- `taxon` (str; the 10-taxon vocab), `species_id` (fk `invert_species`, nullable — care-sheet link)
- `enclosure_id` (fk `enclosures`, SET NULL — optional physical container)
- `name`, `date_acquired`, `founded_date`, `source` (bought/bred/wild_caught)
- `stage_counts` (JSONB) — **per-life-stage buckets always** (e.g. `{"adults":10,"juveniles":20,"nymphs":100,"mixed":0}`); casual keepers can dump everything in `mixed`
- `count_is_estimated` (bool) — honesty: "~50" is a valid answer
- husbandry: `substrate_type`, `substrate_depth`, `target_temp_min/max`, `target_humidity_min/max`, `last_substrate_change`, `notes`, `photo_url`
- `visibility`, `transferred_out_at` (future), timestamps
- `total_count` computed = sum(stage_counts)

### `colony_events` table (generalizes `CommunalIncident`)
- `id`, `colony_id` (fk cascade), `user_id`
- `event_type`: birth | death | added | removed | cannibalism | aggression | molt_found | split | merge | observation | count_correction
- `stage` (which bucket, nullable), `count_delta` (int, nullable — adjusts a bucket), `occurred_at` (date), `severity` (nullable), `notes`, `created_at`
- This is the population lifecycle: a "birth" event +N nymphs, a "death"/"cannibalism" −1, etc. Updates `stage_counts` on write (mirrors FeederColony care-log → count pattern).

### Care logging
Colonies feed/maintain at the **population** level ("fed the colony"), not per-individual. v1: colony feeding + substrate handled via colony's own lightweight logs (or the `colony_events` stream) — do NOT touch the polymorphic `feeding_logs` CHECK yet. **Open decision for the build:** later, add `colony_id` to the polymorphic feeding/substrate parents so colonies flow through Feeding Day + the digest + feeding-status (the established `invert_id` widening pattern). Deferred to keep v1 bounded.

### Cap / collection
A colony counts as **1** toward the free-tier cap (one entry, regardless of headcount). It appears in the main Collection list alongside individual animals (colony-aware merged list), links to its species care sheet, and shows total population + a stage breakdown on its card/detail.

## Phasing
1. **Backend:** `colonies` + `colony_events` models + migration; CRUD router; population-adjustment logic (events → stage_counts); care-sheet link; cap counts colonies.
2. **Collection integration:** merged collection list (animals + colonies) on web + mobile; colony card (total + stage chips); colony detail (buckets, events timeline, add-event, care-sheet surface). Add-flow: "Add a colony" alongside "Add an animal."
3. **Polish / parity:** export includes colonies; optional Feeding Day / digest inclusion (the `colony_id` polymorphic widening); migrate dormant communal-enclosure data in; decide ScorpionColony reframe (optional).

## Open questions (decide at build time)
- Do colonies need feeding cadence / "due" logic (→ Feeding Day inclusion), or is the events log enough for v1?
- Migration of existing `enclosures.population_count` communals + `communal_incidents` rows — volume is likely tiny (feature was unused); confirm before writing the data migration.
- Whether ScorpionColony eventually folds into colonies (only if keepers prefer population over per-individual for communal scorpions) — leave for later.

## Consequences
Two new tables, one migration; a colony-aware Collection/analytics/export merge; the enclosure model simplifies back to a container over time. Reuses FeederColony's proven shape and the species care-sheet catalog. Related: [[project_feeder_rework]] (FeederColony pattern), the unified `inverts` surface, COMPETITIVE-BRIEF-2026-07.
