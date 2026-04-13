# ADR-001: Multi-Axis Theme Preset System

**Status:** Proposed
**Date:** 2026-04-13
**Deciders:** Cory (solo — but documented for future collaborators)
**Related audit:** `PLATFORM_DESIGN_AUDIT_2026-04-13.md`

---

## Context

Tarantuverse currently supports two theming dimensions:

1. **Mode** — dark / light via `ThemeContext` (mobile) and `next-themes` (web)
2. **Accent color** — user-pickable swatches (red, blue-default, etc.) in "Customize Theme"

The default accent is a vibrant blue→purple→magenta gradient that skews young and consumer-app-adjacent (Instagram/Spotify aesthetic). User research and product analysis indicate the platform serves two distinct user segments:

- **Serious keepers / breeders / advanced hobbyists** — prefer a restrained, data-dense tool aesthetic. They spend significant time in the app managing husbandry data, analytics, and breeding records. Visual noise is friction.
- **New / casual hobbyists** — respond well to the vibrant gradient aesthetic. Discovery-oriented, community-first usage pattern.

Both segments are valuable. Forcing one aesthetic alienates the other. The accent color picker partially addresses this but doesn't control gradient usage, header footprint, information density, or surface treatments — all of which define whether the app feels like a tool or a social app.

Additionally, the web platform has a fundamentally different visual treatment and deeper feature set. The theme system must work across both platforms using a single source of truth in user preferences, without forcing visual parity where platform idioms differ.

**Constraint:** Solo developer. Any architecture chosen must be maintainable without a dedicated design-systems team. Complexity is a significant cost.

---

## Decision

Introduce **aesthetic presets** as a third theming axis, implemented as named token-bundle objects. Each preset specifies values for a fixed set of design dimensions. The user's selected preset is stored in the backend (`users.ui_preferences` JSONB) and synced to mobile (AsyncStorage) and web (session) so it follows them across platforms and devices.

Ship two presets initially: **Hobbyist** (current default, vibrant gradients) and **Keeper** (restrained, flat surfaces, compact header). A third **Naturalist** preset (earth tones, field-journal aesthetic, using the documented `#8B4513` primary color) is documented as a future option.

Semantic colors (`danger`, `warning`, `success`, `info`) are **immutable** — they live outside the preset and accent systems entirely and cannot be overridden by any theme choice.

---

## Options Considered

### Option A: Token-bundle preset objects *(recommended)*

Extend `ThemeContext` (mobile) and CSS custom properties (web) with a preset dimension. Each preset is an object mapping design token keys to values. Components consume tokens — never hardcoded values.

**Mobile:** `ThemeContext` shape becomes `{ mode, accent, preset, colors, header, radius, density, ... }`. Preset values are merged at context initialization.

**Web:** A `data-preset` attribute on `<html>` drives CSS custom properties. Tailwind reads variables via `tailwind.config.ts` extensions. `next-themes` is extended to manage the new attribute alongside its existing `data-theme`.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Maintenance cost | Low — one preset object to add a new theme |
| Platform consistency | High — same preset name, platform-idiomatic rendering |
| Team familiarity | High (React context + CSS vars are well-understood) |
| Scalability | High — adding Preset C is one object + one data-attribute rule |

**Pros:**
- Single source of truth per platform (context / CSS vars)
- Adding a new preset never touches component code
- Semantic colors stay fully isolated
- Accent + preset are orthogonal — 2 presets × N accent colors = N×2 valid combinations
- Works with existing `next-themes` on web without replacement

**Cons:**
- Initial refactor touches every component that hardcodes gradient/header/radius values
- Requires a backend migration for `ui_preferences` storage
- Mobile refactor requires careful sequencing to avoid regressions

---

### Option B: Separate full stylesheets per preset

Maintain two complete parallel style systems. User switches between "Hobbyist styles" and "Keeper styles" as distinct CSS/StyleSheet imports.

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Maintenance cost | Very high — every change must be made in N stylesheets |
| Platform consistency | Medium |
| Team familiarity | High |
| Scalability | Poor — adding a preset means duplicating the entire stylesheet |

**Pros:**
- Zero risk of token bleed between presets
- Complete isolation makes testing each preset standalone easy

**Cons:**
- Double (or triple) the stylesheet maintenance burden — every bug fix, spacing tweak, or new component must be replicated
- Likely to drift out of sync over time
- Not viable for a solo developer

---

### Option C: Layout-only toggle (compact / comfortable) without full presets

Instead of presets, expose a single "compact mode" toggle that controls density and header size only. Keep the gradient as-is.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Maintenance cost | Very low |
| Platform consistency | High |
| Team familiarity | High |
| Scalability | Low — can't express the full tool-vs-vibrant distinction |

**Pros:**
- Small scope, ships in a day
- Directly addresses the "header wastes space" critique

**Cons:**
- Doesn't solve the aesthetic-identity problem — a compact vibrant header is still a vibrant header
- Misses the opportunity to serve the serious keeper segment with a genuinely different experience
- Doesn't differentiate Tarantuverse from competitors who also have a single aesthetic

---

## Trade-off Analysis

Option A is more upfront work than Option C but is the only approach that fully addresses both user segments. Option B's maintenance cost makes it unviable at solo scale.

The key risk of Option A is the initial refactor scope — every component that currently hardcodes a gradient, `130` for header height, or a specific border-radius must be updated to read from context/variables. This is a one-time cost with permanent dividend: future presets cost hours, not days.

The risk is manageable because the token surface is small. There are only ~8 preset-controlled dimensions (listed below), and most components only care about 2-3 of them.

---

## The Preset Token Surface

These are the only dimensions a preset controls. Everything else is global.

```
header.height          int (pt / px)
header.useGradient     boolean
header.gradientColors  string[]     (e.g., ['#1a1aff', '#c0188c'])
surface.useGradientTint boolean
radius.sm / md / lg    int
density.rowHeight      int
density.cardPadding    int
density.stackGap       int
elevation.style        'border' | 'shadow' | 'none'
icon.style             'line' | 'duotone'
typography.displayWeight 'bold' | 'heavy'
```

**Immutable (outside preset system):**
```
semantic.danger        #DC2626  (always — Delete Account, error states)
semantic.warning       #F59E0B  (always — overdue badges, warning borders)
semantic.success       #10B981  (always — all-clear banners, fed-today badges)
semantic.info          #3B82F6  (always — informational states)
sex.male               #0A84FF
sex.female             #FF2D92
sex.unknown            #8E8E93
```

---

## Initial Preset Definitions

```ts
// apps/mobile/src/contexts/presets.ts

export const PRESETS = {
  hobbyist: {
    header: { height: 130, useGradient: true },
    surface: { useGradientTint: true },
    radius: { sm: 12, md: 16, lg: 24 },
    density: { rowHeight: 52, cardPadding: 16, stackGap: 12 },
    elevation: { style: 'shadow' },
    icon: { style: 'duotone' },
    typography: { displayWeight: 'heavy' },
  },
  keeper: {
    header: { height: 56, useGradient: false },
    surface: { useGradientTint: false },
    radius: { sm: 8, md: 12, lg: 16 },
    density: { rowHeight: 44, cardPadding: 14, stackGap: 8 },
    elevation: { style: 'border' },
    icon: { style: 'line' },
    typography: { displayWeight: 'bold' },
  },
  // future:
  // naturalist: { ... earth tones, #8B4513 accent, field-journal feel }
} as const

export type PresetKey = keyof typeof PRESETS
```

---

## Web Implementation

```css
/* apps/web/src/app/globals.css */

:root[data-preset="hobbyist"] {
  --header-height: 130px;
  --header-gradient: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --row-height: 52px;
  --card-padding: 16px;
}

:root[data-preset="keeper"] {
  --header-height: 56px;
  --header-gradient: none;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --row-height: 44px;
  --card-padding: 14px;
}
```

```ts
// apps/web/tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      height: {
        'screen-header': 'var(--header-height)',
      },
      spacing: {
        'card': 'var(--card-padding)',
      }
    }
  }
}
```

The `ThemeProvider.tsx` on web sets `data-preset` alongside `data-theme`:
```ts
document.documentElement.setAttribute('data-preset', userPreset)
```

---

## Backend Migration

```python
# New migration: add_ui_preferences_to_users.py
op.add_column('users', sa.Column(
    'ui_preferences',
    JSONB,
    nullable=True,
    server_default=sa.text("'{\"mode\": \"dark\", \"accent\": \"hobbyist\", \"preset\": \"hobbyist\"}'::jsonb")
))
```

```python
# apps/api/app/schemas/user.py — extend UserUpdate
class UIPreferences(BaseModel):
    mode: Literal['light', 'dark'] = 'dark'
    accent: str = 'hobbyist'
    preset: Literal['hobbyist', 'keeper'] = 'hobbyist'

class UserUpdate(BaseModel):
    # existing fields ...
    ui_preferences: Optional[UIPreferences] = None
```

New endpoint:
```
PUT /auth/ui-preferences  →  updates users.ui_preferences
GET /auth/me              →  already returns user; add ui_preferences to response schema
```

---

## Consequences

**What becomes easier:**
- Adding a third preset (Naturalist or community-contributed) is a single object + a data-attribute CSS block
- Per-component design decisions are removed: components don't decide whether to use gradients, they consume tokens
- The "serious keeper" audience has a first-class experience rather than being an afterthought
- Contrast audit becomes scoped: test each preset × mode combination = 4 combinations (2 presets × 2 modes)

**What becomes harder:**
- QA surface increases — every screen must be verified across preset × mode combinations
- Screenshot tests (if added later) need a preset dimension
- Onboarding UX needs to introduce the concept without overwhelming new users

**What we'll need to revisit:**
- If a user creates a custom accent that conflicts with the Keeper preset's flat-surface aesthetic (e.g., a very bright neon accent on a restrained surface), we may need accent-preset compatibility guidance
- The web "deeper features" areas (admin panels, analytics, breeding module) may have components that need individual auditing after the token refactor
- Notification and push systems should respect `header.height` for in-app banners

---

## Action Items

- [ ] Add `PRESETS` object to `apps/mobile/src/contexts/presets.ts`
- [ ] Extend `ThemeContext` to include `preset` field and merged preset tokens
- [ ] Audit mobile components for hardcoded gradient/height/radius values — replace with token reads
- [ ] Wire `preset` selector to "Customize Theme" screen with side-by-side preview
- [ ] Persist selection in `AsyncStorage` alongside existing `auth_token`
- [ ] Create Alembic migration for `users.ui_preferences` JSONB column
- [ ] Extend `UserUpdate` schema and `PUT /auth/ui-preferences` endpoint
- [ ] Add CSS custom property blocks to `apps/web/src/app/globals.css`
- [ ] Extend `tailwind.config.ts` to read radius/spacing from CSS vars
- [ ] Update `ThemeProvider.tsx` on web to set `data-preset` attribute
- [ ] Update `GET /auth/me` response schema to include `ui_preferences`
- [ ] Test all 4 combinations: hobbyist×dark, hobbyist×light, keeper×dark, keeper×light
- [ ] Update CLAUDE.md — add preset system to architecture section

---

*Supersedes:* nothing (first ADR in this repo)
*Superseded by:* n/a
