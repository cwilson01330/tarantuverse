/**
 * QR upload-session client.
 *
 * Backend creates a 20-minute token tied to an HV animal (any taxon).
 * The phone browser at the returned `upload_url` posts photos via the
 * unauthenticated `/upload-sessions/{token}/photo` route — useful for
 * handing off photo capture to a guest, partner, or another device
 * without sharing login credentials.
 *
 * ADR-003: the per-taxon snake/lizard tables collapsed into `animals`,
 * so the snake/lizard upload-session endpoints collapsed into
 * `/api/v1/animals/{id}/upload-session` and the `/s/{id}` + `/l/{id}`
 * public-profile routes collapsed into `/api/v1/a/{id}`.
 *
 * NOTE on web-side rendering: the upload page lives at
 * `apps/web/src/app/upload/[token]/page.tsx` (Tarantuverse domain).
 * It reads the session's `taxon` field and renders animal sessions
 * under Herpetoverse branding, so even though the URL says
 * tarantuverse.com the page reads on-brand once loaded.
 */
import { apiFetch } from './apiClient'
import type { AnimalTaxon } from './animals'

export type { AnimalTaxon } from './animals'

export interface UploadSessionResponse {
  token: string
  upload_url: string
  expires_at: string
  expires_in_minutes: number
  taxon: AnimalTaxon
  /** Display name of the animal the session is bound to. */
  animal_name?: string
}

/**
 * Create a 20-minute upload session for an animal. ADR-003 collapsed the
 * per-taxon endpoints — one route now, taxon comes back in the response.
 */
export async function createUploadSession(
  animalId: string,
): Promise<UploadSessionResponse> {
  return apiFetch<UploadSessionResponse>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/upload-session`,
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
  taxon: AnimalTaxon
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

/**
 * Fetch the permanent public profile for an animal. ADR-003 collapsed
 * `/s/{id}` + `/l/{id}` into `/a/{id}` — taxon comes back in the payload.
 *
 * Sends auth if available (so the owner check works) but doesn't require
 * it — apiFetch always attaches a token when present.
 */
export async function getPublicProfile(
  animalId: string,
): Promise<PublicReptileProfile> {
  return apiFetch<PublicReptileProfile>(
    `/api/v1/a/${encodeURIComponent(animalId)}`,
  )
}
