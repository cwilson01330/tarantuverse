# Review — PRD-herpetoverse-v1.md

**Reviewer:** Claude (critical pass)
**Date:** 2026-04-20
**PRD version reviewed:** Draft, 503 lines, created 2026-04-20
**ADR-002 direction (per Cory, 2026-04-20):** Keep `tarantulas` + add `snakes` / `lizards` as separate tables

---

## Summary verdict

The PRD is a strong strategic draft. The problem framing, competitive positioning, wedge selection (morph genetics + environment tracking + SEO care sheets), and honesty-first checklist are all well-reasoned. The three-persona model, non-goals, and phasing guidance in §8 are unusually disciplined.

Three categories of concern to resolve before implementation:

1. **Schema section (§5.1–§5.2) is partly wrong under the chosen ADR direction** and partly understates the duplication cost, while also partly overstating the migration work because it misses that several primitives are already cross-taxa.
2. **Timeline (§8) is aggressive-to-unrealistic** for solo-dev scope as currently scoped.
3. **Several honesty-first concerns** inside the morph calculator and care-sheet content pipeline are not yet addressed in the §9.C checklist.

Everything else is polish. Detailed notes below, section by section.

---

## §1 — Problem Statement

**Strong.** Gap analysis is accurate. Three pains are well-chosen.

**Minor:** Subreddit subscriber counts (240K / 250K / 1.1M) are soft evidence — subs ≠ app users and many are lurkers. A stronger secondary data point would be MorphMarket's public breeder count (if available) or Reptile Logger's App Store review volume (visible via Sensor Tower or AppFollow). Not blocking.

**Verify before citing:** "Tarantuverse feeder module was deliberately designed as a cross-taxa primitive so snakes and lizards can consume crickets/roaches/mealworms from the same colony model. That work is done." — **Confirmed via code inspection.** `feeder_colonies` is user-scoped with zero taxon coupling, and `enclosures.purpose` is already an extensible discriminator. This claim holds up.

---

## §2 — Goals & success framing

**Success framing assumptions to test:**

- **"At least 100 registered accounts in 60 days"** — achievable only with a marketing push. Herpetoverse starts from zero audience. Tarantuverse's current user count is not stated in the PRD or in CLAUDE.md — if TV is <500 users, the "40% cross-register" subgoal implies 40 users from that base, which is ~8% cross-app conversion. That's high for any dual-product launch without an in-app prompt or email campaign. **Add:** a specific cross-promotion mechanism (in-Tarantuverse banner, one-time email to TV users) as a pre-requisite, otherwise 40% is aspirational.
- **"At least two care sheets ranking on page 1 of Google in 60 days"** — SEO is notoriously slow. ReptiFiles has years of backlinks and domain authority we cannot replicate in 60 days. Page-1 ranking in 60 days is plausible only for (a) long-tail, multi-word queries like "children's python care sheet" — not flagship terms like "ball python care". Reframe as stretch/aspirational: "top 20 for flagship terms, page 1 for 2+ long-tail terms" is more honest.
- **"500 morph calculator runs in 60 days"** — plausible with r/ballpython cross-post. Keep.

**Missing:** No success metric for **public care sheet → app signup conversion**. The care sheets are a top-of-funnel asset; the CTA "Track your [species] in Herpetoverse" needs a conversion target. Even a directional one (e.g. 2% of unique visitors → signup) would let you judge whether the care-sheet funnel is working.

---

## §3 — Non-Goals

**Well-scoped.** Each non-goal is defended with a reason. Rare in PRDs.

**Add explicitly:** "No rodent colony tracking in v1" — this is mentioned in §5.9 but deserves elevation to §3 so it's non-negotiable at the top. Breeders will ask.

**Tension to flag:** §3.3 says "No IoT hardware integrations in v1" while §6 failure-mode mitigation says "prioritize IoT integration earlier than planned" if wedge 3 doesn't resonate. That's internally consistent (architecture-ready, integrations later) but the landing page copy must not imply sensor support exists. The honesty checklist covers this. Good.

---

## §4 — User Stories & personas

**Marcus is too-senior for a "primary" persona.** 8 ball pythons + 4 leopard geckos + breeding both is a power user, not a mainstream target. If Marcus is the primary persona, the majority of actual users (3–5 animals, not breeding) are unrepresented. Two options:

- **Option A:** Keep Marcus as aspirational / power user, add a new primary persona: "Dan, 2 ball pythons, learning the hobby, no morph interest yet." Morph calculator becomes a wedge for *some* users (Marcus-tier), not the central experience.
- **Option B:** Keep Marcus as primary if the product positioning is "serious keeper tool." Be explicit that casual single-keeper use is a lesser priority.

Either is defensible. Pick one and own it — the current draft implies Marcus is primary while Ana is "secondary dedicated single-keeper," which does cover both but makes persona weights unclear.

**Missing persona — the lurker / researcher.** Someone who visits a care sheet without ever signing up is the majority of SEO traffic and drives the content-quality bar. Add:

> **Tertiary persona — The researcher ("Sam," considering a leopard gecko, hasn't bought one yet)**
> - As a researcher, I want to land on a comprehensive leopard gecko care sheet and understand if I can commit to the husbandry before I buy an animal, so I don't rehome an animal I shouldn't have gotten.
> - As a researcher, I should not be gated behind signup to read the care sheet.

This persona directly affects care-sheet design decisions (signup wall, CTAs, content depth) and is currently invisible in §4.

**Edge cases — strong.** The "possible het" distinction and the "clutch produced unexpected morphs" case are exactly the right edge cases for the genetics engine.

---

## §5.1 — Taxon Discriminator Schema

⚠️ **This section needs a rewrite under the chosen ADR direction.** It currently describes a rename-or-view approach; Cory's lean is separate tables. Proposed replacement:

**Under separate-tables direction, §5.1 should say:**

New tables:
- `snakes` — parallel to `tarantulas`, shares the husbandry fields that apply (name, sex, date_acquired, source, price_paid, notes, photo_url, species_id, enclosure relationship). Adds: `genotype` handled via `animal_genotypes` (§5.4).
- `lizards` — parallel structure. Adds reptile-specific fields: `length_cm` (current), `uvb_setup_id` (optional FK to a uvb_bulb_logs record), etc.

**Cross-taxa primitives already exist — do NOT re-migrate:**
- `enclosures.purpose` — extend the enum: `'tarantula' | 'feeder' | 'snake' | 'lizard'`. No new table.
- `feeder_colonies` — already user-scoped, zero changes needed.
- `feeding_logs` — already polymorphic via `(tarantula_id NULL OR enclosure_id NOT NULL)` check constraint. **Reptile feedings can route through `enclosure_id` with no schema change.** If the team wants a direct `snake_id` / `lizard_id` FK, add nullable FK columns and extend the check constraint — still a minimal migration.
- `photos` — currently tarantula-only (`tarantula_id` not nullable). **Needs work under separate tables:** either add nullable `snake_id` / `lizard_id` columns + check constraint, OR introduce a polymorphic `subject_type`/`subject_id` pattern. Lean toward the former for consistency with feeding_logs.
- `qr_upload_sessions` — same as photos. Nullable taxon-specific FKs + check constraint.
- `offspring` — same. The breeding module currently has `tarantula_id` nullable on offspring (becomes-a-tarantula case). Add `snake_id` / `lizard_id` nullable.
- `pairings`, `egg_sacs` — these are user-scoped + reference tarantulas via `male_id` / `female_id`. Under separate-tables, either (a) create `reptile_pairings` / `reptile_clutches` parallel tables, or (b) add nullable `snake_male_id` / `snake_female_id` / `lizard_male_id` / `lizard_female_id` to the existing pairings table. **Parallel tables are cleaner** — breeding semantics differ enough (clutches vs. slings, incubation temperature matters for reptiles) that forcing them into one model adds noise.

**Flag in PRD:** the separate-tables direction does NOT require a `taxon` column on `animals` (because `animals` no longer exists as a table). The "taxon" is implicit via which table you're querying. Every section that mentions `taxon` as a column reference should be rewritten.

**Architectural consequence that must be acknowledged:** Under separate-tables, every cross-taxa query (activity feed, global search, unified keeper profile) becomes a UNION across 2–3 tables. Performance is fine at low volume; it gets ugly at scale. If Herpetoverse exceeds, say, 10K animals, consider revisiting this decision. Worth a sentence in the PRD.

---

## §5.2 — Reptile Husbandry Logs

**`shed_logs`** — model is right. Under separate-tables, add nullable `snake_id` + `lizard_id` with a check constraint (matching the feeding_logs pattern).

**`feeding_logs` extension** — good. Three new nullable columns (`prey_type`, `prey_size`, `prey_count`) do not require a major migration. But: the PRD implies reptile feedings will use the extended columns; make it explicit that **reptile feedings are routed via `enclosure_id` OR new nullable `snake_id` / `lizard_id`** — the PRD currently implies a column-level split which isn't the actual schema shape.

**`environment_readings`** — schema is right. Add a note: under separate-tables, the FK is `enclosure_id`, which works for snakes + lizards that each live in one enclosure. For tarantulas, `environment_readings` is optional (they have target ranges but no time-series reading history today). Clarify whether Tarantuverse gains this table too or it's Herpetoverse-only. Current PRD is ambiguous.

**`uvb_bulb_logs`** — good, reptile-specific, uncontroversial.

**Missing log type:** **`handling_logs`** — for reptiles, how often an animal is handled matters for temperament tracking, stress assessment, and feeding-response-after-handling analysis. Not P0, but at least a P1 open question. Mention in §5.10 or as a future P2.

---

## §5.3 — Reptile Species Data Model

**Field set is comprehensive.** The richness relative to tarantula species is justified.

**Concerns:**

1. **`commonly_restricted_states` is a footgun.** A keeper relies on this field and gets fined because they moved states and we hadn't updated the entry. The "informational, not legal advice" label helps but does not eliminate liability. **Recommendation:** either cut this field from v1 and direct users to external authoritative sources (e.g. "Check your state's fish & wildlife regulations"), or store a last-verified date per entry so stale data is obvious. The latter is more useful but requires ongoing review cycles.

2. **Content pipeline plagiarism risk.** "AI-assisted first pass, cross-referenced against ReptiFiles + published care guides" is precisely the pattern that generates derivative content. If Herpetoverse content reads like ReptiFiles with the names changed, legal and reputational exposure are both real. **Add to §5.3:**
   - Explicit "no verbatim copying" rule
   - Original sourcing where possible (primary research papers, species-expert interviews, Cory's wife's domain expertise)
   - Each sheet cites its own sources — not "as compiled from [list of care sites]" but specific citations per claim where possible
   - Wife-reviewed means wife-rewrites-if-needed, not just approves

3. **Content volume estimate.** 20–25 care sheets × full depth × wife-review = substantial content work. Rough estimate: 2–4 hours per sheet for draft + 1 hour review = 60–125 hours total. Sprint timeline (§8) does not visibly allocate this. **Flag: content is a 2-week solo effort even with AI assistance; more if wife has limited review capacity.**

4. **Field set is missing:** `wild_population_status` (IUCN red list status) — some species in the seed list (e.g., ball pythons) have wild population concerns. Relevant for ethical sourcing discussion.

5. **Seed list review:**
   - Kingsnakes (*Lampropeltis californiae*) — generally fine but some subspecies eat other snakes; note under feeding or skip.
   - Carpet python (*Morelia spilota*) — listed as stretch. It's large and dedicated keepers want it. Consider v1 inclusion.
   - Chinese water dragon — advanced, good to include for scope demonstration.
   - **Missing from v1 lizard list:** *Varanus acanthurus* (ackie monitor) — popular advanced keeper species, would add credibility with the serious-keeper crowd. Stretch candidate.

6. **Common-name slug collisions not addressed.** "Water dragon" can refer to *Physignathus cocincinus* (Chinese) or *Intellagama lesueurii* (Australian). If both exist in the catalog, `/care/water-dragon` needs a disambiguation rule. Spec it: first-registered-wins, or always scope by scientific-name slug as the canonical and common-name slug as a 301 redirect.

---

## §5.4 — Morph Genetics Engine

**Data model is correct.** Punnett calculation is straightforward.

**Honesty-first gaps that should be in §9.C:**

1. **Lethal gene homozygous combinations** — several ball python morphs have known lethal or severely deleterious homozygous expressions (Super Spider has never been produced alive, Super Lesser / Super Butter are lethal, Super Cinnamon and Super Black Pastel are often non-viable). The calculator must warn when an output combination is a known lethal or welfare-negative homozygous. **This is a welfare-critical feature, not a polish feature.** Without it, a novice breeder plans a pairing and produces dead hatchlings.

2. **Welfare-flagged genes** (Spider / Woma / Champagne / HGW / Super Banana) have documented neurological issues ("wobble"). Ethical breeders increasingly don't produce these. The calculator should flag them at input time: "Spider carries a documented neurological condition. Consider not breeding this animal." Not a blocker, but a soft prompt is cheap and signals ethics.

3. **Codominant vs incomplete-dominant terminology.** The hobby uses "codominant" loosely; genetically most ball python codoms are incomplete dominant (Pastel × wild-type produces a distinct intermediate). The PRD uses both terms. Pick incomplete-dominant as the technically-correct term, acknowledge the hobby uses "codominant," and keep the `gene_type` enum as `'codominant'` for hobbyist-recognizability. Add a footnote in UI: "Codominant genes shown here are technically incomplete dominant."

4. **Unproven morph claims.** New morphs are routinely claimed by a single breeder and later turn out to be polygenic line breeding (not a single gene) or unreproducible. The `is_verified` flag addresses this but needs a visible UI affordance: "Unverified — claimed by a single breeder, not yet independently confirmed." Otherwise users treat the calculator output as authoritative.

5. **Calculator public endpoint rate limiting.** `POST /morphs/calculate` is public, no auth. Rate limit aggressively (20 req/min per IP?) or a bot will blow through.

---

## §5.5 — Public SEO Care Sheets

**Implementation plan is sound.** SSR + structured data + canonical URLs = table stakes.

**Gaps:**

1. **Signup gating.** PRD doesn't explicitly say the care sheets are paywall-free. They should be — gating SEO content defeats its purpose. Confirm and write it down.
2. **Image sourcing + licensing.** Care sheet hero images and inline photos need licensed or original sources. Stock sites (iStock, Shutterstock) are the safe path. User-submitted photos are free but need explicit upload consent + license assignment. Unsplash has some reptile photos under CC0 but selection is limited. **Spec needed:** where do v1 hero images come from? Who owns the license?
3. **Localization / unit preferences.** "Temperature 75–85°F" is USD-centric; half of Europe and the UK want °C. This is easy to handle (per-species fields stored in F, rendered in user's preferred unit with a site-wide toggle) but needs to be in v1 or the metric-unit audience bounces. For public care sheets, default to both units or detect by IP / Accept-Language.
4. **Sitemap + SEO monitoring.** Sitemap generation is mentioned; add: submit to Google Search Console, set up weekly rank-tracking (SEMrush / Ahrefs / Mangools) so you know if you're ranking. Otherwise the success metric "2+ care sheets on page 1" is immeasurable.

---

## §5.6 — Web App

**Architecture is right.** Separate Next.js app, separate Vercel project, shared backend.

**Ops cost to acknowledge:**

- Two Vercel projects = two sets of env vars, two deploy pipelines, two Sentry projects (if used), two domains with separate SSL certs (Vercel handles but worth mentioning), potentially two Stripe accounts if pricing forks.
- Shared package vs copy-and-adapt for component library — ADR-002 will resolve. **Lean recommendation:** copy-and-adapt for v1 (faster, no build-tooling for package publishing), refactor to shared package in v1.1 if the maintenance burden materializes. Premature sharing is its own cost.

**Missing route:** `/care` index page. PRD specifies `/care/[slug]` but not `/care` (the listing). Users landing on SEO care sheets will browse other species; give them a hub.

**Missing route:** `/morphs/calculator` publicly (no auth). If the calculator is a wedge feature, it should be a public demo with "save to pairing" gated behind signup. The PRD implies it's under `/dashboard/morphs/calculator` (auth-gated). Decide: public-with-save-gated vs fully auth-gated. Public drives signups; auth-gated loses the SEO hit.

---

## §5.7 — Mobile App

**Apple timeline is the single biggest schedule risk.** PRD acknowledges but understates:

- First submission of a brand-new app, not an update, **historically takes 2–7 days for first review and is frequently rejected** on first pass (trivial issues like missing privacy labels, unclear login flow, missing "restore purchases" if any IAP exists). Plan for 2 review cycles.
- **Separate App Store Connect listing** = new bundle ID, new push notification certificates, new screenshots (required sizes: iPhone 6.7", iPhone 6.1", iPad), new privacy label review. This is ~1 day of setup work plus content production.
- Play Store is faster (hours to 1 day review) but requires closed-testing cohort before production on new accounts now.

**Recommendation:** push mobile hard gate from week 7 to week 6. That gives 4 weeks of review buffer to hit the July 2026 mobile launch. Even so, July launch is optimistic.

**Missing:** EAS Build credentials setup for a separate EAS project — 1–2 hours with some friction.

---

## §5.8 — Activity Feed + DM

**Good.** Reuse is correct. The per-app filter on `taxon_scope` is the right primitive.

**Edge case to spec:** what happens to an activity event from a user who has both Herpetoverse and Tarantuverse, and the event is a cross-taxa action (e.g., "logged feeding from cricket colony to X")? `taxon_scope` must support multi-valued or fall back to "show in both apps." Current PRD implies single-valued. Recommend: `taxon_scope` is an array of taxa.

---

## §5.9 — Feeder Module Cross-App Access

**Claim verified against code.** `feeder_colonies.user_id` with no taxon coupling + `enclosures.purpose` discriminator = no schema changes needed. Herpetoverse web/mobile just queries the existing endpoints filtered by `purpose='feeder'` and gets the user's colonies. Correct as written.

**Add explicitly:** mammalian prey (mice/rats) is out of v1 scope. Already implied. Elevate to non-goal.

---

## §5.10–§5.18 — Should-Have / Future

**Well-prioritized.** Weight logs, brumation, morph photo library are correctly P1.

**Add:** **Rehome / ownership transfer** for reptiles. Snake and lizard rehoming is common (estate sales, breeder retirements). Tarantuverse doesn't have this and keepers work around it by deleting + re-adding. Herpetoverse is a good place to get this right. P2 candidate.

---

## §6 — Success Metrics

**Definitions needed:**

- **"Active user"** — DAU, WAU, MAU? What qualifies (login? log entry?). Define once, use consistently.
- **"Breeder"** — someone who has created a pairing record? Has more than 1 animal of opposite sexes? Explicit definition required for the "60% of breeders" metric to be measurable.
- **"Tarantuverse user churn rate unchanged"** — need a baseline churn measurement first. If one isn't established in TV analytics, this metric is unobservable. **Action:** measure TV 30-day churn baseline before Herpetoverse launch.

**Tracking infrastructure:** Google Analytics is mentioned for care-sheet pageviews. For in-app events (calculator runs, readings logged, feedings logged), what's the analytics pipeline? Rely on API request logs? A dedicated events table? Posthog / Amplitude / Mixpanel? **Decide and write down.** Without this, half the success metrics are unobservable.

---

## §7 — Open Questions

**Good list.** Additions:

- **Q11: Domain availability.** Is `herpetoverse.com` registered? Available? If owned, by whom? If not, what's the backup (`herpetoverse.app`)? Blocks branding + landing-page work.
- **Q12: Support burden.** Solo dev + launched second product = 2x the "I can't log in" queue. What's the support plan? Help center? Async-only via email? In-app help widget? Expectation on response time? **Strongly recommended:** set expectations publicly ("we respond to support within 72 hours") and have a FAQ before launch, not after.
- **Q13: Announcement plan.** How does Cory tell Tarantuverse users Herpetoverse exists? In-app banner? One-time email? Social post? Quietly without cross-promo? This directly drives the 40% cross-register metric and cannot be a week-10 afterthought.
- **Q14: Baseline TV analytics.** Before launch, measure TV: total user count, 30-day active, 30-day churn. Needed to evaluate §6 metrics.
- **Q15: Stripe / payments.** If Herpetoverse has a subscription tier at launch, separate Stripe product or shared? If free at launch, what's the v1.1 monetization plan?

**Updates to existing questions:**

- **Q1 + Q2** — partially resolved by Cory (separate tables; component library open). ADR-002 can focus on the details and cross-table concerns rather than the top-level direction.
- **Q4 (Phase 3.6)** — recommended resolution: **complete Phase 3.6 before Herpetoverse work.** Reasons: (a) theme preset system is architecturally relevant to Herpetoverse (distinct brand = distinct preset), (b) context-switching mid-theme-refactor is expensive, (c) Phase 3.6 is scoped at ~28 pts = ~4 weeks of a 10-week Herpetoverse sprint. Either finish 3.6 by end of April (4 weeks if starting now) and start Herpetoverse May 1, or explicitly defer 3.6 to v1.1 of Herpetoverse.

---

## §8 — Timeline

**10 weeks is aggressive-to-unrealistic for the scope as currently described.** Rough breakdown of solo-dev effort:

| Workstream | Estimate (weeks) |
|---|---|
| Backend — schema + migrations (snakes/lizards/shed_logs/env_readings/uvb/genes/animal_genotypes tables; feeding_log + photo + qr + offspring polymorphic extensions) | 2–3 |
| Backend — API routes + business logic (morph calculator is non-trivial; env reading aggregations; breeding adaptations) | 1.5–2 |
| Web — new Next.js app scaffold + branding + theme preset integration | 1 |
| Web — dashboard, animal detail, add/edit, morph calculator UI, env reading entry, care sheet SSR + structured data | 3–4 |
| Mobile — new Expo app scaffold + branding + theme preset integration | 1 |
| Mobile — tabs, screens, morph calc mobile, env entry, DM, feed | 2–3 |
| Species content — 20 sheets × research + draft + wife-review + publish | 2 |
| Gene data entry — ball python ~50 + leopard gecko ~30 + interaction logic verification | 0.5–1 |
| Ops — Vercel setup, domain, DNS, SSL, separate EAS, App Store Connect, Play Console | 0.5 |
| QA / polish / bug bash | 1 |
| App Store + Play review cycles (not dev time, but calendar blocker for mobile launch) | 1–2 |
| **Total** | **15.5–20.5** |

The 10-week plan requires **a 40% schedule compression** which is the boundary of feasible for one person in continuous flow with no interruptions, no bug fixes to tarantuverse.com, no support queue, and no life events. Practical outcomes:

- **Web at end of June 2026** — plausible if you cut scope: reduce species to 10–12, skip mobile entirely, defer morph calculator polish (but not its existence), defer env_readings trend charts to v1.1.
- **Mobile end of July 2026** — not plausible with current scope unless mobile is feature-reduced at launch.

**Recommendation:** restructure §8 into a tighter web-first v1.0 (end of June) and a v1.1 mobile launch (mid-late August). Promise what you can build and ship; under-promise publicly so the launch lands as "this is polished" not "this is rough." The competitive position is earned by shipping something solid, not by shipping fast.

**Also missing from §8:** a "what ships on day 0" skinny line. The gates describe feature completion; they don't describe launch-day state. Be explicit: "Day 0 web launch = dashboard + 10 species + morph calculator + env readings + public care sheets. Mobile + remaining species + breeding adaptation follow in v1.0.x weekly patches."

---

## §9 — Appendix

**§9.A (Competitive positioning):** solid. Add one row:

| Competitor | Strength | Gap | Our move |
|---|---|---|---|
| **Reptifiles Amazon affiliate network** | Monetization via gear links | Not an app | **Do not replicate** — staying out of affiliate recommends until we have editorial standards to defend them |

**§9.B (Persona overlap):** the 15–25% overlap estimate is Cory's intuition; worth validating by (a) adding a single optional field at TV signup ("do you keep any reptiles?") or (b) running a TV email survey before Herpetoverse launch. One-question surveys get 20%+ response rates and this is the cheapest audience validation available.

**§9.C (Honesty-first checklist):** Add:

- [ ] Morph calculator warns when an output combination is a known lethal homozygous (Super Spider, Super Lesser, Super Butter, etc.) with specific text
- [ ] Welfare-flagged morphs (Spider, Woma, Champagne, HGW) show a disclaimer at genotype input: "This gene carries a documented neurological condition."
- [ ] Unverified community morph submissions display an explicit "Unverified — claimed by a single source, not independently confirmed" badge
- [ ] Care sheet content has no verbatim copying from ReptiFiles or other care sites; each factual claim has its own source citation where possible
- [ ] `commonly_restricted_states` (if retained) has a last-verified date and a "laws change — verify with your state" footnote on every display
- [ ] IUCN / CITES status is linked to IUCN Red List pages directly; we don't paraphrase conservation status

---

## Top 10 action items for Cory

Ranked by blocking-ness.

1. **Rewrite §5.1** under separate-tables direction. The current text is wrong for the chosen architecture. (Blocks ADR-002.)
2. **Update §5.2** to reflect that feeding_logs + enclosures are already cross-taxa; specify polymorphic FK approach for photos, QR sessions, offspring.
3. **Add Q11–Q15** to §7 (domain, support, announcement plan, TV baseline analytics, payments).
4. **Resolve Q4 (Phase 3.6 timing) before anything else.** Context-switching risk is the highest schedule risk not named in §8.
5. **Rescope §8 timeline** — either extend to 15+ weeks realistic, or cut v1 scope (web-first, defer mobile, reduce species). Current 10 weeks requires dishonest self-reporting to hit.
6. **Add lethal/welfare-flag requirements** to §5.4 and §9.C. Welfare-critical, not optional polish.
7. **Add researcher/lurker persona** to §4. Drives care-sheet design decisions.
8. **Clarify content pipeline** in §5.3 — no-verbatim-copy rule, per-sheet sourcing, wife-rewrite-if-needed. Plagiarism risk is real.
9. **Decide public vs gated** for morph calculator (§5.6 `/morphs/calculator`). Public drives signups; gated loses SEO.
10. **Resolve image licensing** for care sheet heroes and inline photos (§5.5). Missing from current spec; legal exposure if botched.

---

## What's not worth changing

These are deliberate calls I'd keep as-is despite them being debatable:

- **Separate Vercel + separate EAS project + separate App Store listing.** Ops cost is real but brand integrity is the right call; the PRD defends this in §1 and §3.7.
- **10 snake + 10 lizard seed list.** Some candidates can swap but the overall volume is right — fewer-but-better is explicitly named as the cut path.
- **Morph calculator for ball python + leopard gecko only.** Scope control. Correct.
- **No forums.** Correct — Reddit owns this. Explicitly defended.
- **Static honesty-first policy.** Kept and strengthened below.

---

**End of review.** Happy to discuss any of the above or dig deeper into specific sections — particularly §5.1 (schema under separate-tables) and §5.4 (genetics + welfare flags) which have the most implementation detail downstream.
