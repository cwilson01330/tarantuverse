# ADR-007 — Generic invert UI + design convergence

**Status:** Accepted (2026-06-05)
**Builds on:** ADR-005 (inverts consolidation), ADR-006 (invert taxa expansion)
**Related:** `project_styling_convergence_plan`, `feedback_web_mobile_parity`

## Context

We now have four taxa live (tarantula + scorpion + centipede + whip spider) and
five more queued for Jason's feature request (vinegaroon, true spider,
millipede, mantis, "other"). Two problems have emerged:

1. **Two design languages.** Tarantula has rich, bespoke screens (feeding
   stats, premolt prediction, breeding). The other taxa have lean screens.
   That split will drift visually and doubles maintenance.

2. **Asymmetric per-taxon cost.** Web is already **generic**: a new invert
   taxon is a config entry (`lib/inverts.ts` + collection `TAXA`), because the
   detail / add / edit / log pages read the taxon from the route and the
   unified `inverts` surface. **Mobile is per-taxon**: each taxon is ~12
   hand-written screen files (lib + detail/add/edit + 4 log forms + species
   picker + care sheet + collection/species/add-picker wiring). Finishing the
   five remaining taxa the per-taxon way is ~60 mobile files — most of which
   we'd immediately converge away.

Order matters: doing the convergence **before** the remaining taxa means each
new taxon is a config entry on *both* platforms, which also satisfies the
standing web+mobile parity rule by construction.

## Decision

**Make the mobile invert UI generic and config-driven, mirroring web. Adopt a
shared layout + per-taxon feature-module model. Converge tarantula onto it
last.**

### 1. Single taxon registry (per platform)

One registry describes every non-tarantula taxon: `key`, `label`, `glyph`,
per-animal facade `prefix` (e.g. `whip-spiders`), species catalog prefix,
`sizeLabel` (leg span vs length), `feedingMode` default, and `safety`
treatment (`harmless` vs `venom`). Mobile gets the analog of web's
`lib/inverts.ts`. Adding a taxon = one registry entry + a species seed +
backend facade routers (the cheap, mechanical part).

### 2. Generic, taxon-driven screens

Mobile gets one config-driven set of invert screens (detail / add / edit /
feeding / molt / substrate / photo / care sheet) that read the taxon from
the route param and the registry, exactly like the web `/dashboard/inverts/*`
pages. The existing per-taxon scorpion / centipede / whip-spider screens are
migrated onto this set and deleted.

### 3. Shared layout + per-taxon feature modules

The shared base renders hero / identity / husbandry / logs / photos for every
taxon. Taxon-specific richness is **opt-in modules**: premolt prediction,
breeding, and feeding analytics are tarantula modules today; a detritivore
husbandry module serves millipedes/"other". A taxon simply doesn't include
modules that don't apply. This is what lets tarantula keep its depth while the
base stays simple.

### 4. "Other" + feeding mode

`other` is the freehand catch-all: no required species match, user-chosen
`feeding_mode`, taxon-specific fields hidden. `feeding_mode` (ADR-006) drives
husbandry copy and the reminder/refusal logic — detritivores never get
live-prey cadence nudges. Both are handled in the shared base via the
registry, not per-taxon code.

### 5. Tarantula converges last

Tarantula keeps its existing rich pages through the additive phases. Only
after the generic surface is proven (the three invert taxa migrated, the new
taxa shipped) do we bring tarantula onto the shared base with its features as
modules. This contains blast radius on the most-used, most-complex screens.

## Why not keep per-taxon mobile screens?

Cheaper per file, but ~60 files for the remaining taxa, all of which we'd
converge away — and it perpetuates the two-design-language drift and the
platform asymmetry. The generic surface is less total code, lands parity by
construction, and front-loads the simplicity.

## Rollout (additive, validated on EAS between steps)

1. **ADR-007** (this doc).
2. **Mobile taxon registry** + **generic mobile invert screens**; migrate
   scorpion / centipede / whip spider onto them (tarantula untouched).
3. **Remaining taxa as config** on web + mobile: vinegaroon, true spider,
   millipede (detritivore), mantis, "other" — plus backend seeds + facade
   routers + log endpoints + taxon-CHECK already widened (ADR-006).
4. **Visual polish + tarantula convergence** — design tokens, shared
   components, tarantula onto the shared base with feature modules. Heaviest /
   highest blast radius, so it ships last and on its own.

## Consequences

- Adding a taxon becomes config + seed + facade routers — trivial on both
  platforms. Parity is automatic.
- One design language; far less UI to maintain.
- Risk concentrates in step 4 (touching tarantula); mitigated by doing it last
  and additively, with EAS/Vercel as the test gate (no local typecheck in the
  dev sandbox).
- The Keeper/Hobbyist theme preset axis (ADR-001) composes with this — presets
  style the shared base, not per-taxon code.
