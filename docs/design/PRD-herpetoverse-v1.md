# PRD — Herpetoverse v1

**Status:** Draft — revised 2026-04-20 per `REVIEW-PRD-herpetoverse-v1.md` and `ADR-002-taxon-discriminator.md`
**Author:** Cory / Tarantuverse team
**Created:** 2026-04-20
**Target release:** Herpetoverse v1.0 — web soft-launch mid-September 2026, mobile follow-up late September 2026 (see revised §8)
**Related docs:** [ADR-002-taxon-discriminator.md](./ADR-002-taxon-discriminator.md), [SPRINT-herpetoverse-v1.md](./SPRINT-herpetoverse-v1.md), [REVIEW-PRD-herpetoverse-v1.md](./REVIEW-PRD-herpetoverse-v1.md), [PRD-feeder-module.md](./PRD-feeder-module.md)

---

## 1. Problem Statement

Reptile keepers — specifically the serious hobbyist and small-breeder segment of snake and lizard keepers — do not have a modern, polished, data-first tracking app that matches the depth of their actual hobby. The existing landscape is fragmented: ReptiFiles owns the care-sheet SEO but ships no app; Reptile Logger and a handful of niche trackers exist but are visually dated and narrow in scope; MorphMarket dominates classifieds and morph identity but is not a husbandry tool; and serious keepers end up stitching together spreadsheets, Herpstat thermostat apps, Govee sensor apps, and paper notes to run their collections.

The specific pains we are solving:

- **Morph genetics live in ugly Web 1.0 calculators** disconnected from a keeper's actual collection. A ball python breeder runs pairings in their head or on scratch paper because the available online calculators are not beautiful, not mobile-friendly, and do not remember which animals they own.
- **Environmental tracking is manual, scattered, or siloed** in per-device vendor apps. A keeper with Govee sensors in four enclosures has to check four separate Govee screens. A keeper without sensors has no place to log manual temp/humidity readings that feels first-class.
- **Care information is hunted, not delivered** — a new ball python owner Google-searches "ball python humidity" and lands on a decent-but-dated ReptiFiles article, bookmarks it, and has no way to pull that care profile into their tracking app because no such tracking app exists with matching depth.

**Strategic context:** Herpetoverse is the second brand under an eventual parent company, alongside Tarantuverse. It is **not** a Tarantuverse re-skin. It is a distinct product, distinct brand, distinct App Store listing, aimed at a distinct (though overlapping) audience. The backend is shared — same FastAPI service, same PostgreSQL database, same user identity — with **parallel taxon tables** (`tarantulas`, `snakes`, `lizards`) rather than a unified animals supertable. See ADR-002 for the architectural decision and rationale.

**Why now:** The Tarantuverse feeder module (shipped April 2026) is the final feature push for Tarantuverse in this phase — it moves to maintenance mode. The feeder module was deliberately designed as a cross-taxa primitive so snakes and lizards can consume crickets/roaches/mealworms from the same colony model. Verified via code inspection: `feeder_colonies` is user-scoped with zero taxon coupling; `enclosures.purpose` is already an extensible discriminator; `feeding_logs` / `molt_logs` / `substrate_changes` are already polymorphic via nullable-FK + CHECK constraint. That work is done, which unlocks Herpetoverse.

**Evidence:**
- r/ballpython has 240K+ subscribers, r/leopardgeckos 250K+, r/reptiles 1.1M+ — the audience exists at scale. (Subreddit subscriber counts are soft evidence; cross-reference with MorphMarket public breeder stats and App Store review volume on Reptile Logger for a more precise acquisition forecast before launch marketing spend.)
- MorphMarket annual reports describe tens of thousands of active breeders transacting — the serious-keeper segment is financially real.
- Competitive gap on morph calculators: the two most-used (WorldOfBallPythons, MorphMarket's calculator) are functional but not integrated with a keeper's collection; neither shows the calculator as part of "your snakes."
- Competitive gap on IoT: Govee, SensorPush, Inkbird all have vendor-specific apps; no aggregator exists.

---

## 2. Goals

1. **Launch a distinct brand at herpetoverse.com with two supported taxa (snakes, lizards)** that reptile keepers recognize as built-for-them, not as a tarantula app with a reptile mode.
2. **Ship two differentiating features not available in existing reptile-tracking apps** — a collection-integrated morph genetics engine (with welfare-first warnings) and a sensor-ready environmental tracking log.
3. **Publish 20-25 public, SEO-indexed care sheets** at `herpetoverse.com/care/[species]` — each one thorough enough to compete for long-tail search queries at launch, with a plausible path to competing on flagship terms as domain authority accrues.
4. **Reuse the shared backend architecture so convergence later is an additive migration, not a rebuild** — parallel taxon tables keep each brand's schema dense and narrow; if scale or cross-taxa queries ever require it, merging into a unified `animals` table is a one-at-a-time operation, not a risky rewrite.
5. **Hold the honesty-first line** — care sheets are AI-researched, human-rewritten, expert-verified (Cory's wife reviews and edits every v1 entry); we do not ship morph probability charts we cannot defend; we flag welfare-problematic genes and lethal homozygous combinations; we label community submissions clearly until verified. Same principle as Tarantuverse.

**Success framing (60 days post-launch):**
- At least 100 registered Herpetoverse accounts, with at least 40% cross-registered with Tarantuverse (contingent on the cross-promotion mechanism in §7 Q13 being live at launch — without it this target is aspirational)
- At least 500 morph calculator runs
- At least **2 care sheets ranking page 1 for long-tail queries** (e.g., "children's python care sheet", "gargoyle gecko humidity") and top-20 for flagship species terms. Competing for flagship terms against ReptiFiles' years-built domain authority is an 6–12 month arc, not 60 days.
- Care-sheet-to-signup conversion rate: 1.5% of unique visitors (directional target — refine after first 30 days of real data)

---

## 3. Non-Goals

1. **No forums, no community board, no message threads.** Reddit, MorphMarket community, and legacy reptile forums own this space. We do not compete for a decade-old network effect. Activity feed and direct messaging are retained; everything else social is deferred indefinitely.
2. **No amphibians, no turtles, no tortoises, no invertebrates other than feeders.** Aquatic husbandry (water parameter tracking, pH, hardness, ammonia) is a fundamentally different product we can add in a future phase; forcing it into v1 dilutes both scopes.
3. **No actual IoT hardware integrations in v1.** The data model is designed to accept sensor streams (Govee, SensorPush, Inkbird). Actual integrations land in v1.1 or later. The v1 positioning is "manual entry today, automatic tomorrow" — honest on the landing page.
4. **No AI care recommendations, no predictive health alerts, no ML anywhere.** Premolt prediction works in Tarantuverse because molt intervals are regular; reptile shed intervals are noisier and a bad prediction kills an animal. We do not ship any predictive feature until we have enough user data to validate it honestly.
5. **No marketplace, no classifieds, no buy/sell flows.** MorphMarket owns this. Do not compete.
6. **No separate login from Tarantuverse.** A user who signs up at herpetoverse.com and already has a Tarantuverse account uses the same credentials; their tarantulas are not shown in Herpetoverse UI and vice-versa, but the account is one account. (See ADR-002 §D4 for the auth model.)
7. **No Tarantuverse UI changes that expose reptile features.** Tarantuverse stays visually and functionally tarantula-only. Users who want reptiles go to herpetoverse.com. Brand purity is preserved on both sides.
8. **No live-prey vs frozen-thawed ethics UX.** The feeding log supports both as data points; we do not editorialize.
9. **No rodent colony tracking.** The feeder module is insect-colonies-only at v1. Keepers who maintain mouse or rat colonies log mammalian prey as "consumed" on a feeding log without colony management. Rodent colony support is deferred to v1.2+ if demand materializes; the hygiene model and ethical posture diverge enough from insect colonies to warrant its own design.
10. **No affiliate links, no Amazon gear recommendations.** ReptiFiles monetizes heavily through affiliates; we explicitly choose not to until editorial standards are defensible and conflicts of interest are mitigated.

---

## 4. User Stories

### Primary persona — Serious breeder / hobbyist ("Marcus," 8 ball pythons + 4 leopard geckos, breeding both)

Marcus is 33, runs a small rack setup in a spare bedroom, breeds ball pythons as a serious side project, has Govee sensors in three enclosures, and posts hatchling photos to Instagram. He already uses MorphMarket to list offspring and has a spreadsheet with his pairings. He is the primary target user **for the app experience**.

- As a breeder, I want to record each snake's genotype (e.g., "Het Pied, Pastel, Banana") so that I can see my breeding pool at a glance without squinting at a spreadsheet.
- As a breeder, I want to run a pairing calculator between any two animals in my collection and see the probability distribution of offspring morphs, so that I can plan the season without switching to a different site.
- As a breeder, I want the calculator to warn me when a planned pairing would produce lethal homozygous combinations (e.g., Super Spider) or welfare-flagged genes (e.g., Spider wobble) so that I can make an informed ethical choice before committing.
- As a breeder, I want to save a planned pairing to my breeding records so that when the pairing happens for real, it links back to the calculator output.
- As a breeder, I want to log temperatures and humidity per enclosure and see a 30-day trend chart so that I can catch a drifting thermostat before it stresses an animal.
- As a breeder, I want a public keeper profile that lists my animals (opt-in per animal) and my recent clutches so that Instagram followers and potential buyers see a polished portfolio.

### Secondary persona — Dedicated single-keeper ("Ana," 1 crested gecko, thinking about a second)

Ana is 26, has had her crested gecko for two years, reads ReptiFiles religiously, wants to do things right, and is researching whether to add a leopard gecko. She is not a breeder but is a serious hobbyist.

- As a keeper, I want to find an authoritative care sheet for my species on Herpetoverse's public site so that I stop hunting across ten different forum threads.
- As a keeper, I want to log feedings, shed cycles, weight, and occasional vet notes so that I have a medical-grade history if something goes wrong.
- As a keeper, I want to browse care sheets for species I am considering so that I can compare husbandry requirements before I commit.
- As a keeper, I want to follow a few breeders and see their activity feed so that I stay connected to the community without needing a forum.

### Tertiary persona — The researcher / lurker ("Sam," considering a leopard gecko, hasn't bought one yet)

Sam is 19, found herpetoverse.com via a Google search for "leopard gecko beginner care," has never owned a reptile, and is trying to figure out if she can commit to the husbandry before buying an animal. She is the **majority of the SEO traffic** and she drives the content-quality bar. She may never sign up — and that's fine. Her experience is what turns the care sheets into a top-of-funnel asset.

- As a researcher, I want to land on a comprehensive leopard gecko care sheet and understand if I can commit to the husbandry before I buy an animal, so I don't rehome an animal I shouldn't have gotten.
- As a researcher, I should not be gated behind signup to read any care sheet — ever.
- As a researcher, I want the key husbandry facts (temps, humidity, UVB, enclosure size, diet) visible above the fold so I can evaluate fit in 60 seconds.
- As a researcher, if I like what I see, I want a low-friction way to save the care sheet for later — either by bookmarking or by creating a free account with one click.

**Design consequence:** care sheets are paywall-free, signup-free, SEO-optimized, and include both a quick-facts panel and a compelling (but non-intrusive) CTA to sign up for tracking.

### Quaternary persona — Cross-over Tarantuverse user ("Cory," 25 tarantulas + 1 ball python + 1 leopard gecko)

Cory is an existing Tarantuverse user who just got into reptiles. He is the archetype for organic cross-sell.

- As an existing user, I want to sign in to herpetoverse.com with my Tarantuverse credentials so that I do not create a second account.
- As an existing user, I want my cricket colony from Tarantuverse to show up in Herpetoverse's feeder view so that I log feedings from one colony into either app.
- As an existing user, I want direct messages sent to me from either app to arrive in one inbox so that the social layer stays unified.

### Edge cases

- As a keeper, I want to mark a morph gene as "possible het" (unproven) separately from "confirmed het" (genetic test or proven breeding) so that the calculator does not overstate certainty.
- As a breeder, I want to record a pairing that produced a clutch of unexpected morphs so that I can flag potential new gene interactions — calculator output is not authoritative, my records are.
- As a keeper without an enclosure record, I want to log a temperature reading against "my ball python rack" in free-text if no enclosure is set, so that the feature is usable before I have finished onboarding.
- As a keeper, I want to delete a care-sheet species from my "following" list without losing any of my animals linked to it.

---

## 5. Requirements

### Must-Have (P0) — ships with v1.0

#### 5.1 Shared Backend — Parallel Taxon Tables

**Resolved per ADR-002 §D1:** Keep `tarantulas` unchanged. Add `snakes` and `lizards` as parallel sibling tables. No `animals` supertable. No `taxon` column on a nonexistent supertable. Taxon is implicit from which table a row lives in.

**New tables:**

- **`snakes`** — parallel to `tarantulas` for shared concepts (name, sex, date_acquired, source, price_paid, notes, photo_url) plus snake-specific fields: `hatch_date`, `source_breeder`, `current_weight_g`, `current_length_in`, `feeding_schedule`, `last_fed_at` (denormalized), `last_shed_at` (denormalized), `brumation_active`. Foreign keys: `user_id`, `reptile_species_id`, `enclosure_id` (nullable).
- **`lizards`** — parallel structure. Lizard-specific: `uvb_bulb_active_id` (FK to `uvb_bulb_logs`, nullable), `requires_uvb` (Boolean, denormalized from species), `activity_period` (`'diurnal' | 'nocturnal' | 'crepuscular'`). No `brumation_active` (lizard equivalent is species-specific; store in notes at v1).
- **`reptile_species`** — parallel to the existing `species` (tarantula) table. Separate table because the reptile field set is materially richer than tarantula (UVB requirements, multiple temp zones, bioactive suitability, brumation profile, CITES status, IUCN conservation status). See §5.3 for the full field set.

**Three-tier primitive reuse (per ADR-002 §D2):**

| Tier | Pattern | Tables in this tier |
|---|---|---|
| **Reuse as-is** | Already taxon-agnostic; no migration | `users`, `feeder_colonies`, `feeder_species`, `feeder_care_log`, `enclosures` (extend allowed `purpose` values only, not schema), forum models, `direct_message`, `follow`, `notification_preferences`, `subscription`, `token_blocklist`, `system_setting`, achievement definitions |
| **Extend polymorphically** | Add nullable `snake_id` / `lizard_id` FK columns; broaden existing CHECK constraint to require at least one parent | `feeding_logs`, `photos`, `qr_upload_sessions`, `offspring`, `pricing_submission`, `activity_feed` (adds `taxon_scope` array column) |
| **New parallel tables** | Reptile semantics diverge from tarantula enough that isolation is cleaner than conditional columns | `shed_logs`, `environment_readings`, `uvb_bulb_logs`, `reptile_pairings`, `reptile_clutches`, `reptile_offspring`, `genes`, `animal_genotypes`, `reptile_species` |

**Enclosures — no schema change, enum extension only.** The existing `purpose` column accepts `'tarantula'` and `'feeder'`; extend application-level validation to accept `'snake'` and `'lizard'`. Reptile-specific nullable columns (`basking_temp_target`, `cool_side_temp_target`, `night_temp_target`, `uvb_required`) are added at the same time but remain NULL for tarantula/feeder enclosures.

**App-scoping:** every read endpoint that returns animal-scoped data self-scopes to its brand. Tarantuverse queries `tarantulas` only; Herpetoverse queries `snakes` and `lizards` (UNION for unified views). The JWT is the security boundary; the app taxon filter is a convenience to keep UX coherent, not a security control.

**Acknowledged trade-off:** Cross-taxa queries (a unified keeper portfolio that shows all animals across both brands) require UNION across 2–3 tables. Performance is fine at the expected v1 scale (<10K animals per user). If institutional users (zoos, herpetological societies) ever adopt the platform and push animal counts higher, revisit via materialized views or migrate to a unified `animals` supertable. ADR-002 §Consequences covers this.

**Migration sequence (additive only, no renames, no data moves — per ADR-002):** 14 migrations, every one reversible without data loss. Detailed in ADR-002 §Migrations sequence; summary in SPRINT-herpetoverse-v1.md Phases 0–1.

#### 5.2 Reptile Husbandry Logs

New log types or polymorphic extensions of existing ones, following the `feeding_logs` precedent.

**`shed_logs` (new table, polymorphic)** — parallel to `molt_logs` but named for the reptile vocabulary and scoped to either a snake, a lizard, or (rarely) an enclosure for multi-animal shed events.

- `id` (UUID, PK)
- Polymorphic parents (exactly one required, enforced by CHECK): `snake_id`, `lizard_id`, `enclosure_id` (all nullable FKs)
- `shed_date` (Date, required)
- `in_shed_started_at` (Date, nullable) — the "in shed" / "opaque" period for snakes
- `completeness` (String) — `'full'` | `'partial'` | `'stuck'` — stuck sheds are a health signal
- `weight_before`, `weight_after` (Numeric, grams, nullable)
- `length_before`, `length_after` (Numeric, inches, nullable)
- `notes` (Text), `image_url` (String, nullable)
- `created_at`

**`feeding_logs` (polymorphic extension, not a new table)** — the existing table is already polymorphic via `(tarantula_id NULL OR enclosure_id NOT NULL)` CHECK. Broaden the CHECK to accept `snake_id` or `lizard_id` as alternative parents, and add three nullable columns for reptile-relevant prey metadata:

- `snake_id` (UUID, FK → snakes, CASCADE, nullable) — new
- `lizard_id` (UUID, FK → lizards, CASCADE, nullable) — new
- `prey_type` (String, nullable) — `'live_mouse'` | `'ft_mouse'` | `'live_rat'` | `'ft_rat'` | `'chick'` | `'insects'` | `'salad'` | `'commercial_diet'` | `'other'`
- `prey_size` (String, nullable) — `'pinky'` | `'fuzzy'` | `'hopper'` | `'weanling'` | `'small_adult'` | `'medium_adult'` | `'large_adult'` | `'jumbo'` | free-text fallback
- `prey_count` (Integer, nullable, default 1) — for multi-insect lizard feedings

**Broadened CHECK:** `tarantula_id IS NOT NULL OR snake_id IS NOT NULL OR lizard_id IS NOT NULL OR enclosure_id IS NOT NULL`. Existing `food_type` / `food_size` columns stay populated for tarantula rows; `prey_*` populated for reptile rows. API-layer validation enforces exactly-one-parent-FK.

**`environment_readings` (new table)** — P0 because this *is* wedge 3.

- `id` (UUID, PK)
- `enclosure_id` (FK → enclosures, CASCADE) — required; readings belong to enclosures, not individual animals
- `reading_type` (String) — `'temp_cool'` | `'temp_warm'` | `'temp_basking'` | `'temp_night'` | `'humidity'` | `'uvb_uvi'`
- `value` (Numeric)
- `unit` (String) — `'F'` | `'C'` | `'percent'` | `'uvi'`
- `recorded_at` (DateTime with tz)
- `source` (String) — `'manual'` | `'sensor_api'` | `'integration'` (plus `integration_id` nullable for future sensor linkage)
- `notes` (Text, nullable)
- `created_at`

**Tarantuverse scope decision:** `environment_readings` is Herpetoverse-first at v1. Tarantuverse tarantula enclosures can use the same table if a keeper wants it (the FK is to `enclosures.id`, which is taxon-agnostic), but no Tarantuverse UI surfaces environmental readings at v1. Tarantuverse keepers continue to rely on target-range fields on the enclosure record.

**`uvb_bulb_logs` (new table)** — UVB bulbs have finite useful life (~6-12 months depending on type); tracking replacement is a pro-keeper feature.

- `id` (UUID, PK), `enclosure_id` (FK, required), `bulb_type` (String) — `'T5_HO'` | `'T8'` | `'compact_coil'` | `'mercury_vapor'`
- `installed_date`, `expected_replacement_date` (Date)
- `notes` (Text)
- `created_at`

**API routes (non-exhaustive):**

- `GET /api/v1/snakes/{id}/sheds`, `POST /api/v1/snakes/{id}/sheds`
- `GET /api/v1/lizards/{id}/sheds`, `POST /api/v1/lizards/{id}/sheds`
- `GET /api/v1/enclosures/{id}/readings`, `POST /api/v1/enclosures/{id}/readings`
- `GET /api/v1/enclosures/{id}/readings?type=humidity&from=2026-05-01&to=2026-06-01` for trend charts
- `GET /api/v1/enclosures/{id}/uvb-bulbs`, `POST /api/v1/enclosures/{id}/uvb-bulbs`

**Deferred to P1/P2:** `handling_logs` for tracking handling frequency + temperament response (noted in review §5.2). Schema design is straightforward but not v1-critical.

#### 5.3 Reptile Species Data Model

Reptile care sheets have a richer field set than tarantula care sheets. The separate `reptile_species` table (per ADR-002) carries this richness without polluting the tarantula schema.

**Fields per reptile species:**

- Taxonomy: `scientific_name`, `scientific_name_lower`, `common_names` (array), `genus`, `family`, `order`
- Care level: `care_level` (`'beginner'`, `'intermediate'`, `'advanced'`)
- Temperament / handling: `handleability` (`'docile'`, `'defensive'`, `'nippy'`, `'hands_off'`), `activity_period` (`'diurnal'`, `'nocturnal'`, `'crepuscular'`)
- Native region, adult size (min/max length + weight range)
- **Climate (richer than tarantula):** `temp_cool_min`, `temp_cool_max`, `temp_warm_min`, `temp_warm_max`, `temp_basking_min`, `temp_basking_max`, `temp_night_min`, `temp_night_max`, `humidity_min`, `humidity_max`, `humidity_shed_boost_min`, `humidity_shed_boost_max`
- **UVB:** `uvb_required` (Boolean), `uvb_type` (`'T5_HO'`, `'T8'`, `'not_required'`), `uvb_distance_inches` (range), `uvb_replacement_months` (Integer)
- **Enclosure:** `enclosure_type` (`'terrestrial'`, `'arboreal'`, `'semi_arboreal'`, `'fossorial'`, `'aquatic'` — aquatic rejected at API layer for v1), `enclosure_min_hatchling`, `enclosure_min_juvenile`, `enclosure_min_adult` (each a string like "4x2x2 ft"), `bioactive_suitable` (Boolean)
- **Substrate:** `substrate_safe_list` (array), `substrate_avoid_list` (array), `substrate_depth_inches` (range)
- **Diet:** `diet_type` (`'strict_carnivore'`, `'insectivore'`, `'omnivore'`, `'herbivore'`), per-life-stage prey size + feeding frequency, supplementation notes (calcium + D3, multivit schedule)
- **Water:** `water_bowl_size` (string description), `soaking_behavior` (text)
- **Behavior:** `brumation_required` (Boolean, snakes), `brumation_notes` (text), `defensive_displays` (array)
- **Lifespan:** `lifespan_captivity_min`, `lifespan_captivity_max` (years)
- **Conservation & legal:** `cites_appendix` (`'I'` | `'II'` | `'III'` | `null`), `iucn_status` (`'LC'` | `'NT'` | `'VU'` | `'EN'` | `'CR'` | `'EW'` | `'EX'` | `'DD'` | `null`), `wild_population_notes` (Text, for context where IUCN alone is misleading). **Removed from v1 per review:** `commonly_restricted_states` — state-level legal data changes constantly and a stale entry creates legal exposure. Instead, every species page includes a "Check your state's fish & wildlife regulations" notice linking to US F&W state contact directory; non-US users see a generic version.
- **Morphs:** `has_morph_market` (Boolean), `morph_complexity` (`'none'`, `'simple'`, `'moderate'`, `'complex'`) — informational; full morph data lives in a separate `genes` table (§5.4).
- Documentation: `care_guide` (Markdown, long-form), `image_url`, `source_url`, `sources` (JSONB array of `{title, url, publication_date}` per-claim citations)
- Community: `is_verified`, `submitted_by`, `verified_by`, `verified_at`, `community_rating`, `times_kept`
- Audit: `content_last_reviewed_at` (Date) — for staleness flagging

**Seed list (v1) — 20 species target, 25 stretch:**

*Snakes (10 v1, 12 stretch):*

| Scientific | Common | Notes |
|---|---|---|
| Python regius | Ball python | **Flagship for morph calculator** |
| Pantherophis guttatus | Corn snake | Beginner, classic |
| Lampropeltis californiae | California kingsnake | Beginner |
| Heterodon nasicus | Western hognose | Popular, mild venom disclaimer needed |
| Eryx colubrinus | Kenyan sand boa | Small, fossorial |
| Lichanura trivirgata | Rosy boa | Beginner |
| Lampropeltis triangulum | Milksnake | Varied subspecies — handle as complex |
| Thamnophis sirtalis | Common garter snake | Non-mouse feeders, worth inclusion for diversity |
| Boa imperator | Colombian boa | Large but extremely common |
| Antaresia childreni | Children's python | Small, docile |
| *Morelia spilota* | Carpet python | Stretch — promoted from original stretch list per review (large, popular with serious keepers) |
| *Pantherophis obsoletus* | Black rat snake | Stretch |

*Lizards (10 v1, 12 stretch):*

| Scientific | Common | Notes |
|---|---|---|
| Eublepharis macularius | Leopard gecko | **Flagship for morph calculator** |
| Correlophus ciliatus | Crested gecko | No-UVB gecko, popular |
| Pogona vitticeps | Bearded dragon | UVB-critical, very common |
| Rhacodactylus auriculatus | Gargoyle gecko | No-UVB gecko |
| Tiliqua scincoides | Blue-tongue skink | Omnivore |
| Hemitheconyx caudicinctus | African fat-tailed gecko | No-UVB gecko |
| Anolis carolinensis | Green anole | Beginner |
| Physignathus cocincinus | Chinese water dragon | Semi-arboreal, advanced — see slug collision note below |
| Uromastyx ocellata | Ocellated uromastyx | Herbivore |
| Salvator merianae | Argentine black & white tegu | Advanced, some state bans — handled via the "check your state" notice, not a data field |
| *Varanus acanthurus* | Ackie monitor | Stretch — added per review; credibility with serious-keeper crowd |
| *Phelsuma madagascariensis* | Giant day gecko | Stretch |
| *Chlamydosaurus kingii* | Frilled dragon | Stretch |

**Slug collision policy:** Common-name slugs are a soft convention; scientific-name slugs are canonical. If two species share a common name (e.g., "water dragon" = *Physignathus cocincinus* OR *Intellagama lesueurii*), the canonical URL is the scientific-name slug (`/care/physignathus-cocincinus`) and the common-name slug (`/care/water-dragon`) 301-redirects to whichever was registered first, OR to a disambiguation page if multiple species claim the same common name. Implementation: `redirect_from` field on each species record, plus a `disambiguation` table for multi-species conflicts.

**Content pipeline (revised per review §5.3):**

- **Research phase:** AI-assisted first pass; starting sources include ReptiFiles, peer-reviewed husbandry papers, primary species literature, breeder guides, and Cory's wife's domain knowledge.
- **No verbatim copying.** Every factual claim in a care sheet must be re-expressed in original language. If ReptiFiles says "humidity should be 60–70% with a shed-boost to 80%," Herpetoverse cannot say the same. Either re-express or cite a different source.
- **Per-claim citations.** Each species' `sources` JSONB stores per-fact citations where possible, displayed on the care sheet as a references section and inline where a specific claim is contested or non-obvious.
- **Human rewrite + review.** Cory's wife is the reviewer and is empowered to rewrite, not just approve. "Review" means she reads each sheet as if she were editing a book chapter; if a sentence reads like AI output, she rewrites it in her own voice.
- **Honesty footer on every AI-researched sheet:** "Researched with AI assistance, written and reviewed by [reviewer name]. Sources: [count]. Last reviewed: [date]. Report an error → [link]"
- **Community submissions** open at launch, marked `is_verified=false` until reviewed. Community contributions go through the same no-verbatim rule, enforced at submission time via a checkbox plus a reviewer spot-check.

**Plagiarism risk mitigation:** Before launch, a final pass checks each sheet against ReptiFiles and two other major care-sheet sources using a similarity tool (e.g., Copyscape or a custom n-gram check). Any sheet >15% textual similarity to a single source triggers a rewrite.

**Content estimate:** 20 sheets × (3 hours draft + 1 hour rewrite + 1 hour wife review + 0.5 hour citation check) ≈ 110 hours of content work, allocated across Sprint 4 per SPRINT-herpetoverse-v1.md.

#### 5.4 Morph Genetics Engine

The genetics data model + calculator UI is wedge 1. This is the headline feature. Welfare warnings and lethal-combo detection are not optional polish — they are core to the feature.

**Data model — `genes`:**

- `id` (UUID, PK)
- `species_scientific_name` (String, indexed) — which species this gene applies to
- `name` (String) — e.g., "Pastel", "Albino", "Het Pied"
- `gene_type` (String) — `'recessive'` | `'dominant'` | `'codominant'` | `'incomplete_dominant'`. **Terminology note:** the hobby uses "codominant" loosely; many ball python "codominant" genes are technically incomplete dominant. Both values are kept for hobbyist-recognizability; a UI footnote explains the distinction.
- `visual_at` (String) — `'het'` | `'homo'` | `'super'` (for codominant where homo is visually distinct, e.g., Super Pastel)
- `symbol` (String, optional) — genetic shorthand
- `description` (Text)
- `image_url` (String, nullable) — photo of an animal showing the gene visually
- **`welfare_flag`** (String, nullable) — `'neurological'` | `'structural'` | `'viability'` | `null`. Genes with known welfare concerns (Spider/Woma/Champagne/HGW neurological, Super Banana viability, etc.) set this field.
- **`welfare_notes`** (Text, nullable) — displayed when the flag is set. Example: "Spider is associated with a documented neurological condition known as 'wobble' in the hobby. Severity varies by individual; some animals show no symptoms, others are severely affected. Ethical breeders increasingly choose not to produce this gene."
- **`lethal_homozygous`** (Boolean, default false) — for genes where the super/homozygous form is known lethal or non-viable (Super Spider, Super Lesser, Super Butter). When a calculator output contains a lethal homozygous combination, the warning is prominent.
- **`welfare_citations`** (JSONB array, nullable) — source citations for welfare flags. Welfare claims without citations are not displayed.
- `is_verified` (Boolean) — community-submitted genes start unverified
- `verification_source` (String, nullable) — e.g., "MorphMarket", "WorldOfBallPythons", "community consensus", "single-breeder claim"

**Data model — `animal_genotypes` (polymorphic per ADR-002):**

- `id` (UUID, PK)
- Polymorphic parent (exactly one required): `snake_id`, `lizard_id` (both nullable FKs + CHECK constraint)
- `gene_id` (FK → genes, CASCADE)
- `zygosity` (String) — `'het'` | `'visual'` | `'poss_het'` | `'super'`
- `poss_het_percentage` (Integer, nullable) — for "66% het", "50% het"
- `proven` (Boolean) — whether the het status is proven by breeding or genetic test vs assumed from parentage
- `notes` (Text, nullable)

**Calculator — pure function, no DB state:**

- Input: two animal_ids (or two raw genotype lists)
- Output: probability distribution of offspring morphs + **welfare warnings** + **lethal-combo warnings**
- Punnett-style combination for each gene, multiplied across all genes on each parent
- Return format: array of `{ morph_description: string, probability: number, includes_genes: [gene_id], warnings: [{type, gene_id, message, citation_url}] }`
- Co-dominant + recessive interactions handled correctly (this is where most online calculators get sloppy — unit tests validate against published calculators' known outputs)

**Welfare UI requirements (per review):**

- **Input-time warning:** when a user adds a welfare-flagged gene to an animal's genotype, a non-dismissible info panel explains the welfare concern with source citations. User can proceed after reading.
- **Output-time warning:** when the calculator output contains a welfare-flagged offspring morph, each affected row in the probability table displays a warning icon + expandable welfare note.
- **Lethal combo warning:** when the output contains a lethal homozygous combination (e.g., Super Spider @ 25%), a red banner above the output table explains the lethality and cites sources. Optional setting: "Hide lethal-combo probabilities from chart" — still calculates them, still warns, but user can suppress the visual to avoid fixating on a percentage that represents dead hatchlings.
- **Language discipline:** warnings use "associated with," "documented in," "reports suggest" — never "causes." Informational, not moralizing. Test the language with 3–5 keepers before launch (Sam and Ana personas benefit from this as much as Marcus does).

**Unverified gene UI:** any gene with `is_verified=false` OR `verification_source='single-breeder claim'` displays an "Unverified — claimed by a single source, not independently confirmed" badge in the gene picker and in the calculator output.

**Launch scope:**

- Ball python: ~40-50 common single-gene morphs + their combinations (Pastel, Banana, Albino, Pied, Clown, Cinnamon, Black Pastel, Mojave, Fire, Lesser, Butter, Enchi, Pinstripe, Spider, Yellow Belly, Het Pied, Het Albino, Het Clown, Het Lavender, and ~20 more). Welfare-flagged at launch: Spider, Woma, Champagne, HGW, Super Banana (male). Lethal-homozygous-flagged at launch: Super Spider, Super Lesser, Super Butter, Super Mojave, Super Black Pastel (partial — some reports of viable supers; flagged with caveats).
- Leopard gecko: ~25-30 common morphs (Albino variants — Tremper/Bell/Rainwater, Eclipse, Murphy Patternless, Enigma, Mack Snow, Super Snow, Raptor combos, etc.). Welfare-flagged at launch: Enigma (Enigma Syndrome neurological).
- Other v1 species: genotype storage enabled but no species-specific morph seed list. Community submissions can add morphs for corn snakes, crested geckos, etc. post-launch.

**UI — web (`/morphs/calculator`):**

- **Public — no auth required for calculation** (see §5.6 routing decision). Signup is required only to save a calculation to a planned pairing.
- Parent A and Parent B selectors (pick from your collection if logged in, OR enter raw genotype manually)
- Visual genotype builder: searchable dropdown of genes, zygosity picker per selected gene
- Output: stacked bar chart of offspring probabilities, expandable to show gene-by-gene breakdown, welfare + lethal warnings prominently displayed
- **Save to planned pairing:** only available to logged-in users. Public users see a "Sign up to save this calculation" CTA below the results.

**UI — mobile:**

- Same flow, optimized for single-column layout
- Camera integration deferred (phase 2) — can't identify morphs from photos yet

**API routes:**

- `GET /api/v1/genes?species=Python%20regius` — list genes for a species (public)
- `POST /api/v1/genes/` — create gene (auth, community submission model)
- `GET /api/v1/snakes/{id}/genotype` — list genes for a snake (auth, ownership check)
- `GET /api/v1/lizards/{id}/genotype` — list genes for a lizard (auth, ownership check)
- `POST /api/v1/snakes/{id}/genotype`, `POST /api/v1/lizards/{id}/genotype` — add gene to animal
- `POST /api/v1/morphs/calculate` — run calculator (accepts two animal_ids or two raw genotype arrays; **public, no auth required, rate-limited to 20 req/min per IP** per review)

#### 5.5 Public SEO-Indexed Care Sheets

Care sheets live at `herpetoverse.com/care/[scientific-name-slug]` and are publicly accessible, server-rendered for SEO, with schema.org structured data. **No signup wall, ever.** Gating SEO content defeats its purpose — Sam (researcher persona §4) cannot convert if she cannot read.

**Requirements:**

- Server-side rendered by Next.js (App Router, dynamic SSG where possible)
- Structured data: `Article` schema + `FAQ` schema for the key-facts panel
- Canonical URL: scientific-name slug (`/care/python-regius`); common-name slug (`/care/ball-python`) 301-redirects to canonical. Both are listed in the sitemap but only the canonical is indexed.
- OG tags + Twitter card metadata per species
- Internal linking: related species, "if you like X, consider Y"
- Sitemap includes all published care sheets
- **Sitemap submitted to Google Search Console** at launch; weekly rank-tracking via Mangools or SEMrush from day 1 so the "2+ care sheets on page 1" success metric is actually measurable

**UX — care sheet page:**

- Hero: common name + scientific, image, care level badge, quick-facts card (size, lifespan, temperament, UVB yes/no)
- Key-facts panel: temp ranges, humidity, enclosure size by life stage — the information someone searching "ball python humidity" actually wants, above the fold
- Full care guide below: husbandry sections, feeding, shed, common issues, sources
- References section at bottom: per-claim citations from `reptile_species.sources` field
- CTA: "Track your [species] in Herpetoverse" → app signup (non-intrusive — inline, not a modal)

**Image licensing (per review):**

- Hero images and inline photos must come from one of: (a) licensed stock (iStock, Shutterstock — line-item in launch budget), (b) user-submitted photos with explicit upload consent and license assignment (Herpetoverse gets a perpetual display license; uploader retains copyright), (c) Creative Commons sources where license terms allow commercial use with attribution (Unsplash, Wikimedia), (d) original photography by Cory or contracted photographers.
- **No unlicensed scrapes from ReptiFiles, Reddit, Instagram, or other care-sheet sites.** Ever.
- License source is stored per-image in a `photo_licenses` table (new, P0): `image_url`, `source_type`, `source_url`, `attribution_text`, `license_type`, `acquired_at`.
- Launch-default fallback when no hero image is available: a species-illustrated placeholder (commissioned flat illustrations — cheaper than stock, distinctive to the brand, and license-clean).

**Localization / unit preferences:**

- Default display: Fahrenheit + inches (US-centric, matches the primary audience base).
- Unit toggle: per-session, top-right of any care sheet, switches to Celsius + centimeters. Toggle persists in `localStorage` for non-logged-in users; persists in `users.ui_preferences` for logged-in users (extending the ADR-001 preferences JSONB).
- Detection: `Accept-Language` header sets the initial default (e.g., `en-GB` → metric).
- Internal storage is always Fahrenheit + inches; rendering layer converts.

#### 5.6 Web App (`herpetoverse.com`)

A distinct Next.js 14 app, separate deployment from tarantuverse.com, separate Vercel project. Copy-and-adapt component library from Tarantuverse per ADR-002 §D3 (no shared package at v1).

**Core routes:**

- `/` — landing page (Herpetoverse branding, taxon-specific hero, wedge feature showcase)
- `/login`, `/register` — shared auth endpoints with Tarantuverse
- `/dashboard` — collection overview filtered to snakes + lizards only
- `/dashboard/animals/[id]` — animal detail (adapted from Tarantuverse tarantula detail)
- `/dashboard/animals/add` — add snake or lizard with taxon picker
- `/dashboard/breeding` — breeding module (reused via reptile_pairings/clutches/offspring)
- `/dashboard/analytics` — per-animal analytics (feeding, shed, weight, temp/humidity trends)
- `/care` — public species list (indexable, linked from care sheet "related species")
- `/care/[slug]` — public care sheets (per §5.5)
- **`/morphs/calculator`** — **public, no auth required for calculation.** Save-to-pairing gated behind signup. This is a wedge feature and gating it loses SEO + top-of-funnel conversion.
- `/species` — browseable species list (authenticated dashboard equivalent; redundant with `/care` for logged-out users but needed for the "add to my collection" flow)
- `/messages`, `/messages/[username]` — reused from Tarantuverse

**Branding:**

- Distinct color palette from Tarantuverse (gold/amber/forest-green tones vs Tarantuverse's purple-pink) — finalized in Sprint 5 design pass
- Distinct logo — TBD, commissioned in Sprint 1
- Similar UI skeleton: sidebar layout, component library, theme preset system (ADR-001 applies to both brands; Keeper vs Hobbyist presets work the same)

**Deployment:**

- Vercel project: `herpetoverse-web` (separate from `tarantuverse-web`)
- Environment: `NEXT_PUBLIC_API_URL=https://tarantuverse-api.onrender.com` (same backend)
- Domain: `herpetoverse.com` (pending registration confirmation — see §7 Q11)

#### 5.7 Mobile App (Herpetoverse — separate React Native app)

A second Expo/React Native app, separate EAS project, separate App Store + Play Store listings. Shares the backend API with Tarantuverse mobile.

**Core screens:**

- Tabs: Collection, Species, Community, Profile (mirror of Tarantuverse tab structure)
- Animal detail, add, edit
- Morph calculator (mobile-optimized)
- Environmental reading entry (quick-log pattern)
- Activity feed, direct messages, notifications

**Brand assets:**

- New icon, new adaptive icon, new splash screen
- Distinct color theme via ThemeContext
- New bundle ID (`com.tarantuverse.herpetoverse` or similar), new push notification certificates, new App Store Connect listing
- Required screenshot sizes: iPhone 6.7", iPhone 6.1", iPad — production is ~1 day of content work per size set

**App Store considerations (revised per review):**

- **First-review gating is the single biggest schedule risk.** Apple first-review averages 2–7 days and is frequently rejected on the first pass (privacy labels, login clarity, restore-purchases if IAP exists). Plan for **2 review cycles** in the timeline.
- **Mobile hard gate is week 15 of 18 per SPRINT-herpetoverse-v1.md Sprint 8** — that gives 2–3 weeks of buffer for Apple review, screenshot production, and any rejection iteration.
- **EAS Build credentials setup** for a separate EAS project adds 1–2 hours of friction; flagged in Sprint 1.
- Realistic landing page language at web launch: "Mobile apps coming September 2026" — do not imply a simultaneous launch.

#### 5.8 Activity Feed + Direct Messaging (reused)

Existing Tarantuverse activity feed and DM models work unchanged. Herpetoverse UI filters activity to reptile-taxon events by default but can show cross-taxa in a "Following" tab.

**Explicit UX decision:** Activity feed respects the app it's viewed in via the `taxon_scope` array column (new) on `activity_feed`. `taxon_scope` is an **array of taxa** (`['tarantula']`, `['snake']`, `['snake', 'lizard']`, `['tarantula', 'feeder']`, etc.) so cross-taxa events (e.g., "logged feeding from cricket colony to snake") can appear in either or both app feeds. Each app filters: Tarantuverse queries `WHERE 'tarantula' = ANY(taxon_scope)`; Herpetoverse queries `WHERE 'snake' = ANY(taxon_scope) OR 'lizard' = ANY(taxon_scope)`.

#### 5.9 Feeder Module Cross-App Access

Feeders (crickets, mealworms, roaches, etc.) are taxon-agnostic — they feed both tarantulas and insectivorous lizards. The existing feeder module is accessible from Herpetoverse without duplication. Verified via code inspection: `feeder_colonies.user_id` has no taxon coupling; `enclosures.purpose` discriminator handles feeder enclosures today.

**Requirement:** The feeder colony API returns the same user's colonies regardless of which app queries. Herpetoverse exposes a Feeders view identical in function to Tarantuverse's.

**Non-scope:** Mammalian prey (mice, rats) do **not** use the feeder colony module in v1. Rodent colony tracking is explicitly deferred (see §3.9).

### Should-Have (P1) — stretch for v1.0, definitely v1.1

#### 5.10 Weight & Growth Tracking

Dedicated `weight_logs` table (separate from shed-associated weight) for keepers who weigh regularly. Chart of weight over time per animal. Schema is polymorphic like shed_logs.

#### 5.11 Brumation Tracker

Seasonal workflow for colubrids: start brumation, track temp drop schedule, monitor weight loss, end brumation. Specific to snakes that require it (California kings, corn snakes, hognoses). Snake record's `brumation_active` boolean is the v1 floor; the workflow UI is P1.

#### 5.12 Morph Photo Reference Library

Each gene in the `genes` table can have multiple reference photos (gene expression varies). Community can submit photos tied to their animals. Licensing enforced per §5.5.

#### 5.13 Gene-Combo Illustration

Calculator output shows not just "pastel banana pied" as text but renders a probability-weighted visual preview using stock morph photos from the reference library.

#### 5.14 Handling Logs

Per review §5.2 — how often an animal is handled affects temperament, stress assessment, and feeding-response analysis. Polymorphic log table; simple schema.

#### 5.15 Rehome / Ownership Transfer

Per review §5.10–§5.18 — snake and lizard rehoming is common (estate sales, breeder retirements). Rather than delete+re-add, provide a structured transfer flow that preserves the animal's log history and assigns it to the new keeper. P2 candidate.

### Future Considerations (P2) — architecture supports, not shipped in v1

#### 5.16 IoT Sensor Integrations

Govee, SensorPush, Inkbird OAuth + API integrations. Sensor data streams into `environment_readings` with `source='sensor_api'` and an `integration_id` linking to the source device. Architecture-ready in v1; integrations land in v1.1 or v1.2.

#### 5.17 Amphibians + Turtles + Tortoises

Additional taxa. Requires aquatic husbandry schema (water params), new species data, new care sheets. Deferred to v2+. Per ADR-002, each new taxon is a new parallel table; if 4+ taxa accumulate, consider migration to a unified `animals` supertable.

#### 5.18 Vet/Health Module

Cross-taxon health tracking — medication logs, symptom history, vet visit records, exportable medical history PDFs. Activation for Herpetoverse is a v1.1 candidate and could become the #3 wedge later.

#### 5.19 Rodent Colony Module

Deferred per §3.9. Not shipping.

#### 5.20 Morph Calculator for Additional Species

Beyond ball python and leopard gecko, add morph data for corn snakes, crested geckos, boas, hognoses, kingsnakes, bearded dragons. Genes table is species-scoped so this is additive data, no schema change.

---

## 6. Success Metrics

**Definitions (required per review §6):**

- **Active user:** a logged-in user who performed at least one of: added an animal, logged a feeding/shed/reading, ran the morph calculator, or viewed a species care sheet while authenticated. Measured as DAU / WAU / MAU.
- **Breeder:** a user who has created at least one `reptile_pairing` record OR who has marked themselves as a breeder in profile settings.
- **Tarantuverse baseline churn:** 30-day churn rate measured before Herpetoverse launch. If a baseline isn't established, the "TV churn unchanged" success metric is unobservable — this is a launch-blocker and is called out in §7 Q14.

**Analytics infrastructure:** event pipeline decided pre-launch (see §7 Q16). Candidates: PostHog (self-hostable, no cost at low scale, integrates with both Next.js and React Native), Amplitude, Mixpanel. Without this, half the metrics below are unobservable. Recommendation: PostHog for v1.

### Leading indicators (measured in first 30 days)

| Metric | Success | Stretch | Measurement |
|---|---|---|---|
| Registered accounts | 100 | 250 | Count of users who have signed up via herpetoverse.com or Herpetoverse mobile |
| Cross-registered with Tarantuverse | 40% of new *(requires cross-promo in §7 Q13)* | 60% of new | Joined on both brands |
| Animals added to collections | 300 | 700 | Total snake + lizard records |
| Morph calculator runs | 500 | 1500 | Unique users × sessions (counted via public endpoint) |
| Public care sheet pageviews | 5000 | 20000 | Google Analytics + PostHog on herpetoverse.com/care/* |
| Care sheet → signup conversion | 1.5% of unique visitors | 3% | (Signups from /care/* referrers) ÷ (unique /care/* visitors) |
| Care sheet Google-indexed | 18+ of 20 | all 20 + some ranking | Search Console |

### Lagging indicators (measured 60-90 days)

| Metric | Success | Stretch | Notes |
|---|---|---|---|
| DAU / MAU | 15% | 25% | Whether users come back |
| Care sheets ranking page 1 | 2+ long-tail | 2+ flagship + 5+ long-tail | For their target species name |
| Environment readings logged per active user per week | 3+ | 10+ | Indicates wedge 3 (env tracking) adoption |
| Morphs per breeder (animals with genotype records) | 60% of breeders | 85% | Indicates wedge 1 (morph genetics) adoption |
| Tarantuverse user churn rate | unchanged from baseline | unchanged | Herpetoverse launch should not cannibalize — requires §7 Q14 baseline |

### Failure modes to watch

- **Care sheets plateau at low traffic:** indicates SEO losing to ReptiFiles, or care sheets not good enough. Mitigation: iterate on content quality, add more species, build backlinks via Reddit outreach.
- **Morph calculator usage low:** indicates the breeder persona didn't show up, or calculator UX is bad. Mitigation: interview users, fix flows, promote to r/ballpython.
- **Environment readings adoption < 1/user/week:** indicates wedge 3 is not resonating. Mitigation: prioritize IoT integration earlier than planned.
- **Cross-register rate < 20%:** indicates Herpetoverse is acquiring pure reptile users but Tarantuverse users aren't crossing over, OR cross-promo wasn't landed. Fine on its own but signals the §7 Q13 in-app promo needs revisiting.
- **Welfare warning dismissal rate >80%:** suggests the language feels preachy. Revise copy; consult keepers.

---

## 7. Open Questions

### Resolved before this revision

- **Q1 (animal schema direction):** Resolved in ADR-002 §D1 — parallel tables (`tarantulas`, `snakes`, `lizards`). Not a rename, not a supertable, no `taxon` column on an animals table.
- **Q2 (component library):** Resolved in ADR-002 §D3 — copy-and-adapt for v1; re-evaluate at v1.1.

### Resolved 2026-04-20

- **Q4 (Phase 3.6 scheduling):** Accepted recommendation — complete Phase 3.6 theme preset system (May 8 target per SPRINT-theme-preset-system.md) before Herpetoverse Sprint 1. Herpetoverse Sprint 1 kicks off May 11. If Phase 3.6 slips, Herpetoverse start slips with it — no parallelization.
- **Q11 (domain):** `herpetoverse.com` owned by Cory. No backup needed. Unblocks branding + landing-page work.
- **Q12 (support plan):** Async-only via `support@tarantuverse.com` (covers both brands). Public FAQ + Help Center on each domain. 72-hour response SLA published on contact page. In-app help widget deferred to v1.1.
- **Q13 (cross-promotion):** Both (a) opt-in Tarantuverse dashboard banner announcing Herpetoverse AND (b) one-time launch email to existing TV users. Cross-promo mechanism must be live at launch — the 40% cross-register metric in §6 depends on it.
- **Q14 (TV baseline analytics):** Measure in Sprint 1–2. Required metrics: total user count, 30-day active users, 30-day churn rate, average session count per user. Baseline needed to validate §6 metrics comparatively.
- **Q15 (pricing):** Free at launch to maximize acquisition. Revisit pricing in v1.1 or v1.2 after retention data exists. Stripe setup shared with Tarantuverse if either brand eventually monetizes.
- **Q16 (analytics platform):** PostHog. Self-hostable, open-source core, scales down to free tier, integrates with Next.js + React Native. To be provisioned in Sprint 1.

### Blocking (still open)

3. **[Product / Design]** Brand identity for Herpetoverse — color palette, logo, visual direction. **Status: Cory will create and circulate.** Blocks web scaffold in Sprint 5. Target: final by Sprint 4 (Jul 3).

### Non-blocking (can resolve during implementation)

5. **[Content]** Final v1 species list — the 20 proposed are strong but selection depends on Cory + wife's priorities. Finalize in Sprint 3–4 without blocking backend.
6. **[Engineering]** Exact morph gene seed list for ball python and leopard gecko — community sources (MorphMarket, World of Ball Pythons) inform. Seed iteratively in Sprint 4.
7. **[Legal]** CITES disclaimer language and "check your state regulations" notice copy. Confirm with a lawyer if Herpetoverse ever adds transactional features (future non-goal). At launch, both are informational disclaimers.
8. **[Product]** First IoT integration (v1.1) — Govee (most consumer-adopted), SensorPush (breeder-preferred premium), or Inkbird (thermostat brand)? Post-launch user research.

---

## 8. Timeline Considerations

**Previous draft (10-week solo plan) was 40–50% under-scoped per review §8.** Realistic effort estimate totals 15.5–20.5 weeks; timeline is now scoped to **18 weeks** at the midpoint. Full sprint-by-sprint breakdown in `SPRINT-herpetoverse-v1.md`.

**Revised hard deadline:** Web soft-launch mid-September 2026 (Sprint 9 end). Mobile launch late September 2026 (end of buffer week, post Apple review).

**Derived gates (per SPRINT-herpetoverse-v1.md):**

- **Sprint 1 end (May 22)** — PRD/ADR alignment complete (this doc), domain registered, snake model + schemas ready
- **Sprint 2 end (Jun 5)** — All 14 polymorphic/additive migrations applied; zero Tarantuverse regressions verified
- **Sprint 3 end (Jun 19)** — Snake API surface complete; first pytest integration tests passing
- **Sprint 4 end (Jul 3)** — 25+ species seeded with wife-verified content; 40+ ball python genes with welfare flags
- **Sprint 5 end (Jul 17)** — Herpetoverse web dashboard + snake CRUD functional
- **Sprint 6 end (Jul 31)** — Public SEO care sheets live and indexable; forums adapted; search working
- **Sprint 7 end (Aug 14)** — Morph calculator shipped with welfare warnings + lethal-combo detection
- **Sprint 8 end (Aug 28)** — Mobile app at parity with web core flows
- **Sprint 9 end (Sep 11)** — Beta cohort complete, App Store submission uploaded
- **Buffer week (Sep 14–18)** — Apple review iteration + launch-day ops
- **Public launch: September 18, 2026**

**Dependencies:**

- Branding decisions (Q3) block Sprint 5. **Owner: Cory — in progress.**
- Phase 3.6 completion (Q4) blocks Sprint 1 start. **Locked: Sprint 1 begins May 11 assuming Phase 3.6 ships on schedule (May 8).**
- ADR-002 (Q1, Q2) — **resolved**, no longer blocking.
- Domain registration (Q11) — **resolved.** `herpetoverse.com` owned. Vercel project + DNS setup is a Sprint 1 task, not a dependency.
- Cross-promo mechanism (Q13) — **locked** as banner + one-time email. Build slots into Sprint 9 (launch prep).
- Baseline TV analytics (Q14) — **committed** to Sprint 1–2 measurement pass using PostHog (see Q16).
- Analytics platform (Q16) — **locked: PostHog.** Provisioning is a Sprint 1 task.

**Phasing if scope slips (cut order, per SPRINT §Stretch Items):**

1. **Cut stretch species first** — ship with 15 instead of 25. Fewer-but-better.
2. **Cut P1 features** — weight logs, brumation workflow UI, morph photo reference library (P1 is explicitly v1.1 territory already).
3. **Defer mobile by 2 weeks** — if Apple review iteration eats the buffer, web ships on schedule, mobile slips to early October.
4. **Reduce morph calculator species scope** — ball pythons only at launch; leopard gecko morphs in v1.1 patch. Loses one wedge half but preserves the other.
5. **Defer morph calculator to v1.1 (last resort)** — this is wedge 1; cutting it guts the value prop. Rather slip the overall launch 2 weeks than cut this.

**Non-starter:** launching without the morph calculator OR without environment readings. Those are the two wedges. Cutting either turns Herpetoverse into Reptile Logger with better branding — insufficient differentiation.

**Day 0 launch state (explicit, per review §8):**

- **Web:** dashboard + 15 species care sheets + morph calculator (ball python + leopard gecko) + environment readings + shed/feeding logs + keeper profiles + reused forums/DMs
- **Mobile:** all of web except advanced analytics (v1.1 patch)
- **v1.0.x weekly patches:** remaining species care sheets, brumation workflow, weight logs, morph photo library, v1.1 feature prep

---

## 9. Appendix

### A. Competitive positioning summary

| Competitor | Their strength | Their gap | Our move |
|---|---|---|---|
| ReptiFiles | Care sheet SEO (3M+ monthly visitors), Amazon affiliate revenue | No app, no tracking | Match their depth + integrate with tracking; **no affiliate links** (editorial integrity) |
| Reptile Logger | Mobile tracking, 4+ year history | Dated UI, no genetics, no public care sheets | Beat on UI/polish, add morph genetics wedge |
| Herp.io | Clean web tracker | No mobile-native, no morphs | Beat on mobile-first, add morph genetics wedge |
| MorphMarket | Classifieds, community, morph calculator (basic) | Not a husbandry tool | Stay out of classifieds; best the morph calculator with collection integration |
| WorldOfBallPythons | Morph calculator (comprehensive, ball python only) | Single species, ugly UI, not integrated | Launch leopard gecko support they don't have; beat on UX; add welfare warnings they don't have |
| Govee / SensorPush / Inkbird | Hardware + their own app | Siloed per vendor, not a keeper tool | Aggregate via v1.1 integrations; manual-entry first |

### B. Persona overlap with Tarantuverse

Current Tarantuverse user base (as of April 2026): mostly invertebrate hobbyists, age ~22-40, mixed experience levels. Overlap with reptile keeping is Cory's intuition at **15-25%** based on r/tarantulas and Arachnoboards thread scanning. **Validation recommended per review:** before Herpetoverse launch, add a single optional onboarding field at TV signup ("do you keep any reptiles?"), OR run a one-question email survey to existing TV users. Either is cheap and gives a real number to plan acquisition against. Target: executed by Sprint 2.

### C. Honesty-first implementation checklist

**Content & attribution:**

- [ ] Every AI-researched care sheet footer: "Researched with AI assistance, written and reviewed by [reviewer]. Sources: [count]. Last reviewed: [date]. Report an error → [link]"
- [ ] No verbatim copying from ReptiFiles or other care-sheet sites; similarity check run on every sheet pre-launch
- [ ] Each factual claim in a care sheet has its own source citation in `reptile_species.sources` where possible
- [ ] Community-submitted species + genes clearly marked `Unverified` until reviewed
- [ ] Image sources stored in `photo_licenses`; no unlicensed scrapes from any source

**Morph calculator:**

- [ ] Calculator output labeled "Probability distribution — actual clutches vary due to gene interactions not yet documented"
- [ ] Lethal homozygous combinations (Super Spider, Super Lesser, Super Butter, Super Mojave, Super Black Pastel) display a red banner warning with source citations
- [ ] Welfare-flagged genes (Spider, Woma, Champagne, HGW, Super Banana, Enigma) display a disclaimer at genotype input time: "This gene is associated with a documented neurological condition. Severity varies by individual. Ethical breeders increasingly choose not to produce this gene."
- [ ] Welfare warning language uses "associated with," "documented in," "reports suggest" — never "causes"
- [ ] Unverified community morph submissions display an explicit "Unverified — claimed by a single source, not independently confirmed" badge
- [ ] Calculator public endpoint rate-limited to 20 req/min per IP to prevent abuse

**IoT & sensors:**

- [ ] Landing page copy: "Manual entry today, automatic tomorrow" for environment tracking — do not imply sensor integration is live
- [ ] No predictive features in v1 (no shed prediction, no health warnings, no AI recommendations)

**Legal & conservation:**

- [ ] CITES appendix status linked to CITES.org official page; not paraphrased
- [ ] IUCN Red List status linked to IUCN Red List species page directly; we don't paraphrase conservation status
- [ ] "Check your state's fish & wildlife regulations" notice on every care sheet for US visitors, linking to F&W state contact directory
- [ ] `commonly_restricted_states` field **removed from v1** per review; replaced with generic notice

---

**Document status:** Revised per `REVIEW-PRD-herpetoverse-v1.md` and `ADR-002-taxon-discriminator.md`. Ready to drive Sprint 1 execution. All blocking open questions either resolved (Q1, Q2) or assigned to Sprint 1 (Q3, Q4, Q11, Q14, Q16).
