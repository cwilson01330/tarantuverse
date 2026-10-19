/**
 * Canonical facts about the Herpetoverse app listings and publisher.
 *
 * One place for the store URLs, the plan prices used in structured data, and
 * the publisher, so llms.txt, the JSON-LD and the homepage links can't drift.
 * Mirrors apps/web/src/lib/app-listing.ts on Tarantuverse.
 *
 * No rating here on purpose: the App Store listing had 0 ratings on
 * 2026-10-19. Add one only when a real store average exists, with its count,
 * and show it on the page too.
 */

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://herpetoverse.com').replace(
  /\/$/,
  '',
)

export const APP_STORE_URL = 'https://apps.apple.com/us/app/herpetoverse/id6765683901'
// From apps/mobile-herpetoverse/app.json (`playStoreUrl`).
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.herpetoverse.app'

/** Herpetoverse Premium as listed on /pricing (PricingPlans.tsx `PRICE`) — change together. */
export const PREMIUM_PRICES_USD = { monthly: 4.99, yearly: 44.99, lifetime: 149.99 } as const

export const LEGAL_ENTITY = {
  name: 'Appalachian Tarantulas, LLC',
  url: 'https://appalachiantarantulas.com',
  email: 'cory@appalachiantarantulas.com',
} as const
