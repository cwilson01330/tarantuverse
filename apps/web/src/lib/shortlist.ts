/**
 * Species shortlist — care sheets a keeper saved but doesn't own yet.
 *
 * Server-backed so the list is the same on web and mobile. Web calls the
 * backend with raw `fetch` against the full /api/v1/... path plus a Bearer
 * token, matching the rest of the dashboard.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ShortlistItem {
  id: string
  species_id: string
  note: string | null
  created_at: string
  taxon: string | null
  scientific_name: string | null
  common_names: string[]
  care_level: string | null
  image_url: string | null
  adult_size: string | null
  type: string | null
  venom_severity: string | null
  is_verified: boolean
  /** True when the keeper has since added one to their collection. */
  owned: boolean
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function listShortlist(token: string): Promise<ShortlistItem[]> {
  const res = await fetch(`${API_URL}/api/v1/species-shortlist/`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load shortlist')
  return res.json()
}

export async function listShortlistIds(token: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/v1/species-shortlist/ids`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load shortlist')
  const data = await res.json()
  return data?.species_ids ?? []
}

/** Idempotent server-side — adding twice returns the existing row. */
export async function addToShortlist(
  token: string,
  speciesId: string,
  note?: string | null,
): Promise<ShortlistItem> {
  const res = await fetch(`${API_URL}/api/v1/species-shortlist/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ species_id: speciesId, note: note ?? null }),
  })
  if (!res.ok) throw new Error('Failed to save to shortlist')
  return res.json()
}

export async function updateShortlistNote(
  token: string,
  speciesId: string,
  note: string | null,
): Promise<ShortlistItem> {
  const res = await fetch(`${API_URL}/api/v1/species-shortlist/${speciesId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ note }),
  })
  if (!res.ok) throw new Error('Failed to update note')
  return res.json()
}

/** Removing something already gone is a success, not an error. */
export async function removeFromShortlist(token: string, speciesId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/species-shortlist/${speciesId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 404) throw new Error('Failed to remove from shortlist')
}
