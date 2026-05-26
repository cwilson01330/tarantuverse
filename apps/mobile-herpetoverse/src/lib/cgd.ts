/**
 * Complete Gecko Diet (CGD) helpers.
 *
 * Rhacodactylids (cresties, gargoyles, leachies, chahoua, mossy) and
 * the day geckos that eat alongside them are fed a complete diet —
 * Pangea / Repashy / etc. — refreshed every 1-3 days rather than via
 * discrete prey events. That breaks the snake-shaped "days since fed"
 * thresholds the rest of Herpetoverse uses: day 4 is already overdue
 * for a healthy crestie, not "fine, still in the yellow."
 *
 * Backend exposes `animal.feeds_on_cgd` (resolved override ?? species
 * default). When that's true, clients should:
 *   - Use the CGD threshold ramp (≤2 green / 3 yellow / 4-5 orange / ≥6 red)
 *   - Surface a "Refreshed CGD" quick action that one-tap logs a feeding
 *   - Offer the brand picker on the log-feeding form so `food_type`
 *     becomes a clean canonical string rather than free-text drift
 */

// ---------------------------------------------------------------------------
// Brand catalog — single-level (brand + flavor combined). Each entry is
// what gets stored in FeedingLog.food_type. Keep this list short and
// canonical so analytics on prey distribution stay clean; the "Other"
// escape hatch on the picker lets a keeper enter a custom string when
// they're using a brand we don't list yet.
// ---------------------------------------------------------------------------

export const CGD_BRANDS = [
  'Pangea Fig & Insects',
  'Pangea Watermelon',
  'Pangea Banana & Apricot',
  'Pangea Papaya',
  'Repashy Crested Diet',
  "Repashy Grubs 'n' Fruit",
  'Black Panther Zoological MRP',
  "Leapin' Leachie",
] as const;

export type CgdBrand = (typeof CGD_BRANDS)[number];

/** Label used on the picker's "type your own" chip. The keeper picks
 *  this then types into the food_type input — we store their string,
 *  not the literal word "Other". */
export const OTHER_BRAND_LABEL = 'Other';

/** Default for the one-tap "Refreshed CGD" quick action. Pangea Fig
 *  & Insects is the most common starter MRP and a safe default. A
 *  keeper who feeds something different can change it in the brand
 *  picker on the log-feeding form. */
export const DEFAULT_CGD_FOOD_TYPE: CgdBrand = 'Pangea Fig & Insects';

/** Ready-to-use option list for ChipGroup<string> pickers. */
export const CGD_BRAND_OPTIONS: { value: string; label: string }[] =
  CGD_BRANDS.map((b) => ({ value: b, label: b }));

// ---------------------------------------------------------------------------
// Feeding-status thresholds
// ---------------------------------------------------------------------------

/** "Days since last fed" thresholds. Different ramps for snake-style
 *  weekly feedings vs. rhacodactylid CGD cadence. */
export interface FeedingPillColors {
  green: string;
  yellow: string;
  orange: string;
  red: string;
}

/**
 * Default color values matching the rest of the app — most callers
 * pass `theme.success` as green and the standard hex codes for the
 * warning ramp.
 */
export const DEFAULT_PILL_COLORS: FeedingPillColors = {
  green: '#10B981', // emerald-500 (HV primary)
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

/**
 * Resolve the feeding-status pill color for an animal.
 *
 * Returns the green color when `days` is null (never fed yet) so the
 * card doesn't scream at the keeper before they've had a chance to
 * log anything. CGD geckos use the tighter ramp; everyone else uses
 * the snake-shaped one already in production.
 */
export function feedingPillColor(
  days: number | null,
  feedsOnCgd: boolean,
  colors: FeedingPillColors = DEFAULT_PILL_COLORS,
): string {
  if (days == null) return colors.green;

  if (feedsOnCgd) {
    if (days >= 6) return colors.red;
    if (days >= 4) return colors.orange;
    if (days >= 3) return colors.yellow;
    return colors.green;
  }

  if (days >= 30) return colors.red;
  if (days >= 14) return colors.orange;
  if (days >= 7) return colors.yellow;
  return colors.green;
}
