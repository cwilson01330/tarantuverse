/**
 * Small pure rules behind the web everyday-logging screens (jumping-spiders
 * Task 7). Web copy of apps/mobile/src/lib/everyday-logging-ui.ts, except the
 * storage helpers are synchronous (localStorage). Import-free so node --test
 * can load it.
 */

export const PREY_QUANTITY_MIN = 1
export const PREY_QUANTITY_MAX = 20

/** Keep a "how many" value inside 1..20; anything unreadable is 1. */
export function clampQuantity(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return PREY_QUANTITY_MIN
  return Math.min(PREY_QUANTITY_MAX, Math.max(PREY_QUANTITY_MIN, Math.round(n)))
}

/** The `quantity` the feeding edit link passes in the query string, as a
 *  clamped number — or null when absent or unreadable. null means "we do not
 *  know the stored count", so a save must not send one. */
export function quantityFromQuery(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? clampQuantity(n) : null
}

/** Date (YYYY-MM-DD, local) of the newest ultimate molt, or null. */
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

export interface SyncStorage {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
}

/** Read the "don't ask after molts" flag. Any storage error means keep asking. */
export function readMoltPhotoDismissed(storage: SyncStorage | null | undefined, key: string): boolean {
  try {
    return !!storage && storage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Remember "don't ask after molts". Never throws. */
export function writeMoltPhotoDismissed(storage: SyncStorage | null | undefined, key: string): void {
  try {
    storage?.setItem(key, '1')
  } catch {
    // worst case the keeper is asked once more
  }
}

/** Should this save open the photo prompt? Only a NEW molt that did not end in
 *  death; the caller still checks taxon / closed / dismissed via offerMoltPhoto. */
export function isPromptableMolt(isEdit: boolean, outcome: string): boolean {
  return !isEdit && outcome !== 'fatal'
}

/** One tap on the "how many" stepper. Touching it means the keeper chose a
 *  count, so it becomes known (and is saved) even when the stored count
 *  couldn't be loaded. */
export function stepQuantity(q: number, delta: number): { quantity: number; known: true } {
  return { quantity: clampQuantity(q + delta), known: true }
}

/** The `quantity` to put in a feeding payload, or undefined to leave the
 *  stored count alone (no stepper for this taxon, or count unknown and
 *  untouched). */
export function quantityForSave(showQuantity: boolean, known: boolean, q: number): number | undefined {
  return showQuantity && known ? clampQuantity(q) : undefined
}
