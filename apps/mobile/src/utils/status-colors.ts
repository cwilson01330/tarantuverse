/**
 * Shared status-color helpers.
 *
 * Single source of truth for the husbandry status ramps that were
 * previously re-implemented inline (with hardcoded hex) across the
 * collection grid + detail screens. Routes through semantic theme tokens
 * (`colors.success/warning/error`) so the colors respond to light/dark
 * mode and any future color-token change — see the 2026-06-22 design
 * system audit, Action 1 + Action 4.
 */
import type { ThemeColors } from '../contexts/ThemeContext';

/**
 * The "overdue but not critical" orange has no semantic token of its own —
 * the feeding ramp needs a fourth step between warning-yellow and
 * error-red. Kept here as the one intentional non-token value so it isn't
 * re-typed at every call site.
 */
export const FEEDING_OVERDUE_ORANGE = '#f97316';

/**
 * Fixed semantic colours (analytics redesign README §5). Identical in every
 * theme and preset. The web copy of the analytics lib keeps the same literals
 * above its shared marker, so keep the two in step.
 */
export const SEMANTIC_COLORS = {
  error: '#ef4444',
  warning: '#eab308',
  success: '#22c55e',
  info: '#3b82f6',
  male: '#3b82f6',
  female: '#ec4899',
  molt: '#8b5cf6',
  premiumDark: '#c9a2ff',
  premiumLight: '#7c3aed',
} as const;

/** Text/icons on a `primary` fill or the Hobbyist gradient. */
export const ON_PRIMARY = '#ffffff';

/** The grey of "sample data" charts (README §3 grey sample, §6). */
export const MUTED_SAMPLE = '#4b5563';

/**
 * Days-since-last-feeding → ramp color.
 *   <7d  green (success) · 7–13d yellow (warning) · 14–20d orange · ≥21d red (error)
 * null/undefined (never fed / no data) reads as success (no alarm).
 */
export function feedingStatusColor(
  days: number | null | undefined,
  colors: ThemeColors,
): string {
  if (days == null) return colors.success;
  if (days >= 21) return colors.error;
  if (days >= 14) return FEEDING_OVERDUE_ORANGE;
  if (days >= 7) return colors.warning;
  return colors.success;
}
