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
