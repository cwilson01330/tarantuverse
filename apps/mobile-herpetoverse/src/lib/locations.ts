/**
 * Keeper locations — room / rack / shelf, for Herpetoverse animals.
 *
 * The server owns the spelling: every write is normalised and snapped to the
 * keeper's existing spelling case-insensitively (utils/locations.py), so
 * "reptile room" and "Reptile Room" can never become two groups. The client's
 * job is to make picking an existing location easier than typing a new one,
 * and to group by `locationKey` rather than by the raw string.
 *
 * Herpetoverse locations are their own list, separate from the same keeper's
 * Tarantuverse locations. A keeper with no locations sees none of this:
 * `useLocations` returns an empty list and every surface hides the option on
 * an empty list.
 *
 * Mirrors apps/mobile/src/lib/locations.ts, over /animals/*. (apiClient's
 * baseURL already carries /api/v1.)
 */
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

export interface LocationItem {
  name: string;
  count: number;
}

/** Sentinel group for animals with no location when grouping is on. */
export const UNASSIGNED_LABEL = 'Unassigned';
export const UNASSIGNED_KEY = '__unassigned__';

/** Same rule as the server's grouping key: trimmed, whitespace-collapsed,
 *  lower-cased. Null/blank → null. */
export function locationKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return t.length ? t : null;
}

export async function listLocations(collection?: string | null): Promise<LocationItem[]> {
  const { data } = await apiClient.get<LocationItem[]>('/animals/locations', {
    params: collection ? { collection } : undefined,
  });
  return data;
}

export async function renameLocation(
  oldName: string,
  newName: string,
  collection?: string | null,
): Promise<{ moved: number; name: string | null }> {
  const { data } = await apiClient.post<{ moved: number; name: string | null }>(
    '/animals/locations/rename',
    { old: oldName, new: newName },
    { params: collection ? { collection } : undefined },
  );
  return data;
}

export async function bulkSetLocation(
  location: string | null,
  animalIds: string[],
  collection?: string | null,
): Promise<{ updated: number; location: string | null }> {
  const { data } = await apiClient.post<{ updated: number; location: string | null }>(
    '/animals/bulk-location',
    { location, animal_ids: animalIds },
    { params: collection ? { collection } : undefined },
  );
  return data;
}

/** Group any rows by their location. Rows with none go under UNASSIGNED_LABEL,
 *  always last; named groups are alphabetical, case-insensitive. Within a
 *  group the caller's order is preserved. */
export function groupByLocation<T>(
  rows: T[],
  getLocation: (row: T) => string | null | undefined,
): { key: string; label: string; rows: T[] }[] {
  const groups = new Map<string, { key: string; label: string; rows: T[] }>();
  const unassigned: T[] = [];
  for (const row of rows) {
    const raw = getLocation(row);
    const key = locationKey(raw);
    if (!key) {
      unassigned.push(row);
      continue;
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, label: (raw as string).replace(/\s+/g, ' ').trim(), rows: [] };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  const out = Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
  if (unassigned.length) out.push({ key: UNASSIGNED_KEY, label: UNASSIGNED_LABEL, rows: unassigned });
  return out;
}

/** The keeper's locations, refetched on demand. Empty = feature hidden. */
export function useLocations(collection?: string | null) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setLocations(await listLocations(collection));
    } catch {
      // Best effort — a failed fetch just means the picker starts empty.
    } finally {
      setLoaded(true);
    }
  }, [collection]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { locations, loaded, refresh, hasLocations: locations.length > 0 };
}
