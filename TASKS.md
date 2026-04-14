# Tasks

## Active

### 🎨 Theme Preset System — Sprint 1 (Mobile Architecture) · ✅ SHIPPED 2026-04-14

- [x] ~~Extend ThemeContext with `AestheticPreset` axis + `LayoutTokens` (useGradient, radius, density, elevation)~~
- [x] ~~`_layout.tsx`: conditional gradient vs flat header for all tab screens~~
- [x] ~~`AppHeader` component: gradient/flat modes, leftAction + rightAction props~~
- [x] ~~`PrimaryButton` component: LinearGradient in Hobbyist, flat solid in Keeper~~
- [x] ~~Migrate all 13 gradient button/FAB/header files to preset-aware components~~
- [x] ~~Appearance settings: App Style section with Hobbyist/Keeper picker~~
- [x] ~~Archive 22 stale root-level docs to `docs/implementation/`~~
- [x] ~~Smoke test 4 combos (hobbyist×dark, hobbyist×light, keeper×dark, keeper×light)~~
- [ ] **Audit: hardcoded border radii** — 452 instances; incremental replacement as files are touched (not a blocker)
- [ ] **Audit: hardcoded card padding / row height** — replace with `layout.density.*` (Sprint 2 scope)

---

### 🔗 Theme Preset System — Sprint 2 (Backend + Web + QA) · due 2026-05-08

- [ ] **Alembic migration** — add `ui_preferences` JSONB to `users` table
  - Follow naming convention from existing migrations
  - Default: `{"mode": "dark", "accent": "hobbyist", "preset": "hobbyist"}`

- [ ] **Extend backend schemas** — add `UIPreferences` Pydantic model to `schemas/user.py`; update `GET /auth/me` response

- [ ] **Implement `PUT /auth/ui-preferences` endpoint** — or fold into existing profile PATCH

- [ ] **Wire mobile sync** — fire `PUT /auth/ui-preferences` on preset change; merge server value on cold start (AsyncStorage wins if offline)

- [ ] **Web CSS variables** — add `[data-preset="keeper"]` + `[data-preset="hobbyist"]` blocks to `apps/web/src/app/globals.css`

- [ ] **Extend `tailwind.config.ts`** — read radius/spacing/height from CSS custom properties

- [ ] **Update `ThemeProvider.tsx`** — read `ui_preferences.preset` from session; set `data-preset` on `<html>` server-side to avoid hydration flash

- [ ] **Web component audit** — scope to 5 primary pages (dashboard, collection, community, search, profile); replace hardcoded gradient/radius/height with CSS-var-derived Tailwind classes; log exceptions

- [ ] **Final QA** — all 4 combos on mobile + web; test cross-device sync (change on mobile → reload web)

- [ ] **EAS OTA update** — `eas update --branch production`

- [ ] **Update CLAUDE.md** — add preset system to architecture section

- [ ] **Mark P0 audit items as resolved** in `PLATFORM_DESIGN_AUDIT_2026-04-13.md`

---

### 🐛 Design Audit — Quick Wins (ship anytime, no sprint dependency)

- [ ] **Fix "d" badge copy** — replace cryptic green "d" with "Fed today" or "✓ today"
  - File: collection card component (mobile)
  - Est: 30 min

- [ ] **Activity feed template** — rewrite `ActivityFeedItem` to include tarantula name + species + thumbnail
  - Files: `apps/mobile/src/components/ActivityFeedItem.tsx`, `apps/web/src/components/ActivityFeedItem.tsx`
  - May need richer payload from `apps/api/app/routers/activity.py`
  - Est: 3–4 hrs

- [ ] **Search input contrast fix** — give search input a flat `theme.surface` background, not the full gradient
  - File: mobile Search screen
  - Est: 30 min

- [ ] **Accessibility labels sweep** — add `accessibilityLabel` / `aria-label` to stat cards, sex badges, emoji headings, "Log" buttons
  - Est: 2–3 hrs across mobile + web

- [ ] **Group Profile menu sections** — Account / Customization / Content / Subscription / Help / Danger
  - Demote Logout to neutral color; keep Delete Account in `semantic.danger` red
  - File: `apps/mobile/app/(tabs)/profile.tsx`
  - Est: 1 hr

- [ ] **FAB bottom padding** — add bottom padding = FAB height + 16pt on all scroll views to prevent card overlap
  - Est: 30 min

---

## Waiting On

- [ ] **Keeper preset visual sign-off** — review Keeper mode renders before Sprint 2 kicks off · since 2026-04-25 (target)
  - Block: Sprint 2 should not start until visual quality is confirmed

---

## Someday

- [ ] **Naturalist preset** — earth tones, `#8B4513` primary, field-journal aesthetic (ADR-001 architecture makes this trivial once preset system ships)
- [ ] **Onboarding preset selection step** — side-by-side choice during welcome flow (P1 in PRD)
- [ ] **Keeper preset: list view default** — when Keeper active, default collection to list view
- [ ] **Light mode for Keeper preset** — systematic light-mode pass on Keeper-specific components
- [ ] **Letter avatars for keepers** — gradient-backed initials for users without profile photos
- [ ] **Default card art for photo-less tarantulas** — genus silhouette + gradient monogram
- [ ] **Activity feed filters** — All / Following / You + reaction support
- [ ] **Unread badges on bottom tabs** — Community (forum replies) + Profile (DMs)
- [ ] **Stripe/PayPal payment integration** — complete subscription monetization
- [ ] **Icon system consolidation** — migrate all emoji-as-UI to Phosphor or Lucide

---

## Done

- [x] ~~Fix silent 401 failures: align session maxAge, add expired token redirect on web and mobile~~ (2026-04-13)
- [x] ~~Fix label print: use outerHTML to preserve theme styles, strip preview zoom~~ (2026-04-13)
- [x] ~~Platform design audit (9 screens + accessibility + design system)~~ (2026-04-13)
- [x] ~~ADR-001: Multi-axis theme preset system~~ (2026-04-13)
- [x] ~~PRD: Theme preset system~~ (2026-04-13)
- [x] ~~Sprint plan: Theme preset system~~ (2026-04-13)
- [x] ~~Sprint 1 mobile: ThemeContext preset axis, AppHeader, PrimaryButton, full gradient migration~~ (2026-04-14)
