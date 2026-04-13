# Sprint Plan: Theme Preset System
**Dates:** 2026-04-14 — 2026-05-08 (4 weeks, two 2-week cycles)
**Team:** 1 (Cory — solo full-stack)
**Sprint Goal:** Ship the Keeper/Hobbyist aesthetic preset system across mobile and web, with cross-device sync, so serious keepers have a first-class tool aesthetic and all users carry their preference everywhere they log in.

> **Estimation key:** 1 point = ~half day of focused solo-dev work. Planning at 70% capacity (accounts for interruptions, context-switching, debugging variance). 20 working days × 70% = 14 effective days = **28 points total capacity.**

---

## Capacity

| Person | Available Days | Effective Days (70%) | Points | Notes |
|--------|---------------|----------------------|--------|-------|
| Cory | 20 | 14 | 28 | Solo — full-stack across mobile, API, web |
| **Total** | **20** | **14** | **28** | |

---

## Phase 1 — Sprint 1 (Apr 14–25): Mobile Architecture

**Phase goal:** The mobile app reads all visual tokens from ThemeContext. No hardcoded gradients, header heights, or radii remain. Both presets render correctly end-to-end on mobile.

### Sprint 1 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Create `presets.ts` with `PRESETS` object (`hobbyist`, `keeper`) | 1 | Pure data — low risk |
| P0 | Extend `ThemeContext` to accept + merge preset tokens into context value | 2 | Critical path — everything downstream depends on this |
| P0 | Audit all mobile components for hardcoded header height — replace with `theme.header.height` | 2 | Search: hardcoded `130`, `height: 130`, `paddingTop` in header components |
| P0 | Audit all mobile components for hardcoded gradients — replace with conditional on `theme.header.useGradient` | 3 | Most complex task — gradient appears in header, FAB, stat card icons, active tabs |
| P0 | Audit all mobile components for hardcoded border radii — replace with `theme.radius.*` | 2 | Lower complexity but wide surface area |
| P0 | Audit all mobile components for hardcoded card padding / row height — replace with `theme.density.*` | 1 | Lower complexity |
| P0 | Verify semantic tokens are immutable (danger, warning, success, sex colors not inside preset bundles) | 1 | Spot-check + grep |
| P0 | Smoke test: render all 5 main tabs in both presets × both modes (4 combos) | 2 | Manual QA on device/simulator — document any regressions |
| P1 | Persist `preset` selection to AsyncStorage alongside existing `auth_token` | 1 | Straightforward |
| P1 | Build preset selector UI in "Customize Theme" screen — side-by-side mini previews | 3 | Most design-intensive task in Sprint 1 |
| **Sprint 1 Total** | | **18** | **Leaves 10 pts for Phase 2** |

### Sprint 1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gradient appears in more places than expected — audit uncovers 20+ touch points | Scope blows Phase 1 | Time-box audit to 1 day. If >15 touch points found, split into "critical path" (header, FAB) and "cosmetic" (stat card tints can follow in a separate PR) |
| ThemeContext refactor breaks existing dark/light mode behavior | All screens regressed | Keep existing `colors` object untouched; only ADD preset-derived fields. Merge, don't replace. |
| Mini-preview in preset selector is hard to make accurate | P1 task blocks Phase 1 from feeling complete | De-risk: use a simplified static mockup (not live-rendered) for v1 preview. Upgrade to live render in Phase 2. |

### Sprint 1 Definition of Done

- [ ] `PRESETS` object committed to `apps/mobile/src/contexts/presets.ts`
- [ ] `ThemeContext` shape extended with `preset` dimension
- [ ] Zero hardcoded `130` (header height) values remaining in mobile app (verified by grep)
- [ ] Zero unconditional `LinearGradient` in header components — all gated on `theme.header.useGradient`
- [ ] All 4 combos (hobbyist×dark, hobbyist×light, keeper×dark, keeper×light) render without crash on iPhone simulator
- [ ] Keeper preset visually looks like a flat, compact tool app (sign-off required before Sprint 2)
- [ ] Preset selector UI accessible in "Customize Theme" screen
- [ ] Selection persisted to AsyncStorage

---

## Phase 2 — Sprint 2 (Apr 28–May 8): Backend + Web + QA

**Phase goal:** Preset preference syncs to the backend and follows users to the web. QA complete. Both platforms ship.

### Sprint 2 Backlog

| Priority | Item | Est | Notes |
|----------|------|-----|-------|
| P0 | Write Alembic migration: add `ui_preferences` JSONB to `users` | 1 | Follow existing migration naming convention |
| P0 | Extend `UserUpdate` schema + `GET /auth/me` response to include `ui_preferences` | 1 | Add `UIPreferences` Pydantic model |
| P0 | Implement `PUT /auth/ui-preferences` endpoint | 1 | Or fold into `PUT /auth/profile` — decide in implementation |
| P0 | Wire mobile sync: on preset change, fire `PUT /auth/ui-preferences` in background; on launch, fetch and merge with AsyncStorage (AsyncStorage wins if network unavailable) | 2 | Async fire-and-forget on change; merge on cold start |
| P0 | Add CSS custom property blocks to `apps/web/src/app/globals.css` for both presets | 1 | `[data-preset="keeper"]` + `[data-preset="hobbyist"]` |
| P0 | Extend `tailwind.config.ts` to read radius/spacing/height from CSS vars | 1 | Low risk; Tailwind already supports `var()` |
| P0 | Update `ThemeProvider.tsx` on web to read `ui_preferences.preset` from session and set `data-preset` on `<html>` | 2 | Must handle: logged-out default (hobbyist), SSR hydration (avoid flash) |
| P0 | Web component audit: identify any hardcoded gradient/radius/height values — replace with CSS var-derived Tailwind classes | 3 | Scope unknown until audit. Time-box to 1.5 days. Document exceptions. |
| P0 | Final QA: all 4 preset×mode combos on mobile + web. Test sync (change on mobile, reload web). | 2 | Requires staging or local test setup |
| P1 | EAS OTA update for mobile changes | 0.5 | `eas update --branch production` |
| P1 | Vercel auto-deploy for web (triggered by push) | 0 | Automatic |
| P1 | Add preset dimension to CLAUDE.md architecture section | 0.5 | Documentation |
| **Sprint 2 Total** | | **15** | Within 10pt budget (buffer on Sprint 1 carries forward) |

### Sprint 2 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Web SSR hydration mismatch — server renders without `data-preset`, client sets it, causes flash | Users see Hobbyist flash → Keeper on every page load | Solve with: read `ui_preferences` in `getServerSideProps`/layout-level session, set `data-preset` in the `<html>` tag server-side |
| Alembic migration fails on production due to locked tables | Deployment blocked | Use `IF NOT EXISTS` and test migration on a local Neon clone first |
| Web component audit finds deeply nested hardcoded values in complex pages (analytics, breeding module) | Scope creep | Scope the P0 audit to the 5 primary pages (dashboard, collection, community, search, profile). Log the rest as P1 follow-up. |
| `eas update` takes longer to propagate than expected | Mobile users on old build see inconsistent sync behavior | Force-update check on app foreground (already handled by Expo's OTA update mechanism) |

### Sprint 2 Definition of Done

- [ ] `users.ui_preferences` column exists in production database
- [ ] `GET /auth/me` returns `ui_preferences` object
- [ ] `PUT /auth/ui-preferences` endpoint live and tested
- [ ] Changing preset on mobile syncs to web within one login session
- [ ] Web renders Keeper preset with compact header, flat surfaces, correct radius tokens
- [ ] Web renders Hobbyist preset with gradient header (unchanged from today)
- [ ] No SSR hydration flash on web for returning users with a saved preset
- [ ] EAS OTA update pushed to `--branch production`
- [ ] Vercel deployment confirmed live
- [ ] CLAUDE.md updated with preset system architecture notes
- [ ] Design audit doc updated to mark P0 items as resolved

---

## Stretch Items (cut if either sprint runs long)

| Item | Phase | Points | Why it's a stretch |
|------|-------|--------|--------------------|
| Keeper preset sets collection default to list view | 1 | 1 | Behaviour change — needs careful state management |
| Profile menu icon color system cleanup | 1 | 2 | Design polish, not blocking |
| Onboarding preset selection step | 2 | 3 | P1 feature, adds test surface |
| Static mini-preview → live-rendered preview in preset selector | 2 | 2 | Nice-to-have polish |

---

## Key Dates

| Date | Milestone |
|------|-----------|
| Apr 14 | Sprint 1 kicks off — begin ThemeContext refactor |
| Apr 17 | ThemeContext + presets.ts complete; begin component audit |
| Apr 21 | Component audit complete; begin preset selector UI |
| Apr 25 | Sprint 1 complete — Keeper preset visually correct on mobile, sign-off |
| Apr 28 | Sprint 2 kicks off — begin backend migration |
| Apr 30 | Backend endpoints live in staging |
| May 5 | Web implementation complete |
| May 7 | Final QA pass — all 4 combos on both platforms |
| May 8 | EAS update + Vercel deploy — **shipped** |

---

## Carryover from Previous Sprints

None for this initiative — it's greenfield. However, the following items from the design audit backlog run in parallel and should not be blocked by this sprint:

- P0 accessibility labels sweep (separate PR, low risk of conflict)
- Activity feed template rewrite (separate component, no token dependency)
- "d" badge → "Fed today" copy fix (1-line change, ship anytime)

---

## Post-Sprint: Measure

Schedule a check-in at **+14 days post-launch** to review:
- % of users who visited Customize Theme (target: 30%)
- % who switched to Keeper (target: 15-25% of visitors)
- Any crash reports related to theme loading
- Any "app looks different" support tickets

Full 30-day retention cohort review scheduled for **June 8**.

