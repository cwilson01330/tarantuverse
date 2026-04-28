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

// ---------------------------------------------------------------------------
// Catalog list — paginated browse
// ---------------------------------------------------------------------------

export interface ReptileSpeciesPaginatedResponse {
  items: ReptileSpeciesSearchResult[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
}

export interface ListReptileSpeciesParams {
  skip?: number;
  limit?: number;
  verified_only?: boolean;
  care_level?: CareLevel;
  enclosure_type?: 'terrestrial' | 'arboreal' | 'semi_arboreal' | 'fossorial';
  diet_type?: 'strict_carnivore' | 'insectivore' | 'omnivore' | 'herbivore';
}

export async function listReptileSpecies(
  params: ListReptileSpeciesParams = {},
): Promise<ReptileSpeciesPaginatedResponse> {
  const { data } = await apiClient.get<ReptileSpeciesPaginatedResponse>(
    '/reptile-species/',
    { params },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Full care-sheet detail
// ---------------------------------------------------------------------------

/**
 * Full reptile species record. Lots of fields — only a curated subset is
 * rendered on the mobile detail screen for v1. Add more renders as
 * keepers ask for them.
 */
export interface ReptileSpecies {
  id: string;
  slug: string;
  scientific_name: string;
  common_names: string[];
  genus: string | null;
  family: string | null;
  order_name: string | null;

  care_level: CareLevel | null;
  handleability: string | null;
  activity_period: string | null;
  native_region: string | null;

  adult_length_min_in: string | null;
  adult_length_max_in: string | null;
  adult_weight_min_g: string | null;
  adult_weight_max_g: string | null;

  temp_cool_min: string | null;
  temp_cool_max: string | null;
  temp_warm_min: string | null;
  temp_warm_max: string | null;
  temp_basking_min: string | null;
  temp_basking_max: string | null;
  temp_night_min: string | null;
  temp_night_max: string | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_shed_boost_min: number | null;
  humidity_shed_boost_max: number | null;

  uvb_required: boolean;
  uvb_type: string | null;

  enclosure_type: string | null;
  enclosure_min_hatchling: string | null;
  enclosure_min_juvenile: string | null;
  enclosure_min_adult: string | null;
  bioactive_suitable: boolean;

  substrate_safe_list: string[];
  substrate_avoid_list: string[];

  diet_type: string | null;
  prey_size_hatchling: string | null;
  prey_size_juvenile: string | null;
  prey_size_adult: string | null;
  feeding_frequency_hatchling: string | null;
  feeding_frequency_juvenile: string | null;
  feeding_frequency_adult: string | null;
  supplementation_notes: string | null;

  water_bowl_description: string | null;
  soaking_behavior: string | null;
  brumation_required: boolean;
  brumation_notes: string | null;
  defensive_displays: string[];

  lifespan_captivity_min_yrs: number | null;
  lifespan_captivity_max_yrs: number | null;

  cites_appendix: string | null;

  has_morph_market: boolean;
  morph_complexity: string | null;

  care_guide: string | null;
  image_url: string | null;
  source_url: string | null;

  is_verified: boolean;
}

export async function getReptileSpecies(id: string): Promise<ReptileSpecies> {
  const { data } = await apiClient.get<ReptileSpecies>(
    `/reptile-species/${encodeURIComponent(id)}`,
  );
  return data;
}
