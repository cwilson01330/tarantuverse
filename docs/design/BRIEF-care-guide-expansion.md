# Brief — Care guide DB expansion (next species, for a research+build agent)

**Status:** Ready for a research+build agent
**Date:** 2026-06-16
**Goal:** Roughly double the species catalog (~205 → ~400) in `invert_species`, optimized
for the fact that **care guides are now public-facing and used as a signup landing surface**
(SEO + conversion, not just an in-app reference).

---

## 0. Read this first — what changed the priorities

Care guides are now **public** and a **top-of-funnel acquisition surface**. That reorders
everything:

1. **A care page with no image ranks and converts badly.** **127 of 205 existing species
   have no `image_url`.** Backfilling images (with attribution) is arguably higher-impact
   than adding new species, and must run as a parallel workstream — see §2 P0.
2. **Prioritize by search volume / popularity**, not by filling a taxonomy. The agent should
   weight toward species people actually search and keep.
3. **Completeness and accuracy per page matter more than raw count.** A half-filled public
   page is worse than not having it. Every new row must be fully populated.
4. **Honesty is non-negotiable** (existing project principle). No fabricated care numbers, no
   guessed venom severities. Cite a source per species (`source_url`). When data is genuinely
   unknown, leave the field null rather than inventing — a null renders as "—", a wrong number
   can hurt an animal.

---

## 1. Current state (pulled from prod `invert_species`, 2026-06-16)

**205 species total:**

| Taxon | Count | Read |
|---|---:|---|
| tarantula | 147 | **Deep.** Popular beginners/intermediates essentially all covered (verified — see §4). |
| scorpion | 26 | Moderate. |
| centipede | 9 | Thin. |
| whip_spider | 6 | Thin. |
| roach | 6 | Thin. |
| mantis | 4 | **Very thin — and the flagship high-search species are missing.** |
| millipede | 3 | Very thin. |
| true_spider | 3 | **Very thin — jumping spiders are a booming search niche.** |
| vinegaroon | 1 | Effectively absent (only *Mastigoproctus giganteus*). |
| other | 0 | By design (freeform). |

**Key insight that should shape the whole effort:** the tarantula list is already deep on
the popular species, so adding more *popular tarantulas* mostly produces duplicates. The real
white space — and the best SEO opportunity because nobody else has good app care data for them
— is the **non-tarantula taxa and their flagship high-search species** (orchid mantis, devil's
flower mantis, jumping spiders, etc.). **Over-index the doubling on non-tarantula taxa.**

**Data-quality issues found (fix as part of this work):**
- 127/205 missing `image_url`.
- `growth_rate` is inconsistent free text: `fast`, `medium`, `medium to fast`, `medium-fast`,
  `moderate`, `moderate to fast`, `slow`, `slow to medium`, `slow-medium`, `very slow`, and a
  literal bug value **`** medium to fast`** (stray markdown). Normalize to a house vocabulary.
- `temperament` ranges from one-word tags (`docile`) to full sentences — inconsistent style.
- `type` has many combo values (`semi-arboreal`, `terrestrial/fossorial`, `scansorial`,
  `psammophile`) — acceptable but pick a consistent set.

---

## 2. Workstreams & priority

### P0 — Image + data-quality backfill on EXISTING rows (parallel, do not skip)
- Backfill `image_url` + `image_attribution` for the 127 missing. Public pages need them.
  Use only licensed/attributable images (Wikimedia Commons / CC, or owner-permissioned). Record
  the license + author in `image_attribution`. **Never hotlink or use unlicensed images** —
  this is a public commercial site.
- Normalize `growth_rate` to a fixed vocabulary (proposed: `slow`, `slow-medium`, `medium`,
  `medium-fast`, `fast`). Fix the `** medium to fast` row.
- Bring `temperament` to a consistent house style (recommend: a short tag phrase, lowercase,
  e.g. "docile, slow-moving" / "fast, defensive" — keep it scannable on a public card).

### P1 — New species, SEO-weighted, over-indexed on non-tarantula taxa
Target additions (~195 to roughly double). Suggested allocation:

| Taxon | Add ~ | Rationale |
|---|---:|---|
| true_spider (jumping spiders esp.) | 25 | Booming pet/search niche, near-zero competition in app care DBs |
| mantis | 25 | High search (orchid, devil's flower, ghost); currently only 4 |
| roach | 20 | Feeder + display crossover; high practical search |
| scorpion | 25 | Double; popular pet genus depth |
| tarantula | 35 | **Localities, dwarfs, deeper genus cuts — NOT the already-covered popular beginners** |
| millipede | 15 | Popular detritivores; currently 3 |
| centipede | 12 | Add high-search *Scolopendra* not yet covered |
| whip_spider | 10 | Amblypygi interest rising |
| vinegaroon | 5 | White space; tiny group but uncontested |

Tune as research dictates — the allocation is a starting weighting, not a quota.

---

## 3. Field spec — every new row must populate these

Write to **`invert_species`**. Required/expected fields (see live schema for full list):

**Identity & taxonomy:** `taxon` (lowercase, must be in the CHECK set — see §5), `scientific_name`,
`scientific_name_lower` (lowercase mirror — used for case-insensitive search; MUST be set),
`slug` (url-safe, used in public routes), `common_names` (text[]), `genus`, `family`, `order_name`.

**Care basics (controlled — match exactly):**
- `care_level` ∈ {`beginner`, `intermediate`, `advanced`}
- `feeding_mode` ∈ {`predator`, `detritivore`, `omnivore`} (millipedes = `detritivore`; most = `predator`)
- `venom_severity` ∈ {`mild`, `moderate`, `medically_significant`, null}

**Care free-text (match the normalized house style from §2):** `temperament`, `growth_rate`,
`type`, `webbing_amount`, `burrowing`.

**Husbandry numbers (null if genuinely unknown — do not invent):** `native_region`, `adult_size`,
`adult_length_min_mm`, `adult_length_max_mm`, `temperature_min/max`, `humidity_min/max`,
`enclosure_size_sling/juvenile/adult`, `substrate_depth`, `substrate_type`, `prey_size`,
`feeding_frequency_sling/juvenile/adult`, `water_dish_required`, `communal_suitable`.

**Safety (get these right — public + animal welfare):** `urticating_hairs` (New World tarantulas),
`medically_significant_venom`, `venom_severity`, `venom_notes`.

**Taxon-specific:** `developmental_class` (centipedes: `epimorphic`), `typical_segment_count`,
`typical_leg_pair_count` (centipede/millipede).

**Content & provenance:** `care_guide` (long-form, the body of the public page — this is the SEO
content; write it well), `image_url`, `image_attribution`, `source_url` (cite where the care data
came from), `is_verified` (set per your review policy).

---

## 4. Dedupe — the tarantula list is already deep

**Before adding any species, check it against the live table** (`scientific_name` /
`scientific_name_lower`). Verified-already-present and must NOT be re-added include the full
popular-beginner tarantula set: *Grammostola pulchra / pulchripes / rosea*, *Brachypelma hamorii /
smithi / emilia / boehmei / auratum / albiceps*, *Aphonopelma seemanni / chalcodes*, *Chromatopelma
cyaneopubescens*, *Caribena versicolor*, *Tliltocatl albopilosus / vagans*, *Lasiodora parahybana*,
*Acanthoscurria geniculata*, *Grammostola actaeon*, *Nhandu chromatus*, *Psalmopoeus irminia /
cambridgei*, *Pterinochilus murinus*, *Monocentropus balfouri*, *Poecilotheria metallica*,
*Theraphosa blondi / stirmi*, *Davus pentaloris*, *Cyriocosmus elegans*, *Homoeomma chilensis*,
*Thrixopelma ockerti*, *Xenesthis immanis*. New tarantulas should be localities, dwarfs, and
deeper genus cuts — and one real beginner gap: the **Euathlus** genus is entirely missing
(*Euathlus* sp. "red" / *E. parvulus* / *E. condorito* are popular beginners — add them).

---

## 5. Seeding mechanics & known traps (do not learn these the hard way)

- **Seeds run via the Render shell, not Alembic** (data, not schema). Write an **idempotent**
  seed script (upsert on `scientific_name_lower`) so re-runs don't duplicate. Follow the pattern
  of existing `seed_*_species.py` scripts.
- **`taxon` must be in the CHECK set** on `inverts` + `invert_species`:
  `tarantula, scorpion, centipede, whip_spider, vinegaroon, true_spider, millipede, mantis, roach, other`.
  Adding a *new* taxon is a migration (out of scope here — stay within these).
- **Validation patterns can 500 the list endpoint after a clean insert.** Schemas use
  `Field(pattern=)` / value-list regexes (`schemas/invert_species.py`) while the DB columns are
  plain VARCHAR — a value the DB accepts but the schema rejects will insert fine, then **break the
  whole `/invert-species/?taxon=` list response on GET**. Grep the schema's `pattern=` / allowed
  values and match them exactly before seeding. (This exact class of bug has bitten before.)
- **Watch VARCHAR caps** — some columns are tight (`VARCHAR(100)/(200)`). Long `native_region` or
  `adult_size` strings will error. Check column lengths before bulk insert.
- **`scientific_name_lower` and `slug` must be set** (search + public routing depend on them).
- **Confirm which table the public tarantula care pages read.** There is also a legacy `species`
  table (149 rows, tarantula-era). New tarantula care sheets go in `invert_species`, but if the
  public/tarantula care route still reads legacy `species`, new tarantulas won't appear there.
  **Verify the read path and seed/mirror accordingly** (the inverts consolidation dual-writes —
  check whether that still applies for new inserts or only covered the backfill).
- After seeding a batch: **GET the public list + a couple of detail pages** and confirm no 500s,
  images resolve, and fields render before moving on.

---

## 6. Suggested Batch 1 — high-SEO flagships, confirmed missing (build these first)

All verified absent from the live table as of 2026-06-16. These are high-search, high-popularity,
and give the biggest public-landing return per page.

**Mantis (flagships, all missing):** *Hymenopus coronatus* (orchid — huge search), *Idolomantis
diabolica* (devil's flower), *Phyllocrania paradoxa* (ghost — currently only genus-thin), *Creobroter
gemmatus* (jeweled flower), *Pseudocreobotra wahlbergii* (spiny flower), *Gongylus gongylodes*
(wandering violin), *Stagmomantis carolina* (native US), *Tenodera sinensis* (Chinese), *Blepharopsis
mendica*.

**Jumping / true spiders (booming niche, all missing):** *Phidippus johnsoni*, *Phidippus mystaceus*,
*Phidippus putnami*, *Hyllus diardi*, *Salticus scenicus*, plus *Hogna* (wolf) and another *Heteropoda*.

**Roach (display + feeder):** *Blaberus craniifer* (death's head), *Blaberus giganteus*, *Archimandrita
tessellata* (peppered), *Panchlora nivea* (banana/green), *Elliptorhina* (Halloween hisser), *Gyna lurida*
(porcelain).

**Millipede:** *Orthoporus ornatus* (desert), *Anadenobolus monilicornis* (bumblebee), *Narceus
gordanus*, *Trigoniulus corallinus* (rusty), *Telodeinopus aoutii*.

**Centipede:** *Scolopendra hardwickei* (Indian tiger — very high search), *Scolopendra morsitans*,
*Ethmostigmus rubripes*, *Scolopendra galapagoensis*.

**Whip spider:** *Phrynus barbadensis*, *Heterophrynus longicornis*, *Paraphrynus laevifrons*.

**Tarantula (real gaps, not the covered beginners):** *Euathlus* sp. "red", *Euathlus parvulus*
(genus entirely missing), plus localities/dwarfs your research surfaces (e.g. *Hapalopus* sp.
variants, *Pamphobeteus* localities, *Cyriocosmus* spp.).

**Scorpion:** depth on popular pet genera — *Pandinus dictator*, more *Heterometrus*, *Euscorpius*
spp., *Hadogenes* spp. (verify against the 26 already present first).

After Batch 1, continue with the §2 allocation, dedupe-checking each name against the live table.

---

## 7. Process per species (how the agent should work)

1. Pick from the priority list; **dedupe-check** against `invert_species` first.
2. Research from reputable sources (keeper databases, peer care sheets, scientific refs). Capture
   a `source_url`.
3. Fill **every** field in §3; null only what's genuinely unknown. Get safety fields right.
4. Source a **licensed image** + attribution.
5. Write a real `care_guide` body (this is the public SEO content — make it genuinely useful, not
   boilerplate).
6. Match controlled vocab + schema patterns (§5) exactly.
7. Add to the idempotent seed script; seed a batch via Render shell.
8. **Verify**: GET the public list + sample detail pages, confirm no 500s and images render.

---

## 8. Acceptance criteria

- [ ] Catalog roughly doubled (~205 → ~400), weighted per §2 (non-tarantula taxa over-indexed).
- [ ] **Zero new rows with a null `image_url`**, and the 127 existing nulls backfilled (with attribution).
- [ ] No fabricated care/safety data; every species has a `source_url`; unknowns are null, not invented.
- [ ] `growth_rate` normalized (incl. the `** medium to fast` bug fixed); `temperament` consistent style.
- [ ] No duplicates (dedupe-checked on `scientific_name_lower`).
- [ ] `scientific_name_lower` + `slug` set on every row; controlled vocab + schema patterns matched.
- [ ] Public list endpoint + sample detail pages return 200 with images after each batch (no 500s).
- [ ] Legacy `species` read-path question resolved for tarantulas (§5).
- [ ] Seed script idempotent; safe to re-run.
