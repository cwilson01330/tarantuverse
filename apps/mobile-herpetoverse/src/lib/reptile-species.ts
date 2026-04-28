/**
 * Reptile species lookup — slim mobile client.
 *
 * Just the search endpoint for the autocomplete picker. Full species
 * detail (care sheet, prey brackets, gene catalog) lives on web for v1
 * — mobile reads scientific name + species_id, hands the rest off to
 * the prey-suggestion endpoint on the snake/lizard route.
 *
 * Search endpoint is unauthenticated (`/reptile-species/search`), but
 * we use the shared apiClient anyway so the timeout + interceptors
 * carry over.
 */
import { apiClient } from '../services/api';

export type CareLevel = 'beginner' | 'intermediate' | 'advanced';

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export interface ReptileSpeciesSearchResult {
  id: string;
  slug: string;
  scientific_name: string;
  common_names: string[];
  care_level: CareLevel | null;
  image_url: string | null;
}

/**
 * Returns at most `limit` matches for the query. Empty array for queries
 * shorter than 2 chars (matches web behavior — short prefixes return too
 * many false positives).
 */
export async function searchReptileSpecies(
  q: string,
  limit = 10,
): Promise<ReptileSpeciesSearchResult[]> {
  if (q.trim().length < 2) return [];
  const { data } = await apiClient.get<ReptileSpeciesSearchResult[]>(
    '/reptile-species/search',
    {
      params: { q: q.trim(), limit },
    },
  );
  return data;
}
