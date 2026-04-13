# Tarantuverse — Platform Design Audit

**Date:** 2026-04-13
**Scope:** Mobile app (14 screens reviewed across two themes) — Dashboard, Collection (grid + list), Community (Keepers + Activity), Search, Profile. Web parity implications noted throughout.
**Reviewer:** Claude (design-critique + accessibility-review + design-system frameworks)
**Reference build:** v1.0 Platform Hardening

---

## AMENDMENT — added after review of default (blue→purple→magenta) theme

The first pass of this audit treated "red" as the app's brand color. That was wrong: **the app ships with a theme picker**, and the default theme is a vibrant blue→purple→magenta gradient. The user had selected a red theme; I mistook a user preference for a brand decision. Corrections below.

**Retracted / revised:**

- ~~"Red is doing too many jobs — brand, active state, alert, destructive, warning all collapse into the same color."~~ **Partially wrong.** In the default theme, semantic colors (overdue day-counter text, the "Needs Feeding" card border, warning triangle icon) **remain red/amber even in the blue theme** — so the app *is* already keeping semantic colors fixed against theme changes. Good architecture. The original critique only appears in the red theme specifically, because there the theme accent happens to collide with the semantic red.
- The "split `brand-red` from `semantic-danger`" recommendation still stands, but reframed: **semantic tokens (`danger`, `warning`, `success`, `info`) should be immutable across themes**, and only the *accent/brand* swatch should swap. Verify Delete Account stays in the fixed semantic-danger color regardless of theme — if it's using the theme accent, a user on the red theme sees Delete + Logout + everything-else-red together, which is the problem I misidentified earlier.

**Strengthened:**

- The theme picker is a genuinely good feature that most competitor apps don't have. It signals product maturity and respects user preference. Keep investing here.
- The default theme reads young, vibrant, and consumer-app-adjacent (Instagram/Spotify family). The red theme reads more "tool / data app." Worth a product decision: is Tarantuverse aiming at **serious keepers/breeders** (who tend to prefer restrained tool aesthetics) or **newer hobbyists on social media** (who respond to vibrant gradients)? Both audiences matter — the theme picker partially solves it, but **the default theme sets the tone for first impressions**. Consider whether the default should be more neutral.

**New observations from the default theme:**

1. **Search screen — the search input field has a full gradient background.** Typed text on a multi-stop purple→pink gradient will fail contrast somewhere along its length. Test this specifically. Recommendation: keep the gradient on the header band *above* the input, but give the input itself a flat dark surface (`theme.surface`) with a subtle accent border.
2. **Stat card icons use gradient-tinted backgrounds** (My Collection spider on purple→pink, Total Molts butterfly on blue→purple) — this looks great when all four tiles coordinate, but `Needs Feeding` breaks the pattern with a flat orange-red (semantic warning). That inconsistency is actually *correct* — it makes the alert tile pop — but make it intentional by giving the other three tiles subtle animation/gloss that the warning tile doesn't share, so the difference reads as hierarchy rather than an oversight.
3. **Profile menu icon colors are ad-hoc** in the default theme: Dark Mode blue, Customize Theme pink, Edit Profile gray, Notifications blue, Export Data blue, Refer Friends pink, Achievements yellow, Subscription yellow, Privacy Settings gray. There's no system — it reads as "whatever color made each icon look good in isolation." Define a small palette (accent for actions, muted for settings, gold for premium, neutral for everything else) and apply it consistently.
4. **The gradient header problem still stands.** ~130pt of vertical space on every screen, regardless of theme. The recommendation to compact it on functional screens is unchanged.
5. **The activity feed problem still stands.** The content sparseness (no species name, no photo, no context) has nothing to do with theme color.
6. **The "d" badge problem still stands.** Green + cryptic letter, theme-independent.
7. **Accessibility findings stand** — contrast on gradients is, if anything, *worse* on the default theme because the gradient spans lighter colors (magenta/pink) than the red theme does.

Everything below this amendment was written under the mistaken assumption about red. Where findings remain valid, they apply to **all themes**. Where they were theme-specific, I've marked them `[RED THEME ONLY]`.

---

---

## 0. TL;DR — The Five Things That Matter Most (revised)

1. **Lock down semantic color tokens so theme switching can't reach them.** Danger/warning/success/info should be immutable. Verify Delete Account, warning borders, and overdue badges are all using fixed semantic tokens — not the theme accent. `[Mostly already done — confirm and document.]`
2. **The gradient header is eating your screen on every theme.** ~15% of vertical space on every functional screen shows a decorative bar. Compact to ~56pt on Dashboard/Collection/Species/Detail. Keep the full gradient for Onboarding and Profile where identity matters.
3. **Activity feed is noise, not signal.** Nine identical "added a new tarantula" rows with generic spider icons — no species names, no photos, no context. It reads like a log file. Theme-independent.
4. **Cards without photos look broken, not empty.** A huge gray spider emoji on an otherwise-polished card signals "missing data" rather than "default state." Theme-independent.
5. **Accessibility gaps are real but fixable.** "d" badges, subtle gray meta text, placeholder-as-label search bars, and **gradient-on-input-field for the Search screen** will fail an AA audit. Sex indicators with color + symbol redundancy already pass.

---

## 1. Per-Screen Critique

### 1.1 Dashboard

**What's working**
- Good use of the 2×2 stat grid — recognizable at a glance.
- Feeding Alerts with "Log" CTA is excellent action-oriented design.
- Communal Setups section is a nice progressive-disclosure touch.

**What needs work**

| Issue | Why it matters | Suggested fix |
|---|---|---|
| Red gradient header is ~130pt tall with only the word "Dashboard" | Wastes prime real estate | Collapse to 56pt bar; use gradient only as a subtle accent strip or remove entirely in favor of a flat safe-area-tinted header |
| "Needs Feeding" card has a red border, others don't | Unclear if this is state (has alerts), selection, or just styling | Use an **amber** border + amber icon when alerts exist; reserve red for truly destructive/overdue-critical only |
| "Total Molts" shows an em-dash "—" with "Tracked specimens" underneath | Ambiguous — is it zero, unknown, or not-yet-loaded? | Show `0` with the label, or a skeleton while loading, or "No molts logged yet" if empty |
| Emoji-as-icon mixing (🕷 ⚠️ 🦋 🔮 🍽 📦) | Inconsistent rendering across OS versions, not themeable, can't hit target sizes reliably | Replace with a single icon library (Phosphor, Lucide, or SF Symbols) with consistent stroke/fill |
| "188 days since last feeding" in red under the card name | Red is correct for severity, but the copy is alarming when that tarantula may be in premolt | Add context when available: "188 days — likely in premolt" or a tap-to-expand diagnostic |
| Feeding Alert row tap target is the whole row vs just "Log" button | Small button, whole-row navigation is ambiguous | Make the row open the tarantula detail; the red "Log" button should open a quick-log sheet, not the detail page |

### 1.2 Dashboard (Quick Actions)

- **Three-column 6-tile grid** is fine, but the tiles are visually uneven: "Add Tarantula" gets `+`, "My Collection" gets a small centered spider, "Analytics" gets a mini chart graphic, "Species DB" is a book emoji, "Community" is a globe emoji, "Messages" is a speech bubble.
- **Problem:** No visual hierarchy — everything is the same card. Quick Actions should prioritize the 1-2 things users actually do most often (Log Feeding, Add Tarantula). Consider promoting those to a larger row.
- **Messages tile** has no unread badge visible. If the point of Quick Actions is frequency, DMs need a counter.

### 1.3 My Tarantulas (Grid)

**What's working**
- "All Clear" empty-state banner for premolt is warm and reassuring.
- Collection Stats card surfaces the right numbers (Total / Species / Feedings / Molts).
- Sex symbol chips (♂ ♀ ?) inside colored circles — color + shape redundancy satisfies WCAG 1.4.1. 

**What needs work**

| Issue | Why it matters | Suggested fix |
|---|---|---|
| "d" green badge on recently-fed cards is cryptic | Users have to learn that "d" = "done today" (or "days since fed = 0"?) | Write it out: "Fed today" or "0d" with a tooltip. Even "✓" alone reads better |
| Cards without photos show a huge grayscale spider | Looks like a broken image state | Generate a themed default: gradient card with the scientific-name-as-monogram in decorative type, OR a silhouette colored by genus |
| Common name is repeated (title + below scientific name) | "Brazilian Red and White Tarantula / Nhandu chromatus / Brazilian Red and White Tarantula" | Remove the duplicate line; show user-given nickname (e.g., "Stephen") above the common name |
| Sort chips (A-Z / Last Fed / Acquired) are ~28pt tall | Close to minimum touch target | Ensure ≥44pt tall with comfortable padding |
| View toggle (grid/list) icon is fine, but the active state is a hard red square | Heavy visual weight on a tertiary control | Use subtle surface color + accent border for active; save red for primary actions |

### 1.4 My Tarantulas (List View)

- List view is actually **more readable** than grid for a tracking app — everything is scannable in one vertical axis.
- The inline sex-symbol + overdue-day badge in the right column is efficient.
- Consider making list the default for collections with >8 animals; keep grid for small collections where the photos are the point.
- "Stephen / Redknee" row has no image and the FAB overlaps the row — hit test collision likely.

### 1.5 Community — Keepers

**What's working**
- Card structure is clean: avatar, name, handle, location, bio, tags, CTA.
- Experience tags (Expert/Advanced/New) use tier-appropriate colors.

**What needs work**

| Issue | Fix |
|---|---|
| Every keeper shows the same generic spider avatar | Letter avatars with gradient backgrounds (first initial or first two letters of username) — scalable, distinct, generated deterministically |
| "View Profile →" link is small and floats at the bottom of a long card | Make the whole card tappable; remove the explicit link, or replace with a right-chevron affordance |
| "Expert" tag is yellow, "Advanced" is purple, "7yrs" is gray — three visual systems for tags | One tag system: shape = category, fill intensity = importance. E.g., filled for experience level, outline for everything else |
| No way to filter (by specialty, region, experience) | Add a filter row. This is a community feature; discoverability is a top-3 value driver |
| "Hobbyist keeper with 15+ years experience. Love arboreal species!" — bio truncation isn't indicated | Clamp at 2 lines with "…" or a fade-mask, and let tap expand |

### 1.6 Community — Activity Feed

**This is the most broken surface in the audit.**

- Eight rows, six of them read exactly "Steph B added a new tarantula" with a purple spider avatar. No photo thumbnail, no species name, no tarantula name. It reads like a log file someone forgot to render.
- **Rewrite the entire item template:**

```
[User avatar]   Steph B added Stephen (Brachypelma hamorii)
                to her collection                              1w ago
                [small photo thumbnail of Stephen]
```

- **Group related activity.** "Steph B added 5 tarantulas this week" with a stacked/faceted preview is far more useful than 5 separate rows.
- **Filter tabs.** "All / Following / My Collection" at minimum.
- **Activity types need visual differentiation** (color, icon) — a feeding log is not the same as a new-tarantula add, and "logged a molt" is the kind of thing people actually want to see and react to.
- Add **reactions** (tap to 🎉 / 💜 / 🕷). You already have the data model for this (`MessageReaction`).

### 1.7 Profile

**What's working**
- Great avatar (the Appalachian Tarantulas logo) — shows you can handle real identity imagery.
- Dark mode toggle is prominent and immediate.
- Good menu coverage: customization, account, content, admin, destructive.

**What needs work**

| Issue | Fix |
|---|---|
| 12+ menu items with no grouping | Group into sections: **Account** (Edit Profile, Privacy), **Customization** (Theme, Notifications), **Content** (Export Data, Achievements), **Subscription**, **Help** (Contact Support, Replay Tutorial), **Danger** (Logout, Delete Account) |
| Logout and Delete Account are both red and adjacent | Logout should be a neutral tint (it's not destructive — it's routine). Delete Account is the only item that deserves red + a trash icon + explicit confirm flow |
| "Refer Friends" has no badge indicating rewards, progress, or whether anyone's been referred | Add a one-line meta: "Earn credits — 0 referred" |
| "Admin Panel" is styled the same as everything else | For admins, this is fine. But make sure non-admins never see it (they don't — verified against codebase, but worth documenting as a pattern) |
| "Replay Tutorial" — great to have, but placement alongside Logout/Delete is buried | Move to the Help section at the top of that grouping |

---

## 2. Cross-Screen Patterns

### 2.1 The Red Gradient Header Problem

It appears on every screen, always the same, always ~130pt tall. That's roughly 15% of screen real estate permanently allocated to brand reinforcement. On a dashboard, that's acceptable (first impression). On a tarantula detail page where users are reading husbandry data, it's expensive.

**Recommendation:**
- Keep the gradient on exactly two surfaces: the landing/onboarding flow, and the Profile header (where identity/branding lives).
- On functional screens (Dashboard, Collection, Species), use a flat, compact header (~56pt) tinted with `theme.surface` — let the content be the hero.
- If you want brand presence, use a **subtle accent strip** (2pt red gradient line under the status bar) — same brand equity, 98% less footprint.

### 2.2 Bottom Tab Bar

- Five tabs (Dashboard, Tarantulas, Community, Search, Profile) is right at the cognitive limit — good.
- Active state = solid red icon + red label. Inactive = gray icon + gray label.
- **Missing:** unread/notification badges on Community and Profile (for DMs, for forum replies).
- **Consider:** a subtle haptic on tab switch (already native on iOS in most setups, confirm it's firing).

### 2.3 FAB Placement

- The `+` FAB on collection screens overlaps the last card on short lists. On long lists, it's fine.
- **Fix:** add bottom padding equal to FAB height + 16pt on all scroll views to prevent overlap.

---

## 3. Accessibility Review (WCAG 2.1 AA)

### 3.1 Contrast (SC 1.4.3)

High-risk items based on visual inspection (need a tool like Stark or axe for exact ratios):

| Element | Risk | Recommendation |
|---|---|---|
| "@tarantulafan" handle — light gray on dark surface | Likely under 4.5:1 | Darken to `#B0B3B8` or similar (test with contrast checker) |
| "View all →" subtle gray CTA | Likely fails 3:1 for large text / 4.5:1 for normal | Promote to accent color or use the primary text weight |
| Meta text like "1w ago", "3w ago" on activity feed | Probably marginal | Bump one shade brighter |
| White text on light portion of red gradient header | Edge cases where gradient lightens near the middle | Ensure text stays on the darker portion or add a text-shadow/scrim |
| Green "d" badge — small text | Very small; contrast + size compounding | Make it 12pt minimum with 4.5:1 contrast, or replace with an icon |
| Warning orange/red day-counter text ("188 days") on dark card | Could be fine, needs check | Test specifically — red on near-black often fails |

**Action:** Run a Stark (Figma) or axe-mobile scan in a CI step. Lock down contrast tokens in the theme file so they can't drift.

### 3.2 Non-text contrast (SC 1.4.11)

- Card borders and the divider under tab icons are very subtle — acceptable as decoration but not relied on for comprehension, so this is OK.
- **But:** the focus/selection state of the grid/list view toggle needs a 3:1 indicator vs non-selected state. The red-square treatment passes.

### 3.3 Color as the only means (SC 1.4.1)

- Sex circles (blue male / pink female / gray unknown) have ♂/♀/? symbols **inside** — good, passes.
- "d" green badge — **fails**. If a user is color-blind and can't see green, "d" is meaningless.
- Red "188 days" warning text — color is the urgency signal; add an icon (⚠️ or a clock) for redundancy.
- Red active tab — icon shape doesn't change between active/inactive. Add a filled vs outlined variant, or an underline/indicator bar.

### 3.4 Touch targets (SC 2.5.5 AAA / Apple HIG 44pt)

| Control | Estimated size | Status |
|---|---|---|
| Sort chips | ~28pt tall | **Likely fails** — bump to 44pt |
| Grid/List toggle | ~32pt | Borderline |
| "Log" buttons in feeding alerts | ~36pt | Borderline |
| Tab bar icons | ~44pt | Passes |
| FAB | ~56pt | Passes |

### 3.5 Forms & labels (SC 3.3.2)

- Search "Search by name, species…" uses placeholder-as-label. When the user types, the label disappears. Acceptable for search specifically because the icon communicates intent, but make sure the `accessibilityLabel` on the TextInput is set explicitly (e.g., `"Search tarantulas by name or species"`).

### 3.6 Screen reader (SC 1.3.1 / 4.1.2)

- Activity feed items all read "Cory added a new tarantula" — without the species/name, VoiceOver users hear the same phrase 9 times. **Rewrite templates to include the subject.**
- Stat cards need proper `accessibilityLabel`: "My Collection, 5, View all" not just "5".
- Sex badge circles need `accessibilityLabel="Male"` / `"Female"` / `"Unknown sex"` (not "blue circle").
- Emoji in headings (🕷, 🍽) — VoiceOver will read them ("spider", "fork and knife plate"), which is often noise. Use `accessibilityLabel` on the heading to override, or replace with icons that are aria-hidden.

### 3.7 Motion & animation (SC 2.3.3)

- Verify `prefers-reduced-motion` is honored for transitions (theme switch, drawer open, tab animations).

### 3.8 Dynamic Type (iOS) / Font Scale (Android)

- Couldn't verify from screenshots, but many measurements look fixed. Test at **200% text size** — most layout breakage shows up there.

---

## 4. Design System Audit

### 4.1 Current Token Inventory (inferred — not authoritative)

**Colors:**
```
Brand
  brand.red.gradient.from     ~#C1272D
  brand.red.gradient.to       ~#5E1E1E
  brand.red.primary           ~#E5342E     (active tabs, CTAs, destructive)

Surfaces (dark mode)
  bg.base                     ~#0A0A0F
  bg.surface                  ~#151520
  bg.surface.raised           ~#1E1E2A
  border.subtle               ~#2A2A38

Text
  text.primary                #FFFFFF
  text.secondary              ~#A1A1A6
  text.tertiary               ~#6E6E73
  text.disabled               ~#48484A

Semantic
  success                     ~#34C759
  warning                     ~#FFD60A
  danger                      ~#FF3B30     (overlaps brand.red!)
  info                        ~#0A84FF

Sex
  sex.male                    ~#0A84FF
  sex.female                  ~#FF2D92
  sex.unknown                 ~#8E8E93
```

**Problem:** `brand.red.primary` and `danger` are visually indistinguishable. This is the semantic confusion manifest in the token layer. **Split them.**

**Proposed:**
```
brand.primary                ~#8B4513  // the documented primary — earth brown
brand.accent                 ~#E5342E  // red for CTAs/active (rename to accent)
semantic.danger              ~#DC2626  // distinctly deeper red with slight blue undertone
semantic.warning             ~#F59E0B  // amber, distinct from red
semantic.success             ~#10B981  // slightly cooler green
```

This gives you a red-for-attention (accent) and a red-for-destruction (danger) that a user can learn to trust. CLAUDE.md already documents `#8B4513` as the primary — but the UI doesn't actually use it anywhere I can see. **Either adopt the documented brown, or update the docs to match the shipped red.**

### 4.2 Typography

Inferred scale:
```
display   32pt / 700    (landing, onboarding)
h1        28pt / 700    (screen titles — "My Profile")
h2        22pt / 600    (section headers — "Feeding Alerts")
h3        18pt / 600    (card titles — "Pink Zebra Beauty")
body      16pt / 400
small     14pt / 400    (meta — "1w ago")
caption   12pt / 400    (badges, chips)
```

- Need to formalize this in the theme file (if not already).
- Caption/small text on dark surfaces is where contrast bugs hide — audit all 12pt text specifically.

### 4.3 Spacing

Looks like a 4-point grid (4, 8, 12, 16, 24, 32). Consistent. Keep it.

### 4.4 Radius

- Cards: 16pt (consistent, good)
- Chips: fully rounded (consistent)
- Buttons: varies — some 8pt, some 12pt, some fully rounded (inconsistent)
- Badges: mixed — circles for sex, rounded rect for overdue, pill for experience

**Action:** Define three radius tokens — `radius.sm = 8`, `radius.md = 12`, `radius.lg = 16`, `radius.full = 9999`. Audit all button/badge components to use only these.

### 4.5 Icon System

**This is the biggest design-system debt.**

- Emoji (🕷 🍽 ⚠️) render differently on iOS 16 vs iOS 17 vs Android, don't respect theme color, and can't be consistently sized.
- Mixed with custom illustrations (crystal ball), Lucide/Phosphor-style line icons (bell, gear), and emoji-in-colored-squares (the stat card icons).
- **Pick one library.** Recommendation for a tarantula app: **Phosphor** (has `spider`, `bug`, `plant`, `heart`, `bell` etc. in matched weights) or **Lucide** for a flatter modernist feel.
- Create an `<Icon name="..." size="md" color="..." />` wrapper and ban emoji-as-UI in the linter.

### 4.6 Components That Need Formalization

From what I see:
1. **StatCard** (the 2×2 grid tiles) — size, icon position, number style
2. **CollectionCard** (grid + list variants)
3. **AlertRow** (feeding alerts)
4. **KeeperCard** (community keeper display)
5. **ActivityRow** (feed items) — needs new template first
6. **Badge** (sex, overdue, experience, verification)
7. **MenuRow** (profile list items)
8. **Chip** (sort, filter)
9. **Banner** (All Clear green banner)
10. **EmptyState** (when no tarantula has a photo, etc.)

Each should be in a `/components/design-system/` folder with Storybook or a screen that renders all variants for QA.

---

## 5. UX Copy & Microcopy

| Current | Issue | Suggested |
|---|---|---|
| "188 days since last feeding" | Alarmist without context | "Last fed 188 days ago — log now" + secondary "Possibly in premolt" if data supports |
| "No tarantulas showing premolt signs" | Clinical, wordy | "All clear — no premolt alerts" |
| "Tracked specimens" under Total Molts | "Specimens" is lab-speak | "Tracked in your collection" or just "across your collection" |
| "Connect with keepers" | Generic | "Find keepers near you" or "Follow keepers you trust" |
| "added a new tarantula" | Repetitive in feed | "added **Stephen** (Brachypelma hamorii)" — name + species |
| "Log" button on feeding alert | Ambiguous (log what?) | "Log feeding" or icon + "+ Feeding" |
| "View all →" | OK but unspecific | "View collection", "View all activity" — say what you'll see |
| "Refer Friends" | No value prop | "Invite keepers — get 1 month Pro" (or whatever the actual reward is) |
| "Replay Tutorial" | "Replay" sounds like a recording | "Restart the welcome tour" |
| Empty states | Not visible in these screens — audit separately | Every empty state should have: 1-line emotional copy, an illustration, and a CTA |

---

## 6. Prioritized Recommendations

Scored by **impact** (user experience gain) and **effort** (engineering cost). Focus your next sprint on the P0 block.

### P0 — Ship within two weeks (high impact, low-to-medium effort)

| # | Item | Impact | Effort | Files |
|---|---|---|---|---|
| 1 | **Audit theme vs semantic color separation**. Verify every use of the theme accent isn't accidentally applied to destructive/warning/success contexts. Where the theme accent is leaking into semantic slots, replace with fixed `semantic.*` tokens. Particular attention to Delete Account, warning borders, overdue badges. | High | S-M | `apps/mobile/src/contexts/ThemeContext.tsx`, `apps/web/tailwind.config.ts`, affected components |
| 1a | **Search input field must not sit on the gradient** — flatten its surface so typed text has guaranteed contrast. | High (a11y) | S | Search screen (mobile + web if applicable) |
| 2 | **Rewrite activity feed templates** to include subject (tarantula name, species, thumbnail). | High | M | `ActivityFeedItem.tsx` (web + mobile), `apps/api/app/routers/activity.py` (may need richer payload) |
| 3 | **Accessibility labels pass** — every icon, badge, stat card, and emoji-heading gets an explicit `accessibilityLabel` / `aria-label`. | High (legal + UX) | M | sweep across components |
| 4 | **Group Profile menu** into Account / Customization / Content / Subscription / Help / Danger. Demote Logout from red. | Medium | S | `apps/mobile/app/(tabs)/profile.tsx` + web equivalent |
| 5 | **Clarify the "d" badge** — replace with "Fed today" / "0d" explicit, or a checkmark icon. | Medium | S | collection card component |
| 6 | **Compact header on functional screens** — kill the ~130pt red gradient on Dashboard/Collection/Species/Profile. Keep it on Onboarding and possibly Community landing. | High | M | layout components; likely a `ScreenHeader` variant prop |

### P1 — Next month (high impact, medium effort)

| # | Item | Impact | Effort |
|---|---|---|---|
| 7 | **Default card art for photo-less tarantulas** — gradient + monogram + genus silhouette. | Medium | M |
| 8 | **Activity feed filters** (All / Following / You) and reactions. | High | M-L |
| 9 | **Letter avatars** for keepers without uploaded photos. | Medium | S |
| 10 | **Unread badges** on bottom tabs for Community (forum replies, follower activity) and Profile (DMs). | High | M |
| 11 | **Touch target audit** — bump sort chips, view toggle, and any `<44pt` interactive element. | Medium | S |
| 12 | **Dynamic type test pass** at 200% text scale — fix overflow/truncation bugs. | High (a11y) | M |
| 13 | **Formalize the icon system.** Pick Phosphor or Lucide, kill emoji in UI. | High (long-term debt) | L |

### P2 — This quarter (foundational, higher effort)

| # | Item | Impact | Effort |
|---|---|---|---|
| 14 | Build out `/components/design-system/` with the 10 components above, including Storybook/demo screen. | High (velocity) | L |
| 15 | Contrast tokens locked down in theme; Stark/axe in CI. | High (a11y durability) | M |
| 16 | Redesign Keeper discovery with filters (specialty, region, experience tier) and better differentiation. | Medium | L |
| 17 | Empty state illustrations for: no tarantulas yet, no feedings yet, no photos yet, no achievements yet, no followers yet. | Medium | M |
| 18 | Haptic + subtle motion pass (respect `prefers-reduced-motion`). | Low-Medium | M |

---

## 7. What Tarantuverse Does Better Than Most Husbandry Apps

To keep this balanced — the audit is mostly critique because that's what's useful, but here's what's already strong:

- **Feature completeness is miles ahead of competitors.** Arachnifiles, ExotiKeeper, Exoden don't have community + breeding + analytics + achievements all in one place.
- **Dark mode rigor** — every screen supports it, no half-finished surfaces.
- **Safety-first information architecture** — the species model has `urticating_hairs` and `medically_significant_venom` flags, badges on care sheets are prominent. Responsible husbandry baked in.
- **Good empty state on premolt alerts** ("All Clear") — warm, reassuring, the right tone for anxious new keepers.
- **Honest branding** — the Appalachian Tarantulas logo on the profile shows the app supports real keeper identity, not just generic placeholder.

---

## 8. Suggested Next Steps

1. **This week:** split the red tokens (P0 #1). It's a 1-2 hour job and it unblocks every other color decision.
2. **Next week:** activity feed rewrite (P0 #2) — biggest perceivable UX win, will delight users who are currently confused by the feed.
3. **Two weeks out:** accessibility labels sweep + touch target audit + header compaction. These ship together as a "polish pass" release.
4. **Then:** formalize the design system folder and start migrating components one at a time.

If you want, I can:
- Draft the token split as a PR-ready diff for ThemeContext and tailwind.config.ts
- Rewrite the ActivityFeedItem component (web + mobile) with the new template
- Generate default-art SVGs for the photo-less tarantula cards
- Produce a Storybook-style "all components in one screen" for mobile to see current state
- Run an actual contrast check on the token values and output failing pairs

Just point me at one and I'll go.

---

**Document owner:** update this with decisions as they're made so future-you (and future-collaborators) know what shipped vs what was discussed.
