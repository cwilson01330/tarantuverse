/**
 * QR upload-session client.
 *
 * Backend creates a 20-minute token tied to a snake or lizard. The
 * phone browser at the returned `upload_url` posts photos via the
 * unauthenticated `/upload-sessions/{token}/photo` route — useful for
 * handing off photo capture to a guest, partner, or another device
 * without sharing login credentials.
 *
 * NOTE on web-side rendering: the upload page lives at
 * `apps/web/src/app/upload/[token]/page.tsx` (Tarantuverse domain).
 * It's been extended to read the session's `taxon` field and render
 * snake/lizard sessions under Herpetoverse branding, so even though
 * the URL says tarantuverse.com the page reads on-brand once loaded.
 */
import { apiFetch } from './apiClient'

export type QRTaxon = 'snake' | 'lizard'

export interface UploadSessionResponse {
  token: string
  upload_url: string
  expires_at: string
  expires_in_minutes: number
  taxon: QRTaxon
  /** Snake responses include `snake_name`, lizard responses `lizard_name`. */
  snake_name?: string
  lizard_name?: string
}

export async function createUploadSession(
  taxon: QRTaxon,
  animalId: string,
): Promise<UploadSessionResponse> {
  const root = taxon === 'snake' ? 'snakes' : 'lizards'
  return apiFetch<UploadSessionResponse>(
    `/api/v1/${root}/${encodeURIComponent(animalId)}/upload-session`,
    { method: 'POST' },
  )
}
