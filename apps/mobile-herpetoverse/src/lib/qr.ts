/**
 * QR upload session client.
 *
 * Backend creates a 20-minute token tied to the animal. The phone
 * browser at the returned `upload_url` can post photos via the
 * unauthenticated `/upload-sessions/{token}/photo` route — useful for
 * handing off photo upload to a guest, another device, or a phone
 * the keeper isn't logged into.
 *
 * NOTE FOR v1: The `upload_url` resolves against the API's
 * FRONTEND_URL setting (currently tarantuverse.com). The Tarantuverse
 * upload page only supports tarantulas right now, so a snake/lizard
 * token URL won't render correctly until either:
 *   - the Tarantuverse upload page is extended to handle snake/lizard
 *     tokens (one taxon-aware page), or
 *   - a Herpetoverse `/upload/[token]` page is added and the API's
 *     FRONTEND_URL gains taxon-aware logic.
 * Tracked as a Sprint 9 (QA/launch) task. The mobile sheet still
 * functions as a session-creation surface and renders the QR.
 */
import { apiClient } from '../services/api';

export type QRTaxon = 'snake' | 'lizard';

export interface UploadSessionResponse {
  token: string;
  upload_url: string;
  expires_at: string;
  expires_in_minutes: number;
  taxon: QRTaxon;
  /** Snake responses include `snake_name`, lizard responses `lizard_name`. */
  snake_name?: string;
  lizard_name?: string;
}

export async function createUploadSession(
  taxon: QRTaxon,
  animalId: string,
): Promise<UploadSessionResponse> {
  const root = taxon === 'snake' ? 'snakes' : 'lizards';
  const { data } = await apiClient.post<UploadSessionResponse>(
    `/${root}/${encodeURIComponent(animalId)}/upload-session`,
  );
  return data;
}
