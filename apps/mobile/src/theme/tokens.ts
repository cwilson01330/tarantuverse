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

  // Finer steps used by the analytics redesign (design_handoff_analytics
  // README §3/§6) and the sign-in notices. Same numbers the screens used
  // before, now named. Weights are explicit (400 = RN's default).
  micro:          { fontSize: 11, fontWeight: '400', lineHeight: 15 },
  microStrong:    { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  microBold:      { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  note:           { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  noteStrong:     { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  small:          { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  smallStrong:    { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  smallBold:      { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  bodyBold:       { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  cardTitle:      { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  subheadingBold: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  tileValue:      { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  figure:         { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  // Premium unlock card (README §3): 14/700 title over 12.5/400 body.
  panelTitle:     { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  panelBody:      { fontSize: 12.5, fontWeight: '400', lineHeight: 17 },
  // Letter-spaced section labels ("INSIGHTS", "PREMIUM · PREVIEW OF YOUR DATA").
  eyebrow:        { fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 1.2 },
  eyebrowSmall:   { fontSize: 11, fontWeight: '600', lineHeight: 15, letterSpacing: 1.2 },
} as const satisfies Record<string, TextStyle>;

export type TypeKey = keyof typeof TYPE;

// ─── Share-card paper ────────────────────────────────────────────────────
// The share cards are images with a fixed palette (they must read the same
// on light and dark feeds), so the composer's frame tiles picture them in the
// same fixed colours rather than theme colours. Mirrors the renderer in
// apps/web/src/lib/share-card.
export const SHARE_CARD_PALETTE = {
  specimenPaper: '#F1EFE8',
  specimenInk: '#2C2C2A',
  specimenRule: '#888780',
  notesPaper: '#F4F1E8',
  notesHand: '#1F2A44',
  herbariumPaper: '#EDE7D6',
  herbariumBorder: '#3B3528',
  photo: '#444441',
} as const;
