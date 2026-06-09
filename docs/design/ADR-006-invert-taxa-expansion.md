# ADR-006 — Invert taxa expansion + feeding modes

**Status:** Accepted (2026-06-05)
**Builds on:** ADR-002 (taxon discriminator), ADR-005 (inverts consolidation)
**Trigger:** Keeper feature request (Jason Pham) — a catch-all so people can
add whip spiders, vinegaroons, velvet worms, true spiders, millipedes,
praying mantises, and "other invertebrates."

## Context

The consolidated `inverts` surface (ADR-005) already proved that adding a
taxon is additive: centipedes (Phase C2/C3) launched with no legacy table,
no dual-write — just a widened CHECK, a species seed, facade routers, and a
UI segment. The request above asks for several more groups at once.

The catch is that the requested groups are not one category, or even one
phylum:

| Requested group | Order / phylum | Feeding | Notes |
|---|---|---|---|
| Whip spiders | Amblypygi (arachnid) | live prey | molts; ~tarantula husbandry |
| Vinegaroons | Thelyphonida (arachnid) | live prey | molts, fossorial; ~scorpion husbandry |
| True spiders | Araneae (arachnid) | live prey | molts, webbing |
| Millipedes | Diplopoda (myriapod) | **detritivore** | eats decaying plant matter + calcium, NOT crickets |
| Praying mantis | Mantodea (**insect**) | live prey | molts (instar), ~1yr lifespan |
| Velvet worms | Onychophora (**separate phylum**) | live prey (slime) | dart-frog-like humidity; tiny advanced niche |
| Isopods / beetles / roaches / stick insects | various | varies | long tail |

A single literal "Other" bucket with one generic care sheet would have to
serve a cricket-hunting whip spider and a leaf-eating millipede at once —
which breaks the feeding-reminder logic and violates the project's
honesty-first principle (never present care data we can't stand behind).

## Decision

**1. Add discrete taxa for the well-understood groups; add one real "Other"
catch-all for the long tail; defer velvet worms.**

New `taxon` discriminator values (lowercase common-name style, consistent
with `tarantula` / `scorpion` / `centipede`):

```
whip_spider   — Amblypygi
vinegaroon    — Thelyphonida (a.k.a. whip scorpion)
true_spider   — Araneae
millipede     — Diplopoda
mantis        — Mantodea
other         — genuine catch-all (freehand species, generic husbandry)
```

Velvet worms (Onychophora) are **not** seeded as a discrete taxon for v1.
They are a separate phylum, kept like dart frogs, with a very small
audience. Keepers can record them under `other` until demand justifies a
real care sheet.

**2. Feeding mode becomes a first-class, species-level concept.**

Everything tracked today assumes live prey. Millipedes (and many `other`
inverts) are detritivores. A new `invert_species.feeding_mode` column drives
husbandry copy and the feeding-reminder / refusal logic:

```
predator     — live prey (default; tarantula, scorpion, centipede,
               whip_spider, vinegaroon, true_spider, mantis)
detritivore  — decaying plant matter / leaf litter + calcium (millipede)
omnivore     — both (some `other` species)
```

`detritivore` species must NOT surface "overdue to feed crickets" or
refusal-streak nudges; their husbandry centers on substrate quality and
calcium. The reminder service reads `feeding_mode` and skips/!reshapes the
live-prey cadence accordingly. (Wiring lands with the millipede phase — the
first detritivore taxon — but the column ships now so the data model is
ready.)

**3. "Other" is an honest flexible bucket, not a fake care sheet.**

`other` records use freehand `scientific_name` entry (no catalog match
required), generic husbandry fields, and a user-chosen `feeding_mode`.
Taxon-specific tracking that doesn't apply (instar, segment counts, venom
tier) is hidden. The UI labels it plainly as a flexible/uncurated category.

## Why not a single "Other" bucket for everything?

It's cheaper to build but dishonest and worse UX: feeding logic, husbandry
copy, and safety fields would all be wrong-by-default for half the animals
in it. The consolidation made discrete taxa nearly free, so we spend that
cheapness on correctness. The catch-all still exists for the genuine long
tail — it just doesn't pretend to be a curated care sheet.

## Architecture / mechanics

All new taxa live on `inverts` directly (the centipede pattern). No legacy
tables, no dual-write. Per the ADR-005 readiness audit (2026-06-05): the
consolidated surface is in sync (0 orphans, 0 unlinked logs), so it is a
sound base to expand on.

- **One foundational migration** widens the taxon CHECK on `inverts` AND
  `invert_species` to include all six new values at once, and adds the
  `feeding_mode` column (+ its CHECK) to `invert_species`. Model
  `CheckConstraint`s and `INVERT_TAXON_VALUES` are updated to match.
- **Per-taxon build** (repeat for each, following centipedes):
  1. Species seed (`seed_<taxon>_species.py`) → `invert_species` rows.
  2. Facade routers: `<taxon>s.py` (per-animal CRUD over `inverts WHERE
     taxon=…`) + `<taxon>-species.py` (public catalog reads).
  3. Register routers in `main.py`.
  4. Web UI: species browser segment + add-flow option + care sheet.
  5. Mobile UI: lib + detail/add/edit/log screens + species browser
     segment + care sheet (the Phase C3 checklist).
- The free-tier collection cap already counts `inverts` cross-taxon
  (ADR/limits work, 2026-06-05), so new taxa count against the 20-animal cap
  automatically — no change needed.

## Rollout order

1. **Foundation** (this ADR): migration + models + `feeding_mode`.
2. **Whip spiders** (`whip_spider`) — taxon #1, predator, ~tarantula
   husbandry. Cheapest honest win; validates the expansion end to end.
3. **Vinegaroons** + **true spiders** — predators, reuse the same shape.
4. **Mantises** — predator, but introduces short-lifespan / sexing nuance.
5. **Millipedes** — first **detritivore**; lands the `feeding_mode` wiring
   in the reminder service.
6. **Other** catch-all — freehand entry, generic husbandry, user-set
   feeding mode.
7. Velvet worms — deferred; revisit on demand.

## Consequences

- Honest care data per taxon; the catch-all covers everyone else without
  faking sheets.
- `feeding_mode` is the one genuinely new concept; it unlocks detritivores
  (millipedes, isopods) cleanly and is reusable on Herpetoverse later.
- More per-taxon UI surface to maintain, but each is a mechanical copy of
  the centipede template.
- Taxon discriminator values are durable once data exists — the names above
  are the committed contract.
