/**
 * Preset-independent design tokens (ADR-007, step 4).
 *
 * Two of the design dimensions are CONSTANT across aesthetic presets and
 * live here: the spacing scale and the typography scale. The dimensions
 * that DO flex per Keeper/Hobbyist preset — radius, row height, card
 * padding, stack gap, elevation style, gradient usage — already live on
 * `layout` (see AESTHETIC_PRESETS in ThemeContext). Read those from
 * `useTheme().layout`, not from here.
 *
 * Colors always come from `useTheme().colors`. Screens should never
 * hardcode hex, font sizes, or pixel spacing — pull from these tokens so
 * the whole invert surface converges on one visual language and future
 * preset/theme work composes cleanly.
 */
import type { TextStyle } from 'react-native';

// ─── Spacing scale ───────────────────────────────────────────────────────
// 4-pt base. Use for margins, padding, and gaps. Preset density
// (cardPadding / stackGap / rowHeight) still comes from `layout`; this
// scale is for everything else.
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export type SpacingKey = keyof typeof SPACING;

// ─── Typography scale ────────────────────────────────────────────────────
// Named roles rather than raw sizes so hierarchy stays consistent across
// screens. `as const` keeps fontWeight as string literals, which satisfy
// RN's TextStyle['fontWeight'] union.
export const TYPE = {
  display:    { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  title:      { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heading:    { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body:       { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  label:      { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  caption:    { fontSize: 12, fontWeight: '500', lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;

export type TypeKey = keyof typeof TYPE;
