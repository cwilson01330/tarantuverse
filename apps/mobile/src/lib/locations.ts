/**
 * Keeper locations — room / rack / shelf.
 *
 * The server owns the spelling: every write is normalised and snapped to the
 * keeper's existing spelling case-insensitively (utils/locations.py), so
 * "spider room" and "Spider Room" can never become two groups. The client's
 * job is to make picking an existing location easier than typing a new one,
 * and to group by `locationKey` rather than by the raw string.
 *
 * A keeper with no locations sees none of this: `useLocations` returns an
 * empty list and every surface hides the option on an empty list.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

export interface LocationItem {
  name: string;
  count: number;
}

/** Sentinel group for animals with no location when grouping is on. */
export const UNASSIGNED_LABEL = 'Unassigned';

/** Same rule as the server's grouping key: trimmed, whitespace-collapsed,
 *  lower-cased. Null/blank → null. */
export function locationKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return t.length ? t : null;
}

export async function listLocations(collection?: string | null): Promise<LocationItem[]> {
  const { data } = await apiClient.get<LocationItem[]>('/inverts/locations', {
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
    '/inverts/locations/rename',
    { old: oldName, new: newName },
    { params: collection ? { collection } : undefined },
  );
  return data;
}

export async function bulkSetLocation(
  location: string | null,
  ids: { invert_ids?: string[]; colony_ids?: string[] },
  collection?: string | null,
): Promise<{ updated: number; location: string | null }> {
  const { data } = await apiClient.post<{ updated: number; location: string | null }>(
    '/inverts/bulk-location',
    { location, invert_ids: ids.invert_ids ?? [], colony_ids: ids.colony_ids ?? [] },
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
  let unassigned: T[] = [];
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
  const out = Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  if (unassigned.length) out.push({ key: '__unassigned__', label: UNASSIGNED_LABEL, rows: unassigned });
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
