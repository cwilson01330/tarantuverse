/**
 * Admin: species catalog images.
 *
 * Mirrors the web admin screen. Both talk to the same two endpoints, and the
 * rules that matter — gap-filling by default, replace needs an explicit flag,
 * attribution required — are enforced SERVER-side, so the two clients can't
 * drift into disagreeing about what's allowed.
 */
import { apiClient } from '../services/api';

export interface SpeciesImageRow {
  id: string;
  scientific_name: string;
  common_names: string[];
  taxon: string;
  image_url: string | null;
  image_attribution: string | null;
}

export interface SpeciesImageStatus {
  species: SpeciesImageRow[];
  /** Across the WHOLE catalog, not the filtered page — so progress is honest
   *  rather than progress-within-a-filter. */
  total_species: number;
  total_with_image: number;
}

export async function listSpeciesImageStatus(
  opts: { taxon?: string; missingOnly?: boolean } = {},
): Promise<SpeciesImageStatus> {
  const { data } = await apiClient.get<SpeciesImageStatus>('/admin/species-images', {
    params: {
      taxon: opts.taxon,
      missing_only: opts.missingOnly ?? true,
    },
  });
  return data;
}

/**
 * Attach an uploaded image to a species.
 *
 * `form` must carry `file` and `attribution`, plus `replace=true` when the
 * species already has an image — the server returns 409 otherwise, on purpose.
 */
export async function uploadSpeciesImage(
  speciesId: string,
  form: FormData,
): Promise<SpeciesImageRow> {
  const { data } = await apiClient.post<SpeciesImageRow>(
    `/admin/species-images/${speciesId}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}
