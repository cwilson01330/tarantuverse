# ADR-008 — Converge on the rich (tarantula) base, not the lean one

**Status:** Accepted (2026-06-09)
**Supersedes:** ADR-007 step 4 ("converge tarantula onto the shared base" — direction only)
**Builds on:** ADR-005 (inverts consolidation), ADR-006 (taxa expansion), ADR-007 (generic invert UI + tokens)
**Related:** `project_styling_convergence_plan`, `feedback_web_mobile_parity`

## Context

ADR-007 set up a shared, config-driven invert UI and assumed the convergence
would bring tarantula *down* onto the lean invert screens (the screens built
for scorpions / centipedes / whip spiders, which only have read-only log lists
with an "add" CTA and no hero-photo management).

On review of the actual product, the owner's position is the opposite: the
tarantula screens' richness — **inline edit and delete of feeding / molt /
substrate logs, set/change of the hero photo, and the fuller detail layout** —
is a feature users value, not excess weight to trim. Lowering tarantula to the
lean style would be a downgrade for the most-used taxon.

## Decision

**The shared invert base is the RICH tarantula interaction model. The lean
invert screens are raised up to it; tarantula is not cut down.**

Every taxon's detail screen, via the shared base, gets:

1. **Inline log management** — feeding / molt / substrate rows support edit and
   delete in place, not just an "add" CTA over a read-only list.
2. **Hero photo set/change** — the primary/hero image can be set and changed
   from the detail screen.
3. **The fuller section layout** — hero, identity, husbandry, logs, photos,
   notes, styled with the ADR-007 token system + shared primitives.

Tarantula's genuinely bespoke analytics stay **opt-in feature modules**, not
baseline: premolt prediction, feeding-stats charts, and breeding. A taxon
includes a module only when it applies — detritivore millipedes have no
feeding-acceptance stats; a taxon with no molt-interval history has no premolt
math. This is unchanged from ADR-007 §3; only the *baseline* is richer.

## What stays from ADR-007

- The token system (spacing/type scales + Keeper/Hobbyist `layout`) and shared
  primitives (`Card` / `SectionCard` / `InfoRow` / `Chip` / `Badge` / `AppText`)
  already shipped — they are the styling layer and are correct as-is.
- The generic, config-driven screen model (one set of taxon-driven screens, no
  per-taxon files) is unchanged. The base simply gains richer interactions.
- Tarantula remains the **reference implementation**: we factor its existing
  log edit/delete and hero flows into the shared base rather than rebuilding.

## Consequences

- More work than the lean-base plan: the generic invert detail screen (web +
  mobile) must gain inline log edit/delete + hero photo management. The backend
  generic log endpoints must support PUT/DELETE per log type for inverts (verify
  before building; add where missing).
- One rich design language across all taxa; inverts become first-class rather
  than a thinner cousin.
- Parity rule holds: web and mobile move together per feature.
- Risk still concentrates where tarantula code is touched; mitigated by using
  tarantula as the reference (lift, don't rewrite) and shipping additively with
  EAS/Vercel as the test gate (no local typecheck in the dev sandbox).

## Rollout (additive, validated between steps)

1. **ADR-008** (this doc).
2. **Backend audit** — confirm generic `/inverts/{id}/{feedings,molts,
   substrate-changes}` support PUT + DELETE and photo set-primary; add any gaps.
3. **Mobile** — invert detail gains inline log edit/delete + hero set/change.
4. **Web** — same, for parity.
5. **Verify** both presets; deploy.
