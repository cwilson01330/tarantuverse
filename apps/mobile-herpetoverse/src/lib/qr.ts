/**
 * QR upload session client.
 *
 * Backend creates a 20-minute token tied to the animal. The phone
 * browser at the returned `upload_url` can post photos via the
 * unauthenticated `/upload-sessions/{token}/photo` route — useful for
 * handing off photo upload to a guest, another device, or a phone the
 * keeper isn't logged into.
 *
 * ADR-003: snakes/lizards/frogs collapsed into one `animals` table, so
 * the per-taxon upload-session endpoints collapsed into
 * `/animals/{id}/upload-session` — taxon comes back in the response.
 *
 * NOTE FOR v1: The `upload_url` resolves against the API's FRONTEND_URL
 * setting. The Tarantuverse upload page reads the session's `taxon`
 * field and renders animal sessions under Herpetoverse branding.
 */
import { apiClient } from '../services/api';
import type { AnimalTaxon } from './animals';

export type { AnimalTaxon };

export interface UploadSessionResponse {
  token: string;
  upload_url: string;
  expires_at: string;
  expires_in_minutes: number;
  taxon: AnimalTaxon;
  /** Display name of the animal the session is bound to. */
  animal_name?: string;
}

/**
 * Create a 20-minute upload session for an animal. ADR-003 collapsed
 * the per-taxon endpoints — one route now, taxon comes back in the
 * response.
 */
export async function createUploadSession(
  animalId: string,
): Promise<UploadSessionResponse> {
  const { data } = await apiClient.post<UploadSessionResponse>(
    `/animals/${encodeURIComponent(animalId)}/upload-session`,
  );
  return data;
}
