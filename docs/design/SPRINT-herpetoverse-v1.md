# Sprint Plan: Herpetoverse v1 Launch
**Dates:** 2026-05-11 — 2026-09-18 (18 weeks, nine 2-week cycles)
**Team:** 1 (Cory — solo full-stack)
**Parent docs:** `PRD-herpetoverse-v1.md`, `ADR-002-taxon-discriminator.md`, `REVIEW-PRD-herpetoverse-v1.md`
**Sprint Goal:** Ship Herpetoverse v1 as a sibling brand under the shared Tarantuverse backend — snake keepers can manage collections, log sheds/feedings, browse SEO-indexed care sheets, and use a welfare-first morph calculator, on web and mobile, without regressing Tarantuverse.

> **Estimation key:** 1 point = ~half day of focused solo-dev work. Planning at 70% capacity (solo dev, interruptions, context-switching variance). 18 weeks × 5 days × 70% = **63 effective days = 126 points total capacity.**
> **Scope reality:** The PRD review estimated 15.5–20.5 weeks of effort. This plan lands at the midpoint (18 weeks) by explicitly cutting lizards to v1.1 and deferring the shared component library to v1.2. Every stretch item is a cut-if-we-slip decision already made.

---

## Capacity

| Person | Available Days | Effective Days (70%) | Points | Notes |
|--------|---------------|----------------------|--------|-------|
| Cory | 90 | 63 | 126 | Solo — full-stack across mobile, API, web, content |
| **Total** | **90** | **63** | **126** | |

---

## Phase 0 — Sprint 1 (May 11–22): Foundation & Alignment

**Phase goal:** PRD and ADR are aligned on the separate-tables architecture. The `herpetoverse.com` domain resolves, Vercel project exists, and the first migration (snakes table) is written and reviewed.

### Sprint 1 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Revise PRD §5.1 and §5.2 to match ADR-002 (separate tables, polymorphic FKs) | 2 | Close the doc/decision drift the review flagged |
| P0 | Address the top 10 action items from `REVIEW-PRD-herpetoverse-v1.md` inline in PRD | 3 | Welfare gaps, researcher/lurker persona, content pipeline plagiarism guardrails |
| P0 | Register `herpetoverse.com`, configure DNS, create Vercel project pointed at same repo | 1 | New Next.js route group `(herpeto)` |
| P0 | Decide brand split approach: subdomain vs path-based vs separate deploy | 2 | Recommended: separate Vercel projects, shared monorepo, `X-Brand` header on API calls |
| P0 | Add `app_scope` middleware to FastAPI (header-based filter, default `tarantula`) | 2 | Pre-req for brand-scoped data isolation |
| P0 | Write Alembic migration: `add_snakes_table` | 2 | Follow ADR-002 §D1 model spec |
| P0 | Write SQLAlchemy `Snake` model + Pydantic schemas (Base, Create, Update, Response) | 2 | Mirror tarantula.py conventions |
| **Sprint 1 Total** | | **14** | |

### Sprint 1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Brand split architecture decision drags into implementation | Delays all downstream sprints | Time-box the decision to 1 day; default to separate Vercel projects if uncertain |
| Phase 3.6 (theme preset system) is still shipping when this kicks off | Context-switching cost, merge conflicts | Do not start Herpeto sprints until Phase 3.6 is signed off. Slip start date rather than parallelize. |

### Sprint 1 Definition of Done

- [ ] Revised PRD committed with ADR-002 alignment
- [ ] `herpetoverse.com` resolves to a placeholder Vercel deployment
- [ ] `app_scope` header middleware live in dev; existing Tarantuverse calls unaffected
- [ ] `snakes` migration written, reviewed, tested locally against a Neon branch
- [ ] `Snake` model + schemas pass a smoke test (create → read)

---

## Phase 1 — Sprint 2 (May 25–Jun 5): Polymorphic Primitives

**Phase goal:** The shared primitives the review flagged (`photos`, `qr_upload_sessions`, `offspring`) are extended to accept snake FKs. Shed logs table exists. No Tarantuverse regressions.

### Sprint 2 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Migration: `extend_photos_polymorphic` — add `snake_id` nullable FK + CHECK constraint matching feeding_logs pattern | 2 | Backfill not needed; existing rows keep `tarantula_id` |
| P0 | Migration: `extend_qr_upload_sessions_polymorphic` — add `snake_id` nullable FK + CHECK | 1 | |
| P0 | Migration: `extend_offspring_polymorphic` — add `snake_clutch_id` nullable FK + CHECK | 1 | Breeding extension — don't over-engineer yet |
| P0 | Migration: `add_shed_logs_table` | 1 | Polymorphic from day 1 (snake_id only for v1, lizard_id later) |
| P0 | `ShedLog` model + schemas + router with CRUD endpoints | 3 | Mirror molt_logs router |
| P0 | Update `Photo`, `QRUploadSession`, `Offspring` models with new nullable FKs and CHECK constraints | 2 | Pydantic validators to enforce "exactly one parent" |
| P0 | Regression smoke test: Tarantuverse add-tarantula, add-feeding, add-molt, add-photo still work end-to-end | 2 | Manual QA on existing prod deployment branch |
| P1 | Write `animal_genotypes` migration + `AnimalGenotype` model (data layer only, no router yet) | 2 | Unblocks morph calculator later |
| **Sprint 2 Total** | | **14** | |

### Sprint 2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CHECK constraint fails on production data due to edge-case rows | Migration blocks | Run `SELECT` pre-check in the migration script; if any row violates, log and exit with clear error |
| Pydantic validators let both parents slip through | Data integrity bug | Write failing test first; validator is a 3-line `@model_validator` |

### Sprint 2 Definition of Done

- [ ] All 4 migrations applied to local Neon branch
- [ ] Existing Tarantuverse flows regression-tested: no 500s, no data loss
- [ ] Shed log can be created against a snake_id; 400 if both/neither parent supplied
- [ ] `animal_genotypes` table exists; model + schema in codebase (router comes later)

---

## Phase 2 — Sprint 3 (Jun 8–19): Snake API Surface

**Phase goal:** Snake collection CRUD, feeding logs, and shed logs are fully wired through FastAPI routers. API docs reflect both taxa.

### Sprint 3 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | `snakes.py` router: GET list, POST create, GET detail, PUT update, DELETE — authenticated, user-scoped | 3 | Mirror tarantulas.py exactly |
| P0 | Extend `feedings.py` router to accept `snake_id` parent | 2 | Union type in Pydantic, branch on payload |
| P0 | `sheds.py` router: CRUD for shed logs (GET list for snake, POST, PUT, DELETE) | 2 | |
| P0 | Extend `photos.py` router to accept snake_id as parent | 1 | |
| P0 | Extend `qr.py` router: QR upload sessions for snakes | 2 | Public profile route `/s/{snake_id}` |
| P0 | OpenAPI docs reviewed at `/docs` — no broken schemas, both taxa represented | 1 | |
| P0 | Integration test suite (pytest) for snake CRUD + shed logs + polymorphic photo upload | 3 | First tests this codebase has had — keep scope small, focus on happy path + one 400 case each |
| **Sprint 3 Total** | | **14** | First time adding tests — expect overrun |

### Sprint 3 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| pytest setup is the first ever for this repo — infrastructure overhead | Test goal not met | Scope down: only 4 tests total (create snake, list snakes, create shed log, reject feeding log with both parents). Defer broader coverage to v1.1. |
| Polymorphic feedings router becomes tangled | Bug surface | Consider splitting into separate routers: `/tarantulas/{id}/feedings` and `/snakes/{id}/feedings` per REST convention. Decide in implementation. |

### Sprint 3 Definition of Done

- [ ] All snake CRUD endpoints live in staging, authenticated
- [ ] Can create shed log for a snake via API; can list sheds for a snake
- [ ] Public snake profile at `/s/{id}` returns a payload
- [ ] 4 passing pytest integration tests
- [ ] Swagger docs show both `Tarantula` and `Snake` schemas cleanly

---

## Phase 3 — Sprint 4 (Jun 22–Jul 3): Species Content + Genetics Data

**Phase goal:** 40 snake species seeded with care sheet data. Gene catalog for ball pythons with welfare flags. Content pipeline has a plagiarism-avoidance rubric.

### Sprint 4 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Migration: `add_snake_species_table` (separate from tarantula species, per ADR-002 §D2) | 1 | Parallel table — different fields (venom class, brumation, adult length vs leg span) |
| P0 | `SnakeSpecies` model + schemas | 1 | |
| P0 | Content pipeline rubric: source citation requirements, "in your own words" rule, reviewer sign-off step | 2 | Addresses review action item on plagiarism risk |
| P0 | Seed 20 beginner/intermediate species (ball python, corn snake, king snake varieties, hognose, boa) | 4 | Original care sheet text, 3+ sources per species, photo sourcing plan |
| P0 | Seed 20 advanced species (Brazilian rainbow boa, Amazon tree boa, various colubrids) | 4 | |
| P0 | Migration: `add_gene_definitions` table (for morph calculator) | 1 | Fields: `key`, `species_id`, `display_name`, `inheritance` (dominant/recessive/codominant/incomplete_dominant), `is_welfare_flagged`, `welfare_notes`, `lethal_homozygous` |
| P0 | Seed ball python gene catalog: 40 most common genes with welfare flags | 3 | Spider, Woma, Champagne, HGW flagged for neurological issues; Super Black Pastel / Super Cinnamon lethal; Caramel Albino kinked-tail risk |
| **Sprint 4 Total** | | **16** | **Over budget by 2 pts — content always slips. Carry stretch items into Sprint 5 buffer.** |

### Sprint 4 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Writing 40 original care sheets takes 2× estimate | Phase slips | Cut to 25 species for launch; flag the other 15 as "coming soon" on the discover page. Seed rest post-launch. |
| Welfare flag data is contested in the community | Reputational risk | Cite 3+ sources per flag (e.g., Roussel 2019 study for Spider wobble). Use language "associated with" not "causes." |
| Photo sourcing runs into copyright issues | Launch blocker | Default to illustration placeholders. Build partnerships with breeders who grant photo licenses (post-launch work). |

### Sprint 4 Definition of Done

- [ ] 25+ snake species in database with care sheets
- [ ] 40+ ball python genes in database with welfare flags
- [ ] Content rubric doc committed to `docs/content/care-sheet-rubric.md`
- [ ] Every species has 3+ cited sources in a `references` JSONB field
- [ ] Welfare-flagged genes have `welfare_notes` populated with specific concern + citation

---

## Phase 4 — Sprint 5 (Jul 6–17): Web Core Flows

**Phase goal:** Herpetoverse web app (under `herpetoverse.com`) has working auth, dashboard, and snake CRUD. Visually distinct from Tarantuverse but reuses adapted components.

### Sprint 5 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Scaffold `apps/web-herpeto` or route group `(herpeto)` — decision made in Sprint 1 | 1 | |
| P0 | Copy and adapt `Sidebar`, `TopBar`, `DashboardLayout` to Herpetoverse branding | 2 | Per ADR-002 §D3 — copy, don't share yet |
| P0 | Herpeto-branded landing page (`/`): hero, feature highlights, CTA to sign up | 2 | Brand palette: greens + earth tones (distinct from Tarantuverse purple/pink) |
| P0 | Auth pages: login, register (shared JWT with Tarantuverse via `X-Brand: herpetoverse` header) | 2 | Users sign up once, can use both apps |
| P0 | Dashboard: snake collection grid with feeding status badges | 3 | Adapt tarantula collection grid component |
| P0 | Add Snake form: species autocomplete, sex, hatch date, source breeder, weight, notes | 3 | Mirror add tarantula form |
| P0 | Snake detail page: basic info, photo, shed logs, feeding logs, edit/delete | 3 | |
| **Sprint 5 Total** | | **16** | Over budget — sprint 6 absorbs carryover |

### Sprint 5 Definition of Done

- [ ] User can register at herpetoverse.com, log in, and see empty dashboard
- [ ] User can add a snake with species autocomplete
- [ ] User can view snake detail page
- [ ] User can log a feeding or shed from detail page
- [ ] Light + dark mode both work (dark mode conformance per CLAUDE.md)

---

## Phase 5 — Sprint 6 (Jul 20–31): Web Polish + SEO Care Sheets

**Phase goal:** Public species care sheets indexable by Google, with structured data. Community + search work on Herpetoverse side.

### Sprint 6 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Public care sheet route: `/species/[slug]` — SSR, structured data (Article + FAQ schema.org) | 4 | SEO target: rank for "ball python care sheet," "corn snake humidity" |
| P0 | Species list page: `/species` — searchable, filterable by care level and type | 2 | |
| P0 | Sitemap.xml generation for all public species pages + public snake profiles | 1 | |
| P0 | robots.txt + OG meta tags | 1 | |
| P0 | Global search adapted for snake context (reuses `GlobalSearch.tsx`) | 2 | `X-Brand` filters results to snake taxa |
| P0 | Community forums adapted — same router, snake-focused default categories | 2 | Categories: Ball Pythons, Colubrids, Boas, Breeding, Husbandry, Off-Topic |
| P1 | Activity feed works for snakes (new shed, new feeding, milestone events) | 2 | |
| P1 | Carryover from Sprint 5 | 2 | Buffer — expect Sprint 5 to slip |
| **Sprint 6 Total** | | **16** | |

### Sprint 6 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google SSR care sheets don't index well due to thin content | SEO goal missed | Commit to 1500+ words per care sheet minimum. Validate with Google Search Console 2 weeks post-launch. |
| Forum category split between brands gets confusing | User confusion | Forums filtered by brand at router level via `X-Brand` header. Document this decision clearly. |

### Sprint 6 Definition of Done

- [ ] `/species/ball-python` renders with full care sheet, structured data, is crawlable
- [ ] Sitemap submitted to Google Search Console
- [ ] Forum works on Herpetoverse with snake-specific categories
- [ ] Global search returns snake results under the herpeto brand

---

## Phase 6 — Sprint 7 (Aug 3–14): Morph Calculator + Welfare UI

**Phase goal:** Morph calculator works for ball pythons — Punnett square math correct, welfare warnings prominent, lethal combinations called out.

### Sprint 7 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | `morph_calculator.py` service: Punnett math for dominant / recessive / codominant / incomplete-dominant gene pairs | 4 | Pure functions, unit-tested before UI wiring |
| P0 | Multi-gene combinations: up to 4 genes × 2 parents = 16 possible offspring genotypes | 2 | Combinatorial math; cap at 4 genes for v1 |
| P0 | Welfare warning overlay: red banner when pairing includes welfare-flagged gene | 2 | Review requirement |
| P0 | Lethal combo detection: warn loudly if offspring % includes lethal homozygous (Super Spider, etc.) | 2 | With refusal-to-show-percent option the user can toggle |
| P0 | API endpoint: `POST /morph-calculator/calculate` — takes two parent genotypes, returns offspring distribution + warnings | 2 | |
| P0 | Web UI: two parent pickers with gene multi-select, results table, welfare panel | 4 | Most design-heavy UI in the sprint |
| **Sprint 7 Total** | | **16** | |

### Sprint 7 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Punnett math is wrong for codominant edge cases | User trust lost on flagship feature | Write the unit tests FIRST against published morph calculators (reptilemaniacs.com, worldofballpythons.com). Treat their output as a regression oracle. |
| Welfare warnings feel preachy, users disable | Ethical aim defeated | Language test with 3-5 keepers: warnings should be informational, not moralizing. Use "associated with" not "causes." |

### Sprint 7 Definition of Done

- [ ] Morph calculator returns correct Punnett distribution for 10 sanity-check cross examples
- [ ] Welfare warning appears on all flagged gene pairings
- [ ] Lethal combo detection works for at least: Super Spider, Super Lesser, Super Butter, Super Black Pastel
- [ ] Web UI usable end-to-end; keyboard-accessible

---

## Phase 7 — Sprint 8 (Aug 17–28): Mobile App

**Phase goal:** Mobile app has snake parity with web core flows. Separate app identity, shared authentication.

### Sprint 8 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Decide mobile strategy: separate app build vs in-app brand toggle | 2 | Recommended: same codebase, brand-switcher in settings, separate App Store listing with different bundle ID |
| P0 | Brand-aware theming: ThemeContext extended with `brand` axis | 2 | Herpeto gets green palette; Tarantu keeps purple |
| P0 | Snake collection screen: list with photos + feeding status | 2 | Adapt existing tarantula collection |
| P0 | Snake detail screen: info, photos, shed logs, feeding logs | 3 | |
| P0 | Add snake form + add shed/feeding forms | 3 | |
| P0 | Species browser + care sheet viewer | 2 | Reuses species screen pattern |
| P0 | QR upload for snakes (camera + gallery) | 2 | Reuses existing QR sheet component |
| **Sprint 8 Total** | | **16** | |

### Sprint 8 Definition of Done

- [ ] Mobile app can switch brand or run as Herpeto build
- [ ] Add snake → log shed → view snake detail flow works end-to-end
- [ ] Dark mode + light mode both work on all new screens (per CLAUDE.md rule)
- [ ] QR upload works for snake photos

---

## Phase 8 — Sprint 9 (Aug 31–Sep 11): QA, Beta, Launch Prep

**Phase goal:** Beta cohort exercises the app for 5+ days. Critical bugs fixed. App Store submission prepared.

### Sprint 9 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Recruit 10–15 beta users from Arachnoboards + ball python subreddit | 2 | Offer: free lifetime premium for beta participation |
| P0 | TestFlight + Play Store internal testing setup for Herpeto mobile build | 2 | |
| P0 | Full regression QA: Tarantuverse web + mobile, Herpetoverse web + mobile, all combos of brand × mode × platform | 4 | |
| P0 | Fix bugs reported during beta (reserve 6 points for unknowns) | 6 | |
| P0 | App Store Connect listing: screenshots, description, keywords, category | 2 | |
| P1 | Content final pass: any seeded species missing photos/citations | 2 | |
| **Sprint 9 Total** | | **18** | **Highest risk sprint — overscoped by 4 pts on purpose because beta always surfaces work** |

### Sprint 9 Definition of Done

- [ ] 10+ beta users have used the app for 3+ days each
- [ ] No P0/P1 bugs open
- [ ] App Store submission uploaded
- [ ] Marketing landing page copy approved
- [ ] CLAUDE.md updated with Herpetoverse architecture section

---

## Buffer: Sep 14–18 (Week 18)

**Apple review + launch-day issues buffer.** 5 days reserved for:
- Apple review feedback iteration (expected 2–3 days review + 1 round of changes)
- Launch-day incident response (analytics dashboard monitoring, user-reported issues)
- Post-launch comms: Arachnoboards announcement, blog post, social

---

## Stretch Items (Cut if Any Sprint Slips)

| Item | Original Phase | Points | Why it's a stretch |
|------|----------------|--------|--------------------|
| Lizards (geckos, bearded dragons) | — | 40+ | Explicitly pushed to v1.1. Do not scope in v1. |
| Shared component library package | — | 15 | ADR-002 §D3 defers to v1.2 |
| Morph calculator for colubrid genes (corn snake, king snake) | 6 | 8 | Ball pythons only for v1; corn snake morphs launch with v1.1 |
| Breeding module for snakes (clutches, incubation, pip tracking) | — | 20 | Out of scope for v1; Phase 3 analog for snakes comes in v1.2 |
| Subspecies / locality tracking | 4 | 4 | Single species_id field for v1 |
| Weight chart / growth analytics for snakes | 7 | 4 | v1.1 — Tarantuverse analytics don't cleanly apply anyway |
| Brumation tracking UI (separate from basic `brumation_active` flag) | 5 | 3 | Field exists in schema; UI can follow |

---

## Key Dates

| Date | Milestone |
|------|-----------|
| May 11 | Sprint 1 kicks off — PRD alignment + foundation |
| May 22 | Snake model + schema ready |
| Jun 5 | All polymorphic migrations applied; zero Tarantu regressions |
| Jun 19 | Snake API surface complete; integration tests green |
| Jul 3 | 25+ species seeded; gene catalog with welfare flags complete |
| Jul 17 | Herpetoverse web dashboard + CRUD functional |
| Jul 31 | Public species care sheets live and indexable |
| Aug 14 | Morph calculator shipped with welfare warnings |
| Aug 28 | Mobile app at parity with web core flows |
| Sep 11 | Beta complete, submission uploaded |
| Sep 18 | **Herpetoverse v1 launched publicly** |

---

## Carryover Dependencies

This sprint plan assumes:

- **Phase 3.6 (theme preset system)** is fully shipped and stable before May 11. If Phase 3.6 slips, push start date rather than parallelize. Context-switching between two major architectural projects is the #1 risk flagged in the PRD review.
- **Tarantuverse v1.0 security and export infrastructure** is considered stable and does not need material work during this window.
- **Cory's availability assumes ~25 hrs/week.** Any sustained drop below 15 hrs/week shifts launch to Oct/Nov.

---

## Post-Launch: Measure (30 days)

| Metric | Target | Source |
|--------|--------|--------|
| New signups on herpetoverse.com | 500 | Analytics |
| Species care sheet page views | 5,000 | Analytics / Search Console |
| Care sheet avg dwell time | >90s | Analytics |
| Morph calculator uses | 200 | Analytics event |
| Welfare warning dismiss rate | <50% | Analytics event (proxy for whether it feels preachy) |
| Support tickets re: data issues | <10 | Email inbox |
| App Store rating | 4.0+ | Store listing |

Schedule 30-day review: **Oct 18, 2026.**

---

## Open Decisions Before Sprint 1 Kicks Off

1. **Subdomain vs separate Vercel project** for herpetoverse.com — recommend separate project
2. **Mobile: separate app or in-app brand toggle** — recommend separate App Store listing, shared codebase
3. **Beta recruitment channel** — Arachnoboards sister community? Ball python subreddit? Both?
4. **Morph calculator scope**: ball pythons only, or include corn snakes at launch? — recommend ball pythons only
5. **Photo sourcing strategy**: breeder partnerships or stock/illustration placeholders — recommend placeholders + partnership pipeline for post-launch

Document these in a follow-up ADR-003 before May 11 if not resolved during Sprint 1.
