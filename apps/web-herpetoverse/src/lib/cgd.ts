/**
 * Complete Gecko Diet (CGD) catalog — web mirror.
 *
 * Mirrors `apps/mobile-herpetoverse/src/lib/cgd.ts`. Web doesn't share
 * code with mobile yet (the shared-package work was deferred per
 * ADR-002 §D3), so the two files coexist as siblings. Keep the brand
 * list and DEFAULT_CGD_FOOD_TYPE in sync — they're the strings stored
 * in `FeedingLog.food_type`, and drift between platforms makes prey
 * distribution analytics noisy.
 */

export const CGD_BRANDS = [
  'Pangea Fig & Insects',
  'Pangea Watermelon',
  'Pangea Banana & Apricot',
  'Pangea Papaya',
  'Repashy Crested Diet',
  "Repashy Grubs 'n' Fruit",
  'Black Panther Zoological MRP',
  "Leapin' Leachie",
] as const

export type CgdBrand = (typeof CGD_BRANDS)[number]

/** Default for the one-tap "Refreshed CGD" button. Pangea Fig &
 *  Insects is the most common starter MRP; a keeper on something
 *  different can change it in the brand picker on the log-feeding
 *  form. */
export const DEFAULT_CGD_FOOD_TYPE: CgdBrand = 'Pangea Fig & Insects'

/**
 * Calendar-day diff in the user's local timezone. We compute against
 * midnight-floored Date objects so a 9pm feeding "yesterday" reads as
 * 1 day ago even if UTC midnight has flipped — matches the mobile
 * `daysSince` helper and the calendar-day rule in our memory notes.
 */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date()
  const thenLocal = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(
    0,
    Math.round((nowLocal.getTime() - thenLocal.getTime()) / 86_400_000),
  )
}

/**
 * Tailwind text-color class for the "Last fed" value on a reptile card.
 * Snake/lizard cadence is the default; CGD-fed rhacodactylids get a
 * tighter ramp (overdue at day 4 instead of day 7) so a healthy
 * crestie reads green at day 2 rather than blending with overdue
 * animals.
 */
export function lastFedTextClass(
  lastFedIso: string | null | undefined,
  feedsOnCgd: boolean,
): string {
  const days = daysSince(lastFedIso)
  if (days == null) return 'text-neutral-500'

  if (feedsOnCgd) {
    if (days >= 6) return 'text-rose-400'
    if (days >= 4) return 'text-orange-300'
    if (days >= 3) return 'text-yellow-300'
    return 'text-emerald-300'
  }

  if (days >= 30) return 'text-rose-400'
  if (days >= 14) return 'text-orange-300'
  if (days >= 7) return 'text-yellow-300'
  return 'text-neutral-200'
}
