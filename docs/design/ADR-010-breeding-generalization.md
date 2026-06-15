# ADR-010 — Breeding Generalization (Tarantula → Inverts)

**Status:** Proposed — 2026-06-12
**Goal:** Rework tarantula breeding so the same engine serves every invert taxon
(scorpions, mantises, roaches, true spiders…), unlocking breeding panels for other
inverts with config, not a third silo. Revenue framing: breeding is the premium
feature; a stronger, broader breeding platform is a direct monetization lever.

**Assumed product defaults** (confirm/redirect):
- Rework core = **generalize onto `inverts`** (UX upgrades ride along, not the focus).
- Monetization = **keep the existing premium gate** (`can_use_breeding`, 402 on create);
  premium *depth tiers* (analytics, pedigree export) are a later layer.
- Platforms = **web first** (breeding is web-only today), mobile parity as a follow-up.

---

## Context

Today's breeding lifecycle (pairing → egg_sac → offspring) is **hard-coupled to the
`tarantulas` table**: `pairings.male_id` / `female_id` are FKs to `tarantulas.id`, and
`offspring.tarantula_id` links a kept sling back to a tarantula. Reptiles already have a
*separate* breeding stack (`reptile_pairings` / `clutches` / `reptile_offspring`). Adding
invert breeding naively would mean a **third** silo.

**The unlock:** the inverts consolidation (ADR-005) mirrors every tarantula (and scorpion)
into the `inverts` table **using the same primary key** (`Invert.id == Tarantula.id`,
verified in `services/inverts_dualwrite.py`). So a pairing's existing `male_id`/`female_id`
values are *already valid `inverts.id` values*. Re-pointing breeding at `inverts` is
therefore an expand-contract migration with a **verbatim backfill** — the lowest-risk
possible path.

---

## Decision

Re-base the breeding tables on `inverts` via expand-contract (mirrors ADR-005):

### Phase A — Expand (additive, non-breaking) ← *this batch*
- `pairings`: add `male_invert_id`, `female_invert_id` (FK → `inverts.id`, ON DELETE
  CASCADE, nullable for now).
- `offspring`: add `invert_id` (FK → `inverts.id`, ON DELETE SET NULL, nullable) — the
  generic equivalent of `tarantula_id` for a kept offspring.
- Models + schemas carry both old and new fields.
- **Dual-write:** the tarantula breeding create paths also populate the invert FKs
  (trivial — same UUID). New code reads new fields with fallback to old.
- `egg_sacs` needs **no change** — it references `pairing_id`, not an animal.

### Phase B — Backfill (one-shot, idempotent) ← gated
- `UPDATE pairings SET male_invert_id = male_id, female_invert_id = female_id` (verbatim,
  because PKs are shared); `UPDATE offspring SET invert_id = tarantula_id`.
- Verification queries (counts match, no orphans) before proceeding.

### Phase C — Generic API + read cutover ← gated
- Generic create accepts invert ids and a `taxon` context; ownership checks hit `inverts`.
- `_get_lineage` and reads prefer the invert FKs, fall back to tarantula FKs during soak.
- `can_use_breeding` premium gate unchanged.

### Phase D — Invert breeding panels (the payoff) ← gated
- Flip `breeding` on in `taxon-modules.ts` per taxon; reuse the generic screens.
- A scorpion/mantis pairing just works through the same engine.

### Phase E — Contract ← gated, weeks after C
- Make invert FKs NOT NULL, drop the legacy `tarantulas` FK columns once nothing reads them.

---

## Consequences

- **Pro:** invert breeding becomes config (Phase D) instead of a new subsystem.
- **Pro:** verbatim backfill (shared PK) makes this far safer than ADR-005's was.
- **Pro:** monetization hook already exists; broader breeding = more reason to subscribe.
- **Con:** a real platform migration touching live breeding data — must follow the
  expand-contract discipline and verify the Alembic chain (head today:
  `rch_20260610_add_roach_taxon`).
- **Watch:** sex validation — invert pairings should still enforce male×female where sex
  is known, and same-species (already done for tarantulas via `species_id`).
- **Deferred (not blocking):** the functional gaps the audit found — edit affordances,
  breeding analytics (clutch success rate, revenue per pairing), multi-generation
  pedigree, bulk offspring actions, mobile parity. Several are strong **premium-depth**
  candidates for a later tier.

---

## Open questions for Cory
1. Confirm the three assumed defaults above (generalize-first / keep gate / web-first).
2. For invert breeding, keep the tarantula lifecycle verbatim (pairing→egg_sac→offspring),
   or rename per taxon (scorpions have *broods*, not egg sacs; mantises lay *oothecae*)?
   Cheapest is shared schema with per-taxon **labels**; that's my lean.
3. Which premium-depth feature is the most compelling first upsell once the base is generic
   — analytics, or exportable pedigree certificates?
