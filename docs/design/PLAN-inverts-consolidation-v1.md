# PLAN — Inverts consolidation v1

**Goal:** Collapse `tarantulas` + `scorpions` into a unified `inverts` table
with `taxon` discriminator, add centipedes on the consolidated surface, and
do all of it without any keeper noticing.

**Related:** `ADR-005-inverts-consolidation.md` (the decision); supersedes
nothing — this is the implementation plan that proves ADR-005 is safe.

---

## 1. User-safety properties (the bar we hit before we ship)

1. **Zero downtime.** API stays available throughout. No 503 windows, no
   maintenance-mode lockouts.
2. **No data loss.** Every existing tarantula and scorpion row survives the
   migration. Every feeding log, molt log, substrate change, photo, QR
   session, pairing, egg sac, and offspring record stays attached to its
   parent.
3. **No forced mobile upgrade.** The previous bundle (Phase 3b +
   collection consolidation, currently deploying) keeps working unchanged
   against the new backend. Keepers running the old build don't have to
   update before the consolidation lands.
4. **Reversible at every phase.** Each phase below can be rolled back
   individually. The only irreversible step is the final cleanup migration
   that drops the legacy tables — that one sits behind an explicit manual
   gate well after everything else is confirmed working.

## 2. Target schema

### 2.1 `inverts` table

Wide table mirroring HV's `animals` strategy. Fields grouped by what they
mean.

**Identity + ownership (every taxon)**

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → users (CASCADE) | |
| `taxon` | inverttaxon enum | `tarantula` / `scorpion` / `centipede`. Lowercase values; non-nullable. |
| `species_id` | UUID FK → invert_species (SET NULL) | |
| `enclosure_id` | UUID FK → enclosures (SET NULL) | |
| `colony_id` | UUID FK → scorpion_colonies (SET NULL) | Scorpion-only today. Keep the FK name for now; rename later. |

**Naming + sex + acquisition (every taxon)**

| column | type | notes |
|---|---|---|
| `name` | varchar(100) | Pet name |
| `common_name` | varchar(100) | |
| `scientific_name` | varchar(255) | |
| `sex` | sex enum | Shared TV enum, UPPERCASE values |
| `date_acquired` | date | |
| `source` | source enum | Shared TV enum |
| `price_paid` | numeric(10,2) | |

**Husbandry (every taxon)**

| column | type | notes |
|---|---|---|
| `enclosure_type` | varchar(30) | `terrestrial` / `arboreal` / `fossorial` |
| `enclosure_size` | varchar(50) | |
| `substrate_type` | varchar(100) | |
| `substrate_depth` | varchar(50) | |
| `last_substrate_change` | date | denormalized |
| `target_temp_min/max` | numeric(5,2) | Fahrenheit |
| `target_humidity_min/max` | numeric(5,2) | percent |
| `water_dish` | boolean | default true |
| `misting_schedule` | varchar(100) | |
| `last_enclosure_cleaning` | date | |
| `enclosure_notes` | text | |

**Feeding pause (every taxon)**

| column | type | notes |
|---|---|---|
| `feeding_paused_reason` | varchar(40) | |
| `feeding_paused_until` | date | |

**Media + privacy + notes (every taxon)**

| column | type | notes |
|---|---|---|
| `photo_url` | varchar(500) | denormalized main photo |
| `is_public` | boolean | default false |
| `visibility` | varchar(20) | `public` / `private` |
| `notes` | text | |

**Taxon-specific (nullable)**

| column | type | notes |
|---|---|---|
| `life_stage` | varchar | Tarantula only. `sling` / `juvenile` / `adult`. |
| `current_instar` | int | Scorpion + centipede. Nullable. |
| `current_length_mm` | numeric(6,2) | Scorpion + centipede. Tarantulas store leg-span on molt rows instead. |
| `current_segment_count` | int | Centipede only. Anamorphic species add segments over time. |
| `current_leg_pair_count` | int | Centipede only. 15–177 pairs depending on order; useful for ID. |
| `developmental_class` | varchar(20) | Centipede only. `anamorphic` / `epimorphic`. |

**Timestamps**

| column | type | notes |
|---|---|---|
| `created_at` / `updated_at` | timestamptz | |

### 2.2 `invert_species` table

Same shape strategy. Core taxonomy + care fields shared, plus nullable
taxon-specific fields (urticating_hairs, venom_severity, communal_suitable,
anamorphic_class). Slug stays unique across all taxa — fine because
scientific names are too.

### 2.3 Polymorphic FK collapse

The five shared tables today carry `tarantula_id` + `scorpion_id` + (some)
`enclosure_id` / `animal_id`. After consolidation, they carry:

* `invert_id` (new, nullable) — for TV inverts
* `animal_id` (existing, nullable) — for HV animals (cross-app polymorphism)
* `enclosure_id` (existing, nullable) — for feeders
* Updated CHECK: `num_nonnulls(invert_id, animal_id, enclosure_id) = 1` for
  exactly-one-parent tables, OR `IS NOT NULL OR …` for at-least-one parents.

The old `tarantula_id` and `scorpion_id` columns stay around for one release
cycle as a safety net (Phase D below drops them).

## 3. Rollout phases

This is the expand-contract pattern. Each phase is one PR / one deploy.

### Phase A — Add new tables, dual-write enabled (no client changes)

1. **Alembic migration `inv_inverts_v1`:**
   * Create `inverts` table (empty).
   * Create `invert_species` table (empty).
   * Create `inverttaxon` enum.
   * Add nullable `invert_id` columns to the five polymorphic tables.
2. **Backend code:**
   * `Invert` and `InvertSpecies` SQLAlchemy models, Pydantic schemas, and
     the unified router tree (`/inverts/`, `/invert-species/`).
   * Add dual-write to existing `/tarantulas/`, `/scorpions/`, `/species/`,
     `/scorpion-species/` POST/PUT/DELETE handlers: every write to a legacy
     table ALSO writes the equivalent row to `inverts` / `invert_species`.
     Reads still come from legacy tables.
   * Identical dual-write on the five polymorphic-log tables: when a row
     is created with `tarantula_id` or `scorpion_id`, also set `invert_id`
     to the corresponding `inverts.id`.
3. **What the keeper sees:** Nothing. The new table is empty (except for
   newly-created rows from this point on); reads still serve the same data.
4. **Rollback:** Revert the backend deploy. The Alembic migration is
   safe to leave in place (empty new tables hurt nothing).

### Phase B — Backfill data (still no client changes)

1. **Data migration script `scripts/backfill_inverts.py`:**
   * For every row in `tarantulas`, INSERT a matching row in `inverts` with
     `taxon='tarantula'` and the same UUID. Same `id` preserves keeper-
     facing references.
   * For every row in `scorpions`, INSERT a matching row in `inverts` with
     `taxon='scorpion'` and the same UUID.
   * For every row in `species` + `scorpion_species`, INSERT a matching
     `invert_species` row preserving UUID.
   * For every log/photo/QR row, set `invert_id` to match
     `tarantula_id ?? scorpion_id`.
   * Idempotent: skips rows that already exist in the target table.
   * Runs as a one-shot operation against prod via the Render shell, NOT
     as an Alembic migration. Reason: backfill scripts that run inside the
     migration system are hard to debug if something goes wrong.
2. **Verification queries:**
   * Row counts match: `tarantulas.count + scorpions.count == inverts.count`.
   * No orphaned logs: for each log table, every row with `invert_id NULL`
     must have a non-null `tarantula_id` or `scorpion_id` (legacy rows
     pre-Phase-A) and vice-versa.
   * Spot-check 10 random tarantula and 10 random scorpion records: every
     field matches between the legacy and new row.
3. **What the keeper sees:** Still nothing.
4. **Rollback:** Truncate `inverts` and `invert_species`. Re-run when ready.

### Phase C — Cutover reads, clients unchanged

1. **Backend code:**
   * Existing `/tarantulas/`, `/scorpions/` route handlers switch to reading
     from `inverts WHERE taxon=…`. They keep their response shapes
     identical — older mobile clients see no change.
   * Existing `/species/` and `/scorpion-species/` read from
     `invert_species WHERE taxon=…`.
   * Existing polymorphic-log routers read from `WHERE invert_id=…` when
     the parent is an invert.
   * Dual-write stays on (writes go to BOTH legacy and `inverts`) so any
     reader still on legacy doesn't drift.
2. **Add `/centipedes/` and `/centipede-species/` routes.** Filter on
   `inverts WHERE taxon='centipede'` and `invert_species WHERE taxon=
   'centipede'`. From here on, centipedes are first-class.
3. **Seed centipede species.** A new `seed_centipede_species.py` against
   `invert_species` with the v1 species list (TBD — see §5).
4. **What the keeper sees:** Nothing change-able to the touch. Internally
   reads now resolve from `inverts`. A mobile client running the OLDEST
   shipped bundle still works perfectly.
5. **Rollback:** Revert the backend deploy. Dual-write means legacy tables
   still have current data; pointing reads back at them is a one-line flip.

### Phase D — Drop dual-write, drop legacy (manual gate)

**This is the only irreversible step. Triggered manually after a confidence
period (suggested: 2 weeks after Phase C ships, longer if usage is sparse
and we want more cycles).**

1. **Alembic migration `inv_drop_legacy_v1`:**
   * Drop the dual-write paths in the backend code (one PR + deploy first).
   * Drop `tarantula_id` and `scorpion_id` columns from the five
     polymorphic tables.
   * Drop the legacy `tarantulas`, `scorpions`, `species`,
     `scorpion_species` tables.
   * Rename `colony_id` FK target to its final form (no more taxon prefix)
     OR keep as-is for now — punt this naming decision to a later cosmetic
     migration.
2. **Verification:** Snapshot the DB before this migration. Re-run all
   smoke tests post-migration: list tarantulas, list scorpions, list
   centipedes, log a feeding for each taxon, view a photo gallery, view a
   pairing.
3. **Rollback:** Restore from the pre-migration snapshot. This is the
   one phase where rollback means data loss for anything created during
   the rollback window — that's why the manual gate exists and why we
   wait long enough to be confident.

## 4. Per-phase bundle plan (what each PR looks like)

| Bundle | Scope | Risk | Reversible |
|---|---|---|---|
| **A1** | Migration + models + schemas + new `/inverts/` and `/invert-species/` routers | Low (additive) | Yes |
| **A2** | Dual-write on legacy CRUD routes | Medium (writes go two places) | Yes |
| **B** | Backfill script + verification queries | Low (data-only, isolated) | Yes (truncate target) |
| **C1** | Read cutover on legacy routes | Medium (mobile clients depend on response shape staying identical) | Yes |
| **C2** | Centipede routes + species seed | Low (additive) | Yes |
| **C3** | Mobile UI for centipedes (Collection tab third taxon, add-flow picker option, species browser segment, care sheet) | Low (JS-only OTA) | Yes |
| **D** | Cleanup — drop dual-write, drop legacy tables | High (irreversible without snapshot restore) | No (snapshot before) |

Suggested cadence: ship A1 + A2 together (one deploy), wait a day for
soak, ship B as a manual script run, ship C1 + C2 + C3 together
(synchronized backend + mobile OTA), wait 2 weeks, ship D.

## 5. Centipede-specific design notes

Once on the unified table, centipede support is a small set of additions:

* **Taxon values:** Add `'centipede'` to `inverttaxon` enum.
* **Centipede-specific columns:** Already enumerated in §2.1
  (`current_segment_count`, `current_leg_pair_count`, `developmental_class`).
* **Species seed:** Initial 8-12 species, leaning on the well-documented
  pet trade specimens. Suggested list (TBD, signoff needed):
  * Beginner: *Scolopendra polymorpha* (Sonoran Tiger), *Scolopendra heros*
    (Texas Redhead), *Ethmostigmus trigonopodus* (Yellow-Legged), *Rhysida
    longipes*
  * Intermediate: *Scolopendra dehaani* (Vietnamese Centipede),
    *Scolopendra alternans* (Florida Keys Giant)
  * Advanced/medically significant: *Scolopendra gigantea* (Peruvian
    Giant), *Scolopendra subspinipes* complex, *Scolopendra cingulata*
    (Mediterranean Banded)
* **Care sheet UX deltas:**
  * Venom callout same shape as scorpions (mild / moderate /
    medically_significant).
  * "Anamorphic vs epimorphic" callout on care sheets — keepers need to
    know whether segments grow with each molt (anamorphic) or hatchlings
    have full count (epimorphic).
  * Substrate depth and humidity are MORE important than for most
    tarantulas; surface the recommendation prominently.
* **Mobile UI:** Add `'centipede'` as a third option everywhere taxon
  picker / filter / segment exists (Collection taxon filter, add-flow
  alert, species browser taxon segment). Glyph: `🐛` placeholder until
  a better one is sourced (MaterialCommunityIcons has nothing
  centipede-specific; consider a custom SVG asset later).

## 6. What's NOT in v1

* **Breeding consolidation.** `pairings` + `egg_sacs` + `offspring` are
  currently tarantula-hardcoded; scorpion `broods` is Phase 5 of the
  scorpion plan and hasn't shipped. Generalizing the breeding tables is
  deliberately deferred — wait until both are real schemas, then a
  smaller ADR-Y covers it.
* **`/inverts/` as the canonical surface.** This plan keeps the per-
  taxon routes alive forever — they're now thin wrappers, but they
  exist. A future cleanup bundle can promote `/inverts/` and deprecate
  the per-taxon trees with a polite migration period.
* **Web app changes beyond keep-it-working.** Web UI consolidates on
  its own cadence; this plan keeps the existing web tarantula + scorpion
  surfaces functioning without forcing a redesign.
* **HV cross-pollination.** TV and HV stay separate platforms. Inverts
  and animals live in distinct tables. A future "all creatures" merge
  is a separate, much larger decision.

## 7. Open decisions for sign-off

These must be resolved before Phase A1 ships:

1. **Centipede species list — sign off on the 8-12 in §5 or push back.**
2. **Cadence between Phase C and Phase D — 2 weeks (proposed) or longer/shorter.**
3. **Should the `pairings` table get a generalized `invert_id` parent
   in Phase D, or stay tarantula-only for now?** Recommend: stay
   tarantula-only; revisit when scorpion breeding (Phase 5 of scorpion
   plan) ships.
4. **Naming on the public API:** Do we want to expose `/centipedes/` as
   a peer of `/tarantulas/` and `/scorpions/`, or just `/inverts/?taxon=
   centipede`? Recommend: per-taxon routes for keeper UX (matches the
   existing pattern), keep `/inverts/` available too.

## 8. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backfill misses rows | Low | High | Idempotent script + post-run row count + spot checks. Phase B is read-only against new tables so it's testable in isolation. |
| Dual-write divergence (legacy and new tables drift) | Medium | High | Dual-write is best-effort but logged. Add a nightly reconciliation query during Phases B + C that alerts if counts diverge. |
| Mobile client built against Phase B sees both legacy and new data | Low | Low | Phase B doesn't change reads at all; clients only ever hit legacy reads. |
| Phase C read cutover changes response shape in subtle ways (e.g. ordering, NULL vs empty string) | Medium | Medium | Snapshot-test responses for the top routes before and after; align any divergence. |
| Drop-legacy migration in Phase D runs against a DB that's still being written to from a stale deploy | Low | High | Phase D is gated by deploy verification: confirm no service is still using legacy paths before running the drop migration. |
| Centipede biology has more variation than the schema captures | Medium | Low | Iterate on `current_segment_count` / anamorphic-class fields after real keeper feedback. Schema is meant to evolve. |

## 9. References

* `docs/design/ADR-005-inverts-consolidation.md` — the decision
* HV ADR-003 in the changelog — the proof-of-concept
* `docs/design/PLAN-scorpion-v1.md` §3 — the deferral that scheduled this
* Render dashboard for snapshot management (Neon also supports
  point-in-time recovery — confirm before Phase D)
