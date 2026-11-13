/**
 * Small pure rules behind the mobile everyday-logging screens (jumping-spiders
 * Task 6). Kept out of the screens so they can be tested.
 */

export const PREY_QUANTITY_MIN = 1
export const PREY_QUANTITY_MAX = 20

/** Keep a "how many" value inside 1..20; anything unreadable is 1. */
export function clampQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return PREY_QUANTITY_MIN
  return Math.min(PREY_QUANTITY_MAX, Math.max(PREY_QUANTITY_MIN, Math.round(n)))
}

/** Date (YYYY-MM-DD, local) of the newest ultimate molt, or null. The animal
 *  detail has no matured_at of its own, so it reads this off the molts it
 *  already loaded. */
export function maturedAtFromMolts(
  molts: ReadonlyArray<{ molted_at: string; is_ultimate?: boolean }>,
): string | null {
  let best: Date | null = null
  for (const m of molts) {
    if (!m.is_ultimate) continue
    const d = new Date(m.molted_at)
    if (Number.isNaN(d.getTime())) continue
    if (!best || d > best) best = d
  }
  if (!best) return null
  const mm = String(best.getMonth() + 1).padStart(2, '0')
  const dd = String(best.getDate()).padStart(2, '0')
  return `${best.getFullYear()}-${mm}-${dd}`
}

/** Read the "don't ask again" flag. Any storage error means keep asking. */
export async function readMoltPhotoDismissed(
  storage: { getItem: (k: string) => Promise<string | null> },
  key: string,
): Promise<boolean> {
  try {
    return (await storage.getItem(key)) === '1'
  } catch {
    return false
  }
}

/** Remember "don't ask again". Never throws. */
export async function writeMoltPhotoDismissed(
  storage: { setItem: (k: string, v: string) => Promise<void> },
  key: string,
): Promise<void> {
  try {
    await storage.setItem(key, '1')
  } catch {
    // worst case the keeper is asked once more
  }
}

/** Every exit from the molt photo prompt (Take, Choose, Not now, backdrop)
 *  reports the "Don't ask again" tick; store it when ticked. Never throws. */
export async function rememberMoltPhotoChoice(
  dontAskAgain: boolean,
  storage: { setItem: (k: string, v: string) => Promise<void> },
  key: string,
): Promise<void> {
  if (dontAskAgain) await writeMoltPhotoDismissed(storage, key)
}
