# Plan: Scorpion expansion (Tarantuverse v2.0)

**Date:** 2026-05-22
**Status:** Planning draft — locked decisions below; open decisions flagged at the bottom.
**Author:** Scoping pass with Cory.

---

## TL;DR

Tarantuverse expands beyond tarantulas. **Scorpions** are the first new taxon, with mantises, centipedes, and other inverts likely to follow. The brand stays Tarantuverse; v1 ships near feature-parity with the tarantula surface (collection, logging, breeding, care sheets, photos, QR).

The work fits a ~6–8 week solo sprint, modeled on the Herpetoverse v1 cadence but smaller because the backend, auth, settings, notifications, and shared infrastructure are already in place. The single biggest decision is the data model — see §3.

---

## 1. Locked decisions

- **Brand:** Keep "Tarantuverse." Tagline updates to position it as an invert platform that starts with tarantulas and grows. No domain change, no rebrand, no app store re-listing.
- **Scope:** Near-parity with the tarantula surface for v1 — collection CRUD, logging (feeding / molt + instar / substrate / photos), breeding (pairing → brood → offspring), care sheets, analytics, QR identity. Same depth, scorpion-shaped.
- **Mobile nav (§7 D1):** Two siblings tabs on TV mobile — **Tarantulas** and **Scorpions** — each with its own list and at-a-glance count.
- **Species seed (§7 D2):** Approved as proposed in §7 — 25 species across beginner / intermediate / medically significant / hobbyist favorites.
- **Communal setups (§7 D3):** **In v1.** First-class `scorpion_colonies` table day one (not just a species flag). Keepers get a real "colony" entity for Pandinus / Heterometrus / Centruroides setups.
- **Premolt prediction (§7 D4):** **Deferred.** No scorpion premolt model in v1 — the algorithm gets tuned in a later pass once we have real feeding/molt data from scorpion keepers to calibrate against.
- **Tagline copy (§7 D5):** Pending — non-blocking. Three variants drafted before launch.

---

## 2. What scorpions are *not* tarantulas

Important biological and product differences that the data model and UI need to handle. Listing them upfront because they steer multiple downstream design choices.

| Concern | Tarantulas | Scorpions |
|---|---|---|
| Reproduction | Oviparous (egg sacs) | **Viviparous** — live birth; mother carries 1st-instar scorplings on her back |
| Breeding terminology | Pairing → Egg sac → Offspring | Pairing → **Brood** → Offspring |
| Parthenogenesis | Not in the hobby | **Real** — Hottentotta hottentotta, Tityus serrulatus, others reproduce asexually |
| Venom severity | Always mild (urticating hairs are the worse concern for keepers) | **Highly variable** — some species are medically significant (Centruroides, Androctonus, Leiurus, Tityus) |
| Default measurement | Leg span | **Total length** (head to telson) |
| Instar tracking | Loosely tracked | **Important** — keepers count instars; molt cadence is the primary growth signal |
| Communal keeping | Almost never | **Some species** keep communally (Pandinus imperator, Heterometrus, some Centruroides) |
| UV fluorescence | n/a | **Yes** — every scorpion glows under UV; photo angle worth surfacing in care sheets |
| Diet | Insects, occasional pinkies | Insects, occasional small vertebrates for the large desert species (Hadrurus) |

None of these break the existing data shape — they're variations on familiar fields. But each one wants surfacing somewhere in v1.

---

## 3. Data model — the biggest call

**Recommendation: add a `scorpions` table now. Plan an inverts consolidation (ADR-X) for when the third taxon lands.**

There are two clean options:

### Option A: Add a `scorpions` table that mirrors `tarantulas`

Extend the polymorphic log tables (feeding_logs, molt_logs, substrate_changes, photos, qr_upload_sessions, pairings, egg_sacs/broods, offspring) with a nullable `scorpion_id` FK and a CHECK constraint enforcing exactly one parent. Same pattern Herpetoverse used pre-ADR-003.

**Pros:**
- **Lowest risk to the live tarantula app.** Tarantulas table is untouched; all existing rows and FKs keep working byte-for-byte.
- Fast to ship — the migration is mechanical and the pattern is established.
- Each per-taxon table can carry taxon-specific columns naturally (e.g. `scorpions.venom_severity`, `scorpions.communal_setup_id`).

**Cons:**
- When a third taxon arrives (mantises, centipedes), the polymorphism gets more painful — each log table gets another nullable FK, every router branches harder.
- Consolidating later is real work — Herpetoverse's ADR-003 was ~16 tasks worth of bundle effort.

### Option B: Big-bang consolidation — `inverts` table + `taxon` discriminator (TV's ADR-003)

Create a unified `inverts` table on day one. Migrate existing `tarantulas` rows into it (preserving IDs). Collapse every polymorphic FK to a single `invert_id`. Build scorpions onto the consolidated surface.

**Pros:**
- Future taxa (mantises, centipedes, millipedes, isopods) are an enum value plus seed plus UI — no migration churn.
- Cleaner long-term, no consolidation tax later.

**Cons:**
- **High risk to live tarantula users.** This is a migration on production data while the app is shipping new features daily. Herpetoverse did its ADR-003 while still pre-launch; doing it on a live, paying-user codebase is meaningfully scarier.
- More upfront work; pushes scorpion launch back by weeks.

### Why Option A wins for v1

We've already paid the consolidation lesson once on Herpetoverse and the playbook is documented. The cost of consolidating *later* is bounded and predictable. The cost of breaking the tarantula app during a live consolidation is unbounded. We do the consolidation when we add taxon #3 — by then we'll have two real schemas to learn from, and the migration target will be clear.

**Concretely for v1:**

- `scorpions` table with the columns tarantulas has plus the scorpion-specific ones (venom_severity, default_measurement, instar, `colony_id` FK, etc.).
- A `scorpion_species` table, OR reuse `species` with a taxon discriminator. Reusing `species` is messier than it sounds because the existing `species` columns are tarantula-shaped (urticating_hairs, etc.). A separate `scorpion_species` table is cleaner.
- Polymorphic extensions on `feeding_logs`, `molt_logs`, `substrate_changes`, `photos`, `qr_upload_sessions`, `pairings`, `offspring`. CHECK constraint enforcing exactly one parent.
- New table `broods` (the scorpion analogue of `egg_sacs`). Different name, same shape. The frontend renders the right word per taxon.
- **New table `scorpion_colonies`** (per §7 D3 sign-off): `id`, `user_id`, `name`, `enclosure_id` (optional), `notes`, `created_at`. Each scorpion may belong to zero or one colony via `scorpions.colony_id`. Logs stay per-scorpion — the colony is a grouping layer, not a polymorphic log parent. The frontend can offer "log feeding across the colony" as a bulk action that fires one log per scorpion.

---

## 4. v1 scope

### In

**Backend:**
- `scorpions` + `scorpion_species` + `scorpion_colonies` + `broods` tables (Alembic migration).
- Polymorphic FK extensions on the 7 shared log/asset tables.
- Routers: `scorpions.py`, `scorpion_species.py`, `scorpion_colonies.py`, `broods.py` plus polymorphic extensions to the existing routers.
- Seed: 25 commonly kept scorpion species with full structural fields and citations (list signed off in §7 D2).

**Mobile (TV mobile, existing app):**
- New "Scorpions" tab or collapse-into-Tarantulas? See open decision (§7). Recommend: separate **Scorpions tab** alongside Tarantulas in the existing TV mobile bottom-nav for v1 visibility.
- Scorpion collection list with feeding-status pill, sex chip, photo, locality (where tracked).
- Add scorpion form (taxon-specific fields: instar, venom-severity inherited from species, etc.).
- Edit scorpion.
- Scorpion detail screen mirroring the tarantula detail: husbandry, feeding log, molt log + instar tracking, substrate, photos, breeding tab.
- Logging screens reuse the existing add-feeding / add-molt / add-substrate / add-photo with taxon-aware copy.

**Web (TV web):**
- Same surface as mobile. Collection grid + detail page + add/edit + breeding pages.
- Public scorpion profile route at `/s/{id}` (mirrors `/t/{id}` for tarantulas).
- Care sheet pages at `/scorpions/[id]` (mirrors `/species/[id]`).

**Cross-cutting:**
- **Venom severity badges** prominent on every detail screen and care sheet — same pattern the existing `medically_significant_venom` flag uses for tarantulas, now driving severity tiers (none / mild / moderate / **medically significant**).
- **Colonies** as first-class entities (per §7 D3 sign-off): add/edit/delete a colony, see all scorpions in a colony, shared husbandry fields, colony-level photos, bulk "log feeding across colony" action that creates one feeding row per member. Communal-suitable species flag still surfaces on the species sheet to suggest the option.
- **Instar field** on molt logs.
- **Brood** terminology in the breeding flow (instead of egg sac).

### Out (deferred to v1.1+)

- **Inverts consolidation (ADR-X).** Deferred until taxon #3.
- **Parthenogenesis-aware breeding UI.** v1 allows a brood with one parent (`father_id` nullable); future polish surfaces a "Parthenogenetic species — single parent" hint on the form.
- **Premolt prediction for scorpions** (per §7 D4 sign-off — deferred for fine-tuning once we have real data).
- **Photo UV-fluorescence hint** on the care sheet. Nice-to-have.

---

## 5. Sprint outline

Solo-dev cadence, ~6–8 weeks total. Each phase is 1–2 weeks.

### Phase 1 — Backend foundation (1–1.5 weeks)

- Migration `scp_YYYYMMDD_add_scorpions.py`: create `scorpions`, `scorpion_species`, `scorpion_colonies`, `broods`. Add nullable `scorpion_id` to feeding_logs / molt_logs / substrate_changes / photos / qr_upload_sessions / pairings / offspring. CHECK constraints.
- SQLAlchemy models + Pydantic schemas.
- Routers: `scorpions.py`, `scorpion_species.py`, `scorpion_colonies.py`, `broods.py`.
- Extend `feedings.py`, `molts.py`, `substrate_changes.py`, `photos.py`, `qr.py`, `pairings.py`, `offspring.py` to accept the new polymorphic parent.
- Regression smoke test on tarantula flows.

### Phase 2 — Species seed + care sheets (1 week)

- Seed 25–30 species with structural fields + citations. Initial list in §7.
- `/scorpions/[id]` care sheet route on web (mirror of `/species/[id]`).
- Mobile species browser pulls from same `/scorpion-species/` endpoint.

### Phase 3 — Mobile collection + detail (1.5 weeks)

- "Scorpions" tab on TV mobile nav. **Nav consolidation needed** — the bottom-bar is already at the iOS guideline ceiling (5 tabs); adding Scorpions probably means folding Forums into a single Community tab, or moving a tab into the Profile menu. Decide as part of this phase.
- List + add + edit + detail screens.
- Colony list + colony detail (members + shared husbandry).
- Feeding + molt-with-instar + substrate + photo logging surfaces.

### Phase 4 — Web collection + detail (1 week)

- Parallel to Phase 3 on web. Collection grid, detail page, husbandry editor, log forms, colony pages.

### Phase 5 — Breeding (1 week)

- Pairings (works generically — taxon-agnostic).
- Broods table (scorpion-specific term).
- Offspring flow shared.
- Add-to-collection from offspring detail (works on both taxa).

### Phase 6 — Polish + QA (1 week)

- Venom severity badges polished.
- Premolt prediction reused with scorpion-tuned thresholds.
- Care sheet copy reviewed.
- Full regression QA on tarantula side.
- App Store / Play listing screenshots updated to reflect both taxa.

### Phase 7 — Buffer + launch (0.5 week)

Launch announcement on Arachnoboards + the scorpion subreddit. Tagline update on the landing page. App Store description update.

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Polymorphic FK migration breaks an existing tarantula query | Live regression | Every router that touches a polymorphic table gets a regression smoke test pre-merge; existing rows keep `tarantula_id` and the new FK defaults to null. |
| "Tarantuverse for scorpions" brand confusion in store listings | Slower adoption from scorpion keepers searching the App Store | Title-tag update to "Tarantuverse: Tarantula & Scorpion Keeper" within Apple's 30-char limit. Description leads with both taxa. |
| Venom-severity badge feels alarmist to keepers of mild species | Bad UX | Tier the badge — mild species get a quiet info tag; only "medically significant" gets red. Mirror the existing tarantula safety badge approach. |
| Seeding 25–30 species drains a week of content time | Phase 2 slips | Cut to 15 species for launch (cover the common pet trade), flag the rest as "coming soon." |
| Future taxon (mantis, centipede) compounds the polymorphic-FK pain | Future engineering tax | Schedule ADR-X (TV inverts consolidation) before adding taxon #3 — don't ship a third per-taxon table. |

---

## 7. Open decisions for sign-off

These need your call before Phase 1 starts.

### Decision 1: Mobile navigation shape

When scorpions ship, the mobile bottom-nav becomes:

- **Option A:** Two collection tabs — **Tarantulas** and **Scorpions** as siblings, each with their own list. (Recommended for v1 — taxon-specific lists keep the UX clear; both taxa get equal visibility.)
- **Option B:** One **Collection** tab with a taxon filter chip at the top. (More scalable for future taxa but loses the at-a-glance "I have N scorpions" view.)

### Decision 2: Initial species seed list

Proposed 25 species, lean toward what's actually in the pet trade. **Beginner / docile:**

- Pandinus imperator (Emperor Scorpion)
- Heterometrus spinifer (Asian Forest Scorpion)
- Heterometrus laoticus (Vietnamese Forest Scorpion)
- Heterometrus silenus
- Hadrurus arizonensis (Arizona Desert Hairy Scorpion)
- Hadrurus spadix (Black Hairy Scorpion)
- Smeringurus mesaensis (Dune Scorpion)

**Intermediate:**

- Centruroides gracilis (Florida Bark Scorpion)
- Heterometrus longimanus (formerly H. spinifer in some literature)
- Hottentotta hottentotta (parthenogenetic)
- Hottentotta judaicus
- Babycurus jacksoni
- Diplocentrus melici
- Vaejovis spinigerus

**Advanced / medically significant (venom-severity prominent):**

- Centruroides sculpturatus (Arizona Bark Scorpion) — North America's only medically significant species
- Androctonus australis (Sahara Yellow Fat-Tail)
- Androctonus crassicauda (Black Fat-Tail)
- Androctonus mauritanicus
- Leiurus quinquestriatus (Deathstalker)
- Leiurus abdullahbayrami
- Parabuthus transvaalicus (Transvaal Thick-Tail)
- Tityus serrulatus (Brazilian Yellow Scorpion — parthenogenetic, medically significant)
- Tityus stigmurus

**Hobbyist favorites:**

- Lychas mucronatus (Chinese Swimming Scorpion)
- Opistophthalmus glabrifrons (Tricolor Burrowing Scorpion)

Sign off on this list or push back on the cut — I'll seed whatever you approve.

### Decision 3: Communal setups in v1?

Many keepers run Pandinus imperator and Heterometrus colonies. v1 plan defers the full "shared enclosure / shared husbandry" data model. Options:

- **Defer fully (recommended).** v1 supports communal-suitable *species* via a flag on `scorpion_species`. Each scorpion is still its own row. v1.1 adds the colony model.
- **Add a `scorpion_colonies` table now.** More work, but communal keepers get a first-class UX day one.

### Decision 4: Premolt prediction

The tarantula premolt algorithm uses feeding refusal + molt interval analysis. Should v1:

- **Reuse the tarantula algorithm with scorpion-tuned thresholds (recommended).** Quick win — scorpions also show pre-ecdysis behavior changes; the algorithm is generic enough.
- **Skip premolt prediction for scorpions in v1.** Smaller surface, less risk of a misleading prediction.

### Decision 5: Tagline / store-listing copy

Need new copy for the landing page hero, app store title, and app store description. Once the path is locked I'll draft three variants for you to pick from — non-blocking for Phase 1.

---

## 8. References

- Herpetoverse v1 plan: `docs/design/SPRINT-herpetoverse-v1.md` — sprint cadence template.
- ADR-002 (taxon discriminator) and ADR-003 (animals consolidation): the design lineage for future invert consolidation.
- Parity audit: `docs/design/PARITY_AUDIT_TV_HV_2026-05-22.md` — lessons-learned that already informed Herpetoverse settings/notifications work and apply here too.
- Content rubric: `docs/content/care-sheet-rubric.md` (Task #25) — citation requirements and "in your own words" rule for the species seed.

---

## 9. Next step

Once you sign off on §7's open decisions (or push back on any of them), I'll start **Phase 1 — Backend foundation** — Alembic migration + models + schemas + routers + polymorphic FK extensions. That's a one-week bundle on its own and the cleanest place to begin.
