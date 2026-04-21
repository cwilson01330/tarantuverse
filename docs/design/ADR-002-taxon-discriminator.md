# ADR-002: Herpetoverse Data Architecture — Parallel Taxon Tables

**Status:** Proposed
**Date:** 2026-04-20
**Deciders:** Cory (solo — documented for future collaborators)
**Related docs:** `PRD-herpetoverse-v1.md`, `REVIEW-PRD-herpetoverse-v1.md`, `ADR-001-theme-preset-system.md`

---

## Context

Herpetoverse launches as a distinct brand for reptile (snake + lizard) keepers on a shared backend with Tarantuverse. The PRD establishes the strategic commitment: same FastAPI service, same PostgreSQL database, same user identity, distinct apps and brands.

The technical question this ADR resolves is **how reptile data coexists with tarantula data at the schema layer**. Every downstream decision — API routing, query patterns, migration sequencing, test surface, component library strategy, search and activity-feed mechanics — depends on this choice.

Four sub-questions are bundled here because they interact:

1. **Animal representation.** Rename `tarantulas` → `animals` with a `taxon` column? Keep `tarantulas` + add parallel `snakes` / `lizards` tables? Single-table inheritance? Separate schemas entirely?
2. **Cross-taxa primitive reuse.** Which existing tables (enclosures, feeder_colonies, feeding_logs, photos, QR sessions, breeding records, activity feed) are already taxon-agnostic; which need polymorphic FK extensions; which need parallel tables?
3. **Component library.** Shared package between Tarantuverse web/mobile and Herpetoverse web/mobile, or copy-and-adapt?
4. **Auth.** How does a user crossing between apps experience identity, session, and authorization?

**Existing schema reality (verified in code on 2026-04-20):**

- `enclosures` already has a `purpose` discriminator column (`'tarantula' | 'feeder'`) — extensible.
- `feeder_colonies` is user-scoped with no taxon coupling — already cross-taxa.
- `feeding_logs`, `molt_logs`, `substrate_changes` each have a `(tarantula_id NULL OR enclosure_id NOT NULL)` check constraint — **already polymorphic at the DB level via enclosure_id**.
- `photos`, `qr_upload_sessions`, `offspring` are tarantula-only with non-nullable or nullable `tarantula_id` foreign keys — will need polymorphic extension.
- `pairings`, `egg_sacs` reference tarantulas directly via `male_id` / `female_id` — scoped to tarantula breeding.

**Constraint:** Solo developer. Every architectural choice is weighted against maintenance burden for a single engineer.

**Non-constraints:** scale (Herpetoverse launches with 0 users and will measure success at 100). Query performance on UNION operations across parallel tables is irrelevant at the scale this architecture must survive in v1.

---

## Decision

### D1. Animal representation — parallel tables

Keep the existing `tarantulas` table unchanged. Add two new tables — `snakes` and `lizards` — as parallel siblings. No `animals` supertable, no rename, no `taxon` column on an animals supertable (because there is no animals supertable).

### D2. Cross-taxa primitive reuse — three tiers

| Tier | Pattern | Tables |
|---|---|---|
| **Reuse as-is** | Already cross-taxa; no migration | `users`, `feeder_colonies`, `feeder_species`, `feeder_care_log`, `enclosures` (extend enum values only), `forum` models, `direct_message`, `follow`, `notification_preferences`, `subscription`, `activity_feed` (add `taxon_scope` array column), `token_blocklist`, `system_setting`, `achievement` definitions |
| **Extend via nullable FK + check constraint** | Add `snake_id` and `lizard_id` nullable FK columns; broaden existing CHECK constraint to require at least one parent FK | `feeding_logs`, `photos`, `qr_upload_sessions`, `offspring`, `pricing_submission` |
| **New parallel tables** | Reptile husbandry / breeding diverges enough from tarantula semantics to warrant isolation | `shed_logs`, `environment_readings`, `uvb_bulb_logs`, `reptile_pairings`, `reptile_clutches`, `reptile_offspring`, `genes`, `animal_genotypes`, `reptile_species` |

### D3. Component library — copy-and-adapt for v1, re-evaluate for v1.1

Herpetoverse's web and mobile apps start as fresh Next.js / Expo scaffolds with components copied from Tarantuverse and immediately adapted for brand and schema. **No shared package at v1.** After 60 days of production, audit: if maintenance drift between brands has been costly, extract a shared UI package in v1.1.

### D4. Auth — single identity, app-scoped data

Users sign up and log in once; both `tarantuverse.com` and `herpetoverse.com` authenticate against the same JWT-issuing endpoints. Authorization rules are unchanged at the backend. **Apps apply their own taxon filter on every read endpoint that returns animal-scoped data.** A `taxon_scope` application-level header (`X-App: tarantuverse | herpetoverse`) is optional but not load-bearing for security; the security boundary is the JWT, not the app identity.

---

## Options Considered

### Option A: Rename `tarantulas` → `animals` + `taxon` discriminator column

One table, one taxon enum, one set of columns. Every row is an animal. Husbandry fields that apply only to tarantulas (e.g., `substrate_depth`) remain as nullable columns; reptile-specific fields (e.g., `uvb_required`) are added as nullable columns. All current queries become `SELECT ... FROM animals WHERE taxon = 'tarantula' AND ...`.

| Dimension | Assessment |
|---|---|
| Migration risk | Very high — destructive rename + backfill on production data; every FK in the schema must be updated to point at `animals.id`; every API route that queries `tarantulas` must be rewritten |
| Ongoing maintenance | Low once migrated — one table to keep up |
| Query ergonomics | Low — every query needs `AND taxon = 'X'`; forgetting once leaks cross-taxa data |
| Schema purity | Low — the `animals` table accumulates dozens of taxon-specific nullable columns, most of which are NULL for any given row |
| Scalability across future taxa | Excellent — adding amphibians is a new enum value + more nullable columns |
| Solo-dev risk | High — one bad migration on production data is unrecoverable without backup |

**Pros:**
- Cleanest long-term architecture when the product eventually supports 4+ taxa
- Single place to query for "all user's animals" (cross-brand dashboards, marketplaces)
- Cross-taxa features (unified activity feed, global search) are trivial

**Cons:**
- Destructive migration on production data — high blast radius for solo dev
- Every existing route and query must be touched and retested
- Schema becomes "wide and sparse" with many nullable taxon-specific columns
- A single forgotten `WHERE taxon = ?` clause in any endpoint leaks cross-brand data

### Option B: Single-table inheritance via SQLAlchemy polymorphic mapping

Use SQLAlchemy's polymorphic_identity pattern: `Tarantula`, `Snake`, `Lizard` classes inherit from an `Animal` base, all map to a single `animals` table with a discriminator column.

| Dimension | Assessment |
|---|---|
| Migration risk | Same as Option A — still requires the rename + discriminator migration |
| Ongoing maintenance | Medium — SQLAlchemy polymorphism is well-supported but has edge cases around eager-loading and joins |
| Query ergonomics | High at the ORM level (`session.query(Snake)` filters automatically); low at raw SQL level (still `WHERE taxon = ?`) |
| Schema purity | Same issue as A — one wide sparse table |
| Team familiarity | Lower — polymorphic patterns are an extra thing to learn/debug |

**Pros of B over A:**
- ORM handles the discriminator filter automatically; can't forget the `WHERE taxon = ?`
- Class hierarchy mirrors the domain model cleanly

**Cons:**
- Inherits all of A's migration risk
- Polymorphic joins interact awkwardly with FastAPI response_model typing
- Debugging ORM-generated queries is harder than debugging raw `tarantulas` queries

### Option C: Parallel tables + reuse cross-taxa primitives *(recommended)*

Keep `tarantulas`. Add `snakes`, `lizards`. Each has the fields that apply to its taxon and nothing else. Shared concepts (enclosures, feeders, users, activity feed, messaging, forums, achievements) already exist as cross-taxa primitives or are cheap to adapt. Taxon-specific relationships (photos, QR, offspring) get nullable FK columns + broadened check constraints. Breeding diverges enough that reptiles get parallel tables (`reptile_pairings`, `reptile_clutches`).

| Dimension | Assessment |
|---|---|
| Migration risk | Low — all new tables are additive; no existing data is moved or renamed |
| Ongoing maintenance | Medium — schema changes that apply across taxa must be replicated in 2–3 places (e.g., if animals get a `microchip_id` field later) |
| Query ergonomics | High per-app (each app queries only its own taxon tables); low for cross-taxa (UNION required) |
| Schema purity | High — each table is narrow and dense |
| Scalability across future taxa | Medium — adding amphibians means another parallel table; acceptable for 4–5 taxa, painful at 10+ |
| Solo-dev risk | Low — migrations are additive, reversible, and localized |

**Pros:**
- Additive migrations only. No existing row changes identity.
- Each app queries its own taxon table with no risk of cross-brand data leak at the query layer (schema enforces the boundary).
- Per-table schema stays dense: `snakes` doesn't carry `urticating_hairs`; `tarantulas` doesn't carry `uvb_required`.
- Easy to roll back per-taxon: drop `snakes` + `lizards` tables and Herpetoverse is gone without touching Tarantuverse.

**Cons:**
- Schema changes that genuinely span all taxa must be applied in multiple places.
- Cross-taxa queries (unified "all user's animals", global search across brands) require UNION across 2–3 tables.
- Breeding logic partially duplicates (tarantula pairings vs. reptile pairings).
- Adds ~3 new tables per future taxon; cost grows linearly.

### Option D: Separate schemas / separate databases

Physically separate tarantula and reptile data in different databases (or Postgres schemas). Each brand gets its own data store; user identity is the only bridge.

| Dimension | Assessment |
|---|---|
| Migration risk | Nil — no existing data moves |
| Ongoing maintenance | High — two database connections, two sets of migrations, two backup strategies |
| Cross-taxa queries | Extremely hard — requires application-level joining |
| User identity | Requires a shared auth service or federated identity |
| Solo-dev risk | High — operational surface doubles |

**Pros:** absolute data isolation between brands. If Herpetoverse gets sold or spun out, the data is already separated.

**Cons:** nearly every operational and UX concern gets harder. Feeder colonies would need to be duplicated. Messaging across apps would need a cross-DB federation layer. Not defensible for a solo-dev v1.

---

## Trade-off Analysis

Option A and B are architecturally cleaner long-term but are destructive-migration-shaped. For a solo dev launching a new brand with zero users, the right time to eat that cost is when the scale justifies it — not at launch, when nothing can't be undone by dropping tables.

Option D is operationally prohibitive.

Option C accepts some duplication cost in exchange for migration safety, narrow schemas, and the ability to delete Herpetoverse data without affecting Tarantuverse. The duplication cost is manageable because:

1. Cross-taxa tables (`enclosures`, `feeder_colonies`, activity feed, messaging) exist already and cover most shared concerns.
2. The polymorphic FK + check constraint pattern is already in use for `feeding_logs` / `molt_logs` / `substrate_changes`. Extending it to `photos` / `qr_upload_sessions` / `offspring` follows precedent.
3. Parallel tables for breeding (`reptile_pairings` vs. `pairings`) surface the fact that reptile breeding semantics actually do differ (clutches vs. slings, incubation temperature, brumation windows) — the duplication reveals genuine domain divergence, not accidental complexity.
4. If duplication becomes painful at 4+ taxa, the eventual migration to Option A or B is easier *because each per-taxon table already isolates its own concerns* — a `snakes` table can be merged into an `animals` table later with far less surgery than rewriting a rename-in-place migration.

**The strategic call: C is Option A delayed.** We'd rather pay the migration cost once, at scale, on a product that's proven it deserves to survive, than pay it now on a launch that might not.

---

## Schema plan

### New tables

#### `snakes`

```python
class Snake(Base):
    __tablename__ = "snakes"

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reptile_species_id = Column(UUID, ForeignKey("reptile_species.id"), nullable=True)
    enclosure_id = Column(UUID, ForeignKey("enclosures.id", ondelete="SET NULL"), nullable=True)

    # Basic
    name = Column(String(100))
    common_name = Column(String(100))
    scientific_name = Column(String(255))
    sex = Column(SQLEnum(Sex), default=Sex.UNKNOWN)

    # Acquisition
    date_acquired = Column(Date)
    hatch_date = Column(Date, nullable=True)  # More precise than date_acquired for CB animals
    source = Column(SQLEnum(Source))
    source_breeder = Column(String(255), nullable=True)  # For morph provenance
    price_paid = Column(Numeric(10, 2))

    # Current state
    current_weight_g = Column(Numeric(8, 2), nullable=True)
    current_length_in = Column(Numeric(6, 2), nullable=True)

    # Husbandry reference (fine-grained husbandry lives in environment_readings)
    feeding_schedule = Column(String(100), nullable=True)  # e.g., "1 medium rat every 10 days"
    last_fed_at = Column(DateTime(timezone=True), nullable=True)  # Denormalized, updated via trigger or app
    last_shed_at = Column(Date, nullable=True)  # Denormalized
    brumation_active = Column(Boolean, default=False)

    # Media
    photo_url = Column(String(500))

    # Privacy
    is_public = Column(Boolean, default=False)
    visibility = Column(String(20), default='private')

    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

#### `lizards`

Same skeleton as `snakes` with lizard-specific fields:

- `uvb_bulb_active_id` (FK → `uvb_bulb_logs`, nullable) — currently installed bulb
- `requires_uvb` (Boolean) — denormalized from species
- `activity_period` (String) — `'diurnal' | 'nocturnal' | 'crepuscular'`
- Omit `brumation_active` (lizard equivalent is species-specific and less universal)

#### `reptile_species`

Separate from `species` (tarantula). Full field set per PRD §5.3, with the review's addition of `wild_population_status` (IUCN status enum) and removal of `commonly_restricted_states` from v1 (deferred per review).

#### `shed_logs`

```python
class ShedLog(Base):
    __tablename__ = "shed_logs"
    __table_args__ = (
        CheckConstraint(
            'snake_id IS NOT NULL OR lizard_id IS NOT NULL OR enclosure_id IS NOT NULL',
            name='shed_log_must_have_parent'
        ),
    )

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    snake_id = Column(UUID, ForeignKey("snakes.id", ondelete="CASCADE"), nullable=True)
    lizard_id = Column(UUID, ForeignKey("lizards.id", ondelete="CASCADE"), nullable=True)
    enclosure_id = Column(UUID, ForeignKey("enclosures.id", ondelete="CASCADE"), nullable=True)

    shed_date = Column(Date, nullable=False)
    in_shed_started_at = Column(Date, nullable=True)
    completeness = Column(String(20))  # 'full' | 'partial' | 'stuck'
    weight_before = Column(Numeric(8, 2), nullable=True)
    weight_after = Column(Numeric(8, 2), nullable=True)
    length_before = Column(Numeric(6, 2), nullable=True)
    length_after = Column(Numeric(6, 2), nullable=True)
    notes = Column(Text)
    image_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

#### `environment_readings`

Per PRD §5.2. FK to `enclosures.id` (which already supports reptile enclosures via `purpose` enum extension). No direct FK to animal taxon tables — readings belong to enclosures, not individual animals.

#### `uvb_bulb_logs`

Per PRD §5.2. FK to `enclosures.id`.

#### `genes`, `animal_genotypes`

Per PRD §5.4. `animal_genotypes` uses polymorphic FK:

```python
class AnimalGenotype(Base):
    __tablename__ = "animal_genotypes"
    __table_args__ = (
        CheckConstraint(
            'snake_id IS NOT NULL OR lizard_id IS NOT NULL',
            name='genotype_must_have_animal'
        ),
    )

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    snake_id = Column(UUID, ForeignKey("snakes.id", ondelete="CASCADE"), nullable=True)
    lizard_id = Column(UUID, ForeignKey("lizards.id", ondelete="CASCADE"), nullable=True)
    gene_id = Column(UUID, ForeignKey("genes.id", ondelete="CASCADE"), nullable=False)
    zygosity = Column(String(20))  # 'het' | 'visual' | 'poss_het' | 'super'
    poss_het_percentage = Column(Integer, nullable=True)
    proven = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
```

#### `reptile_pairings`, `reptile_clutches`, `reptile_offspring`

Parallel to `pairings` / `egg_sacs` / `offspring` but reptile-specific. Clutches track eggs (not egg sacs), include incubation temperature and humidity ranges, and have different developmental timelines. Offspring records support species-specific visual morph recording.

### Extensions to existing tables

#### `enclosures`

Extend the `purpose` column's allowed values at the application-validation layer: `'tarantula' | 'feeder' | 'snake' | 'lizard'`. **No schema change** (the column is already `String(20)`; extension is a code-level enum update).

Add nullable reptile-specific columns:
- `basking_temp_target` (Numeric, F)
- `cool_side_temp_target` (Numeric, F)
- `night_temp_target` (Numeric, F)
- `uvb_required` (Boolean, nullable, default NULL)

These columns are NULL for tarantula and feeder enclosures. Schema-pure purists will dislike this; the alternative is separate `reptile_enclosures` / `tarantula_enclosures` tables which would break the single `enclosures.id` FK pattern currently used by feeding_logs and shed_logs. **Nullable columns win.**

#### `feeding_logs`

Add two columns:
- `snake_id` (UUID, FK → snakes.id, CASCADE, nullable)
- `lizard_id` (UUID, FK → lizards.id, CASCADE, nullable)

Broaden the existing CHECK constraint:
```sql
ALTER TABLE feeding_logs DROP CONSTRAINT feeding_log_must_have_parent;
ALTER TABLE feeding_logs ADD CONSTRAINT feeding_log_must_have_parent CHECK (
    tarantula_id IS NOT NULL
    OR snake_id IS NOT NULL
    OR lizard_id IS NOT NULL
    OR enclosure_id IS NOT NULL
);
```

Add nullable columns for reptile feedings:
- `prey_type` (String) — per PRD §5.2
- `prey_size` (String)
- `prey_count` (Integer, default 1)

#### `photos`

Make `tarantula_id` nullable; add `snake_id`, `lizard_id` nullable FK columns; add CHECK constraint requiring at least one.

#### `qr_upload_sessions`

Same pattern as photos.

#### `offspring`

Already has nullable `tarantula_id`. Add nullable `snake_id`, `lizard_id`.

#### `pricing_submission`

Already has nullable `tarantula_id`. Add nullable `snake_id`, `lizard_id`.

#### `activity_feed`

Add `taxon_scope` column — `ARRAY(String)` — storing values like `['tarantula']`, `['snake', 'lizard']`, or `['tarantula', 'feeder']` for cross-taxa events. Each app's activity feed query filters `WHERE 'tarantula' = ANY(taxon_scope)` or `WHERE 'snake' = ANY(taxon_scope) OR 'lizard' = ANY(taxon_scope)`.

### Migrations sequence

1. `add_reptile_species_table.py`
2. `add_snakes_and_lizards_tables.py`
3. `add_shed_logs.py`
4. `add_environment_readings.py`
5. `add_uvb_bulb_logs.py`
6. `add_genes_and_animal_genotypes.py`
7. `add_reptile_breeding_tables.py` (reptile_pairings, reptile_clutches, reptile_offspring)
8. `extend_enclosures_for_reptiles.py` (nullable columns only)
9. `extend_feeding_logs_for_reptiles.py` (new columns + broadened CHECK)
10. `extend_photos_polymorphic.py`
11. `extend_qr_upload_sessions_polymorphic.py`
12. `extend_offspring_polymorphic.py`
13. `extend_pricing_submission_polymorphic.py`
14. `add_taxon_scope_to_activity_feed.py`

Each migration is additive or constraint-broadening. None renames, drops, or moves existing data. All are reversible without data loss (except the activity_feed taxon_scope backfill — document that downgrade loses cross-taxa event filtering).

---

## Application-layer routing

### Backend — FastAPI

New routers:
- `snakes.py` — CRUD for snakes
- `lizards.py` — CRUD for lizards
- `sheds.py` — shed log CRUD (polymorphic by snake_id/lizard_id/enclosure_id)
- `environment.py` — readings CRUD
- `uvb_bulbs.py` — bulb log CRUD
- `genes.py` — gene CRUD (public GET, auth POST)
- `genotypes.py` — animal_genotypes CRUD
- `morph_calculator.py` — POST /morphs/calculate (public, rate-limited per review)
- `reptile_breeding.py` — pairings/clutches/offspring
- `reptile_species.py` — species CRUD

**Existing routers — minimal changes:**
- `feeding_logs.py` — accept new `snake_id` / `lizard_id` / `prey_*` fields; validate exactly one parent is set
- `photos.py` — same
- `qr.py` — accept polymorphic animal references
- `keepers.py` — keeper profiles now aggregate tarantulas + snakes + lizards (UNION)
- `activity.py` — accept and return `taxon_scope` array

**No changes required to:**
- `auth.py`, `notification_preferences.py`, `forums.py`, `direct_messages.py`, `follows.py`, `subscriptions.py`, `achievements.py` (definitions extend; logic unchanged), `system_settings.py`, `feeder_*` routers

### App-level scoping

Each app applies a taxon filter on every read endpoint that returns animal data. No shared query helper — each app has its own read layer. This is deliberate: a single source of "which taxa does this app show" makes it impossible to accidentally leak cross-brand data.

**Tarantuverse web/mobile:** queries `tarantulas` exclusively. Ignores `snakes` and `lizards` entirely.

**Herpetoverse web/mobile:** queries `snakes` and `lizards` (UNION for unified dashboard). Ignores `tarantulas`.

**Cross-app-shared views:** messaging, forums, follows, activity feed (with `taxon_scope` filter), feeder colonies. These are shared-identity, not shared-animals.

### Authorization

No changes to the JWT model. The existing `get_current_user` dependency is sufficient. Ownership checks on snakes/lizards mirror tarantulas: `snake.user_id == current_user.id`.

**No cross-brand authz scope.** If a user is signed in on tarantuverse.com and tries to hit a `snakes` API endpoint, the endpoint returns their snakes (if any). The authz check is per-resource, not per-brand. Apps self-scope on the frontend by not showing irrelevant data.

---

## Component library — copy-and-adapt for v1

Herpetoverse web scaffolds from a copy of `apps/web` with immediate branding and schema adaptations. Herpetoverse mobile scaffolds from a copy of `apps/mobile`. No shared npm package at v1.

**Why not a shared package:**
- A solo dev has no bandwidth to maintain a published internal UI package, its version bumps, its changelogs, its release process.
- The brands are supposed to diverge visually (ADR-001 establishes the preset system expects this).
- Premature abstraction locks in decisions before the brand aesthetic diverges organically.

**What to watch for post-launch (v1.1 audit trigger):**
- A bug fixed in one app and forgotten in the other for >2 weeks
- A new shared component (e.g., a refined species autocomplete) copied twice
- Design token updates (ADR-001 presets) requiring 2x edits

If any of these happen >3 times in the first 60 days, extract a shared package in v1.1. Likely scope: `@tarantuverse/ui` — pure presentational components with no taxon-specific logic (Sidebar, TopBar, DashboardLayout, AchievementBadge, Skeleton primitives, theme provider, preset tokens).

---

## Auth model — single identity, app-scoped data

### Existing state

- `users` table is shared. JWT tokens are shared (same SECRET_KEY, same backend).
- Login on tarantuverse.com or herpetoverse.com returns a token valid on both.
- Session storage (AsyncStorage on mobile, cookies on web) is per-app — a user logged into Tarantuverse mobile is not automatically logged in on Herpetoverse mobile even though the same backend would accept the token.

### Web

Each brand's web app has its own cookie domain (tarantuverse.com vs. herpetoverse.com). A user who wants to access both signs in on each. There is no SSO layer at v1; cost/benefit doesn't justify it.

**Exception:** if the marketing plan includes "click here to enter Herpetoverse with your Tarantuverse account," that specific flow requires a token-pass mechanism (e.g., a short-lived one-time-use auth token in a redirect URL). **Defer this to v1.1 unless cross-register metrics depend on it at launch.**

### Mobile

Two separate apps, two separate credential stores, two separate push token registrations. Users sign in on each. Same JWT infrastructure; no shared keychain access at v1 (platform-specific work).

### Admin

`is_admin` is a user-level flag, not brand-scoped. An admin in Tarantuverse is also an admin in Herpetoverse. Admin UIs in each app show only taxon-appropriate management surfaces (species management in Herpetoverse shows reptile species; in Tarantuverse shows tarantula species).

---

## Consequences

### What becomes easier

- **Rollback.** Dropping Herpetoverse is a 7-table drop script. Tarantuverse is unaffected.
- **Independent deploy cadence.** Herpetoverse schema changes don't touch tarantula tables.
- **Query correctness at the brand boundary.** Each app queries its own tables. Cross-brand data cannot leak via a forgotten WHERE clause.
- **Per-taxon schema evolution.** Adding a snake-specific field doesn't require migrating 1000+ tarantula rows.

### What becomes harder

- **Cross-taxa keeper profiles.** A unified "all Cory's animals" view requires UNION across 3 tables with different schemas. Acceptable at scale where each table has <10K rows per user; ugly at 100K+.
- **Cross-taxa global search.** Search over Cory's animals must query 3 tables and merge results. Search server (if later adopted — Elasticsearch, Typesense) indexes each table separately.
- **Schema changes that span all taxa.** Adding microchip tracking, for example, means 3 migrations and 3 model updates.
- **Breeding cross-taxa events.** Not a v1 concern but — can you cross-breed a tarantula with a snake? No. Can a single breeder's portfolio view show "all my pairings" across both taxa? Would need UNION.

### What we'll need to revisit

- **At 4+ taxa** (adding amphibians, turtles), reconsider whether parallel-table growth is sustainable. The migration path from C to A is paved once we're ready: merge each taxon table into a new `animals` supertable one at a time.
- **At production scale >10K animals per user** (extremely unlikely for a hobbyist platform but possible for institutional adopters — zoos, herpetological societies), revisit UNION performance and consider materialized view for keeper portfolios.
- **Component library drift** — audit at 60 days post-launch; extract shared package if triggers fire.
- **SSO across brands** — if data shows users want to cross-register without re-authenticating, add v1.1 token-pass redirect flow.

### What this doesn't solve

- Content strategy, species catalog, morph seed data, branding. These are product concerns, not architecture concerns.
- Timeline realism (see review §8 — the schema work here is 2–3 weeks of the 15–20 week total).
- The questions about morph calculator welfare warnings, care sheet content sourcing, and public vs. gated calculator UI — those are in the review, not here.

---

## Action Items

### Pre-implementation (this week)

- [ ] Confirm ADR-002 direction with Cory; revise PRD-herpetoverse-v1.md §5.1 and §5.2 to reflect this architecture
- [ ] Register `herpetoverse.com` (or decide on fallback domain) — blocks branding work
- [ ] Measure Tarantuverse 30-day active / churn baseline for §6 metric comparability

### Migration implementation (weeks 1–3 of Herpetoverse sprint)

- [ ] Create Alembic migration: `add_reptile_species_table.py`
- [ ] Create migration: `add_snakes_and_lizards_tables.py`
- [ ] Create migration: `add_shed_logs.py`
- [ ] Create migration: `add_environment_readings.py`
- [ ] Create migration: `add_uvb_bulb_logs.py`
- [ ] Create migration: `add_genes_and_animal_genotypes.py`
- [ ] Create migration: `add_reptile_breeding_tables.py`
- [ ] Create migration: `extend_enclosures_for_reptiles.py`
- [ ] Create migration: `extend_feeding_logs_for_reptiles.py`
- [ ] Create migration: `extend_photos_polymorphic.py`
- [ ] Create migration: `extend_qr_upload_sessions_polymorphic.py`
- [ ] Create migration: `extend_offspring_polymorphic.py`
- [ ] Create migration: `extend_pricing_submission_polymorphic.py`
- [ ] Create migration: `add_taxon_scope_to_activity_feed.py`
- [ ] Test all migrations up+down on a staging database copy before applying to production

### Model + schema layer

- [ ] Create `app/models/snake.py`, `lizard.py`, `reptile_species.py`, `shed_log.py`, `environment_reading.py`, `uvb_bulb_log.py`, `gene.py`, `animal_genotype.py`, `reptile_pairing.py`, `reptile_clutch.py`, `reptile_offspring.py`
- [ ] Update `app/models/feeding_log.py` with new columns and relationship definitions
- [ ] Update `app/models/photo.py`, `qr_upload_session.py`, `offspring.py`, `pricing_submission.py` with polymorphic FKs
- [ ] Update `app/models/enclosure.py` with new nullable columns
- [ ] Update `app/models/activity_feed.py` with `taxon_scope` column
- [ ] Add Pydantic schemas for all new models

### Routes

- [ ] Implement new routers: `snakes.py`, `lizards.py`, `sheds.py`, `environment.py`, `uvb_bulbs.py`, `genes.py`, `genotypes.py`, `morph_calculator.py`, `reptile_breeding.py`, `reptile_species.py`
- [ ] Update `feeding_logs.py` to accept and validate polymorphic parent FKs
- [ ] Update `photos.py`, `qr.py` for polymorphic uploads
- [ ] Update `keepers.py` to UNION tarantulas + snakes + lizards for profile queries
- [ ] Update `activity.py` to filter by `taxon_scope`
- [ ] Add rate limiting to `POST /morphs/calculate` (20 req/min per IP)

### Validation + testing

- [ ] Integration test: each new endpoint creates/reads/updates/deletes with proper ownership checks
- [ ] Integration test: Tarantuverse routes return zero snake/lizard data even when user has both
- [ ] Integration test: Herpetoverse routes return zero tarantula data
- [ ] Load test: keeper profile UNION query with 100 animals across 3 taxa

### Component library (copy-and-adapt)

- [ ] Scaffold `apps/herpetoverse-web` as a copy of `apps/web` with schema + brand adaptations
- [ ] Scaffold `apps/herpetoverse-mobile` as a copy of `apps/mobile` with same
- [ ] Establish monorepo pnpm workspace inclusion

---

## Open sub-questions (non-blocking for this ADR)

- **Web subdomain vs. separate domain** — `herpetoverse.com` vs. `herp.tarantuverse.com`. PRD calls for the former; cost is one more registered domain + DNS + SSL, benefit is brand purity.
- **Feature flag for admin scope-switching** — should an admin be able to toggle their own view between "show me tarantula admin tools" and "show me reptile admin tools" without switching apps? Nice-to-have; deferred.
- **Unified keeper URLs** — `herpetoverse.com/keeper/cory` shows Cory's reptiles. `tarantuverse.com/keeper/cory` shows Cory's tarantulas. Is there ever a `allmybeasts.com/keeper/cory`? Parent-company-level unified view is a v2+ concern.

---

**End of ADR-002.** Ready for approval; applies directly to the sprint plan (SPRINT-herpetoverse-v1.md, pending).
