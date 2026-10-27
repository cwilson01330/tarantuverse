# Handoff: Tarantuverse analytics redesign (web + mobile)

Scope: the keeper analytics screens, their entry points, and the per-animal chart visual language. Tarantuverse only. Nothing else in the apps changes.

## Files in this bundle

- `Analytics Redesign.dc.html` — the design. 1a recommendation + entry points · 1b the page in four theme combos · 1c every state · 1d web · 1e the two-page alternative (not shipping) · 1f chart grammar. Open in any browser.
- `README.md` — this document.

## Repo touchpoints

| Layer | File | Change |
|---|---|---|
| API router | `apps/api/app/routers/analytics.py` | small additions to `/collection` (§7); `/advanced/` unchanged |
| API schemas | `apps/api/app/schemas/analytics.py` | new optional fields on `CollectionAnalytics` (§7) |
| Web page | `apps/web/src/app/dashboard/analytics/page.tsx` | rebuild as the one page |
| Web page | `apps/web/src/app/dashboard/analytics/advanced/page.tsx` | **delete**; redirect to `/dashboard/analytics#premium` |
| Web nav | `apps/web/src/components/Sidebar.tsx`, `apps/web/src/app/dashboard/page.tsx` | sidebar row stays; Insights card on the dashboard; remove the Advanced quick action |
| Web shared | `apps/web/src/components/ui/card.tsx`, `UpgradeModal.tsx`, recharts | reuse |
| Mobile screen | `apps/mobile/app/analytics/index.tsx` | rebuild as the one page |
| Mobile screen | `apps/mobile/app/analytics/advanced.tsx` | **delete**; `router.replace('/analytics')` for any stale deep link |
| Mobile nav | `apps/mobile/app/(tabs)/index.tsx` | Insights card under the feeding hero; the Analytics tools-grid tile stays |
| Mobile nav | `apps/mobile/app/(tabs)/profile.tsx` | "Your collection" group with an Analytics row |
| Mobile charts | new `apps/mobile/src/components/charts/` (`Bars`, `StepLine`, `SplitBar`, `RankedRows`) on `react-native-svg` | replaces the hand-built `View` charts in `advanced.tsx` |
| Per-animal charts | `GrowthChart.tsx`, `FeedingStatsCard.tsx` (both platforms) | restyle only to the §6 grammar; same position on the detail screen |

Mobile is pure JS/TS over `react-native-svg` (already in the binary); ships OTA. No new native modules.

## 1 Decisions (§6 of the brief)

1. **One page.** Sex split, species and paid total appeared on both pages, so two pages never had a reason. One page also puts Premium in front of the 127 free keepers every time they open analytics, instead of behind a button on a page they rarely find. The two-page layout is drawn in 1e for comparison; it leaves a whole screen that is only a paywall.
2. **Navigation.** No new tab. Mobile: an **Insights card** on Home (second card, under the feeding hero) plus an **Analytics row** in You, plus the existing tools-grid tile. Web: the **Analytics sidebar row** (already there; the Advanced sub-route goes away) plus the same **Insights card** on the dashboard. The Insights card is what makes analytics get *opened*; the rows are what make it *findable*.
3. **Cards.** Keep Collection, Feeding, Molts, Recent, and the Premium set. New: **Right now** (Due to eat · Last molt · Longest gap). Merge: Notable Animals → Molts (per-animal rows); Top Species → Collection (full list ≤ 5, else top 5 + "n more"); Most Expensive + Spent this month + Feeding cost → one **Money** card. Drop: Total Activity, Average Price, Species Diversity, the pie, and By Group for single-taxon collections (it renders as a segmented bar otherwise). Breeding is not on the page.
4. **Charts.** One grammar on both platforms (§6): bars, a step line, a segmented bar, ranked rows. Mobile moves to `react-native-svg`; web keeps recharts configured to the same spec. Every chart has a sentence under it and a 0 / 1 / many rule.

## 2 Page structure (both platforms, top to bottom)

| # | Block | Free | Source |
|---|---|---|---|
| 0 | Header: "Analytics" + `"{n} animals · {m} species"` | ✓ | `/collection` |
| 1 | **Right now** — three tiles | ✓ | `/collection` (+ §7 asks) |
| 2 | **Collection** — counts, time with you, sex split, species list, paid in total | ✓ | `/collection` |
| 3 | **Feeding** — feedings, avg days between, per animal, one sentence | ✓ | `/collection` (+ §7) |
| 4 | **Molts** — per-animal ranked rows with last date | ✓ | `/collection` (+ §7) |
| 5 | **Recent** — three rows | ✓ | `/collection` |
| 6 | **Premium** label row | ✓ | — |
| 7 | **Molts, last 12 months** — bars | Premium | `/advanced/` |
| 8 | **Collection growth** — step line | Premium | `/advanced/` |
| 9 | **Enclosures** (and **By group** when >1 taxon) — segmented bar | Premium | `/advanced/` |
| 10 | **Money** — spent this month, paid for animals, est. feeding cost (editable) | Premium | `/advanced/`, `PUT /feeding-cost/` |

Web: block 1 is a 3-up row; blocks 2 and 3+4 sit side by side; 5 goes under Collection; 7–10 are a 3-up row (Enclosures folds into the Money column when present). Phone: one column, 16pt gutters, 12pt between cards.

**Requests.** Free keeper: one call (`/collection`). Premium keeper: two (`/collection`, `/advanced/`), fired together. The Premium section renders from `/advanced/`; a 402 switches it to the preview state. The Home Insights card makes **no extra call** (it reads `recent_activity` the Home already has).

## 3 Component specs

Values are the app's own tokens. Mobile reads `useTheme().colors` / `layout`; web uses the Tailwind theme classes. Never hardcode. Radii follow `layout.radius`: cards `lg` (Hobbyist 16 / Keeper 12), tiles `md`, chips `sm`. Elevation from `layout.elevation` (Hobbyist shadow, Keeper 1px `border`).

### Header
- Hobbyist: 130pt gradient `[primary, secondary]`, title `TYPE.title` white, subtitle `12/400` white at .75. Keeper: 56pt flat `surface` with bottom `border`, title `17/700 textPrimary`. Collapses to a compact bar on scroll (web: sticky page title).
- Subtitle states: loading → a 12pt bar at 30% white (Hobbyist) / `surfaceElevated` (Keeper), **no number**; error → `—`; zero animals → "No animals yet".
- Web only: a units line top-right in `text-theme-secondary` 12px: `"Inches · grams · your currency"` from the units helper. This is the only place the page names a unit.

### Right now tiles (3 across)
- `surface`, `border` 1px, radius `md`, padding `10 12`. Label row `11/600 textSecondary` with a 14pt icon; value `22/700 textPrimary`; caption `11/400 textTertiary`.
- Icons + colours are semantic and fixed across presets: Due `silverware-fork-knife` `error`; Last molt `butterfly-outline` `#8b5cf6`; Longest gap `clock-alert-outline` `warning`.
- Copy: **Due to eat** → value `{due_today}`, caption `"{first due name}, {days}d"` or `"{overdue} overdue"` when > 1. **Last molt** → relative time (`3d`, `2h`, `7mo`), caption name. **Longest gap** → `{days}d`, caption name. Web uses the long forms (`3 days ago`, `19 days`, `"Rosie, usually every 10"`).
- Zero animals: tiles are not rendered. Field missing from the API (not yet built): tile shows `—` with caption `"not available yet"`, never `0`.
- Tap → Due: `/feeding-day`; Last molt / Longest gap: that animal's detail.

### Collection card
- Title row: `spider` 18pt `accent` + `15/700`.
- Three figures `24/700` (web 26) with `11/400 textTertiary` captions: `animals`, `species`, `with you, avg` (web: `with you, average`). The third is `average_age_months` rendered as `1y 4m`; **never call it age.**
- Sex split: `SplitBar` (§6) + legend `12/400 textSecondary`: `gender-male` `male` colour, `gender-female` `female` colour, `help-circle-outline` `textTertiary`, each followed by `"{n} male / female / unsexed"`. Legend always shows all three, including zeros.
- Species: hairline, then rows `13px`, italic scientific name `textSecondary` left, count `600` right. ≤ 5 species → all rows. > 5 → top 5 with a 6pt `border` track + `primary` bar scaled to the top count, then `"{n} more species →"` `13/600 accent` opening a sorted list screen (`/analytics/species`, new, trivial).
- Footer: hairline, `Paid in total` `13 textSecondary` left; right `{total_value}` `700` + `"{priced} of {n} priced"` `11 textTertiary`. If `priced_count` is 0 → value `—` and the caption reads `"no prices entered"`. If the API ask isn't built yet, omit the caption and show the value only when `total_value > 0`, else `—`.

### Feeding card
- Title `silverware-fork-knife` + `15/700`. Figures: `feedings`, `between, avg` (`9d`; web `9 days`), `per animal` (`total_feedings / total_animals`, one decimal when < 10).
- Sentence `13/400 textSecondary` line-height 18: `"{name}'s {days}-day gap is the longest right now; {pronoun} usually eats every {cadence}."` Falls back to `"{name} has waited longest: {days} days."` when cadence is unknown, and to `"Nothing is overdue."` when `overdue == 0`. Hidden when `total_feedings == 0`; the figures then read `0`, `—`, `—`.

### Molts card
- Title `butterfly-outline` + `15/700`, trailing `"{total_molts} logged"` `12 textTertiary`.
- `RankedRows` (§6): label 64pt (web 70) name, bar, right `"{count} · {relative last}"` `13/600` with the date part `400 textTertiary`. Zero molts → track only and `none yet` in `textTertiary`.
- ≤ 5 animals: all rows. > 5: top 3 + `"All {n} →"`.
- Zero molts in the whole collection: no rows; one line `"No molts logged yet. Each one you log shows up here with how long it's been."`

### Recent card
- Up to 3 rows: 28pt radius-8 tinted icon well (`butterfly-outline` on `#8b5cf6` 16%, `silverware-fork-knife` on `success` 16%, `layers` on `primary` 16%), sentence `13` with the name at `600` (`"Juniper molted"`, `"Pepper ate a cricket"`, `"Rosie substrate changed"`), relative time right `textTertiary`.
- Empty: `"Nothing logged yet."`

### Premium label row
- `lock-outline` (free) or `star-four-points-outline` in `#c9a2ff` (Premium) 14pt + `12/600` letter-spaced `textTertiary`: `PREMIUM · PREVIEW OF YOUR DATA` (free) / `PREMIUM` (member). Empty-collection free keeper: `PREMIUM` + a right-aligned outlined chip `SAMPLE DATA` `11/700 textTertiary`.

### Premium preview (free keeper with data)
- The real Premium cards, rendered from `/advanced/`… except a 402 means there is no data. So the preview is **rendered client-side from `/collection`**: molt bars from `recent_activity` molts bucketed by month (it only reaches back as far as the activity list does; that's fine for a preview), growth from `newest/oldest_acquisition` as a 2-point step, and Money tiles showing `total_value`. Whole block gets `blur(5px)` (mobile: `@react-native-community/blur` is **not** in the binary, so use an `opacity: .35` + `surfaceElevated` overlay instead of blur, or render the SVGs with 40% opacity strokes; web uses CSS `filter: blur(5px)`), `pointerEvents: none`, with the **unlock card** centred over it:
  - `surface`, `border`, radius `lg`, padding 16, shadow `0 8px 24px rgba(0,0,0,.25)`.
  - Title `14/700` `"Molt timing, growth and what you spend"`; body `12.5/400 textSecondary` `"Computed from your {n} animals. Premium unlocks the detail."`; primary button `See Premium` (Hobbyist gradient, Keeper `primary` fill, white `13/700`, min height 44) → `UpgradeModal` source `advanced_analytics`; trailing caption `"No charge until you choose."` `12 textTertiary`.
- Nothing free sits inside the blurred block. The block is never taller than ~300pt on mobile.

### Premium preview (free keeper, zero animals)
- Grey sample: bars in `#4b5563`, zero stubs `border`, dashed `#3b3b4d` 1px card border, values in `textTertiary`. Sentence under the chart: `"This is what a keeper with six tarantulas sees. Yours will use your own logs."` No upgrade button on this state.

### Premium cards (member)
- **Molts, last 12 months**: `Bars` + trailing `"{n} total"`; sentence `"Busiest month was {Month}: {n} molts."`; 0 → no chart, `"No molts logged in the last year. The chart appears after the first one."`
- **Collection growth**: `StepLine`; sentence `"{first} → {last} this year."` + `" {k} arrived in {Month}."` when a month added ≥ 2; flat → `"No change since {Month}."`; single point → dot + `"1 animal since {Month}."`
- **Enclosures** / **By group**: `SplitBar` with legend `"{n} terrestrial"` etc. One segment → sentence `"1 terrestrial. A split appears with two or more animals."` By group only renders when `taxon_distribution` has > 1 key.
- **Money**: title `cash-multiple` + `Money`, trailing caption `"your currency · private"`. Two figures `24/700`: `spent_this_month` with captions `spent this month` and `"{feeders_spent_this_month} on feeders"`; `collection_value_total` with captions `paid for animals` and `"most: {most_expensive_name}, {price}"`. Footer row: `"Est. feeding cost / month ~{estimated_monthly_feeding_cost}"`, caption `"{cost_per_feeding} per feeding"` or `"default, {cost} per feeding"` when `cost_per_feeding_is_default`, and a 44pt-tall outlined **Change** button → existing cost sheet. Zero spend → `—` + `nothing spent this month`. No prices → `—` + `no price entered` + link `Add what you paid` → collection.
- Money is **never** on anything shareable and never appears in the Insights card.

### Insights card (Home / web dashboard)
- `surface`, `border`, radius 18 (mobile) / 16 (web), padding `14 16`. Label row `chart-line` 15pt `accent` + `INSIGHTS` `11/600` letter-spaced `textTertiary`. Sentence `16/600` lh 22 (web 15/21). Support line `13/400 textTertiary`. Link `See analytics →` `13/600 accent`. Whole card tappable → `/analytics`.
- **Rotation rule** (client-side, from `recent_activity[0]`, no new call):
  - `molt` → `"{name} molted {rel}, {pronoun-possessive} {ordinal} with you."` + `"That's one every {avg interval} days on average."` (support line omitted if < 2 molts).
  - `feeding` → `"{name} ate {rel}."` + `"{n} feedings this month across {m} animals."`
  - `substrate_change` → `"{name} got fresh substrate {rel}."` + `"{n} animals, {k} feedings logged."`
  - animal added (`newest_acquisition.date` within 7 days and newer than `recent_activity[0]`) → `"{name} joined {rel}."` + `"{n} animals · {m} species."`
  - No activity → `"{n} animals, {k} feedings logged."` + `"See how they compare →"` as the link.
  - Zero animals → card not rendered.
- Pronouns from `sex` (her / his), else `their`.

### You · Analytics row
- First row of a new "YOUR COLLECTION" group: `chart-line` 20pt `accent`, `Analytics` `14/600`, trailing `"{n} animals"` `12 textTertiary`, chevron. 52pt tall. Then Feeders, Expenses (Premium badge), Export.

### Loading / error / empty
- **Loading**: skeleton blocks in the shape of the first four cards (three 74pt tiles, 200, 120, 120). Pulse 1.4s between .55 and 1 opacity. No text, no `0`.
- **Error**: one card, centred: `alert-outline` 34pt `warning`, `"We couldn't load your analytics"` `16/700`, `"Your records are fine. This is a connection problem."` `13 textSecondary`, outlined **Try again** 44pt. The Premium section does not render on a `/collection` error. A `/advanced/` error with a good `/collection` shows the free cards and, in the Premium slot, one card: `"We couldn't load your Premium insights."` + Try again. Never the empty-state copy on a failed fetch.
- **Empty** (zero animals): one card: `chart-line` 30pt `accent`, `"Add your first animal and this page starts filling in."` `16/700`, body `"Every feeding and molt you log turns into something here: who's due, how often each animal eats, how long between molts."`, primary **Add to collection** → add flow. Then the grey Premium sample.

### Large collections
- Thousands separators everywhere. Names ellipsised at the label column. Species capped at 5 (+ link), Molts rows at 3 (+ link). Sex bar uses real proportions. Nothing paginates on the page itself; the "more" screens do.

## 4 Copy deck

Labels (truthful, per §2.5 of the brief):
- `Average Age` → **with you, avg** (`average_age_months`)
- `Collection Value` → **Paid in total** (free) / **paid for animals** (Premium Money)
- `Total Animals` → **animals**; `Avg Age (mo)` → gone
- Money: plain numbers, two decimals when fractional, **no currency symbol**. The word "currency" appears once: `your currency · private` on the Money card and in the web units line.
- Units: lengths through the units helper (`formatLength`), weights grams. This page shows no lengths today; GrowthChart does.

Never write: `$0`, `N/A`, `Advanced Analytics`, `✨`, any emoji. Never show a number the data doesn't support; the empty slot is `—`.

## 5 Themes and presets

- Two palettes × two presets, both platforms. The design shows the page in all four (1b). Semantic colours do not change across presets: `error #ef4444`, `warning #eab308`, `success #22c55e`, `info #3b82f6`, `male #3b82f6`, `female #ec4899`, premolt purple `#8b5cf6`, Premium lilac `#c9a2ff` (dark) / `#7c3aed` (light).
- Light-mode values in the design file are approximations; use the light branch of `ThemeContext` verbatim. Check `textTertiary` on `surface` clears 4.5:1 in light; the design uses `#6b7280` on white (4.8:1).
- Keeper preset: flat 56pt header, border elevation, `primary`-filled buttons (no gradient), `accent` on web is `#0052cc` for contrast on white.
- Hobbyist preset: gradient header, gradient primary buttons, shadow elevation.
- Web: `bg-surface`, `border-theme`, `text-theme-secondary`, `text-primary`, `bg-gradient-brand` for the Hobbyist CTA. If web has no preset switch today, ship Hobbyist and leave the Keeper classes in place.

## 6 Chart grammar (`apps/mobile/src/components/charts/`, recharts config on web)

All charts: no y-axis, no gridlines, no legend that repeats labels, one sentence underneath, an `accessibilityLabel` / `aria-label` that states the series in words (`"Molts per month, November to October, most in October with 4"`).

**`Bars`** (monthly counts, 12 buckets). Bar width = (W − 11·gap) / 12, gap 6, radius 3, `primary`; the maximum bar `secondary` with its value printed above in `11/600 textPrimary`; zero months a 2pt `border` stub; month initials `9–10/400 textTertiary` under each bar. Height 70 + 16 for labels. Rules — 0 total: no chart, sentence only. 1: one bar, sentence names the month. Many: as drawn.

**`StepLine`** (running count). Stepped polyline 2.5pt `primary`, round joins; area fill `primary` at 14% to the baseline; end dot r4 `primary` with a 2pt `surface` ring; first value `9/400 textTertiary` at left, last value `9/600 textPrimary` at right. Height 70. Rules — 1 point: flat `border` track with a dot and the month under it. Flat: straight line + "No change since". Many: as drawn.

**`SplitBar`** (a split). 8pt tall, segments flexed by value, 2pt gaps, radius 4. Legend below `12/400 textSecondary`: glyph or 8pt swatch + count + word, always all categories. Sex colours fixed; other splits take `primary`, `#8b5cf6`, `success`, `warning`, `info` in order. Rules — 1 category: sentence instead of a bar.

**`RankedRows`** (per animal / species). Row: label (64 mobile / 70 web, ellipsised) · 8pt track `surfaceElevated` with `primary` fill scaled to max · right value `13/600` with a `textTertiary` suffix. Rows with 0 keep the track and read `none yet`. Caps: 3 (animals) / 5 (species) + "n more →".

**Per-animal charts** (`GrowthChart`, `FeedingStatsCard`): restyle to `StepLine` and `Bars` rules (stroke, fill, dot, label sizes), keep their place on the detail screen, keep their data. Lengths through the units helper.

## 7 API asks (all marked; none assumed built)

Additions to `GET /analytics/collection` (`CollectionAnalytics`), all optional so the client can ship first:

| Field | Type | Meaning |
|---|---|---|
| `feeding_due_today` | `int` | animals due today or overdue, same rule as `/inverts/feeding-status` |
| `feeding_overdue` | `int` | subset past their cadence |
| `longest_gap` | `{tarantula_id, name, days, usual_interval_days \| null}` | animal with the most days since last feeding |
| `last_molt` | `{tarantula_id, name, date, molt_number}` | most recent molt in the collection |
| `priced_count` | `int` | animals with a non-null `price_paid` |
| `molts_per_animal` | `[{tarantula_id, name, count, last_date}]` | sorted desc, capped at 10 server-side |
| `total_animals` | `int` | alias of `total_tarantulas`; keep both for one release |
| `average_months_in_collection` | `float` | alias of `average_age_months`; keep both for one release |

Until these land: Right-now tiles show `—` / `not available yet`; Molts card falls back to `most_active_molter` as a single row; the Feeding sentence is omitted; "priced" caption is omitted.

Not asked: a currency code. Numbers stay unit-less; the page says "your currency" once.

## 8 Interactions

- Pull to refresh (mobile) refetches both calls. Web: no auto-refresh; "updated just now" caption uses the fetch time.
- Tiles and rows deep-link to the animal or Feeding Day (above). Species "more" → `/analytics/species` list (new, sort by count, search). Molts "All" → `/analytics/molts` list (new).
- **Change** on feeding cost → existing sheet / modal; on save, refetch `/advanced/` only.
- **See Premium** → `UpgradeModal` with `source: 'advanced_analytics'`. Track `upgrade_prompt_shown` once per page view when the preview is visible, `_clicked` on tap.
- Keyboard/screen reader: tiles and rows are single focusable items with a combined label (`"Due to eat, 1, Rosie, 19 days"`). Charts expose the sentence as their label. Touch targets ≥ 44pt (the Change button and the tiles are padded to it).

## 9 Not shipping

- The two-page layout (1e). Drawn for comparison only.
- Herpetoverse analytics, admin analytics, Collection Value / market signals (linkable from the Money card later; not linked now).
- Pie charts, `Top 10` lists, `Species Diversity`, `Average Price`, `Total Activity`, the "✨ Advanced Analytics" button, the "← Back to Dashboard" link, the mobile `advanced.tsx` screen and route.
- Breeding analytics on this page.
- A currency setting.
- Benchmarks, ratings, trends, or any number the two endpoints don't return.

## 10 Open items

- The free-keeper **preview is computed client-side** from `/collection` (§3) because `/advanced/` returns 402. If the molt buckets from `recent_activity` look too thin (it holds the last ~20 events), the alternative is a `GET /analytics/preview` that returns the three series without money. Decide after seeing it on real accounts.
- Mobile has no blur primitive in the binary. The design shows 5px blur; the mobile fallback is the overlay-at-35%-opacity described in §3. If the result reads as "broken" rather than "preview", switch to the grey sample for everyone and revisit after the next store build.
- The web Keeper preset assumes a preset switch exists on web. If it doesn't, ship Hobbyist only and leave this README's Keeper values for later.
