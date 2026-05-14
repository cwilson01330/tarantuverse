# ADR-003 — Single `animals` table with a taxon discriminator

**Status:** Accepted (2026-05-14)
**Supersedes:** ADR-002 §D1 ("separate but consistent" per-taxon tables)

## Context

ADR-002 established Herpetoverse's taxon strategy as "don't clone, don't
inherit, separate but consistent" — each taxon (snakes, then lizards)
got its own table with an identical shape. That call was made with two
taxa and no concrete plan for a third.

Adding frogs (F1, 2026-05-13) made the cost visible. Every new taxon
requires:

- A cloned table (`snakes` → `lizards` → `frogs`), structurally
  identical down to the column comments.
- A polymorphic-FK extension migration touching six tables — `photos`,
  `qr_upload_sessions`, `feeding_logs`, `shed_logs`, `weight_logs`,
  `animal_genotypes` — each gaining a `<taxon>_id` column and a widened
  `num_nonnulls(...)` CHECK constraint.
- A breeding extension migration touching `reptile_pairings` (two new
  `*_<taxon>_id` columns, three rewritten CHECK constraints) and
  `reptile_offspring` (one new `<taxon>_id` column).
- Three near-identical files: model, schema, router.

The CHECK constraints grow combinatorially. `num_nonnulls(tarantula_id,
snake_id, lizard_id, frog_id) = 1` widens with every taxon, and the
breeding `taxon_match` constraint became a three-way AND that keeps
growing. The per-animal table shape, meanwhile, has been *byte-for-byte
identical* across all three taxa — the genuine biological divergence
lives in the species catalog and the log tables, not the animal record.

We were cloning files that have no business being separate.

## Decision

Collapse `snakes`, `lizards`, and `frogs` into a single `animals` table
with a `taxon` enum discriminator (`snake | lizard | frog | ...`).

- **Polymorphic FKs collapse to `animal_id`.** The six shared tables get
  one `animal_id` column instead of one column per taxon. Their CHECK
  constraints become `num_nonnulls(tarantula_id, animal_id) = 1` — a
  two-way constraint that never grows again. (`tarantula_id` stays
  separate; Tarantuverse is a different app with molt/substrate logs
  that don't apply to herps. Two bounded parents is fine — it's the
  *unbounded* growth that was the problem.)
- **Breeding collapses to `male_animal_id` / `female_animal_id`** plus a
  denormalized `taxon` column on `reptile_pairings` for the same-taxon
  match constraint. `reptile_offspring` gets `animal_id`.
- **One model, one schema, one router.** The router filters by `taxon`.
  Adding a taxon after this is: add a value to the `taxon` enum, seed
  species. No table, no clone, no migration.

Companion changes in the same bundle:

- Rename `reptile_species` → `herp_species` (and `reptile_species_id` →
  `herp_species_id`). The "reptile" name was always a misnomer for a
  table that holds amphibians; pre-launch is the only cheap time to fix
  it. Postgres `ALTER TABLE ... RENAME` keeps FK constraints intact
  automatically.
- Husbandry enums on the species table (`handleability`, `uvb_type`,
  etc.) are reptile-centric. Where a frog doesn't map cleanly we choose
  the honest nearest value rather than inventing tiers; if real
  divergence shows up later, the escape hatch is a JSONB `husbandry`
  blob, not more enum values.

UUIDs are preserved through the migration — `animals.id` equals the
original `snakes.id` / `lizards.id` / `frogs.id`. This makes the data
migration a `COALESCE` and keeps any external reference (QR codes,
bookmarked URLs) valid.

## Why now

The consolidation's real cost is the data migration. Herpetoverse is
not live — there is no production data beyond the developer's own test
animals, which are explicitly disposable. That cost is near zero today
and rises every day after launch. This is a now-or-never-cheaply
decision.

## Consequences

**Positive**

- Adding a taxon drops from a multi-migration, multi-file effort to an
  enum value + a species seed.
- CHECK constraints stop growing. The schema gets simpler with each
  taxon instead of more complex.
- ~3x less model/schema/router code to maintain.
- The misnamed species table gets fixed before anyone depends on the
  name.

**Negative / costs**

- One-time consolidation migration set plus a backend rewrite (Animal
  model, schemas, router, updated breeding + log routers, updated
  seeds).
- HV web + mobile thread `snake_id` / `lizard_id` / `frog_id` types and
  call `/snakes/`, `/lizards/`, `/frogs/` throughout — a rename-heavy
  frontend refactor. It's mechanical, not net-new logic, but it is real
  work.
- Must land *before* the frog web/mobile UI (F2/F3). Building that UI
  on the old per-taxon shape and consolidating after would mean
  rewriting it.

**Neutral**

- Taxon-specific per-animal fields, if any ever emerge, go in a JSONB
  `taxon_attributes` column rather than nullable columns or new tables.
  None exist today — the three taxa share an identical record.

## Migration plan

1. `anm_20260514` — create `animals`, copy snake/lizard/frog rows
   preserving UUIDs, collapse the six polymorphic FKs to `animal_id`,
   collapse breeding FKs, drop the legacy `snakes` / `lizards` /
   `frogs` tables.
2. `anh_20260514` — rename `reptile_species` → `herp_species`,
   `reptile_species_id` → `herp_species_id`.
3. Backend: `Animal` model, `HerpSpecies` model, collapsed
   schemas/router, updated breeding + log routers, updated seeds.
4. HV web + HV mobile: consolidate the per-taxon API libs into a single
   `animals` lib, update every screen.
5. Then F2/F3 frog UI builds once, on the final shape.
