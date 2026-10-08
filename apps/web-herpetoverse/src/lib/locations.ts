/**
 * Keeper locations — room / rack / shelf, for Herpetoverse animals.
 *
 * The server owns the spelling: every write is normalised and snapped to the
 * keeper's existing spelling case-insensitively (utils/locations.py), so
 * "reptile room" and "Reptile Room" can never become two groups. The client's
 * job is to make picking an existing location easier than typing a new one,
 * and to group by `locationKey` rather than by the raw string.
 *
 * Herpetoverse locations are their own list: they are separate from the same
 * keeper's Tarantuverse locations. A keeper with no locations sees none of
 * this — `listLocations` returns an empty list and every surface hides the
 * option on an empty list.
 *
 * Mirrors apps/web/src/lib/locations.ts, over /api/v1/animals/*.
 */
'use client'

import { apiFetch } from './apiClient'

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

export function listLocations(collection?: string | null): Promise<LocationItem[]> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  return apiFetch<LocationItem[]>(`/api/v1/animals/locations${qs}`)
}

export function renameLocation(
  oldName: string,
  newName: string,
  collection?: string | null,
): Promise<{ moved: number; name: string | null }> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  return apiFetch<{ moved: number; name: string | null }>(`/api/v1/animals/locations/rename${qs}`, {
    method: 'POST',
    json: { old: oldName, new: newName },
  })
}

export function bulkSetLocation(
  location: string | null,
  animalIds: string[],
  collection?: string | null,
): Promise<{ updated: number; location: string | null }> {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
  return apiFetch<{ updated: number; location: string | null }>(`/api/v1/animals/bulk-location${qs}`, {
    method: 'POST',
    json: { location, animal_ids: animalIds },
  })
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
