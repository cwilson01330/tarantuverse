# Handoff to design: Tarantuverse analytics redesign (web + mobile)

Brief for a design agent. Written 2026-10-26 from the code and production data as they stand today.

**The ask, in Cory's words:** "I hate the way analytics looks as a whole on mobile and web … Advanced analytics is almost hidden."

**Goal:** one analytics experience that looks good, is easy to find, and is still useful for the collections keepers actually have (most are small, see §4). It should also make Premium's analytics visible to free keepers without burying it or turning it into a wall.

**What to send back:** see §8. In short: a design file plus a handoff README in the same format as the share-card handoff (`C:\Users\gwiza\Downloads\Tarantuverse and Herpetav\design_handoff_share_cards\README.md`), so it can be built without guessing.

---

## 1 Scope

**In scope (Tarantuverse only)**

| Surface | Web | Mobile (Expo / React Native) |
|---|---|---|
| Collection analytics ("basic", free) | `apps/web/src/app/dashboard/analytics/page.tsx` | `apps/mobile/app/analytics/index.tsx` |
| Advanced analytics (Premium) | `apps/web/src/app/dashboard/analytics/advanced/page.tsx` | `apps/mobile/app/analytics/advanced.tsx` |
| Entry points (how people find analytics) | sidebar `apps/web/src/components/Sidebar.tsx`, dashboard quick action `apps/web/src/app/dashboard/page.tsx` | Home quick action `apps/mobile/app/(tabs)/index.tsx` |
| Per-animal charts (visual language only, keep their place on the page) | `components/FeedingStatsCard.tsx`, `components/GrowthChart.tsx` | `src/components/FeedingStatsCard.tsx`, `src/components/GrowthChart.tsx` |

**Out of scope:** Herpetoverse (it has no keeper analytics screens today), the admin analytics pages (`/dashboard/admin/analytics`), the Collection Value / market-signals page (`/dashboard/collection-value`, web only; you may link to it, but don't redesign it), the share cards, and any API change beyond the small asks listed in §6.

## 2 What exists today

### Web: `/dashboard/analytics` (free)
- Header: "← Back to Dashboard" text button (redundant: the page already sits in the sidebar layout), H1 "📊 Collection Analytics", and on the right a purple-to-pink gradient button "✨ Advanced Analytics". **That button is the only way into Advanced on web.**
- Four stat cards: Total Animals (+ unique species), Collection Value, Average Age, Total Activity.
- Cards: Sex Distribution, Notable Animals (most active molter, newest and oldest acquisition), Species Distribution (Top 10), Feeding Statistics (total feedings, avg days between feedings, avg feedings per animal), Recent Activity.
- Data: one call, `GET /api/v1/analytics/collection`.

### Web: `/dashboard/analytics/advanced` (Premium)
- Free keepers: the API answers 402 and the page shows a locked card ("Advanced Analytics is a Premium feature" + "View Premium Plans").
- Premium keepers see:
  - Stat cards: Total Collection Value, Average Price, Most Expensive, Est. Monthly Feeding Cost (with "Change" to set the keeper's own cost per feeding, and "Use default"), Spent this month.
  - Charts (recharts): 🦋 Molt Activity (bar, last 12 months), 📈 Collection Growth (line, last 12 months), 👥 Sex Distribution (pie), 🏠 Enclosure Types (bar).
  - Lists and stats: 🧭 By Group (taxon split), 🕷️ Top Species (Top 10, bar), Total Feedings Logged, Total Molts Logged, Species Diversity.
- Data: `GET /api/v1/analytics/advanced/` and `PUT /api/v1/analytics/feeding-cost/`.

### Mobile: `analytics/index` (free)
- `AppHeader` "📊 Analytics" with a back button to Home and a button to Advanced in the header area.
- 2×2 stat tiles (Total, Species, Value, "Avg Age (mo)"); cards: Sex Distribution, Activity Stats, Notable Animals, Top Species, Recent Activity.
- **Reached only from a Home quick action.** There's no tab and no Profile row.

### Mobile: `analytics/advanced` (Premium)
- `AppHeader` "✨ Advanced Analytics" with a Premium badge. Free keepers get a locked state and the `UpgradeModal` (source `advanced_analytics`).
- Cards mirror web: 💎 Most Expensive, 🦋 Molt Activity, 📈 Collection Growth, 👥 Sex Distribution, 🏠 Enclosure Types, 🧭 By Group, 🕷️ Top Species, 💰 Estimated Monthly Feeding Cost (editable), 🧾 Spent This Month.
- Charts are hand-built from `View`s (bars and a line). Web uses recharts, so the two platforms don't look alike.

### Problems already visible
1. **Advanced is hard to find:** a single header button on a page that is itself only reachable from the sidebar or a Home quick action.
2. **Two pages overlap:** sex split, species ranking and collection value appear on both, so it's unclear why there are two pages.
3. **Charts are built for big collections** (Top 10 species, 12-month series). Most keepers have 1–7 animals (§4), so these render mostly empty.
4. **The look doesn't match the rest of the app:** emoji as section icons, a one-off gradient button, cards that don't use the shared design system, and web and mobile charts that look nothing alike.
5. **Labels that overstate:**
   - "Average Age" / "Avg Age (mo)" is really *time in the collection*: it's computed from `date_acquired`, not hatch date.
   - "Collection Value" is the sum of what the keeper *paid* (`price_paid`), not a market value.
   - Money always prints "$", but the feeding cost is a plain number in the keeper's own currency.

## 3 Data you can design with

Use only these fields. Anything else becomes a request in §6. All money arrives as a number with no currency.

**`GET /analytics/collection`** (free; every taxon, living animals only)
`total_tarantulas` (despite the name, every taxon), `unique_species`, `sex_distribution {male, female, unknown}`, `species_counts [{species_name, count}]` (full list), `total_value` (sum of price paid), `average_age_months` (time in collection), `total_feedings`, `total_molts`, `total_substrate_changes`, `average_days_between_feedings`, `most_active_molter {tarantula_id, name, molt_count}`, `newest_acquisition {tarantula_id, name, date}`, `oldest_acquisition {…}`, `recent_activity [{type: feeding|molt|substrate_change, date, tarantula_id, tarantula_name, description}]`.

**`GET /analytics/advanced/`** (Premium; 402 for free keepers)
`collection_value_total`, `collection_value_average`, `most_expensive_name`, `most_expensive_price`, `molt_heatmap [{month "YYYY-MM", count}]` (12 months), `collection_growth [{month, count}]` (12 months), `species_distribution [{species_name, count}]` (top 10), `unique_species`, `total_animals`, `sex_distribution`, `enclosure_type_distribution {terrestrial, arboreal, fossorial, …}`, `taxon_distribution {tarantula: n, mantis: n, …}`, `total_feedings_logged`, `total_molts_logged`, `estimated_monthly_feeding_cost`, `cost_per_feeding`, `cost_per_feeding_is_default`, `spent_this_month`, `feeders_spent_this_month` (both from Expenses, UTC month).

**Related data that already exists** (fair game for "what's useful" ideas, but it lives on other screens today)
- Per animal: `GET /inverts/{id}/feeding-stats` (verdict, days since fed, cadence), `GET /inverts/{id}/growth` (molt sizes and weights over time, in inches/grams from storage), `GET /premolt/...` (premolt prediction, tarantulas).
- Collection-wide feeding status: `GET /inverts/feeding-status` (what's due or overdue; it drives Feeding Day).
- Expenses (Premium): `GET /expenses/summary` (totals by category and month).
- Breeding: `GET /analytics/breeding`. Breeding is barely used (1 keeper has ever logged a pairing), so don't give it prominence.

## 4 Who the screens are for

Production snapshot, 2026-10-26:
- **Collections are small.** 146 keepers have living animals. The median keeper has **3**: 80 keepers have 3 or fewer, 57 have 4–15, and 9 have more than 15 (the largest has about 1,200).
- **About 19 keepers have Tarantuverse Premium.** Advanced analytics is mostly being *seen* by free keepers as a preview or upsell.
- **Activity is sparse.** Many animals have a handful of feedings and zero or one molt, so 12-month series are mostly zeros.

Design implications:
- **Design first for 1–5 animals,** and make sure a 1,000-animal collection still holds up: long species lists, big counts.
- **Treat every empty case as a designed state.** The page should still feel worthwhile when there are no molts this year, a single species, or no prices entered. A useful sentence beats a chart full of zeros.
- **Favor insights a small collection can answer.** For example: who's due to eat, longest gap since a meal, last molt and how long ago, growth of one animal, money spent this month. Big distributions matter less.

## 5 Constraints (non-negotiable)

- **Light and dark mode** for every element, on both platforms. Web: Tailwind with `dark:` variants and the theme classes already in use (`bg-surface`, `border-theme`, `text-theme-secondary`, `text-primary`, `bg-gradient-brand`). Mobile: colors only from `ThemeContext` (`theme.background`, `theme.surface`, `theme.text`, …), spacing and type from `apps/mobile/src/theme/tokens.ts`, primitives from `apps/mobile/src/components/ui/` (Card, SectionCard, InfoRow, Chip, Badge, AppText, InfoGrid) and `AppHeader`. Never hardcode colors on mobile.
- **Both aesthetic presets:** *Keeper* (restrained, flat 56pt header, border elevation, line icons) and *Hobbyist* (vibrant gradients, 130pt header, shadow elevation). Show each key screen in both. Semantic colors (danger, warning, success, info, sex colors) are fixed across presets. Docs: `docs/design/ADR-001-theme-preset-system.md`.
- **Honesty principle:** loading, zero and error are three different states and must look different. Never show a number the data doesn't support, never print "$0" for "not entered", and keep labels truthful (§2 item 5). No invented ratings, trends or benchmarks.
- **Units:** lengths and temperatures go through each platform's units helper (inches or centimetres per the keeper's setting). Weights stay grams. Never design a hardcoded unit next to a measurement.
- **Money:** show amounts without assuming a currency symbol, or with a neutral one. Keepers enter their own currency. Expense figures are private to the keeper: never place them on anything shareable.
- **Premium:** the API decides access (402). Design what a free keeper sees for each Premium element: a preview, a sample, or a locked teaser with one clear upgrade action through the existing `UpgradeModal` (source `advanced_analytics`). Don't use dark patterns, and don't hide free information behind the paywall.
- **Web and mobile parity:** the same information and capabilities on both, adapted to each form factor (desktop sidebar layout; phone at about 380pt wide).
- **Mobile ships by OTA update:** no new native modules. `react-native-svg` and `react-native-chart-kit` are already in the store binary and safe to use; anything else must be plain JS/TS.
- **Accessibility:** WCAG AA contrast in both themes, information never carried by color alone (sex split, statuses), labels on charts and tiles for screen readers, and 44pt minimum touch targets.
- **One request per screen where possible.** The API runs on a small instance, so don't design a page that needs 10 calls.

## 6 Decisions for you, and allowed API asks

**Your call (recommend one, with a reason):**
1. Keep two pages (basic and Advanced) or make **one Analytics page** with Premium sections inline (locked previews for free keepers)?
2. **Where analytics lives** in navigation on each platform: a mobile tab, a Profile row, a Home card, or something else. Advanced must not be one button deep on a page people can't find.
3. Which cards stay, merge or go, given §4.
4. One chart style for both platforms (and whether mobile moves from hand-built `View`s to `react-native-svg`).

**API asks you may make:** small additions to the two analytics responses are fine, e.g. due/overdue counts, last molt per animal, renaming confusing fields, or the currency question. List each one in the handoff with the exact field name, type and meaning, and mark it as an API change. Don't assume any of them exists until it's built.

## 7 Repo map for the build

| Layer | File |
|---|---|
| API router | `apps/api/app/routers/analytics.py` (`/collection`, `/advanced/`, `/feeding-cost/`, `/breeding`) |
| API schemas | `apps/api/app/schemas/analytics.py` (`CollectionAnalytics`, `AdvancedAnalyticsResponse`) |
| Web pages | `apps/web/src/app/dashboard/analytics/page.tsx`, `apps/web/src/app/dashboard/analytics/advanced/page.tsx` |
| Web shared UI | `apps/web/src/components/ui/card.tsx`, `apps/web/src/components/UpgradeModal.tsx`, recharts (already a dependency) |
| Web navigation | `apps/web/src/components/Sidebar.tsx`, `apps/web/src/app/dashboard/page.tsx` (quick actions) |
| Mobile screens | `apps/mobile/app/analytics/index.tsx`, `apps/mobile/app/analytics/advanced.tsx` |
| Mobile shared UI | `apps/mobile/src/components/ui/`, `apps/mobile/src/theme/tokens.ts`, `AppHeader`, `src/components/UpgradeModal.tsx` |
| Mobile navigation | `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/(tabs)/index.tsx` (Home quick actions), `apps/mobile/app/(tabs)/profile.tsx` |
| Per-animal charts | web `components/FeedingStatsCard.tsx` and `GrowthChart.tsx`; mobile `src/components/FeedingStatsCard.tsx` and `GrowthChart.tsx` |

## 8 What to send back

1. **A design file** (HTML is fine, like `Share Card Frames.dc.html`) covering, for web desktop and a 380pt phone:
   - the analytics screen(s) in light and dark, Keeper and Hobbyist presets;
   - states: loading, error, empty (new keeper, no animals), small collection (1–3 animals), large collection (hundreds), free keeper viewing Premium content, Premium keeper;
   - the new entry points in the navigation.
2. **A handoff README** in the share-card format: repo touchpoints, what changes, per-component specs (sizes, type, spacing, colors as theme tokens rather than raw hex), copy for every label and empty state, chart specs (axes, colors, what happens with 0/1/many data points), API asks from §6, and an explicit "not shipping" list.
3. **Your recommendation on the §6 decisions,** with one line of reasoning each.
