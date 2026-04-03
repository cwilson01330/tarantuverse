# Tarantuverse Upgrade Roadmap — Q2 2026

**Timeline:** 4-6 weeks (April 7 – May 15, 2026)
**Goals:** User growth & retention, monetization, polish & trust
**Constraint:** Solo dev, prefer Expo OTA (JS-only) where possible

---

## Status Overview

- 14 items total across 3 phases
- Phase 1 (NOW): 6 high-impact items — ship within 2 weeks
- Phase 2 (NEXT): 5 medium items — weeks 3-4
- Phase 3 (LATER): 3 items requiring native resubmission — weeks 5-6

---

## Phase 1 — NOW (Weeks 1-2): Quick Wins, Huge Impact

These are the highest value-to-effort items. All are OTA-deployable (JS-only changes + API updates).

### 1. Mobile Onboarding Flow
**Impact:** Retention · **Effort:** 2 days · **OTA:** Yes

New users on mobile land on a bare collection screen with no guidance. Web has a DashboardTour component with spotlight overlays — mobile has nothing.

Build a 3-4 screen welcome flow after first login: "Welcome to Tarantuverse" → "Add your first tarantula" → "Track feedings & molts" → "Join the community." Store completion in AsyncStorage. Show a persistent "Get Started" card on the collection screen until they add their first tarantula.

Why it matters: first-session retention is the single biggest lever. Users who add a tarantula in session 1 are dramatically more likely to come back.

### 2. Mobile Collection Search & Filter
**Impact:** UX · **Effort:** 1 day · **OTA:** Yes

Web has search and filtering on the collection page. Mobile doesn't — users with 10+ tarantulas have to scroll. Add a search bar with name/species filtering and sort options (name, last fed, date acquired). This is table-stakes UX that's already built on web.

### 3. Premolt Predictor (Killer Feature)
**Impact:** Growth + Retention + Premium · **Effort:** 3-4 days · **OTA:** Yes (API + frontend)

This is the feature nobody else has. Use existing feeding log data to predict premolt based on feeding refusal patterns and time since last molt. The algorithm: if a tarantula has refused 2+ consecutive feedings AND it's been >60% of their average inter-molt interval, flag "Likely in premolt" with a confidence score.

Show on the tarantula detail page and as a dashboard card ("2 tarantulas may be in premolt"). Push notification when triggered. Gate the detailed prediction view (confidence %, historical comparison, estimated molt window) behind premium — free users see the alert but not the analysis.

Why it matters: this is the "wow" feature that no competitor has. Keepers talk about premolt prediction constantly on Arachnoboards. It gives people a reason to log feedings consistently (retention) and a reason to upgrade (monetization).

### 4. Feeding Reminders That Actually Work
**Impact:** Retention · **Effort:** 1-2 days · **OTA:** Yes

The notification system infrastructure exists but feeding reminders need to be smarter. Instead of a fixed interval, calculate per-tarantula reminders based on species feeding frequency data from the species database. A sling needs reminders every 3-4 days, an adult every 7-14. Auto-schedule these when a feeding is logged, using the species care data to set the interval. Show "overdue" badges on the collection grid.

### 5. Social Proof on Landing Page
**Impact:** Growth · **Effort:** 1 day · **OTA:** N/A (web only, auto-deploys)

The landing page has no testimonials, user counts, or screenshots. Add a live stats bar ("1,200+ keepers tracking 8,500+ tarantulas"), 3 testimonial cards (reach out to active community members like Ashley), and actual app screenshots showing the dashboard, analytics, and species care sheets. Add App Store / Google Play badges linking to the mobile app.

### 6. Empty State Improvements (Web + Mobile)
**Impact:** Retention · **Effort:** 1 day · **OTA:** Yes

Every empty state is an opportunity. When someone has zero feedings, zero molts, zero photos — show helpful prompts instead of blank space. "Log your first feeding to start tracking patterns" with a one-tap action. Add illustration or icon, explain why tracking matters. Currently the detail page just shows empty sections.

---

## Phase 2 — NEXT (Weeks 3-4): Engagement & Monetization

### 7. Achievement & Badge System
**Impact:** Retention + Engagement · **Effort:** 3 days · **OTA:** Yes

Add milestones that reward consistent use: "First Tarantula" → "Collector (10)" → "Hoarder (25)". "Dedicated Feeder" (30-day feeding streak). "Molt Watcher" (logged 5 molts). "Community Contributor" (10 forum posts). "Breeder" (first successful pairing). Display on keeper profiles and in the activity feed. This gives people goals and makes profiles more interesting to visit.

Backend: achievements table, check triggers on relevant actions. Frontend: badge display on profiles, toast notifications when earned, achievement gallery page.

### 8. Global Search
**Impact:** UX · **Effort:** 2 days · **OTA:** Yes

No way to search across the platform. Add a search bar to the top bar / sidebar that searches tarantulas, species, keepers, and forum threads in one place. Use the existing species full-text search (TSVECTOR) pattern and extend it. This is a quality-of-life feature that makes the app feel professional.

### 9. "Discover" Community Tab
**Impact:** Engagement · **Effort:** 2 days · **OTA:** Yes

The community section is hard to find and feels empty. Replace the current community board with a "Discover" feed showing: trending forum threads (most replies in 7 days), recently active keepers, popular species (most kept), and new members. Add "Keeper Spotlight" featuring a random active user weekly. This makes the community feel alive even with modest user counts.

### 10. Premium Value: Advanced Analytics Dashboard
**Impact:** Monetization · **Effort:** 2-3 days · **OTA:** Yes

The current analytics are basic and free. Build a premium-gated advanced dashboard with: collection cost breakdown (total spent, average per tarantula), molt frequency heatmap (which months are busiest), feeding cost estimator (monthly prey expense calculator), and collection growth timeline. Free users see a teaser card with blurred previews + upgrade prompt.

### 11. Shareable Care Logs (Public Collection Links)
**Impact:** Growth · **Effort:** 2 days · **OTA:** Yes

Let users share individual tarantula profiles as public links (tarantuverse.com/keeper/username/tarantula-name). Show photo, species info, feeding history chart, molt timeline — a beautiful public page. This turns every user into a growth channel. Breeders share these links with buyers. Keepers share on social media. Each page has a "Track yours on Tarantuverse" CTA.

---

## Phase 3 — LATER (Weeks 5-6): Native Upgrades

These require App Store resubmission but deliver significant value.

### 12. Camera-First Photo Flow
**Impact:** Engagement · **Effort:** 2-3 days · **Resubmit:** Yes

Redesign the photo flow to be camera-first: open camera directly from the tarantula detail page, auto-tag with species and date, optional caption, upload in background. Add a "Photo of the Day" community feature showing the most-liked recent photo. Photos are the most engaging content type in the hobby — make them frictionless.

### 13. QR Code Enclosure Labels
**Impact:** Growth + Premium · **Effort:** 2 days · **Resubmit:** Yes (camera permissions)

Generate printable QR codes for each tarantula/enclosure. Scan with phone to jump directly to that tarantula's detail page. Premium feature — free users can view QR pages, premium can generate and print. Breeders love this for collection management at scale. Requires native camera/barcode scanning module.

### 14. Widget Support (iOS + Android)
**Impact:** Retention · **Effort:** 3-4 days · **Resubmit:** Yes

Home screen widget showing: next feeding due, tarantulas in premolt, days since last molt for a selected tarantula. This is daily passive engagement — users see Tarantuverse every time they look at their phone without opening the app. Requires native module (expo-widgets or custom).

---

## Prioritization Matrix (Value vs Effort)

```
HIGH VALUE
    │
    │  ★ Premolt Predictor    ★ Achievements
    │  ★ Onboarding Flow      ★ Shareable Links
    │  ★ Smart Reminders      ★ Discover Tab
    │  ★ Social Proof         ★ Adv. Analytics
    │                              ★ QR Labels
    │  ★ Collection Search    ★ Widgets
    │  ★ Empty States         ★ Camera Flow
    │                         ★ Global Search
    │
    └──────────────────────────────────────────
         LOW EFFORT                HIGH EFFORT
```

---

## What This Roadmap Does NOT Include (And Why)

- **Offline mode**: High effort (local DB, sync engine), low urgency — users have internet
- **Marketplace/classifieds**: Needs critical mass of users first; premature right now
- **IoT sensor integration**: Cool but niche; save for v2 when user base justifies it
- **Video uploads**: Storage costs scale badly; photos are enough for now
- **WebSocket real-time**: Nice to have but polling works fine at current scale

---

## Success Metrics

After 6 weeks, measure:

- **Retention**: Day-7 retention rate (target: 40%+, likely <20% today)
- **Engagement**: Average feedings logged per active user per week
- **Conversion**: Free → Premium conversion rate (target: 3-5%)
- **Growth**: New registrations per week and organic traffic
- **Community**: Forum posts per week, DMs sent, followers gained

---

## Dependencies & Risks

- **Premolt predictor accuracy**: Needs enough feeding data per tarantula (~10 logs minimum). Show "Not enough data" gracefully for new tarantulas.
- **Social proof**: Requires outreach to active users for testimonials. Start this week 1.
- **App Store review time**: Submit Phase 3 changes by week 4 to account for review delays.
- **Expo OTA limits**: All Phase 1-2 changes are JS-only and deploy instantly via EAS Update. Phase 3 requires `eas build` + store submission.

---

*Last updated: April 3, 2026*
