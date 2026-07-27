/**
 * Species shortlist — care sheets a keeper has saved but doesn't own yet.
 *
 * Server-backed (not AsyncStorage) so the list is the same on web and mobile
 * and survives a reinstall. See app/models/species_shortlist.py for why.
 *
 * Note the trailing slashes: collection endpoints use them, the per-species
 * action endpoints don't — matching the router.
 */
import { apiClient } from '../services/api';

export interface ShortlistItem {
  id: string;
  species_id: string;
  note: string | null;
  created_at: string;
  taxon: string | null;
  scientific_name: string | null;
  common_names: string[];
  care_level: string | null;
  image_url: string | null;
  adult_size: string | null;
  type: string | null;
  venom_severity: string | null;
  is_verified: boolean;
  /** True when the keeper has since added one to their collection. */
  owned: boolean;
}

export async function listShortlist(): Promise<ShortlistItem[]> {
  const res = await apiClient.get('/species-shortlist/');
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Just the ids — used to light up bookmark icons across a browser list
 * without pulling every full row.
 */
export async function listShortlistIds(): Promise<string[]> {
  const res = await apiClient.get('/species-shortlist/ids');
  return res.data?.species_ids ?? [];
}

/** Idempotent server-side: adding twice returns the existing row. */
export async function addToShortlist(speciesId: string, note?: string): Promise<ShortlistItem> {
  const res = await apiClient.post('/species-shortlist/', {
    species_id: speciesId,
    note: note ?? null,
  });
  return res.data;
}

export async function updateShortlistNote(speciesId: string, note: string | null): Promise<ShortlistItem> {
  const res = await apiClient.patch(`/species-shortlist/${speciesId}`, { note });
  return res.data;
}

/** Removing something already gone is a success, not an error. */
export async function removeFromShortlist(speciesId: string): Promise<void> {
  await apiClient.delete(`/species-shortlist/${speciesId}`);
}
