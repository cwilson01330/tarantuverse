# Handoff: Tarantuverse + Herpetoverse redesign (Home & Collection)

## Overview

A design review of the two React Native (Expo) keeper apps in the `tarantuverse` monorepo, with proposed revisions for the four highest-traffic screens:

| App | Screen | Source file today |
|---|---|---|
| Tarantuverse | Dashboard / Home | `apps/mobile/app/(tabs)/index.tsx` |
| Tarantuverse | Collection | `apps/mobile/app/(tabs)/collection.tsx` |
| Herpetoverse | Home | `apps/mobile-herpetoverse/app/(tabs)/dashboard.tsx` |
| Herpetoverse | Collection | `apps/mobile-herpetoverse/app/(tabs)/index.tsx` |

The brief was **flow, consistency, and discoverability** — not a repaint. The Tarantuverse gradient identity stays. The changes are hierarchy, navigation, and card structure.

## About the design files

`Design Review.dc.html` in this bundle is a **design reference created in HTML** — a prototype showing intended look and structure, not production code to copy. Each screen appears twice: the current build recreated from source ("Today"), and the proposal ("Proposed"). Rationale sits to the right of each pair.

The task is to **recreate the "Proposed" screens in the existing React Native environment** using the apps' established patterns (`useTheme()`, `StyleSheet.create`, `MaterialCommunityIcons`, `expo-router`). Do not port HTML/CSS. Every value below is already expressible in the current theme system.

## Fidelity

**High fidelity.** Colors, type sizes, spacing and radii below are exact and come from the apps' own theme files. Recreate the layout precisely; pull colors from `useTheme().colors` rather than hardcoding the hex values listed here.

---

## Screen 1 — Tarantuverse Home

**Purpose:** land the keeper on the weekly job (feeding) and expose every feature the app has.

### Layout (top to bottom)

1. **Header** — gradient band, `LinearGradient` `[colors.primary, colors.secondary]`, start `{x:0,y:0}` end `{x:1,y:1}`.
   - Left: greeting `20/700` `#fff`; subtitle `12/400` `rgba(255,255,255,.72)` — `"{n} animals · {m} species"`.
   - Right: three 22px icons, gap 16 — `magnify`, `bell-outline`, `message-outline`.
   - Replaces the current centered "Dashboard" title and the separate in-body `topGreeting` Text.
2. **Body** — `padding: 16`, vertical stack, `gap: 12`. Children must not shrink (`flexShrink: 0`).
3. **Feeding hero card** — `surface`, `borderRadius: 18`, border `#3a2030` when overdue > 0 else `colors.border`.
   - Head row: `padding: 16 16 14`, bottom border `colors.border`.
     - 44×44 `borderRadius: 14` icon well, bg `rgba(239,68,68,.14)`, icon `silverware-fork-knife` 24px `#ef4444`.
     - Count `28/700` + `"due today"` `15/600`; sub-line `13/400` `textTertiary` — taxa breakdown.
     - `Start` button — gradient `PrimaryButton`, `padding: 9 16`, `borderRadius: 12`, label `14/700 #fff`.
   - List: up to 3 rows, `padding: 8 8`, `gap: 12`, 38×38 `borderRadius: 10` thumb, name `14/600`, meta `12/400` with the overdue delta in `getFeedingDaysColor()`.
   - Trailing 34×34 `borderRadius: 10` outlined check button — one-tap mark-fed (reuse `handleMarkFed`).
   - Footer link `See all {n} →`, `13/600 colors.accent`.
   - **This card replaces both the "Needs Feeding" stat tile and the entire "Feeding Alerts" section** — they render the same `/inverts/feeding-status` data today.
4. **Stat strip** — 3 equal cards, `gap: 8`, `borderRadius: 14`, `padding: 10 12`.
   - Label row: 14px icon + `11/600 textSecondary`. Value `22/700`. Footer `11/400 textTertiary`.
   - Premolt (`butterfly-outline`, `#8b5cf6`) · Molts (`arrow-expand-vertical`, `colors.accent`) · Feeders (`fridge-outline`, `#22c55e`).
5. **"Everything else" grid** — section label `12/600`, `letterSpacing: .1em`, uppercase, `textTertiary`; trailing `Customize` link `12/600 colors.accent`.
   - 4-column grid, `gap: 8`, tile `borderRadius: 14`, `padding: 10 4`, `gap: 6`.
   - 38×38 `borderRadius: 19` halo, `colors.primary + '1F'`, icon 20px `colors.accent`.
   - Label `10.5/600`, centered, `lineHeight: 1.25`.
   - Tiles: Add · Analytics · Breeding · Species · Enclosures · Feeders · Forums · Import.

### Tab bar

Five tabs: **Home · Collection · Species · Community · You**. Remove `href: null` from the `species` screen. `search`, `scorpions`, `enclosures`, `forums` stay routable but reach the user through the tools grid.

---

## Screen 2 — Tarantuverse Collection

**Purpose:** browse and triage the collection; photos lead.

### Layout

1. **Header** — same gradient band. Title `Collection` `20/700`; subtitle `"{n} animals · {m} species"`. Right icons: `magnify`, `tune-variant`, `view-grid-outline` (search / filter+sort sheet / layout toggle).
   - **Deletes from the body:** the search `TextInput`, the sort chip row, the `🕷️ My Collection` + ViewToggle row, and the `📊 Collection Stats` card (it duplicates Home).
2. **Filter chip row** — horizontal scroll, `gap: 7`, chip `padding: 7 13`, `borderRadius: 10`, `12.5/600`.
   - Chips carry counts: `All 62`, `Due 7` (leading `alert-circle` 14px `#ef4444`), then one chip per **owned** taxon with its MDI glyph + count. Port `ownedTaxa` from `apps/mobile-herpetoverse/app/(tabs)/index.tsx` — today all 11 taxa render regardless of ownership.
3. **Card grid** — 2 columns, `gap: 12`, card `borderRadius: 16`, `borderWidth: 1`.
   - **Photo** `aspectRatio: 4/5` (was a fixed 150px height).
   - Overlays, maximum two: sex chip top-right (24×24, `borderRadius: 12`, `rgba(10,10,15,.7)` when unknown, `#ec4899`/`#3b82f6` when known, 14px glyph); premolt pill bottom-left only when active (`padding: 4 9`, `borderRadius: 9`, `rgba(139,92,246,.92)`, `butterfly-outline` + "Premolt", `11/700 #fff`).
   - **Body** `padding: 11 12 12`: keeper name `15/600`; scientific name `12/400 italic textTertiary`. **Drop the third line** — the current card prints the common name in the title and again below it.
   - **Status footer**: `marginTop: 9`, `paddingTop: 9`, top border `#22222e`; 7px dot + `12/600` label — `Fed 1d ago` / `17d overdue` (overdue uses `#ef4444` at `700`).
   - The feeding badge, sex badge, premolt badge and taxon glyph currently all overlay the photo; premolt and taxon are both `bottom/left: 8` and collide.
4. **FAB** unchanged — 56px, gradient, `right: 20`, `bottom: insets.bottom + 20`.

### Bug to fix here

`app_screens/01.png` shows `✓ nulld ago` — a null `days_since_last_feeding` concatenated into the badge string. Guard for never-fed and render `Not yet fed`.

---

## Screen 3 — Herpetoverse Home

Same skeleton as Tarantuverse Home, same spacing values, emerald palette.

- **Header gradient**: `LinearGradient ['#065F46', '#0B0B0B']`, same start/end. `layout.useGradient` already exists in the HV theme and is unused.
- Header subtitle: `"3 of 5 animals · Free plan"` — remove the duplicate cap counter from the Collection stat card.
- Feeding hero: identical structure; icon well `rgba(244,63,94,.14)` / `#F43F5E`; `Start` button solid `#10B981` with `#0B0B0B` label.
- Stat strip: Species (`dna`, `#34D399`) · Feeders (`snowflake`, `#0EA5E9`) · Sheds (`weather-windy`, `#F59E0B`).
- Tools grid (8): Add · Feeders · Morphs · Weigh-in · Log shed · QR upload · Import · Species. All of these are shipped features with no current entry point.
- **Upgrade row** at the bottom: `borderRadius: 14`, `1px dashed #2e3b34`, `padding: 13 14`, `arrow-up-circle-outline` 22px `#34D399`, title `13/600`, sub `11.5/400`, trailing `Upgrade` `12/700 #34D399`.

### Tab bar

**Home · Collection · Species · Breeding · You** — four slots shared with Tarantuverse, one differentiating slot.

---

## Screen 4 — Herpetoverse Collection

**Purpose:** the husbandry loop in one tap per animal.

1. **Header** — emerald gradient, title + `"3 of 5 animals"`, right icons `magnify` / `tune-variant` / `view-grid-outline`.
   - **Removes** the current four unlabeled 22px header actions (`bell-outline`, `fridge-outline`, `tray-arrow-down`, `silverware-fork-knife`). Feeders and Feeding Day move to the Home tools grid; Import moves into the add flow; the bell moves to Home.
2. **Filter chips** — same spec as Tarantuverse, with counts.
3. **Row card** — horizontal, `borderRadius: 16`, `borderWidth: 1`, overflow hidden.
   - **Photo column 96px full-bleed** on the left (was a 56px inset thumbnail).
   - Right column `padding: 12 12 12 14`, `gap: 7`:
     - Name `16/600`; species line `12/400 italic textTertiary` — **append the morph** (`Python regius · Pastel het Clown`); sex glyph 17px right-aligned.
     - Status line: 7px dot + `12/600` delta text (`4d overdue` `#F59E0B`, `16d overdue` `#F43F5E`, `Fed 3d ago` `textSecondary`), then a `·`-separated secondary fact (weight, `CGD`, `in blue`).
     - **Action row**, `gap: 7`: primary `flex: 1` button `padding: 7 0`, `borderRadius: 9`, `#10B981` bg / `#0B0B0B` label `12/700` — reads `Fed`, or `Refresh CGD` when `feeds_on_cgd`; then two 38px outlined buttons (`weather-windy` = log shed, `scale-bathroom` = log weight), border `#2c2c2c`, icon 15px `textSecondary`.
   - These three actions already exist in `src/components/AnimalActionSheet.tsx` behind an unadvertised long-press. Surfacing them on the card is the single biggest discoverability win in this app; keep the long-press sheet for Edit.

### Bug to fix here

In `ReptileCard`, `styles.fedChip` has `marginTop: 6` inside a `cardIndicators` row that is `alignItems: 'center'` — the Fed chip hangs low against the sex chip and day pill. Remove the margin.

---

## Interactions & behavior

- **Feeding hero check button** → `POST` a feeding via the existing quick-feed path (`quickFeedAnimal` in HV, `handleMarkFed` in TV), then optimistically remove the row and decrement the count. Refetch on settle.
- **`Start`** → `router.push('/feeding-day')`.
- **`See all {n} →`** → `/feeding-day`.
- **Filter chips** → local state, no refetch; `Due` filters on the server's `is_overdue`.
- **Header `tune-variant`** → bottom sheet holding sort (A–Z / Last fed / Acquired) and any secondary filters. Reuse the `AddPickerSheet` / `AnimalActionSheet` sheet shell.
- **Header `view-grid-outline`** → toggles grid ↔ list, persisted (TV already stores `viewMode`).
- **Card tap** → detail route; **long press** → existing action sheet.
- **Pull to refresh** → unchanged on all four screens.
- Loading skeletons unchanged. Empty states: keep the existing copy, swap the emoji for the mapped MDI icon.

## State

No new endpoints. Everything on the proposed Home comes from calls the screens already make:

- `/inverts/feeding-status` (TV) / `/animals/feeding-status` (HV) — hero count, taxa breakdown, rows
- `/inverts/` and `/analytics/collection` (TV) / `/animals/` (HV) — header subtitle
- `/premolt/dashboard` (TV) — premolt stat
- `/animals/limits` (HV) — cap subtitle + upgrade row
- Feeder stock stat needs the existing feeders list endpoint summed client-side

## Design tokens

Pull from `useTheme().colors` — never hardcode. Listed for reference.

**Tarantuverse dark** (`apps/mobile/src/contexts/ThemeContext.tsx`)

| Token | Value |
|---|---|
| background | `#0a0a0f` |
| surface | `#1a1a24` |
| surfaceElevated | `#2a2a3a` |
| border | `#2a2a3a` |
| textPrimary / Secondary / Tertiary | `#e5e7eb` / `#d1d5db` / `#9ca3af` |
| primary / secondary / accent | `#0066FF` / `#FF0099` / `#3385FF` |
| success / warning / error / info | `#22c55e` / `#eab308` / `#ef4444` / `#3b82f6` |
| male / female | `#3b82f6` / `#ec4899` |

**Herpetoverse dark** (`apps/mobile-herpetoverse/src/contexts/ThemeContext.tsx`)

| Token | Value |
|---|---|
| background / surface / surfaceRaised | `#0B0B0B` / `#171717` / `#262626` |
| border | `rgba(38,38,38,.7)` |
| textPrimary / Secondary / Tertiary | `#F5F5F5` / `#A3A3A3` / `#737373` |
| primary / secondary / accent | `#10B981` / `#059669` / `#34D399` |
| danger / warning / success / info | `#F43F5E` / `#F59E0B` / `#10B981` / `#0EA5E9` |
| on-primary text | `#0B0B0B` |

**Spacing** — `apps/mobile/src/theme/tokens.ts` `SPACING` (4/8/12/16/24/32). Already written and documented; the dashboard and collection screens currently hardcode instead of importing it.

**Typography** — `tokens.ts` `TYPE`: display 28/700, title 24/700, heading 18/700, subheading 16/600, body 14/400, bodyStrong 14/600, label 13/500, caption 12/500.

**Radius** — from `layout.radius` (`hobbyist` 12/16/24, `keeper` 8/12/16). Cards in the proposal use `md`; the feeding hero uses 18 (add it or round to `lg`).

### Reconcile the drifted values

The two dashboards are ports of each other and have slid apart. Pick one and share it:

| Token | TV today | HV today | Use |
|---|---|---|---|
| Stat icon box | 40 | 36 | **40** |
| Stat value | 24 | 26 | **26** |
| Section title | 18 | 17 | **18** |
| Alert thumbnail | 40 | 42 | **40** |
| Card radius | 12 | 12–16 | **16** |
| Elevation | shadow | border | from `layout.elevation` |

Move both apps onto `tokens.ts` and promote it into `packages/shared` so this stops recurring.

## Assets & icons

No new assets. Replace every emoji used as UI with `MaterialCommunityIcons` (the apps already import it):

| Emoji | MDI name |
|---|---|
| 🕷️ | `spider` |
| 🦂 | `zodiac-scorpio` |
| 🦋 | `butterfly-outline` |
| 🔮 | `clock-alert-outline` |
| 🍽️ | `silverware-fork-knife` |
| 📊 | `chart-line` |
| 👥 | `account-multiple` |
| ✅ | `check-circle-outline` |
| ⚠️ | `alert` |
| 🐍 | `snake` |
| 🦎 | `turtle` — **note: there is no `lizard` glyph in MDI**; `turtle` is the closest real herp icon. Verify before use. |
| 🐛 / 🪱 | `bug-outline` / `dots-horizontal` |

Emoji may stay in the taxon registry glyphs on the add-picker, where the playfulness is intentional.

## Light mode

Herpetoverse's `ThemeContext` exports a single frozen `darkTheme`. Tarantuverse's exports the full light branch plus 11 species palettes and the Keeper/Hobbyist density presets, with the same context shape. Port Tarantuverse's `ThemeContext` to Herpetoverse (swapping the default palette to emerald) — that delivers light mode, theming and density in one change and puts both apps on one theme API.

## Suggested order

1. Feeding hero on both Home screens — one card, no new data, removes a duplicate section.
2. Tools grid + five-tab spine — the discoverability fix.
3. Card rework in both Collections — also kills the `nulld ago` bug.
4. Emoji sweep + shared tokens package.
5. Port `ThemeContext` to Herpetoverse.

## Files

- `Design Review.dc.html` — the full review: four Today/Proposed screen pairs, findings, and the cross-app system section. Open in any browser.

## Not covered in this pass

Animal detail, Breeding, Settings/Profile, and onboarding were reviewed at a source level but not redesigned.
