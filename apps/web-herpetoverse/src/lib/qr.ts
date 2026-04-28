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

// ---------------------------------------------------------------------------
// Public profiles — the destination of label QR codes.
//
// These endpoints serve owner-aware payloads: an authenticated owner gets
// extra husbandry/notes fields and an `is_owner: true` flag so the page
// can show quick-action buttons. Unauthenticated viewers see the public
// card; private collections respond 403.
// ---------------------------------------------------------------------------

export interface PublicReptileProfile {
  id: string
  taxon: 'snake' | 'lizard'
  name: string | null
  common_name: string | null
  scientific_name: string | null
  display_name: string
  sex: 'male' | 'female' | 'unknown' | null
  photo_url: string | null
  is_owner: boolean
  owner_username: string | null
  current_weight_g: number | null
  current_length_in: number | null
  species: {
    id: string
    scientific_name: string
    common_names: string[]
    care_level: string | null
    temperament: string | null
    adult_size: string | null
    temperature_min: number | null
    temperature_max: number | null
    humidity_min: number | null
    humidity_max: number | null
    image_url: string | null
  } | null
  photos: Array<{
    id: string
    url: string
    thumbnail_url: string | null
    caption: string | null
    taken_at: string | null
  }>
  last_feeding: {
    date: string
    food_type: string | null
    food_size: string | null
    accepted: boolean
  } | null
  last_shed: {
    date: string | null
    is_complete_shed: boolean
    has_retained_shed: boolean
  } | null
  // Owner-only fields
  husbandry?: {
    feeding_schedule: string | null
    last_fed_at: string | null
    last_shed_at: string | null
    brumation_active: boolean
    brumation_started_at: string | null
  }
  date_acquired?: string | null
  hatch_date?: string | null
  source?: string | null
  source_breeder?: string | null
  notes?: string | null
}

export async function getPublicProfile(
  taxon: 'snake' | 'lizard',
  animalId: string,
): Promise<PublicReptileProfile> {
  const path = taxon === 'snake' ? 's' : 'l'
  // Send auth if available (so the owner check works) but don't require
  // it — the apiClient's apiFetch always attaches a token when present.
  return apiFetch<PublicReptileProfile>(
    `/api/v1/${path}/${encodeURIComponent(animalId)}`,
  )
}
