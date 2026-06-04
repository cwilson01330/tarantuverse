# Tasks

## Active

### 🔄 ADR-005 Inverts Consolidation · A1+A2+B+C2+C3 shipped 2026-05-27, soak window open

Plan: `docs/design/PLAN-inverts-consolidation-v1.md` · Decision: `docs/design/ADR-005-inverts-consolidation.md`

**Shipped:**
- [x] ~~Phase A1 — additive schema migration: `inverts` + `invert_species` tables + `invert_id` companion columns on the 5 polymorphic log tables (inv_20260527)~~
- [x] ~~Phase A2 — dual-write service (`inverts_dualwrite.py`) wired into every legacy CRUD route (4 entity routers, 5 log routers, 24 mirror call sites)~~
- [x] ~~Phase B — backfill script (`backfill_inverts.py`) verified clean on prod: 1440 tarantulas + 127 species mirrored, 1527 log rows linked, all checks at 0~~
- [x] ~~Phase C2 — centipede launch on unified surface: CHECK widening migration (cip_20260527), `/centipedes/` + `/centipede-species/` routers, centipede-parented log endpoints, 9-species seed~~
- [x] ~~Phase C3 — mobile centipede UI: lib, detail/add/edit/log/photo screens, collection tab integration, species browser segment, care sheet with biology callout~~
- [x] ~~`AddPickerSheet` — left-aligned bottom sheet replacing native Alert.alert for the add-to-collection taxon picker~~

**Remaining (gated):**
- [ ] **Phase C1 — read cutover on legacy routes**: switch `/tarantulas/` + `/scorpions/` handlers to read from `inverts WHERE taxon=…` while keeping response shapes identical for older mobile clients. Medium risk, reversible. Start after soak window confirms backend stable.
- [ ] **Phase D — drop dual-write + legacy tables**: gated for 2+ weeks after C1 ships. Snapshot DB before running. Irreversible without snapshot restore.

---

### 🌡️ Sensor Integration · scoped 2026-06-04

Discussed direction: tiered approach. v1 covers SwitchBot (cleanest API) + generic webhook ingest endpoint for DIY tier. Iterate to Govee + Shelly after launch.

- [ ] **Data model** — `enclosure_readings` table (id, enclosure_id, source enum, recorded_at, temp_f, humidity_pct, battery_pct, raw_payload jsonb) + `sensor_connections` table (per-user provider auth + enclosure mapping)
- [ ] **SwitchBot integration** — Open API v1.1, cloud poll every 10 min via background job, OAuth-style API key entry
- [ ] **Generic webhook ingest** — `POST /enclosures/{id}/readings` with per-enclosure secret token (DIY ESP32 path)
- [ ] **Environment tab on enclosure detail** — current reading + 24h/7d/30d sparkline + battery status pill
- [ ] **Out-of-range alerts** — pull thresholds from `invert_species.temperature_min/max` + `humidity_min/max`
- [ ] **Rate limiting + per-user opt-in** — guard against scale (1000 keepers × 10min polls)

Stretch (after launch):
- [ ] Govee integration (H5101 / H5179, requires WiFi gateway)
- [ ] Shelly H&T Plus integration (local LAN HTTP API + cloud API)
- [ ] Sensorpush integration (premium tier, rate-limited API)

---

### 🎯 Add-Flow Streamline · parked 2026-06-04

Replace the bottom-sheet picker + separate add screens with a single form that has a taxon segment control at the top. Species autocomplete scoped to the active taxon. "I don't see my species" affordance routes to freehand scientific_name entry.

- [ ] **Prototype on `centipede/add.tsx`** — net-new screen with cleanest field set; least risk
- [ ] **Visual sign-off** — share the prototype before extending to tarantula + scorpion add screens
- [ ] **Roll out to scorpion + tarantula add screens** — same shape, taxon-specific field blocks toggle based on segment selection

---

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
- [ ] **QRSheet generalization** — currently tarantula-only; extend to scorpions + centipedes so any taxon can spawn an offline upload QR
- [ ] **Sensor integration v1.1** — Govee API (H5101 / H5179) after SwitchBot launches
- [ ] **Sensor integration v1.2** — Shelly H&T Plus (local LAN + cloud)
- [ ] **Sensor integration premium tier** — Sensorpush (rate-limited API, premium accuracy)
- [ ] **Centipede care sheet images** — sourcing pipeline for the 9 v1 species (currently image_url=null)

---

## Done

- [x] ~~AddPickerSheet bottom sheet — left-aligned taxon picker replacing Alert.alert~~ (2026-06-04)
- [x] ~~ADR-005 Phase C3: Centipede mobile UI (lib, 7 screens, collection integration, species browser segment, care sheet with biology callout)~~ (2026-05-27)
- [x] ~~ADR-005 Phase C2: Centipede backend launch (CHECK widening migration, `/centipedes/` + `/centipede-species/` routers, centipede log endpoints, 9-species seed)~~ (2026-05-27)
- [x] ~~ADR-005 Phase B: Backfill script — 1440 tarantulas + 127 species mirrored, 1527 log rows linked, all checks at 0~~ (2026-05-27)
- [x] ~~ADR-005 Phase A2: Dual-write service wired into 4 entity routers + 5 log routers (24 mirror call sites)~~ (2026-05-27)
- [x] ~~ADR-005 Phase A1: Additive `inverts` + `invert_species` schema, `invert_id` companion columns~~ (2026-05-27)
- [x] ~~Mobile Collection consolidation — single Collection tab with taxon filter + add-picker, hide separate Scorpions tab~~ (2026-05-22)
- [x] ~~Unified species browser — taxon switcher segment between tarantula + scorpion catalogs~~ (2026-05-22)
- [x] ~~Scorpion Phase 3b: Mobile detail/add/edit/log screens + photo upload + QR + species browser + care sheet~~ (2026-05-22)
- [x] ~~Scorpion Phase 3a: Mobile lib, types, collection screen, tab nav consolidation~~ (2026-05-22)
- [x] ~~Scorpion Phase 2: 25-species seed script~~ (2026-05-22)
- [x] ~~Scorpion Phase 1b: Polymorphic FK extensions (feeding/molt/substrate/photo/QR) for scorpion_id~~ (2026-05-22)
- [x] ~~Scorpion Phase 1a: Migration + models + schemas + 4 new routers (scorpions, scorpion_species, scorpion_colonies, broods)~~ (2026-05-22)
- [x] ~~CGD (Crested Gecko Diet) feeding flag — herp_species.feeds_on_cgd + animals.feeds_on_cgd_override + UI + brand picker~~ (2026-05-22)
- [x] ~~HV mobile notifications service + native install + preferences screen~~ (2026-05-22)
- [x] ~~HV mobile + web settings parity~~ (2026-05-22)
- [x] ~~Password recovery per-app frontend_url + web /reset-password + mobile forgot-password~~ (2026-05-22)
- [x] ~~ADR-003: Single animals table (HV) — snake/lizard/frog consolidated~~ (2026-05-14)
- [x] ~~TV Path C: Feeding pause UX — backend column, web detail, mobile detail, collection grid overdue suppression~~ (2026-05-01)
- [x] ~~HV reptile breeding parity — backend + web + mobile (TV 6a-6i)~~ (2026-04 → 2026-05)
- [x] ~~Fix silent 401 failures: align session maxAge, add expired token redirect on web and mobile~~ (2026-04-13)
- [x] ~~Fix label print: use outerHTML to preserve theme styles, strip preview zoom~~ (2026-04-13)
- [x] ~~Platform design audit (9 screens + accessibility + design system)~~ (2026-04-13)
- [x] ~~ADR-001: Multi-axis theme preset system~~ (2026-04-13)
- [x] ~~PRD: Theme preset system~~ (2026-04-13)
- [x] ~~Sprint plan: Theme preset system~~ (2026-04-13)
- [x] ~~Sprint 1 mobile: ThemeContext preset axis, AppHeader, PrimaryButton, full gradient migration~~ (2026-04-14)
- [x] ~~Update CLAUDE.md with multi-taxon platform changes + recent changelog~~ (2026-06-04)
