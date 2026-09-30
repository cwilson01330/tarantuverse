/**
 * Keeper locations — room / rack / shelf.
 *
 * The server owns the spelling: every write is normalised and snapped to the
 * keeper's existing spelling case-insensitively (utils/locations.py), so
 * "spider room" and "Spider Room" can never become two groups. The client's
 * job is to make picking an existing location easier than typing a new one,
 * and to group by `locationKey` rather than by the raw string.
 *
 * A keeper with no locations sees none of this: `listLocations` returns an
 * empty list and every surface hides the option on an empty list.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface LocationItem {
  name: string
  count: number
}

/** Sentinel group for animals with no location when grouping is on. */
export const UNASSIGNED_LABEL = 'Unassigned'
export const UNASSIGNED_KEY = '__unassigned__'

/** Same rule as the server's grouping key: trimmed, whitespace-collapsed,
 *  lower-cased. Null/blank → null. */
export function locationKey(value: string | null | undefined): string | null {
  if (!value) return null
  const t = value.replace(/\s+/g, ' ').trim().toLowerCase()
  return t.length ? t : null
}

function authHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    const d = body?.detail
    if (typeof d === 'string') return d
    if (d && typeof d.message === 'string') return d.message
  } catch {
    // no body
  }
  return fallback
}

export async function listLocations(token: string, collection?: string | null): Promise<LocationItem[]> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  const res = await fetch(`${API_URL}/api/v1/inverts/locations${qs}`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await readError(res, 'Could not load locations'))
  return res.json()
}

export async function renameLocation(
  token: string,
  oldName: string,
  newName: string,
  collection?: string | null,
): Promise<{ moved: number; name: string | null }> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  const res = await fetch(`${API_URL}/api/v1/inverts/locations/rename${qs}`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ old: oldName, new: newName }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not rename location'))
  return res.json()
}

export async function bulkSetLocation(
  token: string,
  location: string | null,
  ids: { invert_ids?: string[]; colony_ids?: string[] },
  collection?: string | null,
): Promise<{ updated: number; location: string | null }> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  const res = await fetch(`${API_URL}/api/v1/inverts/bulk-location${qs}`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ location, invert_ids: ids.invert_ids ?? [], colony_ids: ids.colony_ids ?? [] }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not set location'))
  return res.json()
}

/** Group any rows by their location. Rows with none go under UNASSIGNED_LABEL,
 *  always last; named groups are alphabetical, case-insensitive. Within a
 *  group the caller's order is preserved. */
export function groupByLocation<T>(
  rows: T[],
  getLocation: (row: T) => string | null | undefined,
): { key: string; label: string; rows: T[] }[] {
  const groups = new Map<string, { key: string; label: string; rows: T[] }>()
  const unassigned: T[] = []
  for (const row of rows) {
    const raw = getLocation(row)
    const key = locationKey(raw)
    if (!key) {
      unassigned.push(row)
      continue
    }
    let g = groups.get(key)
    if (!g) {
      g = { key, label: (raw as string).replace(/\s+/g, ' ').trim(), rows: [] }
      groups.set(key, g)
    }
    g.rows.push(row)
  }
  const out = Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
  if (unassigned.length) out.push({ key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL, rows: unassigned })
  return out
}
