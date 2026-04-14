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

**Backend** (pivoted to existing `user_theme_preferences` table — less work than new `ui_preferences` JSONB):
- [x] ~~**Alembic migration** — `a1b2c3d4e5f7` adds `aesthetic_preset` column to `user_theme_preferences`~~ (2026-04-14)
- [x] ~~**Extend backend schemas** — `ThemePreferencesBase` + `ThemePreferencesUpdate` now include `aesthetic_preset`~~ (2026-04-14)
- [x] ~~No new endpoint needed~~ — existing `PUT /api/v1/theme-preferences/` handles it

**Mobile** (cross-device sync):
- [x] ~~**`loadFromAPI`** — reads `aesthetic_preset` from server response~~ (2026-04-14)
- [x] ~~**`saveToAPI`** — includes `aesthetic_preset` in PUT body~~ (2026-04-14)
- [x] ~~**`setAestheticPreset`** — AsyncStorage + background API sync on every toggle~~ (2026-04-14)

**Web**:
- [x] ~~**Web CSS variables** — `[data-preset="keeper"]` + `[data-preset="hobbyist"]` blocks in `globals.css` with radius, padding, row-height, shadow, gradient tokens~~ (2026-04-14)
- [x] ~~**Extend `tailwind.config.js`** — `borderRadius`, `spacing`, `boxShadow` read from CSS custom properties~~ (2026-04-14)
- [x] ~~**Preset utility classes** — `.rounded-preset-{sm/md/lg}`, `.shadow-preset`, `.card-preset`, `.btn-primary-preset`, `.row-preset` in `@layer utilities`~~ (2026-04-14)
- [x] ~~**`themeStore.ts`** — `aestheticPreset` state, `setAestheticPreset` action, `applyColorsToDOM` sets `data-preset` on `<html>`, `loadFromAPI`/`saveToAPI` synced, localStorage persisted~~ (2026-04-14)
- [x] ~~**`ThemeProvider.tsx`** — watches `aestheticPreset`, triggers `applyColorsToDOM`~~ (2026-04-14)

**Remaining**:
- [ ] **Web component audit** — scope to 5 primary pages (dashboard, collection, community, search, profile); replace hardcoded gradient/radius/height with preset utility classes
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
