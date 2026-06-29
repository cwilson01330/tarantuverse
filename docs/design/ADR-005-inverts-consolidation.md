# ADR-005: Inverts consolidation (TV `tarantulas` + `scorpions` → `inverts`)

**Status:** Proposed
**Date:** 2026-05-27
**Owner:** Cory
**Supersedes:** N/A (companion to scorpion expansion plan)
**Related:** ADR-002 (taxon discriminator), ADR-003 (HV animals consolidation), `docs/design/PLAN-scorpion-v1.md` (§3 deferred this decision to taxon #3)

---

## Context

When the scorpion expansion shipped (Phase 1a, 2026-05-22), §3 of the plan
explicitly deferred consolidating tarantulas and scorpions into one polymorphic
table:

> Separate `scorpions` table + polymorphic FK extensions (Herpetoverse pre-ADR-003 style).
> Do NOT consolidate `tarantulas` into a generic `inverts` table in v1 — too risky on
> a live production app. Schedule the consolidation (ADR-X) for taxon #3
> (mantises, centipedes, etc.) so the migration target benefits from two real schemas.

Taxon #3 has arrived: centipedes. The deferral has done its job — we now have
two real production schemas to inform the unified design instead of guessing
from one. Continuing to add per-taxon tables for every new invert is no longer
defensible:

* The scorpion expansion duplicated ~80% of the tarantula table structure plus
  most of the polymorphic-FK plumbing. Adding centipedes that way means doing
  it a third time, and a fourth for whatever comes next.
* Maintenance cost compounds: every shared concept (feeding pause, photo
  upload, QR sessions, breeding records) requires N copies of similar code.
* The Herpetoverse team faced this exact problem at the same point in their
  growth and solved it with ADR-003 — the playbook is proven.

## Decision

Adopt the HV ADR-003 pattern for TV inverts. Specifically:

1. **One animal table per platform.** TV gets a single `inverts` table that
   replaces both `tarantulas` and `scorpions`. Centipedes are inserted into
   the same table from day one. Each row carries a `taxon` discriminator
   (`tarantula` / `scorpion` / `centipede`, with room to grow).
2. **One species catalog per platform.** `species` + `scorpion_species` merge
   into `invert_species`, also discriminated by `taxon`.
3. **Polymorphic FK collapse.** Tables that today carry `tarantula_id` and
   `scorpion_id` columns (`feeding_logs`, `molt_logs`, `substrate_changes`,
   `photos`, `qr_upload_sessions`) collapse to a single `invert_id` column.
   The existing `animal_id` column (for Herpetoverse cross-app polymorphism)
   stays separate; TV inverts and HV animals remain distinct populations.
4. **Backward-compatible API surface.** The existing `/tarantulas/`,
   `/scorpions/`, and `/species/`, `/scorpion-species/` route trees keep
   working unchanged. Internally they filter `inverts WHERE taxon = …` and
   `invert_species WHERE taxon = …`. Existing mobile builds in the wild
   continue to function until they update — they never see the change.
5. **One new route tree for centipedes today, unified surface later.**
   `/centipedes/` and `/centipede-species/` ship as thin filters on the
   unified tables, matching the existing per-taxon API style. A future
   bundle can expose `/inverts/` as the canonical polymorphic surface and
   deprecate the per-taxon routes; this ADR doesn't require that.
6. **Taxon-specific fields stay narrow.** Tarantulas, scorpions, and
   centipedes have biological differences (`urticating_hairs`,
   `venom_severity`, `current_instar`, `current_segment_count`,
   anamorphic-vs-epimorphic developmental class). Wide-table nullable columns
   per taxon, mirroring HV's `animals` strategy. JSONB-per-taxon attrs was
   considered and rejected — query ergonomics matter more than column count
   at this scale.

## Consequences

### Positive

* **Adding taxon #4 (and onwards) is a JS-and-seed change, not a migration.**
  New enum value, new seed entries, new taxon-specific UI affordances.
  No new table, no polymorphic-FK gymnastics, no new router tree (the
  unified surface handles it).
* **Cross-taxon features become trivial.** A "log feeding for the whole
  enclosure" bulk action, a unified Collection tab, a single search, a
  cross-taxon breeding analytics dashboard — all of these are one query
  against `inverts` instead of fan-out across N tables.
* **Code surface shrinks.** Approximately one set of models, schemas, and
  routers covers all current and future inverts. Estimated reduction:
  ~40% of taxon-specific backend code once both old surfaces are sunset.
* **The HV team has lived with the same shape for several months.** No
  novel risks — ADR-003 has surfaced and resolved the realistic gotchas
  (enum casing, JSON serialization quirks, mobile lib unification).

### Negative

* **One-shot data migration during which old and new schemas coexist.**
  This is the single highest-risk step. The plan doc addresses it in
  depth (see `PLAN-inverts-consolidation-v1.md` §3).
* **Mobile clients have to keep working through the cutover.** Solved by
  the backward-compatible API surface (Decision §4) — clients running
  the previous bundle never see the schema change.
* **Two species catalogs become one.** Species IDs are UUIDs and stay
  stable, so existing tarantula records keep their `species_id` reference
  unchanged. Behavior identical from the keeper's point of view.
* **Phased rollout means two deploy cycles before old tables can be
  dropped.** Acceptable; standard expand-contract pattern.

### Neutral

* **Rename `inverts` vs `animals`.** HV used `animals` because reptiles +
  amphibians + (future) invertebrates would all live there. TV is
  inverts-only by domain — `inverts` is more precise. When HV and TV
  eventually merge into one platform (separate decision, not in scope),
  the unified table would likely be `creatures` or a similar umbrella term
  with `realm` (vertebrate/invertebrate) above `taxon`.

## Migration safety guarantees

The plan doc covers the step-by-step mechanics. The properties this ADR
commits to:

1. **Zero downtime.** No window where the API is unavailable or
   returning errors to mobile clients.
2. **No keeper data loss.** Existing tarantulas + scorpions, their logs,
   their photos, and their breeding records all survive identically.
3. **No mobile build forced upgrade.** A user on the bundle from one
   release ago can still log feedings, view their collection, and add
   new animals while the consolidation rolls out.
4. **Reversible at every step.** Each phase of the rollout can be rolled
   back individually if a problem surfaces. The point of no return is the
   final cleanup migration that drops the old tables; it sits behind a
   manual gate.

## Alternatives considered

1. **Build centipedes as a third per-taxon table.** Fastest to ship in
   isolation but locks in O(N) duplication forever. Rejected — the §3
   deferral specifically named this as the trigger to consolidate.
2. **JSONB taxon-specific attrs column.** Cleaner per-taxon than nullable
   columns, but the moment any taxon-specific field needs an index or a
   constraint (e.g. `venom_severity` for warnings, `current_instar`
   range checks) it becomes worse than nullable columns. Rejected.
3. **Separate `tarantula_attrs`, `scorpion_attrs`, `centipede_attrs`
   tables joined by `invert_id`.** Pure-relational option; clean but
   introduces N joins per detail-page fetch. Considered for the data
   model but rejected for query simplicity.
4. **Defer consolidation again to taxon #4.** Just kicks the can. Each
   additional pre-consolidation taxon increases the migration target
   surface. The §3 schedule was deliberate; honor it.

## Open questions (resolve in the plan doc)

* Exact column list on `inverts` — see PLAN §2.
* Disposition of `pairings` / `egg_sacs` / `offspring` (currently tarantula-
  hardcoded) and the new scorpion `broods` (Phase 5 of the scorpion plan,
  not yet shipped). Likely: leave both per-taxon for now, generalize later.
* Whether to also unify the existing TV `species` catalog with HV's
  `herp_species`. **No** — different platforms, different domains.

---

## References

* `docs/design/PLAN-scorpion-v1.md` §3 — the deferral that scheduled this ADR
* HV ADR-003 (`Migration: consolidate snakes/lizards/frogs into animals` in
  the changelog) — the proof-of-concept this ADR adapts
* `docs/design/PLAN-inverts-consolidation-v1.md` — the operational plan

---

## Progress log

### 2026-06-29 — Scorpion read partially cut over to `inverts` (Phase C1, scorpion slice)

Trigger: a keeper ("Ember_and_the_Inverts") had 3 scorpions created through the
generic invert add flow (`POST /inverts/`, taxon=scorpion). Those write ONLY to
`inverts`, but `GET /scorpions/` still read the legacy `scorpions` table, so they
were invisible in the collection. A wider audit found 6 inverts-only scorpions
and 1 legacy-only scorpion platform-wide (the two tables had drifted; neither was
a superset).

Changes shipped:

* **`GET /scorpions/` now reads from `inverts` (taxon='scorpion')**, UNIONed with
  any legacy-only scorpions not yet mirrored — so nothing is dropped during the
  transition and the fix reaches every client (incl. old app builds) without an
  app update. (`routers/scorpions.py`)
* **`ScorpionResponse` got pattern-free enum overrides** (sex/source/
  enclosure_type/visibility) — `inverts` stores the shared UPPERCASE casing, which
  would otherwise `ResponseValidationError` through the lowercase patterns. Same
  trap previously fixed on `InvertResponse`.
* **`reconcile_scorpions_to_inverts.py`** (one-shot, idempotent) mirrored the 1
  legacy-only straggler ("Stacy's Mom", *Heterometrus spinifer*) into `inverts`.
  Verified after run: `legacy scorpions = 3`, `inverts scorpions = 9`,
  `legacy_missing_from_inverts = 0`.
* **`/analytics/collection`** was switched to count from `inverts` (all taxa) in
  the same cycle, so scorpion logs/counts are now cross-taxon too.

Remaining for full C1 / Phase D:

* **Tarantula read cutover** — `GET /tarantulas/` + the mobile collection's
  `listTarantulas`/`listScorpions` still read legacy tables. Once soaked, route
  these through `inverts` the same way (tarantula `inverts` mirror is already
  complete: 22/22 verified for the audited keeper, 1440 backfilled platform-wide).
* **Phase D** — after a 2+ week soak with reads on `inverts`, drop the dual-write
  and the legacy `tarantulas` / `scorpions` tables. Gated; do not start until C1
  reads are fully cut over and verified.
