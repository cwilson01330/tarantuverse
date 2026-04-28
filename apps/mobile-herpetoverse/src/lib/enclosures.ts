/**
 * Enclosure list helper.
 *
 * The enclosures table lives on the shared tarantula API. Each row is
 * tagged with a lightweight `purpose` column ('tarantula' | 'feeder' |
 * null). v1 reuses the 'tarantula' + NULL rows as generic solo-animal
 * enclosures for reptiles — no schema extension needed.
 *
 * When the enclosure model gains a real reptile taxon tag, flip the
 * default filter and drop this compatibility note.
 */
import { apiClient } from '../services/api';

export type EnclosurePurpose = 'tarantula' | 'feeder';

export interface EnclosureSummary {
  id: string;
  name: string;
  is_communal: boolean;
  population_count: number | null;
  purpose: EnclosurePurpose | null;
  species_name: string | null;
  inhabitant_count: number;
  days_since_last_feeding: number | null;
  photo_url: string | null;
  enclosure_type: string | null;
}

export async function listEnclosures(
  purpose: 'tarantula' | 'feeder' | 'all' = 'tarantula',
): Promise<EnclosureSummary[]> {
  const { data } = await apiClient.get<EnclosureSummary[]>('/enclosures/', {
    params: { purpose },
  });
  return data;
}
