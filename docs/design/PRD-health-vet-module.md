# PRD — Health & Veterinary Module

**Status:** Draft
**Author:** Tarantuverse team
**Created:** 2026-04-17
**Target release:** v1.1 (Q3 2026)
**Related docs:** [AUDIT-2026-04-17-followup.md §5 row 1](./AUDIT-2026-04-17-followup.md), [PLATFORM_DESIGN_AUDIT_2026-04-13.md](./PLATFORM_DESIGN_AUDIT_2026-04-13.md)

---

## 1. Problem Statement

Tarantula keepers have nowhere to record, track, or reason about their animals' health. When a spider starts twitching, refuses food for weeks, shows a bloated abdomen, or dies suddenly, keepers ask forum strangers for help — often too late, usually with no timeline, and with no way to connect symptoms to recent husbandry changes (substrate swap, new pesticide sprayed in the next room, a warmer heat pack in a shipment). Serious hobbyists and breeders with collections worth thousands of dollars have no documentation for insurance, no way to detect patterns across their collection, and no way to share a structured case with an exotic vet. No competitor (Arachnifiles, ExotiKeeper, Husbandry.Pro) ships a real health module — this is the single highest-leverage feature gap in the category.

**Evidence:** Top-ranked feature in 4/17 research sweep. DKS (dyskinetic syndrome), mite outbreaks, toxin exposure from household chemicals, and post-acquisition mortality are the four most-discussed emergency topics on Arachnoboards. Every one of them benefits from timestamped, structured data the current app cannot capture.

---

## 2. Goals

1. **Give keepers a first-class place to log health events** — symptoms, treatments, vet visits, deaths — with the same rigor as feeding and molt logs.
2. **Enable pattern detection** — surface correlations between husbandry changes (substrate, temp, humidity, nearby pesticide use) and health events within a single tarantula's timeline and across the collection.
3. **Support DKS triage specifically** — the community's #1 emergency use case deserves a guided workflow: symptom checklist → severity score → recommended protocol (water bowl, ICU cup, isolation) → outcome log.
4. **Produce shareable case summaries** — export a PDF or shareable link a keeper can hand to an exotic vet containing the full timeline, photos, and husbandry context.
5. **Preserve dignity for post-mortem records** — deaths happen; the app should support respectful record-keeping (date, suspected cause, photos if the keeper wants, keeper-only or memorialized publicly) without gamifying or penalizing it.

**Success framing:** Within 90 days of launch, keepers with a collection of 5+ log at least one health event, and 25% of tarantulas that die in-app have a cause-of-death record attached.

---

## 3. Non-Goals

1. **We are not providing veterinary advice.** The app surfaces keeper-entered data and community-sourced symptom definitions; it will never diagnose. Every AI-generated suggestion carries a prominent "not a vet" disclaimer. Rationale: liability + honesty-first principle (see `project_honesty_principle` memory).
2. **We are not building a vet finder / directory in v1.** Adding a vet as a free-text contact is enough; a curated directory of exotic vets is a future initiative with its own moderation burden.
3. **We are not shipping IoT sensor integration in this module.** Environmental data for correlation will come from manually logged substrate changes, enclosure cleanings, and a new lightweight `environment_reading` entry (sub-feature §6.3). Govee / SensorPush integration is Phase 5.
4. **We are not building drug dosage calculators.** Tarantula pharmacology is under-researched; dosing is a vet's call. We log *what was administered* and *by whom* without computing amounts.
5. **We are not gamifying death.** No achievements are awarded or revoked for mortality. No leaderboards reference loss counts. Post-mortem records are private by default.

---

## 4. User Stories

### Primary persona — Serious hobbyist ("Sam," 25-Ts collection, 4 years keeping)

- As a keeper, I want to log that my *G. pulchra* refused food today and noticed leg curling, so that I have a dated record of early warning signs.
- As a keeper, I want to mark an event as "DKS suspected" and get a guided checklist of other symptoms to look for, so that I can confirm or rule it out without guessing.
- As a keeper, I want to attach photos or a short video to a symptom log, so that the condition is documented and I can compare progression.
- As a keeper, I want to record that my neighbor sprayed pesticide yesterday, so that three months later I can still connect dots if something goes wrong.
- As a keeper, I want to see a timeline for a specific tarantula that merges health events with feedings, molts, and substrate changes, so I can reason about what changed before a problem started.

### Secondary persona — Breeder ("Marisol," 80-T collection, sells offspring)

- As a breeder, I want to log that an entire sac died before emergence, so that I can track mortality rates by pairing and condition.
- As a breeder, I want to note DOA (dead on arrival) on a shipment I received, so that my vendor-rating data includes mortality context.
- As a breeder, I want to mark a tarantula as "quarantined" with a reason, so that it shows visually in my collection grid and I remember not to cross-contaminate tools.
- As a breeder, I want to export a health report for a specific animal to send to a customer asking why a T they bought from me died, so that I have a defensible record.

### Tertiary persona — Vet consultation workflow

- As a keeper, I want to generate a shareable read-only link summarizing an animal's health timeline, so that I can send it to an exotic vet who does not have a Tarantuverse account.
- As a keeper, I want to mark a vet visit with outcome + follow-up date, so that the app reminds me to log the follow-up.

### Edge cases

- As a keeper, I want a "best guess" option when I do not know the cause of death, because honesty about uncertainty matters.
- As a keeper, I want to delete or privatize a post-mortem record after the fact, because grief is real and not everything belongs in history.
- As a keeper, I want to recover a tarantula from "deceased" back to "alive" within 7 days, because sometimes "molt coma" gets misdiagnosed and a keeper wants to undo the declaration.

---

## 5. Requirements

### Must-Have (P0) — ships with v1.1

#### 5.1 Health Log (daily observations)
General-purpose symptom/observation log attached to a tarantula.

**Data model:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE)
- `observed_at` (datetime)
- `category` (ENUM: symptom / injury / parasite / toxin_exposure / recovery / general)
- `severity` (ENUM: info / watch / concern / emergency) — drives visual treatment in UI
- `symptoms` (ARRAY of predefined keys — see §5.6 for vocabulary)
- `notes` (text, max 5000)
- `photos` (FK → existing photos table via `health_log_photos` join table)
- `resolved` (boolean, default false)
- `resolved_at` (datetime, nullable)
- `created_at`, `updated_at`

**Acceptance:**
- [ ] Keeper can create/edit/delete a health log on web and mobile
- [ ] Severity `emergency` renders a red banner on the tarantula card + dashboard
- [ ] Unresolved `concern` or `emergency` logs older than 14 days trigger a mobile local notification asking "Is this resolved?"
- [ ] Photos attach via the existing upload flow (no new storage work)
- [ ] Health logs appear in the existing unified timeline on tarantula detail page
- [ ] Soft delete supported (for recover-from-grief case)

#### 5.2 DKS Triage Workflow
Guided entry for suspected dyskinetic syndrome — the single most important emergency path.

**Flow:**
1. Symptom checklist (8-10 items from community literature): uncoordinated movement, twitching, missed strikes, difficulty righting, leg curling, premature death-curl, inability to find water dish, lethargy, unexplained weight loss, exposure to known DKS triggers (pesticides, Frontline, essential oils).
2. Severity score auto-computed (count of checked items → low/medium/high).
3. Recommended response card (community-sourced, disclaimer prominent): immediate actions (water bowl access, move to ICU cup if severe, remove from suspected toxin source).
4. Creates a health log with `category=symptom, severity=concern|emergency` and `symptoms=[selected keys]`.
5. Offers to schedule a 48-hour follow-up reminder.

**Acceptance:**
- [ ] Workflow reachable from tarantula detail page "Log Health Event" → "DKS suspected" quick action
- [ ] All recommendations include "this is keeper-sourced information, not veterinary advice" disclaimer
- [ ] Completing the flow produces exactly one health log record
- [ ] User can cancel at any step with no data persisted
- [ ] 48-hour reminder scheduled via existing notification preferences system

#### 5.3 Treatment Log
Records interventions taken.

**Data model:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE)
- `health_log_id` (FK → health_logs, nullable — optional link to the event being treated)
- `treatment_type` (ENUM: hydration / icu_cup / quarantine / rehouse / medication / environmental_adjustment / other)
- `administered_at` (datetime)
- `administered_by` (ENUM: keeper / vet) — if vet, link to `vet_visit_id`
- `vet_visit_id` (FK → vet_visits, nullable)
- `notes` (text, max 2000)
- `ongoing` (boolean) — for quarantine / long-running protocols
- `ended_at` (datetime, nullable)
- `created_at`

**Acceptance:**
- [ ] Keeper can start an ongoing treatment (e.g., "quarantined") and end it later
- [ ] A tarantula with `ongoing=true, treatment_type=quarantine` shows a quarantine badge on collection grid + detail page
- [ ] Cross-contamination warning renders when keeper tries to log feeding/substrate across two quarantined animals in the same session (stretch)
- [ ] No dosage calculations or prescriptions are generated

#### 5.4 Vet Visit
Lightweight visit record. Not a vet directory.

**Data model:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE) — or nullable for collection-wide visit
- `user_id` (FK → users) — for collection-wide visits not tied to a single animal
- `vet_name` (text, 200)
- `vet_contact` (text, 500 — free-form: phone, email, website)
- `visited_at` (date)
- `reason` (text, 500)
- `findings` (text, 2000)
- `recommendations` (text, 2000)
- `follow_up_date` (date, nullable)
- `cost` (numeric, nullable)
- `created_at`, `updated_at`

**Acceptance:**
- [ ] Keeper creates a vet visit tied to one tarantula or to the collection generally
- [ ] Follow-up date produces a reminder via notification preferences
- [ ] Cost tracking is optional; when present, it appears in the advanced analytics cost breakdown
- [ ] Visit has its own timeline entry on the tarantula detail page

#### 5.5 Post-Mortem / Death Record
Respectful record of mortality.

**Data model:**
- `id` (UUID, PK)
- `tarantula_id` (FK → tarantulas, CASCADE, UNIQUE — a tarantula can have at most one death record)
- `died_at` (date)
- `age_at_death_days` (computed, nullable if `date_acquired` missing)
- `suspected_cause` (ENUM: old_age / unknown / dks_suspected / dehydration / fall / toxin_exposure / parasite / mite_infestation / post_molt_complication / shipping_stress / other)
- `cause_notes` (text, 2000)
- `had_post_mortem_exam` (boolean, default false)
- `post_mortem_findings` (text, 2000, nullable)
- `visibility` (ENUM: private / followers / public, default private)
- `memorialized` (boolean, default false) — appears on public profile if true
- `created_at`, `updated_at`

**Tarantula state changes:**
- Adds `status` column to `tarantulas` table (ENUM: alive / deceased / rehomed, default alive)
- Deceased tarantulas remain in the database and in historical views but are excluded from default collection count
- Grace period: 7-day `revert_deceased` allowed

**Acceptance:**
- [ ] Creating a death record sets `tarantulas.status = 'deceased'` atomically
- [ ] Collection grid visually de-emphasizes (greyscale photo + small memorial indicator if `memorialized=true`) without removing
- [ ] Dashboard stats show "alive" and "lifetime" counts separately
- [ ] No achievement is granted, revoked, or affected by death
- [ ] Visibility defaults to private; public memorialization is opt-in with explicit second confirmation
- [ ] `revert_deceased` within 7 days restores prior state (including any treatments marked `ongoing` at time of death)
- [ ] Death record can be deleted entirely (hard delete — some keepers want no record)

#### 5.6 Symptom Vocabulary (seed data)
A curated list of ~60 symptom keys grouped into categories. Stored as a static dictionary (not a table) initially — becomes a DB table in v1.2 if community-submitted symptoms are added.

**Categories:** Neurological (leg-curling, twitching, uncoordinated, righting-reflex-lost, death-curl-premature), Nutritional (refusing-food, visible-weight-loss, bloated-abdomen), Environmental (dehydration, fluid-from-mouth, fluid-from-book-lungs), External (missing-legs, visible-injury, wet-molt), Parasitic (mites-visible, nematodes, phorid-flies), Behavioral (hyperactivity, lethargy, persistent-webbing, refusing-water).

**Acceptance:**
- [ ] Symptom keys stored in `apps/api/app/services/health_vocabulary.py`
- [ ] Each key has: display name, category, short description, optional "common triggers" note
- [ ] Keys are versioned (v1 schema) so future additions don't break old logs

#### 5.7 Toxin Exposure Log
Specialized event capturing household/environmental chemical exposure.

**Data model:**
- `id` (UUID, PK)
- `user_id` (FK → users) — collection-wide (affects all Ts in the household)
- `exposed_at` (datetime)
- `substance` (text, 200)
- `substance_category` (ENUM: pesticide / essential_oil / cleaning_product / aerosol / flea_treatment / smoke / other)
- `proximity` (ENUM: same_room / adjacent_room / same_building / outdoor)
- `notes` (text, 2000)
- `affected_tarantulas` (ARRAY of tarantula UUIDs, or null for "potentially all")
- `created_at`

**Acceptance:**
- [ ] Exposure event appears on the timeline of every affected tarantula
- [ ] A collection-wide exposure with `proximity=same_room` renders a warning banner on the dashboard for 30 days
- [ ] When a health log is created on any affected tarantula within 30 days of the exposure, the toxin event is automatically suggested as a "possibly related" link in the health log UI

### Nice-to-Have (P1) — fast follow (v1.2)

- **Case summary export** — PDF with timeline, photos, recent husbandry, symptoms, treatments. Suitable for handing to an exotic vet.
- **Shareable vet link** — read-only tokenized URL (similar pattern to existing QR upload sessions, no account required for viewer). 30-day TTL.
- **Collection-level health dashboard** — incidence rate, open concerns, quarantine count, recent deaths. Separate from general analytics.
- **Symptom correlation hints** — "3 of your keepers in this species have logged similar symptoms within 2 weeks" cross-collection insight. Opt-in anonymous aggregation.
- **Mobile widget** — home-screen widget showing any unresolved `emergency` or `concern` logs.

### Future Considerations (P2) — architectural insurance

- **Community-submitted symptom vocabulary** — designed in §5.6 to migrate to a DB table without breaking logs.
- **Species-level baseline data** — "average lifespan for *G. pulchra* in captivity," "known DKS susceptibility" — extend the existing `species` table.
- **Vet directory / reviews** — separate initiative; model now accepts free-form vet contacts so it can migrate.
- **Lineage health tracking** — if a sac has 80% mortality, surface it when recommending that pairing be retired. Depends on lineage visualizer (§5 row 3 of audit).
- **IoT sensor ingestion** — add `environment_readings` table design now so temp/humidity sensors can write to it later without schema churn.

---

## 6. Technical Design

### 6.1 Database Migrations

Single migration: `a1b2c3d4e5f6_add_health_module.py` (rename to fit chain — current head is `z7a8b9c0d1e2_add_token_blocklist.py`).

Tables created:
- `health_logs`
- `health_log_photos` (join table)
- `treatments`
- `vet_visits`
- `post_mortems`
- `toxin_exposures`
- `toxin_exposure_tarantulas` (join table)

Column added to `tarantulas`: `status` (ENUM: alive / deceased / rehomed, default alive, NOT NULL, indexed).

All enums created via Alembic `op.execute("CREATE TYPE ...")` pattern used in existing breeding migration (`k2l3m4n5o6p7`).

### 6.2 API Endpoints

All under `/api/v1` prefix, all authenticated except shareable case links.

- `GET /tarantulas/{id}/health-logs` — list
- `POST /tarantulas/{id}/health-logs` — create
- `GET /health-logs/{id}` — detail
- `PUT /health-logs/{id}` — update
- `DELETE /health-logs/{id}` — soft delete
- `POST /tarantulas/{id}/health-logs/dks-triage` — special endpoint that accepts the guided-workflow payload and returns the created log
- `GET /tarantulas/{id}/treatments`, POST, PUT, DELETE
- `POST /treatments/{id}/end` — close an ongoing treatment
- `GET /tarantulas/{id}/vet-visits`, POST, PUT, DELETE
- `GET /users/me/vet-visits` — collection-wide visits
- `POST /tarantulas/{id}/post-mortem` — creates and transitions state
- `PUT /tarantulas/{id}/post-mortem` — edit
- `DELETE /tarantulas/{id}/post-mortem` — hard delete, reverts state if within 7-day window
- `POST /tarantulas/{id}/revert-deceased` — explicit revert (same 7-day rule)
- `GET /users/me/toxin-exposures`, POST, PUT, DELETE
- `GET /health/vocabulary` — returns symptom keys (public, cacheable, 1-hour TTL)
- `POST /tarantulas/{id}/health-share-link` — P1, creates tokenized read-only link
- `GET /health-share/{token}` — P1, public read-only

Rate limits:
- `POST /health-logs` — 20/min per user
- `POST /health-share-link` — 5/hour per user (matches export endpoint policy)
- DKS triage endpoint — 5/min (prevents scripting)

Schemas: follow Pydantic v2 `model_dump()` conventions. Bound all text fields with `Field(..., max_length=N)` per the §5 audit lesson.

### 6.3 Environment Readings (P2 hook)

Add — but do not populate — an `environment_readings` table in v1.1 migration:

```
environment_readings (
  id UUID PK,
  tarantula_id UUID FK,
  recorded_at DATETIME,
  source ENUM(manual/iot),
  temperature_f NUMERIC,
  humidity_pct NUMERIC,
  notes TEXT,
  created_at DATETIME
)
```

No UI in v1.1 — schema-only. Lets us add the IoT ingestion endpoint without another migration.

### 6.4 Service Layer

New service: `apps/api/app/services/health_service.py`
- `compute_dks_severity(symptom_keys) -> 'low' | 'medium' | 'high'`
- `suggest_related_toxin_exposures(tarantula_id, observed_at) -> list[ToxinExposure]`
- `format_case_summary(tarantula_id) -> dict` — feeds PDF export + share link

### 6.5 Mobile-Specific Notes

- Follow `feedback_mobile_api_trailing_slashes` — collection endpoints take slash, named actions (`/dks-triage`, `/end`, `/revert-deceased`) do not.
- Follow `feedback_mobile_auth_guard_pattern` — gate any health-log `useEffect` on `authLoading=false`.
- Follow `feedback_mobile_error_ux` — never `router.back()` in catch blocks. Error states get retry buttons.
- Follow `feedback_stylesheet_in_component` — all `StyleSheet.create` at module level.
- All UI must support both theme presets (Keeper / Hobbyist) — severity colors come from `theme.semantic.*` (immutable), never preset accent colors.
- Severity colors map to existing semantic tokens: `info` → info, `watch` → warning, `concern` → warning (darker), `emergency` → danger.

### 6.6 Web-Specific Notes

- All surfaces need `dark:` variants per dark-mode rule in CLAUDE.md.
- No raw gradients — use preset-aware tokens per ADR-001.
- Shareable vet link page (`/health-share/[token]`) must be fully server-rendered for SEO-safety; it includes a `<meta name="robots" content="noindex">` tag.

---

## 7. UX / Wireframes

### 7.1 Entry points
- **Tarantula detail page** — new "Health" tab alongside existing Feeding / Molts / Substrate / Breeding.
- **Quick actions** — FAB on detail page: "Log feeding / molt / substrate / **health event**".
- **Dashboard** — if any tarantula has an unresolved `concern` or `emergency` log, a red card at top: "3 animals need attention."
- **Collection grid** — quarantine badge, emergency-symptom dot, deceased greyscale treatment.

### 7.2 Health tab structure (tarantula detail)
1. Active alerts — unresolved concern/emergency logs
2. Active treatments — ongoing quarantine/ICU
3. Timeline — merged feed of symptoms, treatments, vet visits, related toxin exposures
4. Post-mortem section — only visible if deceased

### 7.3 DKS triage modal flow
1. Intro screen — "This is not a diagnostic tool. Use for recordkeeping and to structure a case for your vet." Continue / Cancel.
2. Symptom checklist — scrollable, grouped by category, each item has a "?" icon with short description.
3. Severity + recommended actions card.
4. Optional: attach photos.
5. Optional: schedule 48-hour follow-up.
6. Summary → save.

### 7.4 Post-mortem creation
- Triggered from tarantula detail page "Mark as deceased" in overflow menu
- First screen: soft "We're sorry" copy (not maudlin), date picker, suspected cause dropdown, optional notes
- Second screen: visibility (private / followers / public), opt-in memorialization
- Final confirmation: "This will mark [Name] as deceased. You can revert within 7 days."
- No celebratory or gamified UI — no confetti, no badges, no progress bar.

---

## 8. Success Metrics

### Leading indicators (measured 30 days post-launch)

| Metric | Target | Stretch | How measured |
|--------|--------|---------|--------------|
| % active keepers who view the Health tab | 40% | 60% | page_view analytics |
| % active keepers (5+ collection) who create ≥1 health log | 20% | 35% | db query `health_logs.user_id` distinct count |
| DKS triage flow completion rate (started → saved) | 70% | 85% | funnel analytics |
| Median time to first health log after launch | <14 days | <7 days | cohort analysis |
| Vet-share link creation count | 50 | 200 | db query |
| False emergencies (created then deleted < 1 hour) | <10% | <5% | health_logs where deleted_at - created_at < 3600 |

### Lagging indicators (measured 90 days post-launch)

| Metric | Target | Stretch | How measured |
|--------|--------|---------|--------------|
| Retention lift for keepers who used health module vs matched cohort | +5 pts at D60 | +10 pts | cohort retention analysis |
| % of in-app deaths that have a post-mortem attached | 25% | 50% | db query |
| Support ticket volume mentioning "health/sick/dying" | -30% vs pre-launch baseline | -50% | support tagging |
| NPS delta among health-module users vs non-users | +5 | +10 | existing NPS survey, segmented |
| Forum mentions of Tarantuverse on Arachnoboards around health topics | qualitative positive | brand mentioned in ≥5 DKS threads as resource | manual review |

### Kill criteria
If at 90 days: <10% of eligible keepers have logged a health event AND retention lift <1 pt, reassess module rather than double down on P1 extensions.

---

## 9. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Keepers misuse the app as a diagnostic tool → animal dies that a vet could have saved | High — harm to animal + reputational | Medium | Prominent disclaimers at every DKS / recommendation surface. Link to exotic-vet-finder resources. Never use words like "diagnose," "confirmed," "cure." |
| Liability exposure from app being perceived as giving vet advice | High — legal | Low-Medium | Terms of service update. Keeper-sourced language throughout. "Community-suggested" framing for all recommendations. Legal review before launch. |
| Morbid gamification perception ("logging deaths feels gross") | Medium — brand | Medium | No achievements, no counts in leaderboards. Private-by-default. Grief-aware copy review by a designer. |
| DKS vocabulary drift — community adds terms we don't support | Low | Medium | Versioned schema; plan vocabulary migration in v1.2 P1. |
| Collection-wide toxin exposure warnings become noisy / training users to dismiss | Medium — product | Medium | 30-day decay, severity threshold before banner appears, easy "this wasn't actually a concern" dismissal that also retrains the banner heuristic. |
| Data export of case summary reveals PII we shouldn't share | Medium — privacy | Low | Shareable links are scoped to one tarantula; keeper must opt-in per export; no user email, no account-level info. |

---

## 10. Open Questions

Blocking — must resolve before coding starts:

- **[Legal]** Terms of Service update for health module — need sign-off that disclaimer language is sufficient.
- **[Design]** Severity color mapping — do we use existing `theme.semantic.danger` for emergency, or introduce a dedicated `health.emergency` token? Needed for preset system alignment.
- **[Product]** Is memorialization (public post-mortem with opt-in) in v1 or punted to v1.2? Currently marked P0 — push back if the "no death gamification" thread feels risky without more research.

Non-blocking — resolve during implementation:

- **[Engineering]** Should ongoing treatments automatically close when the tarantula is marked deceased, or persist as historical record? Leaning toward auto-close with `ended_at = post_mortem.died_at`.
- **[Engineering]** When a tarantula is reverted from deceased, should we re-open treatments that were auto-closed? Probably yes.
- **[Data]** How do we handle a DKS triage event whose recommended 48-hour follow-up never gets logged? Auto-mark the health log as "unresolved — check in"?
- **[Design]** The quarantine badge on collection grid — does it sit alongside the existing sex badge or replace it when active?
- **[Community]** Do we pull symptom vocabulary from Arachnoboards wiki (with attribution) or write our own? Wiki is more comprehensive; attribution is polite + defensible.
- **[Research]** Is there prior research on mortality distribution in captive tarantulas we can cite on the post-mortem flow copy? Gives weight to "this is normal" framing.

---

## 11. Timeline & Phasing

### Phase 1 (v1.1) — 6-8 weeks

- Week 1: Schema design sign-off, migration written, backend models + Pydantic schemas
- Week 2: Backend routers + services + tests; symptom vocabulary compiled
- Week 3: Web UI — Health tab, DKS triage, post-mortem flow
- Week 4: Mobile UI — feature parity pass
- Week 5: Integration — timeline merging, notification hooks, collection-grid badges
- Week 6: QA, legal review, accessibility pass (screen reader on DKS modal especially)
- Week 7: Soft launch to power users (top 50 keepers by activity), gather feedback
- Week 8: General release

### Phase 2 (v1.2) — 3 weeks (starts ~8 weeks after v1.1 GA)

Ships the P1 list: case summary PDF, shareable vet link, collection-level health dashboard, symptom correlation hints, mobile widget.

### Hard dependencies

- No external deps — all existing infra (notifications, photos, share links) already supports the module.
- Nice-to-have: Shipping module (audit §5 row 2) integrates nicely here for DOA tracking — can ship after v1.1 or together.

### Flex points for scope compression

If the 6-week window is at risk, cut in this order (keep everything above the cut):
1. Keep: Health Log, Post-Mortem, DKS triage, Treatment, symptom vocab.
2. Cut first: Toxin Exposure (ship as fast-follow).
3. Cut second: Vet Visit (merge into Health Log as a subtype initially).
4. Do not cut: Post-mortem — deaths happen whether we ship or not; keepers need this path immediately.

---

## 12. Appendix

### A. Symptom vocabulary seed (abridged — full list in `health_vocabulary.py`)

| Key | Category | Display | Common triggers |
|-----|----------|---------|----------------|
| leg_curl | neurological | Leg curling | dehydration, DKS, old age, toxin |
| twitching | neurological | Involuntary twitching | DKS, pesticide exposure |
| righting_reflex_lost | neurological | Cannot right itself | DKS, severe dehydration, neurological |
| refusing_food | behavioral | Refusing food | premolt, stress, illness |
| bloated_abdomen | nutritional | Bloated abdomen | overfeeding, dehydration, infection |
| fluid_from_mouth | environmental | Fluid from mouth | DKS, nematode infection |
| mites_visible | parasitic | Visible mites | substrate, prey items |
| visible_injury | external | Visible bleeding/injury | fall, cage-mate, mismolt |
| wet_molt | external | Mismolt / wet molt | low humidity at molt |
| ... | ... | ... | ... |

### B. Recommended references

- American Tarantula Society literature on DKS
- Arachnoboards wiki (with permission/attribution)
- Existing care-sheet `care_guide` fields in species table (link to species-specific risk factors)

### C. Copy principles

- "Symptom" not "disease"
- "Concerning" not "dangerous"
- "Suspected cause" not "cause"
- "Community-sourced" not "verified"
- "Recordkeeping" not "diagnosis"
- "Mark as deceased" not "Log death"
- "No longer with us" in public-facing memorial copy, never just "dead"
