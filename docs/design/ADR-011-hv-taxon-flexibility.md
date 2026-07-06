# ADR-011: Herpetoverse taxon flexibility — enum → VARCHAR discriminator + registry

**Status:** Accepted — 2026-07-03. Foundation for HV broad-coverage launch. Precedes the P1–P4 feature sweep (HV_PORT_PLAN_2026-07-03) and the species-research push, because both build on the taxon set.

## Context

HV wants to cover "as many animals as possible" at launch. But `animals.taxon` is a rigid 3-value Postgres enum (`animal_taxon` = snake | lizard | frog). Adding a group (turtles, tortoises, salamanders…) means `ALTER TYPE … ADD VALUE`, which has real Postgres friction (can't add values inside a transaction, can't remove/rename, ordering quirks). That's the opposite of the goal.

TV already solved this: `inverts.taxon` is a plain `VARCHAR` discriminator driven by a config registry (`INVERT_TAXON_VALUES` + a widen-able CHECK). Adding roach/vinegaroon/etc. became config + a species seed. Bring that pattern to `animals`.

A second gap: **`herp_species` has no taxon/group column at all.** Species are keyed only by scientific name, so a broad catalog (turtles, salamanders, …) can't be grouped or filtered in the species browser. The flexible-taxon foundation must add a `taxon` group to the species catalog too.

## Decision

1. **`animals.taxon`: `animal_taxon` enum → `VARCHAR(20)` + a widen-able CHECK**, mirroring `inverts`. The Python `AnimalTaxon` enum is replaced by an `ANIMAL_TAXON_VALUES` tuple (the single source of truth), validated at the schema layer and CHECK-enforced at the DB. Adding a taxon = add to the tuple + widen the CHECK (one line) + update the two frontend registries + seed species. No enum migration.
2. **`herp_species.taxon`: add `VARCHAR(20)` + CHECK + index** (nullable initially) so the species catalog is groupable/filterable and the species browser + care sheets can segment by group.
3. **Launch taxa (7):** `snake`, `lizard`, `turtle`, `tortoise`, `frog`, `salamander`, `other`.
   - Turtles vs tortoises split — materially different husbandry (aquatic/semi-aquatic vs terrestrial; diet), and keepers filter by them. Cheap to separate now.
   - `lizard` stays one broad group (geckos, monitors, chameleons, skinks, agamids…); species-level detail (e.g. crested-gecko CGD) already lives on the species row.
   - `frog` covers frogs & toads (Anura); `salamander` covers salamanders, newts, and axolotls (Caudata).
   - `other` = freeform catch-all so no herp is un-trackable at launch.

## Migration (`htx_20260703_animal_taxon_flexibility`, down_revision `col_20260702_colonies`)

```
-- animals.taxon: enum -> varchar + CHECK
ALTER TABLE animals ALTER COLUMN taxon TYPE varchar(20) USING taxon::text;
ALTER TABLE animals ADD CONSTRAINT animals_taxon_check
  CHECK (taxon IN ('snake','lizard','turtle','tortoise','frog','salamander','other'));
-- herp_species.taxon: new group column
ALTER TABLE herp_species ADD COLUMN taxon varchar(20);
ALTER TABLE herp_species ADD CONSTRAINT herp_species_taxon_check
  CHECK (taxon IS NULL OR taxon IN ('snake','lizard','turtle','tortoise','frog','salamander','other'));
CREATE INDEX ix_herp_species_taxon ON herp_species (taxon);
-- animal_taxon enum type is now unused
DROP TYPE IF EXISTS animal_taxon;
```
Down-migration recreates the enum + casts back (only valid while all rows are in {snake,lizard,frog}).

**Existing `herp_species.taxon` backfill** is a one-shot data script (family/order → group mapping) run on the species-research track — not blocking; the column ships nullable.

## Code changes

Backend (5 files touch `AnimalTaxon`): `models/animal.py` (enum→String col + `ANIMAL_TAXON_VALUES` + `__table_args__` CHECK), `models/reptile_species.py` (+`taxon`), `schemas/animal.py` (taxon validated against the tuple; `herp_species` schema gains `taxon`), `routers/animals.py` (drop taxon enum-coercion; string filter), `models/reptile_pairing.py` + `routers/reptile_pairings.py` (denormalized `taxon` → String), `models/__init__.py` (export the values tuple, drop the enum export).

Frontend registries (the "add a taxon = config" surface): `apps/web-herpetoverse/src/lib/animals.ts` + `apps/mobile-herpetoverse/src/lib/animals.ts` — a 7-entry `ANIMAL_TAXA` registry (key, label, glyph, default husbandry framing, size label). Then the add-animal taxon picker + collection filter + species browser read the registry (no hardcoded 3-taxon lists).

## Consequences

Adding a herp group is now config + seed, matching the invert workflow, so the species-research track can scale breadth without migration churn. One bounded migration on HV-only data (`animals` is not shared with TV inverts). The feeding-status/import/transfer endpoints being built are already taxon-agnostic, so they inherit new taxa for free. Related: [[project_adr003_animals_consolidation]] (which promised cheap taxon adds — this delivers it), HV_PORT_PLAN_2026-07-03.
