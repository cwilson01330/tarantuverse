# Handoff: Tarantuverse + Herpetoverse redesign (Home & Collection)

## Overview

A design review of the two React Native (Expo) keeper apps in the `tarantuverse` monorepo, with proposed revisions for the twelve highest-traffic screens:

| App | Screen | Source file today |
|---|---|---|
| Tarantuverse | Dashboard / Home | `apps/mobile/app/(tabs)/index.tsx` |
| Tarantuverse | Collection | `apps/mobile/app/(tabs)/collection.tsx` |
| Herpetoverse | Home | `apps/mobile-herpetoverse/app/(tabs)/dashboard.tsx` |
| Herpetoverse | Collection | `apps/mobile-herpetoverse/app/(tabs)/index.tsx` |
| Tarantuverse | **Animal detail (standardize)** | `app/tarantula/[id].tsx` **+** `app/invert/[id].tsx` |
| Tarantuverse | Species browser | `apps/mobile/app/(tabs)/species.tsx` |
| Tarantuverse | Species care sheet | `apps/mobile/app/species/[id].tsx` |
| Tarantuverse | Add flow | `src/components/AddPickerSheet.tsx` + `app/tarantula/add.tsx` |
| Tarantuverse | Colonies | `app/colony/[id].tsx`, `app/colony/add.tsx`, colony card in `(tabs)/collection.tsx` |
| Herpetoverse | Animal detail | `src/screens/AnimalDetailScreen.tsx` + `src/components/reptile-detail/ReptileDetailShared.tsx` |
| Herpetoverse | Add reptile | `app/reptile/add.tsx` |
| Herpetoverse | Breeding | `app/(tabs)/breeding.tsx` |

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

## Screen 12 — Tarantuverse Animal detail — STANDARDIZE

**This is the app's most-visited screen and it currently exists twice.**

### The problem

| | `app/tarantula/[id].tsx` | `app/invert/[id].tsx` |
|---|---|---|
| Size | **1,297 lines** | **426 lines** |
| Built from | bespoke inline markup | shared `Section` / `InfoRow` / `LogSection` |
| Hero | 250px full-width image | 180px inset card |
| Name block | 28px title + scientific + common | 22px title + scientific |
| Identity | `infoGrid` — icon + label + value tiles | `InfoRow` — label/value rows |
| Log lists | 3 hand-rolled, each with own `showAll…` state | `LogSection`, hard-capped `.slice(0, 5)` |
| Provenance | **absent** | present |
| Transfer / rehome | **absent** | present |
| Breeding pairings | **absent** (despite being a registered tarantula module) | present |
| Action bar | pinned Feed / Molt / Substrate / Photo | **none** — per-section text links only |

Routing is a ternary in `(tabs)/collection.tsx` and `(tabs)/index.tsx`:

```tsx
item.taxon === 'tarantula' ? `/tarantula/${item.id}` : `/invert/${item.id}`
```

So the keeper's core screen changes shape based on which animal they tapped, and every feature since the split has been built twice or landed on one side only.

### The mechanism already exists

`src/lib/taxon-modules.ts` declares per-taxon opt-in modules — `premolt`, `feedingStats`, `growth`, `breeding` — plus `growthLengthLabel(taxon)`. It was written for exactly this. **Build ONE `AnimalDetailScreen` that reads the registry, and delete both files.** Tarantula stops being a special case and becomes a row of flags.

```
TAXON_MODULES = {
  tarantula: ['premolt', 'feedingStats', 'growth', 'breeding'],
  scorpion:  ['growth', 'breeding'],
  centipede: ['growth'],
  mantis:    ['growth'],
  roach:     [],
  …
}
```

Two registry rows are worth confirming with the team before you build:
- **`roach: []`** — every module off ("growth off at launch"), yet roaches are the taxon most likely to be kept as a colony where population tracking matters.
- **`feedingStats` is tarantula-only** because the endpoint is `/analytics/tarantulas/{id}/feeding-stats`. Generalising it to `/analytics/inverts/{id}/feeding-stats` lights the module up for all eleven taxa.

### Proposed layout — one shell

Structurally identical to Screen 9 (HV animal detail). Build the two as one shared shell if you can; at minimum keep them visually identical.

1. **Full-bleed hero**, `height: 214`, scrim `linear-gradient(transparent, rgba(0,0,0,.82))`.
   - Floating 38px circular back / share / overflow buttons at `top: 50`.
   - **Photo-count chip** bottom-right: `padding: 5 10`, `borderRadius: 9`, `rgba(10,10,15,.62)`, `image-multiple-outline` + count → opens the gallery. Today the hero shows one photo and the gallery of the rest is ten sections down.
   - Name `24/700` + sex glyph 17px inline. Subtitle `13/400`: `<i>{scientific_name}</i> · {age} · {taxon icon} {taxon label}`.
   - **Remove the `AppHeader`.** On the tarantula screen the name currently renders three times (header, 28px title, then `common_name` on both line two and line three of the same block).
2. **One feeding card**, `borderRadius: 18`, border `#2a3040` (or the overdue tint).
   - Head: 42px `borderRadius: 13` tinted icon well; verdict as a sentence `15.5/700` ("Feed in 3 days" / "Feed now — 4 days overdue"); reasoning `12.5/400` ("Every 14d · 92% accepted · fed 11d ago").
   - Action row: primary gradient `Fed — cricket` (repeats the last prey type), 44px `tune-variant` for the full form, 44px `pause` wired to the existing `PauseFeedingSheet`.
   - This absorbs `FeedingStatsCard`'s headline numbers and the pause banner.
3. **Stat strip** — three cards, `borderRadius: 14`, `padding: 9 11`. Contents are registry-driven: Molts (count + last date) · size using `growthLengthLabel(taxon)` with delta · Premolt % (only when the `premolt` module is on; otherwise show acceptance rate).
4. **One interleaved timeline** replacing four independent lists (feedings, molts, substrate changes, and on inverts breeding).
   - Filter chips: All / Feed / Molt / Sub (+ registry-driven extras).
   - Rows `borderRadius: 13`, `padding: 9 12`: 32px tinted type icon, sentence `13.5/600` ("Ate a cricket", "Molted — 5.5\" leg span", "Substrate changed"), relative date `11.5/400`, right-aligned outcome or delta.
   - Replaces three `showAll…` toggles and three bespoke empty states with one list and one empty state.
5. **Collapsed rows with previews** `borderRadius: 13`, `padding: 11 14`, title `14/600` + 18px icon: Husbandry ("Coco fibre · 3\""), Provenance ("@spidershack"), Growth (chart), Transfer / rehome, Notes. Registry-gated; a taxon without `growth` simply has one fewer row.
6. **Pinned action bar** — four equal columns, icon 20px + label `10.5/600`: Feed / Molt / Substrate / Photo, labels from the registry. **Inverts have no pinned bar today at all** — logging a scorpion feeding means scrolling to find a text link.

### State

No new endpoints. The unified screen fetches the same data both screens already fetch; the timeline is a client-side merge of the log arrays sorted by date desc and tagged by type. `showAllFeedings` / `showAllMolts` / `showAllSubstrate` are replaced by one filter + paging state, and the invert screen's hard `.slice(0, 5)` cap goes away.

---

## Screen 5 — Tarantuverse Species browser

**Purpose:** browse 312 care sheets across ten taxa; today it is effectively hidden.

### Navigation change (do this first)

The route is `href: null` in `(tabs)/_layout.tsx`. Its only entry points are a 24px `book-open-variant` icon in the Collection header and a Quick Actions tile below the dashboard fold. **Give Species a permanent tab** in the five-tab spine.

### Layout

1. **Header** — gradient band. Title `Species` `20/700`; subtitle `"312 care sheets · 10 taxa"`. Right icons `tune-variant`, `bookmark-outline`.
   - **Search moves into the header**: `borderRadius: 12`, `rgba(255,255,255,.16)`, `padding: 9 12`, `magnify` 19px, placeholder `15/400 rgba(255,255,255,.75)`.
   - Deletes the in-body 28px "Species Database" title block, the "Browse by animal type" label, the ten-pill segment control, the "Care level" label and the standalone result count — roughly 260px of chrome before the first result today.
2. **Filter chip row** — horizontal scroll, `gap: 7`, chip `padding: 7 13`, `borderRadius: 10`, `12.5/600`. `All 312` leads, then one chip per taxon with its MDI glyph + count. Care level moves into the `tune-variant` sheet.
3. **"Good for beginners" shelf** — section label `12/600` uppercase `letterSpacing: .1em` `textTertiary`, trailing `See all` `12/600 accent`.
   - Horizontal scroller, tile `width: 104`, `borderRadius: 14`; 74px image block; name `12/600`, scientific `10.5/400 italic`.
   - Query is `care_level = 'beginner'` ordered by `times_kept` — data you already return. Obvious follow-on shelves: "Species you keep", "Most kept this month", "Communal-safe".
4. **Result rows** (replaces the 2-up card grid) — `borderRadius: 16`, `borderWidth: 1`, overflow hidden.
   - 88px full-bleed image column left.
   - Right column `padding: 11 12 11 13`, `gap: 6`:
     - Common name `15/600`; scientific name `12/400 italic textTertiary`; `check-decagram` 16px `#22c55e` right-aligned when `is_verified`.
     - Badge row: care level as **a word in a tinted pill** — `padding: 3 8`, `borderRadius: 7`, `11/700`, bg `color + '24'` (Beginner `#22c55e`, Intermediate `#eab308`, Advanced `#f97316`). Then `Hot venom` (`alert`, `#ef4444`) and/or `Communal` (`account-multiple`, `#3b82f6`) when applicable.
     - Facts line `11.5/400 textTertiary` — `Terrestrial · 5–6" · New World`.
     - Optional social proof `11.5/400` — `Kept by 1,204 keepers` (`times_kept`).

### Why rows instead of the current grid

Most catalog entries have no photo, so the current 160px image area renders a block of emoji. Rows fit the same information in less height, give care level and venom tier room to be words, and put biome/size/hemisphere on one scannable line.

### Specific defects

- **Care level is a colored circle containing `✓` / `⚠` / `⚡` / `?`** (`careLevelBadge`, 28px) with the word rendered nowhere on the card. Nothing teaches the mapping and colour alone fails for colour-blind keepers.
- **Ten taxon pills in a horizontal `ScrollView`** hide seven options with no affordance; a tarantula-only keeper still scrolls past Vinegaroons, Roaches and Other. Lead with `All` and carry counts.
- `imageGradient` is a flat `rgba(0,0,0,0.2)` block over the bottom 30% of the image, not a gradient — it reads as a grey band. Use a real `LinearGradient` or drop it.

---

## Screen 6 — Tarantuverse Species care sheet

**Purpose:** decide whether to keep this species, then keep it.

### Layout

1. **Hero** `height: 192` (was 280) — image, bottom scrim `linear-gradient(transparent, rgba(0,0,0,.8))`.
   - Floating 38px circular back button top-left; `bookmark-outline` + `share-variant-outline` top-right, same treatment.
   - Common name `13/600 rgba(255,255,255,.8)` **above** the scientific name `23/700 italic #fff` — the common name is how people search and speak.
   - Badge row `gap: 7`, badge `padding: 5 10`, `borderRadius: 9`, `11.5/700`: care level, `Hot venom` when `medically_significant_venom`, biome on a neutral `rgba(10,10,15,.55)` chip.
2. **Quick stats** — one row of four, `gap: 8`, card `borderRadius: 14`, `padding: 11 10`, centered: MDI icon 18px, value `15/700`, label `10.5/400 textTertiary`.
   - `arrow-expand-horizontal` size · `thermometer` temp · `water-percent` humidity · `trending-up` growth. Replaces the 📏📈🌡️💧 wrapping grid.
3. **Safety line** — single card, `borderRadius: 12`, `borderLeft: 3px solid #ef4444`, `padding: 12 14`. `alert` 19px; title `13.5/700` combining both hazards; body `12.5/400 textTertiary`, `lineHeight: 1.5`.
   - Replaces two stacked warning blocks (~150px) that repeat what the hero badges and the Behavior accordion already say.
4. **Accordions** — `borderRadius: 14`, `padding: 13 14`, title `15/700` + 19px `accent` icon.
   - **Enclosure expands by default** — it is the reason people open a care sheet.
   - Collapsed rows **preview their contents** on the right in `12/400 textTertiary`: Feeding → `Adult 1×/wk`, Overview → `India · Skittish`, Community → `318 keepers · 4.6`.
   - Expanded content: label/value rows, `13px`, label `textTertiary`, value `600 textPrimary`.
5. **Pinned action bar** — `flex: none`, `padding: 12 16 26`, top border.
   - Primary `flex: 1`, `borderRadius: 13`, `padding: 13 0`, gradient, `plus` 18px + `Add to collection` `14.5/700 #fff` → routes to the add form **prefilled with this species**.
   - Secondary 50px outlined `compare` button.

### Specific defects

- **No call to action.** A keeper who decides to buy the species must back out, find Collection, tap the FAB, choose a taxon and retype the name. The pinned bar is the highest-value change on this screen.
- **All five accordions default closed**, so the sheet opens as five grey bars.
- **Two care-sheet implementations**: tarantulas render `app/species/[id].tsx`, the other nine taxa render `app/invert-species/[id].tsx`. The browser already normalises all ten into one `Row` union — the detail screen should too, with taxon-conditional sections.
- Emoji in body copy: `⚠️ MEDICALLY SIGNIFICANT VENOM`, `📚 Source`, `⭐ 4.6`, and `Medically Significant ⚠️` as an `InfoRow` value. Replace with icons per the mapping table below.

---

## Screen 7 — Adding an animal

**Purpose:** get a new animal into the collection with the least possible ceremony.

### The problem

Today: tap FAB → pick one of eleven taxa in a bottom sheet → land in one of three different forms (`/tarantula/add`, `/invert/add?taxon=`, `/colony/add`) → choose between two form modes → fill up to 22 fields. **Four decisions before the keeper types anything**, none of which they are thinking about.

### Specific defects

- **Two picker rows are visually identical.** `AddPickerSheet` ROWS gives Scorpion and Vinegaroon the same `🦂` glyph, and Tarantula and True spider the same `🕷`. The source comments on running out of emoji.
- **The sheet has no `ScrollView`.** Eleven rows × ~64px + title + cancel exceeds the sheet height on a 375×812 device — the last rows, **including Colony**, are unreachable.
- **22 fields for one animal**, all optional: species lookup, common name, scientific name, nickname, sex, life stage, date acquired, last fed, source, enclosure type, enclosure size, substrate type, substrate depth, last substrate change, temp min/max, humidity min/max, misting schedule, notes.
- **Species lookup already fills common + scientific name**, yet both remain as separate editable inputs directly beneath it.
- **A mode toggle in the header** (`Guided` / `All fields`, `quickMode` state) exists because the form is too long either way. Switching modes also resets `currentStep` to 0.
- **Save is hard to reach**: the wizard's primary button reads `Next →` and only becomes Save on step 3; the header Save renders only in quick mode.
- The step indicator costs a permanent ~60px band (28px circles, 10px labels).

### Proposed layout — one screen

1. **Header** — gradient band. `close` left, `Add to collection` centred `17/700`, `tray-arrow-down` (Import) right.
2. **"What is it?"** — section label `12/600` uppercase `letterSpacing: .1em` `textTertiary`.
   - Species search field, `borderRadius: 13`, focused border `colors.primary`, `magnify` 21px, input `16px`.
   - Results list `borderRadius: 13`: 40px thumb, common name `14.5/600`, scientific `12/400 italic`, care-level pill right. Selected row tinted `colors.primary + '14'`.
   - Last row: `pencil-outline` + "Not listed — enter manually" (reveals the free-text name fields).
   - Helper line: "Taxon is set from the species — no picker needed." **This retires `AddPickerSheet` entirely**; the species record's taxon selects the create endpoint.
3. **"What do you call it?"** — nickname input, then two segmented rows (sex, life stage), button `padding: 11 0`, `borderRadius: 11`, `13/600`.
4. **Care-sheet prefill card** — `borderRadius: 14`, `padding: 13 14`, `auto-fix` 20px `accent`; title `13.5/700`; summary line `12.5/400` listing the values pulled; trailing toggle, on by default.
   - **This is the highest-value change in the flow.** The species record already carries `type`, `enclosure_size_*`, `substrate_type`, `substrate_depth`, `temperature_min/max`, `humidity_min/max`. The form currently asks the keeper to retype all of it.
5. **Three collapsed rows**, `borderRadius: 13`, `padding: 13 14`, title `14.5/600` + 18px icon, right-side preview `12/400 textTertiary`:
   - Provenance → "Acquired today"
   - Enclosure & environment → "Prefilled" (in `accent`)
   - Photo & notes
6. **Pinned action bar** — `padding: 12 16 26`, top border. Primary `flex: 1`, `borderRadius: 13`, gradient, label names the animal: `Add Mexican Red Knee`. Secondary 52px `plus-box-multiple-outline` = save and add another (for keepers unboxing a shipment of slings).

Delete the wizard, the step indicator, the mode toggle and `quickMode` state.

---

## Screen 8 — Colonies

**Purpose:** a colony is a *population*, not an animal. The screens currently treat it as one.

### Colony card in the collection

Today `renderColony` reuses `styles.card` — the same photo card as a tarantula — with three overlays on a 150px image: a "Colony" tag top-right (`rgba(139,92,246,.9)`), the count top-left, and `taxonGlyph` bottom-left that **duplicates the placeholder emoji rendered directly behind it**.

**Proposed:** colonies break out of the 2-up grid into full-width rows, pinned above the animal cards under a "Colonies" label.

- Row `borderRadius: 16`, `padding: 13 14`, `gap: 10`.
- 40px `borderRadius: 11` taxon tile (icon, not photo); name `15/600`; species `12/400 italic`.
- Right: headcount `18/700`, below it 30-day delta `11.5/700` with `trending-up`/`trending-down` in `success`/`error`.
- Full-width 7px stage proportion bar + a legend line `11/400` ("660 nymphs · 180 adults").
- No overlays, no photo.

### Colony detail

1. **Header** — gradient band, back arrow, name `19/700`, subtitle `"{species} · colony"`, `dots-horizontal` right.
2. **Population card** (replaces the hero photo as the first element) — `borderRadius: 18`, `padding: 16`, `gap: 13`.
   - Count `34/700` + `est.` when `count_is_estimated`; caption "population today".
   - Right-aligned trend: `trending-up` + `+106` `16/700` in `success`, caption "last 30 days".
   - **12-bar weekly series**, height 44, bar `borderRadius: 2`, gap 3, most recent bars in `colors.primary` fading back to a muted tint.
   - Stage rows: 60px label `11.5/400`, 7px `borderRadius: 4` track, value `12/700` right — proportion, not two boxes.
   - **All derivable from existing data**: `colony_events.count_delta` + `occurred_at` reduced over time, plus `stage_counts`.
3. **Four quick-log buttons**, `gap: 8`, tile `borderRadius: 13`, `padding: 11 0`: Births (`egg-outline`, success), Deaths (`skull-outline`, error), Removed (`export`, `#f97316`), Recount (`counter`, accent). Each opens a small sheet asking only stage + count.
   - Today all eleven `ColonyEventType`s render as equal emoji chips inside a disclosure panel that only appears after tapping "+ Add event" — and sits at the bottom of the scroll. The remaining seven types move behind "More" in that sheet.
4. **Recent activity** — three rows, `borderRadius: 13`, `padding: 11 13`. 34px tinted icon tile; **event phrased as a sentence** ("120 nymphs hatched") `14/600` with relative time `12/400` below; signed delta right-aligned `14/700` in the event's colour. Trailing "All events" link.
   - Today rows read "Birth / +120 nymphs · Jul 14" with an inline delete `✕` on every row — move destructive actions to swipe or long-press.
5. **Collapsed rows** for Husbandry (preview: "85–95°F · egg flats") and Care sheet.

### Photo

Nobody opens a colony to look at it. Demote the 150px hero to a thumbnail beside the title, or drop it.

### Colony creation

`colony/add.tsx` is a reasonable form, but the concept is discovered badly: "Colony" is row 11 of the taxon picker (below the fold, no scroll) with the hint "Track a communal/colony population" — which explains the concept to someone who must already understand it to find the row. **Make it a toggle on the unified add screen** — "one animal" vs "a population" — shown after the species is chosen, when the choice is concrete. The stage-bucket editor then replaces the sex/life-stage segments.

### Feature to consider

Most invert keepers run a roach or isopod colony **as a feeder source**, and the app already has a Feeders inventory. A "Removed" event that optionally credits feeder stock joins two features that currently don't know about each other.

---

## Screen 9 — Herpetoverse Animal detail

Files: `src/screens/AnimalDetailScreen.tsx`, `src/components/reptile-detail/ReptileDetailShared.tsx`

**Herpetoverse is pre-launch — this is the cheapest moment to move these.**

### Specific defects

- **The name renders twice within ~100px.** `AppHeader title={animalTitle(animal)}` and `ReptileHero title={animalTitle(animal)}` both print it.
- **Three cards answer one question.** `FeedingStatusBanner`, `FeedingIntelligence` and `CgdRefreshSection` stack in sequence before the log buttons.
- **Three lists of identical shape.** `Recent weigh-ins`, `Recent feedings`, `Recent sheds` — each sorted independently.
- **`sectionTitle` is 11px/700 with `letterSpacing: 1.5`** — below the app's own 12px caption floor, and five in a row give the screen no hierarchy.
- **Log actions are outlined secondary buttons** mid-scroll, and each opens a full form.
- Hero photo is 88×88 on a screen about an animal.

### Proposed layout

1. **Full-bleed hero**, `height: 214`, scrim `linear-gradient(transparent, rgba(0,0,0,.82))`. Floating 38px circular back / share / overflow buttons. Name `24/700` + sex glyph 17px inline; subtitle `13/400` — `<i>{scientific_name}</i> · {morph}`. **Same treatment as the species care sheet**, so detail screens rhyme across both apps. Remove the `AppHeader`.
2. **One feeding card**, `borderRadius: 18`. Head: 42px `borderRadius: 13` tinted icon well; verdict as a sentence `15.5/700` ("Feed now — 4 days overdue"); reasoning `12.5/400` ("Every 7d · prey 141–212 g (10–15% BW)"). Action row: primary `Fed — small rat` (reuses `quickFeedAnimal` with the remembered meal), plus 44px `tune-variant` (full form) and `pause` buttons. When `feeds_on_cgd`, the primary relabels to `Refresh CGD` — that retires `CgdRefreshSection`.
3. **Stat strip**, three cards, `borderRadius: 14`, `padding: 11 12`: Weight (value `17/800` + `+38 · 28d` delta `11/700` in `success`), Last shed, **Accepted %**.
   - Acceptance rate is new but free: feedings already carry an `accepted` flag, and refusal streaks are the earliest sign something is wrong. `92% · 24 of 26`.
4. **Photos** — 4-up `aspectRatio: 1` row, `borderRadius: 11`, last tile is a `+15` overflow chip.
5. **One timeline** replacing the three lists. Filter chips (All / Feed / Weight / Shed), then rows `borderRadius: 13`, `padding: 10 12`: 32px tinted type icon, sentence `13.5/600` ("Weighed 1,410 g", "Ate a small rat", "Shed complete"), relative date `11.5/400`, right-aligned delta or outcome.
6. **Collapsed Genetics row** with a preview ("Pastel · het Clown").
7. **Pinned log bar** — four equal columns (Feeding / Weight / Shed / Photo), icon 20px + label `10.5/600`.

---

## Screen 10 — Herpetoverse Add reptile

File: `app/reptile/add.tsx`

This form is already better than Tarantuverse's — one screen, sensible fields, taxon-aware placeholders via `TAXON_EXAMPLES`. Three changes:

1. **Invert the order.** It opens with a required taxon chip row, then Name, then Species, then Common name. Species search goes first; `taxon`, `common_name` and `feeds_on_cgd` all derive from the species record. Same layout as Screen 7 — the two apps should share this screen's structure exactly.
2. **Add a genetics field for snakes.** For a ball python keeper the morph *is* the animal, but there is no genotype input — every new snake must be saved, reopened, and edited through the detail screen's Genetics section. Put the gene chip picker on the add screen, gated to `taxon === 'snake'` like the detail screen already does. Chips `padding: 5 10`, `borderRadius: 9`, `12/700`, tinted per gene, with a dashed `+ Add gene` chip.
3. **Care defaults card** — same `auto-fix` prefill pattern, emerald: "Feed every 7d · 88–92°F hot side · 55–65%", toggle on by default.

Also: **"Feeds on CGD" is a bare toggle with no hint**, shown to keepers before they know the app changes feeding cadence based on it. Resolve it from the species (crested geckos already resolve server-side) and only surface the override when ambiguous.

Remaining fields (weight, hatch date, source, enclosure, notes) collapse into two disclosure rows. Pinned bar: `Add ball python` + `plus-box-multiple-outline` for save-and-add-another.

---

## Screen 11 — Herpetoverse Breeding

File: `app/(tabs)/breeding.tsx`

### Specific defects

- **~110px of permanent onboarding copy.** A `PAIRINGS` kicker, a "Breeding records" title that repeats the header, and a three-line paragraph about privacy defaults render on every visit forever. Move both to the empty state and the new-pairing form.
- **Rows show dates, not status.** `PairingRow` prints "♂ Loki × ♀ Kaa" and "Paired Mar 3 · separated Mar 9 · 🐍 Snake". Breeding season is a milestone sequence — pairing → ovulation → prelay shed → lay → hatch — and the keeper's question is always *what's next and when*.
- **The copy promises clutches and offspring the tab doesn't show.**
- **The morph calculator is never mentioned.** It exists at `/morph-calculator` and accepts `?snakeId=`, and a pairing is literally two parents with known genotypes.
- Empty state leads with a 🥚 emoji.

### Proposed layout

1. **Header** — emerald gradient. Title `Breeding` `20/700`, subtitle `"2026 season · 2 pairings, 1 clutch"`. Right: `calculator-variant-outline`, `plus`.
2. **Next-milestone hero**, `borderRadius: 18`, `padding: 15 16`: 44px `egg-outline` well; "Nova's clutch hatches in 18 days" `15.5/700`; "7 eggs · day 42 of 60 · 89°F" `12.5/400`.
3. **Season stat strip** — Pairings active / Eggs incubating / Hatched this season.
4. **Pairing cards**, `borderRadius: 16`, `padding: 13 14`, `gap: 11`:
   - Title row: `♂ Name × ♀ Name` `15/600` with sex glyphs in `#3b82f6` / `#ec4899`; right-aligned **stage pill** `padding: 4 9`, `borderRadius: 8`, `11/700`, tinted (Incubating → `success`, Prelay shed → `warning`).
   - **Four-stop progress track**: 9px dots joined by 2px connectors — Paired · Ovulation · Laid · Hatch. Completed `primary`, current `warning`, future `#2c2c2c`. Labels `9.5/400`.
   - Footer above a hairline: facts left (`7 eggs · laid Jun 15`), countdown or next action right (`18 days to hatch` / `Log next milestone`).
5. **Morph projection card** — dashed border, `calculator-variant-outline`, "Project this pairing's morphs" with the two parents' genotypes as the subtitle, routing into `/morph-calculator` prefilled from the pairing.

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
- **Species chip row** → local filter, no refetch. **`tune-variant`** → sheet holding care level + sort.
- **Species row tap** → care sheet. **`Add to collection`** → add form with `?species_id=` prefilled. **`bookmark-outline`** → local shortlist.
- **Species search in the add flow** → same endpoints `SpeciesAutocomplete` already uses; selecting a row sets `species_id`, `scientific_name`, `common_name`, `taxon`, and seeds the husbandry fields.
- **Prefill toggle off** → clears the seeded husbandry values but keeps the species link.
- **Save and add another** → POST, toast, reset the form but keep the species selected.
- **Colony quick-log** → `POST /colonies/{id}/events` with `event_type` + `stage` + `count_delta`; the population card and stage bars update optimistically.
- **HV detail timeline** → merge `weights`, `feedings` and `sheds` into one array sorted by date desc, tagged by type; the filter chips narrow client-side. No new endpoints.
- **HV pairing progress track** → derived from the milestone dates already on the pairing/clutch records; the current stage is the latest one with a date.
- Loading skeletons unchanged. Empty states: keep the existing copy, swap the emoji for the mapped MDI icon.

## State

No new endpoints. Everything on the proposed Home comes from calls the screens already make:

- `/inverts/feeding-status` (TV) / `/animals/feeding-status` (HV) — hero count, taxa breakdown, rows
- `/inverts/` and `/analytics/collection` (TV) / `/animals/` (HV) — header subtitle
- `/premolt/dashboard` (TV) — premolt stat
- `/animals/limits` (HV) — cap subtitle + upgrade row
- Feeder stock stat needs the existing feeders list endpoint summed client-side
- Species browser: `/species`, `/scorpion-species/`, `/invert-species/?taxon=` — unchanged. The beginners shelf and the chip counts are derived client-side from the rows already loaded.
- Add flow: no new endpoints. The species record supplies the taxon (choosing the create endpoint) and the husbandry defaults. `quickMode` / `currentStep` state is deleted.
- Colonies: `GET /colonies/`, `GET /colonies/{id}`, `GET /colonies/{id}/events`, `POST /colonies/{id}/events` — all exist. The trend series and 30-day delta are a client-side reduce over `count_delta` + `occurred_at`; no backend change needed.

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

## Assets & icons — READ THIS FIRST

**No new assets.** Every icon is `MaterialCommunityIcons` from `@expo/vector-icons`, which both apps already import.

### How to read the icons in `Design Review.dc.html`

The HTML prototype renders icons with the **MDI webfont**, so the markup looks like:

```html
<i class="mdi mdi-silverware-fork-knife"></i>
```

In the app that is:

```tsx
<MaterialCommunityIcons name="silverware-fork-knife" size={20} color={colors.primary} />
```

**Strip the `mdi-` prefix; the remainder is the `name` prop verbatim.** MaterialCommunityIcons *is* the MDI set, so the names are identical. Do not go looking for an icon library to install.

### Verified against your repo

Every name below was checked against the glyph map already present in this repo:

```
apps/mobile/node_modules/@expo/vector-icons/build/vendor/
  react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json
```

(`@expo/vector-icons ^15.0.2`, Expo ~54.) All of them resolve. To check any other name yourself:

```bash
node -e "const m=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');console.log('turtle' in m)"
```

> ⚠️ **`lizard` does not exist in MDI.** Use `turtle` for a generic non-snake herp, or `snake` as the taxon fallback. An unknown `name` renders an empty box **silently** — it does not throw, so a typo ships.

### Emoji → icon replacements

| Emoji | `name` |
|---|---|
| 🕷️ | `spider` |
| 🕸️ | `spider-web` |
| 🦂 (scorpion) | `zodiac-scorpio` |
| 🦂 (vinegaroon) | `spider-thread` — resolves the picker's duplicate-glyph collision |
| 🕷 (true spider) | `spider-web` |
| 🐛 | `bug-outline` |
| 🪱 | `slash-forward` |
| 🦗 | `grass` |
| 🪳 / 🐜 | `dots-hexagon` |
| 🐾 | `paw` / `paw-outline` |
| 🐍 | `snake` |
| 🦎 | `turtle` (no lizard glyph exists) |
| 🦋 | `butterfly-outline` |
| 🔮 | `clock-alert-outline` |
| 🍽️ | `silverware-fork-knife` |
| 📊 | `chart-line` |
| 👥 | `account-multiple` |
| ✅ | `check-circle` |
| ⚠️ | `alert` |
| 🥚 | `egg-outline` |
| 💀 | `skull-outline` |
| 🏜️ | `beach` |
| 🌳 | `tree-outline` |
| ⛰️ | `image-filter-hdr` |
| 📏 | `arrow-expand-horizontal` |
| 📈 | `trending-up` |
| 🌡️ | `thermometer` |
| 💧 | `water-percent` |
| 📚 | `book-open-page-variant` |
| ⭐ | `star` |
| ✓ ⚠ ⚡ ? (care level) | render the **word**, not a glyph |

### Full verified list used across the proposals

`spider`, `spider-web`, `spider-thread`, `zodiac-scorpio`, `bug-outline`, `dots-hexagon`, `slash-forward`, `grass`, `butterfly-outline`, `paw`, `paw-outline`, `snake`, `turtle`,
`silverware-fork-knife`, `food-drumstick`, `scale-bathroom`, `weather-windy`, `fridge-outline`, `snowflake`, `cup`, `pause`, `camera-outline`, `qrcode-scan`,
`arrow-expand-horizontal`, `arrow-expand-vertical`, `thermometer`, `water-percent`, `trending-up`, `tree-outline`, `image-filter-hdr`, `beach`, `check-decagram`, `clock-alert-outline`,
`egg-outline`, `skull-outline`, `export`, `counter`, `dna`, `calculator-variant`, `calculator-variant-outline`, `heart-multiple`, `heart-multiple-outline`, `timeline-outline`,
`view-dashboard`, `view-dashboard-outline`, `book-open-variant`, `book-open-page-variant`, `account-group`, `account-group-outline`, `account-multiple`, `account-multiple-outline`, `account-circle-outline`, `forum-outline`, `chart-line`, `chart-timeline-variant`,
`tune-variant`, `view-grid-outline`, `view-list`, `bookmark-outline`, `share-variant-outline`, `tray-arrow-down`, `home-variant-outline`, `magnify`, `history`,
`auto-fix`, `plus-box-multiple-outline`, `compare`, `tag-outline`, `pencil-outline`, `information-outline`, `alert`, `alert-circle`, `arrow-up-circle-outline`, `gender-male`, `gender-female`, `help-circle-outline`, `check`, `check-circle`, `close`, `close-circle`, `plus`, `plus-circle`, `plus-circle-outline`, `chevron-up`, `chevron-down`, `chevron-right`, `arrow-left`, `dots-horizontal`, `bell-outline`, `message-outline`, `cog`, `layers`, `ruler`, `star`, `cash`, `map-marker-outline`, `calendar-blank-outline`, `weight-gram`, `clipboard-text-outline`

Emoji may stay in the taxon-registry glyphs used by the add-picker rows, where the playfulness is intentional — but the proposal retires that picker anyway.

## Light mode

Herpetoverse's `ThemeContext` exports a single frozen `darkTheme`. Tarantuverse's exports the full light branch plus 11 species palettes and the Keeper/Hobbyist density presets, with the same context shape. Port Tarantuverse's `ThemeContext` to Herpetoverse (swapping the default palette to emerald) — that delivers light mode, theming and density in one change and puts both apps on one theme API.

## Suggested order

1. Feeding hero on both Home screens — one card, no new data, removes a duplicate section.
2. Tools grid + five-tab spine — the discoverability fix. Species gets a permanent tab.
3. **Unify the two TV detail screens onto one registry-driven shell** — highest-traffic screen, removes ~1,300 lines of divergence, and gives tarantulas provenance + transfer + breeding.
4. Card rework in both Collections — also kills the `nulld ago` bug.
5. `Add to collection` on the care sheet + Enclosure expanded by default — two small changes, large payoff.
6. Species browser rows + word-based care level.
7. Unified add screen + care-sheet prefill — retires `AddPickerSheet` and the wizard.
8. Colony population card, quick-log buttons, and the full-width colony row.
9. HV detail: one feeding card + one timeline + pinned log bar.
10. HV breeding: season overview, stage pills, progress track, morph-calculator link.
11. Emoji sweep + shared tokens package.
12. Port `ThemeContext` to Herpetoverse.

## Files

- `Design Review.dc.html` — the full review: twelve Today/Proposed screen sets, the findings summary, the cross-app system section, and a verified icon appendix. Open in any browser.

## Not covered in this pass

Settings/Profile, onboarding, Community/Forums, Analytics and Feeders were reviewed at a source level but not redesigned. The Herpetoverse species browser (`apps/mobile-herpetoverse/app/(tabs)/species.tsx`) should inherit the Tarantuverse browser changes once they land.
