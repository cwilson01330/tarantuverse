# PRD: Multi-Axis Theme Preset System
**Feature:** Aesthetic Presets — "Keeper" & "Hobbyist" modes
**Status:** Draft
**Date:** 2026-04-13
**Author:** Cory
**Related:** ADR-001, PLATFORM_DESIGN_AUDIT_2026-04-13

---

## Problem Statement

Tarantuverse serves two meaningfully different user segments: serious keepers and breeders who use the app as a daily data tool (husbandry tracking, breeding records, analytics), and newer or casual hobbyists who are drawn to the community and social discovery features. The current app ships a single visual aesthetic — a vibrant blue-to-magenta gradient that reads consumer and social — which resonates with casual hobbyists but creates visual friction for serious keepers who want a dense, quiet tool aesthetic. Forcing one experience alienates the other, and as the platform matures into a serious data product, the mismatch between the serious keeper's expectations and the app's default look risks churn in the most valuable user segment.

---

## Goals

1. **Serve both user segments** — serious keepers can opt into a restrained tool aesthetic without changing platforms or workarounds.
2. **Increase retention among advanced users** — target a measurable improvement in 30-day retention for users who self-identify as intermediate/advanced/expert.
3. **Keep the theme picker as a product differentiator** — no competitor offers meaningful aesthetic customization. Deepen this moat rather than reducing it.
4. **Sync across platforms** — a user who sets Keeper mode on mobile should see Keeper mode on the web the next time they log in. One preference, everywhere.
5. **Create the architecture for future presets** — Naturalist (earth tones), potential community-submitted themes, or seasonal presets should require no architectural changes to ship.

---

## Non-Goals

- **Not a full design system rewrite.** We are adding a preset layer on top of the existing system, not rebuilding every component. Individual component polish (icon consolidation, card redesign) are separate work items in the design backlog.
- **Not a custom theme builder.** Users pick from named presets; they do not define arbitrary token values. A drag-to-any-color system is a separate future feature.
- **Not a web-first redesign.** The web has a different visual treatment by design. This initiative syncs the *preset dimension* (mode + accent + aesthetic) across platforms, not the visual output.
- **Not a per-screen preset.** A user picks one preset for their whole account, not different presets per screen.
- **Not light mode parity.** Light mode support across presets is out of scope for v1. The app's primary mode is dark. Light mode variants of the Keeper preset are P2.

---

## User Stories

### Serious Keeper / Advanced Hobbyist

- As a serious keeper, I want to switch the app to a flat, compact visual style so that I can focus on my husbandry data without the interface competing for attention.
- As a breeder, I want my preference synced across my phone and the web app so that I don't have to reconfigure it when I switch devices.
- As an advanced user, I want a denser layout so that I can see more of my collection at once without scrolling.
- As a keeper who hates visual noise, I want the header to be compact and undecorated on every functional screen so that I get more vertical space for content.

### New / Casual Hobbyist

- As a new keeper, I want the vibrant gradient default so that the app feels fun and welcoming from my first day.
- As a community-focused user, I want my current experience unchanged if I don't touch theme settings so that an update doesn't break my preferred look.
- As a user who picked a custom accent color, I want that color to still work within whichever preset I choose so that my personalization still applies.

### All Users

- As any user, I want to see a side-by-side preview of both presets before I commit so that I know what I'm getting.
- As any user, I want to switch presets at any time without losing my data or other settings.
- As any user on mobile, I want my selection to be available immediately (no loading spinner) even if the network sync hasn't completed.

---

## Requirements

### Must-Have — P0

**1. Preset token architecture on mobile**
Define `PRESETS` object in `apps/mobile/src/contexts/presets.ts` with `hobbyist` and `keeper` bundles. Extend `ThemeContext` to merge preset tokens. Every component currently hardcoding a gradient, header height, or border radius must read from context instead.

*Acceptance criteria:*
- [ ] All gradient-producing code paths in the app read `theme.header.useGradient` before rendering
- [ ] Header height reads `theme.header.height` — no hardcoded `130` values remain
- [ ] Border radius reads `theme.radius.*` throughout
- [ ] Semantic colors (`danger`, `warning`, `success`, `info`, sex colors) are not part of any preset bundle and cannot be overridden

**2. Keeper preset is visually distinct and usable**
The Keeper preset must produce a compact, flat, high-density layout that a serious user would genuinely prefer over Hobbyist.

*Acceptance criteria:*
- [ ] Header height ≤ 56pt, no gradient on any functional screen in Keeper mode
- [ ] Card border radius 12pt (vs 16pt/24pt Hobbyist)
- [ ] Row height 44pt (vs 52pt Hobbyist)
- [ ] No gradient tint on card surfaces
- [ ] Visual result reviewed and approved before shipping

**3. Preset selector in Customize Theme**
A side-by-side or stacked preview showing both presets. User taps one to select it.

*Acceptance criteria:*
- [ ] Both presets rendered as mini-previews showing the header, a sample card, and a sample stat tile
- [ ] Selected preset highlighted with accent color border
- [ ] Change applies immediately (no save button required)
- [ ] Works alongside existing accent color picker without conflict

**4. Persist to AsyncStorage and sync to backend**

*Acceptance criteria:*
- [ ] Preset selection persisted in AsyncStorage immediately on change
- [ ] `PUT /auth/ui-preferences` endpoint accepts `{ mode, accent, preset }`
- [ ] `GET /auth/me` response includes `ui_preferences`
- [ ] On app launch, AsyncStorage value loads first (instant), then synced value from server replaces it silently if different (no flash)
- [ ] Backend migration adds `ui_preferences` JSONB column to `users` table, defaulting to hobbyist

**5. Web CSS variable implementation**
Web applies preset via `data-preset` attribute on `<html>`. Tailwind reads from CSS variables.

*Acceptance criteria:*
- [ ] `data-preset="keeper"` on `<html>` applies compact token values across the web app
- [ ] `data-preset="hobbyist"` restores gradient and spacious token values
- [ ] `ThemeProvider.tsx` sets the attribute on mount and on change
- [ ] No hardcoded gradient/height/radius values remain in web components (or they are documented as intentional exceptions)

---

### Nice-to-Have — P1

**6. Onboarding preset selection**
During the 4-screen mobile onboarding, show a "choose your style" step with both presets as interactive previews. New users select before reaching the main app.

*Acceptance criteria:*
- [ ] Preview shows real app chrome (not just color swatches)
- [ ] Selection persists and syncs same as in-app selection
- [ ] Skippable (defaults to Hobbyist)

**7. Profile menu icon system cleanup**
Profile menu icons currently use ad-hoc colors (blue/pink/yellow/gray with no system). With the preset refactor creating a tokenized color layer, align menu icon colors to a defined palette: `accent` for primary actions, `muted` for settings, `gold` for premium items, `neutral` for everything else.

**8. Keeper preset: list-view default**
When Keeper preset is active, default the collection screen to list view instead of grid view (since list is more data-dense). Respect user overrides.

---

### Future Considerations — P2

**9. Naturalist preset** — earth tones, `#8B4513` primary, field-journal aesthetic. Requires the ADR-001 architecture to already be in place (so this is free once P0 ships).

**10. Light mode for Keeper preset** — Keeper preset with a light background for users who work in daylight. Requires a systematic light-mode pass on all Keeper-specific components.

**11. Community-submitted presets** — allow verified users to submit presets for curation. Marketplace-style. Requires a preset submission, moderation, and distribution pipeline. Not in scope for v1 architecture but should not be architecturally blocked by ADR-001.

**12. Preset scheduling** — automatically switch to Keeper at 9am and Hobbyist at 6pm (like Night Shift). Novelty feature, not on the critical path.

---

## Success Metrics

### Leading Indicators (measurable within 2 weeks of launch)

| Metric | Target | Method |
|---|---|---|
| % of users who visit Customize Theme and see the preset selector | 30% within 14 days | Analytics event on screen view |
| % of users who switch from Hobbyist → Keeper | 15–25% of those who visit Customize Theme | Analytics event on preset change |
| Preset switch session abandonment | < 5% (user switches then immediately reverts) | Compare `preset_changed` events |

### Lagging Indicators (measurable at 30/60/90 days)

| Metric | Target | Method |
|---|---|---|
| 30-day retention: Keeper users vs Hobbyist users | Keeper ≥ 5pp higher retention | Retention cohort split by preset |
| Feature depth (breeding/analytics/husbandry usage): Keeper vs Hobbyist | Keeper users use 2+ "serious" features at higher rate | Feature usage by preset cohort |
| Support tickets about "app looks wrong after update" | Zero increase post-launch | Tag support tickets |

### Guard Rails (if these move, investigate immediately)

- Overall 7-day retention must not decrease >2pp vs pre-launch baseline
- Crash rate must not increase (preset loading is synchronous, risk of flash/crash on launch)
- App review score must not decrease (monitor for "app changed my settings" 1-star reviews)

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| Should the onboarding step be added to v1 or deferred to P1? | Product (Cory) | No — default to Hobbyist for new users if onboarding step is cut |
| Should expert/advanced experience level in the user profile auto-suggest the Keeper preset? | Product (Cory) | No — ship as passive option first, personalized suggestion is a follow-up |
| Does the web "deeper features" (admin panel, breeding module, analytics) need its own preset audit before shipping? | Engineering (Cory) | Yes for P0 — do a quick scan before shipping web variant, log exceptions |
| Should `ui_preferences` be its own endpoint or part of the user profile PATCH? | Engineering (Cory) | No — either approach works, choose what's simpler |

---

## Timeline Considerations

No hard external deadline. Internal phasing recommendation:

- **Week 1:** ADR-001 approved → Mobile preset architecture (ThemeContext refactor + component audit). This is the riskiest part — touching many files.
- **Week 2:** Keeper preset values + Customize Theme UI + AsyncStorage persistence. Ship internally and dogfood.
- **Week 3:** Backend migration + sync endpoint + web CSS variables + web ThemeProvider update.
- **Week 4:** QA all 4 combinations (hobbyist×dark, hobbyist×light, keeper×dark, keeper×light) on both platforms. Fix regressions. EAS update for mobile. Vercel auto-deploy for web.

Dependencies:
- Alembic migration for `users.ui_preferences` must run before web sync works (but AsyncStorage works independently before then).
- Mobile refactor (Week 1) must complete before Customize Theme UI (Week 2) — no parallelism opportunity since it's a solo codebase.

---

## Appendix — Preset Visual Comparison

| Dimension | Hobbyist | Keeper |
|---|---|---|
| Header height | 130pt — gradient | 56pt — flat |
| Card radius | 16–24pt | 8–12pt |
| Row height | 52pt | 44pt |
| Card surfaces | Tinted/gradient wash | Flat, border-only |
| Icon style | Duotone (colored fills) | Line (stroked) |
| Display typography | Heavy (oversized h1) | Bold (standard weight) |
| Elevation | Drop shadow | 1pt border |
| FAB | Gradient | Flat accent fill |
| Default collection view | Grid | List |

