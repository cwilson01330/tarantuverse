/**
 * Canonical facts about the Tarantuverse app listings.
 *
 * Single source for both the structured data Google reads and the rating line
 * visitors see. They are deliberately fed from the same constant: Google's
 * review-snippet guidelines expect a rating in markup to be visible on the page
 * itself, and keeping one number in two places is how those quietly drift apart.
 *
 * KEEPING THIS HONEST
 * -------------------
 * `ratingCount` is required by the type, not optional. A rating average with no
 * count is the misleading shape — "5.0 out of 5" reads very differently from
 * "5.0 out of 5 from 2 ratings", and right now the count is small. Both the
 * markup and the UI always carry it.
 *
 * Set `rating` to null when there's nothing real to report. Everything degrades
 * cleanly: the visible line disappears and `aggregateRating` is omitted from the
 * JSON-LD. That costs the star rich result and nothing else — the app entity is
 * still described. Never put a number here that isn't on the store page.
 *
 * Update from App Store Connect / Play Console when the numbers move.
 */

export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://tarantuverse.com'

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/tarantuverse/id6756224640'
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.tarantuverse.app'

export interface AppRating {
  /** Average score as shown on the store listing. */
  value: number
  /** How many ratings that average is built from. Never omit this. */
  count: number
  /** Where the number comes from, so the page can say so plainly. */
  source: string
  /** Top of the scale — 5 on both stores. */
  best: number
}

/**
 * Verified 2026-08-05 against the App Store listing: 5.0 out of 5, 2 ratings.
 * Play Store had no rating average yet at that point, so this reflects iOS only
 * and the label says so rather than implying a combined score.
 */
export const APP_RATING: AppRating | null = {
  value: 5.0,
  count: 2,
  source: 'App Store',
  best: 5,
}

export const LEGAL_ENTITY = {
  name: 'Appalachian Tarantulas, LLC',
  url: 'https://appalachiantarantulas.com',
  email: 'cory@appalachiantarantulas.com',
} as const
