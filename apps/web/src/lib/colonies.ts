/**
 * Colony mode web API/lib layer (ADR-010).
 *
 * A colony is population-level tracking for communal/colony keepers — a
 * first-class collection entry with per-life-stage headcounts, tracked as ONE
 * entry (not individual animals). Modeled on the FeederColony pattern.
 *
 * Web calls the backend with raw `fetch` against the full /api/v1/... path plus
 * a Bearer token (matching the rest of the dashboard pages). These helpers just
 * centralize the URL + payload shapes; each caller passes its own token.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Colony taxa reuse the invert taxon vocabulary, minus tarantula (colonies are
// for communal/population keepers). 'other' catches isopods/springtails etc.
export type ColonyTaxon =
  | 'scorpion'
  | 'centipede'
  | 'whip_spider'
  | 'vinegaroon'
  | 'true_spider'
  | 'millipede'
  | 'mantis'
  | 'roach'
  | 'other'

export type ColonySource = 'bought' | 'bred' | 'wild_caught'
export type ColonyVisibility = 'private' | 'public'

export type ColonyEventType =
  | 'birth'
  | 'death'
  | 'added'
  | 'removed'
  | 'cannibalism'
  | 'aggression'
  | 'molt_found'
  | 'split'
  | 'merge'
  | 'observation'
  | 'count_correction'

/** Per-life-stage headcount buckets, e.g. {"adults":10,"nymphs":100}. */
export type StageCounts = Record<string, number>

export interface ColonyListItem {
  id: string
  taxon: ColonyTaxon
  name: string
  photo_url: string | null
  total_count: number | null
  count_is_estimated: boolean
  stage_counts: StageCounts | null
  is_active: boolean
  species_display_name: string | null
  species_scientific_name: string | null
  species_missing: boolean
}

export interface ColonyResponse {
  id: string
  user_id: string
  taxon: ColonyTaxon
  name: string
  species_id: string | null
  enclosure_id: string | null
  date_acquired: string | null
  founded_date: string | null
  source: ColonySource | null
  stage_counts: StageCounts | null
  count_is_estimated: boolean
  substrate_type: string | null
  substrate_depth: string | null
  last_substrate_change: string | null
  target_temp_min: number | null
  target_temp_max: number | null
  target_humidity_min: number | null
  target_humidity_max: number | null
  water_dish: boolean | null
  notes: string | null
  photo_url: string | null
  visibility: ColonyVisibility | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  total_count: number | null
  species_display_name: string | null
  species_scientific_name: string | null
  species_missing: boolean
}

export interface ColonyCreate {
  name: string
  taxon: ColonyTaxon
  species_id?: string | null
  enclosure_id?: string | null
  date_acquired?: string | null
  founded_date?: string | null
  source?: ColonySource | null
  stage_counts?: StageCounts | null
  count_is_estimated?: boolean
  substrate_type?: string | null
  substrate_depth?: string | null
  last_substrate_change?: string | null
  target_temp_min?: number | null
  target_temp_max?: number | null
  target_humidity_min?: number | null
  target_humidity_max?: number | null
  water_dish?: boolean | null
  notes?: string | null
  photo_url?: string | null
  visibility?: ColonyVisibility | null
}

// Update is a partial — send only changed fields.
export type ColonyUpdate = Partial<ColonyCreate>

export interface ColonyEventResponse {
  id: string
  colony_id: string
  user_id: string
  event_type: ColonyEventType
  stage: string | null
  count_delta: number | null
  occurred_at: string // YYYY-MM-DD
  severity: string | null
  notes: string | null
  created_at: string
}

export interface ColonyEventCreate {
  event_type: ColonyEventType
  stage?: string | null
  count_delta?: number | null
  occurred_at?: string | null
  severity?: string | null
  notes?: string | null
}

export type ColonyEventUpdate = Partial<ColonyEventCreate>

/**
 * A 402 (over the free-tier cap) surfaces as this error so callers can pop the
 * UpgradeModal instead of a generic failure. `detail` mirrors the invert-create
 * 402 body: { message, current_count, limit, is_premium }.
 */
export class ColonyLimitError extends Error {
  detail: { message?: string; current_count?: number; limit?: number; is_premium?: boolean }
  constructor(detail: ColonyLimitError['detail']) {
    super(detail?.message || 'Free plan limit reached')
    this.name = 'ColonyLimitError'
    this.detail = detail
  }
}

function authHeaders(token: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

// ── Colonies ────────────────────────────────────────────────────────────────

export async function listColonies(
  token: string,
  includeInactive = false,
): Promise<ColonyListItem[]> {
  const qs = includeInactive ? '?include_inactive=true' : ''
  const res = await fetch(`${API_URL}/api/v1/colonies/${qs}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load colonies')
  return (await res.json()) as ColonyListItem[]
}

export async function getColony(token: string, id: string): Promise<ColonyResponse> {
  const res = await fetch(`${API_URL}/api/v1/colonies/${id}`, {
    headers: authHeaders(token),
  })
  if (res.status === 404) throw new Error('Colony not found')
  if (!res.ok) throw new Error('Failed to load colony')
  return (await res.json()) as ColonyResponse
}

export async function createColony(
  token: string,
  payload: ColonyCreate,
): Promise<ColonyResponse> {
  const res = await fetch(`${API_URL}/api/v1/colonies/`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (res.status === 402) {
    const body = await res.json().catch(() => ({} as any))
    throw new ColonyLimitError(body?.detail ?? {})
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.detail || 'Failed to create colony')
  }
  return (await res.json()) as ColonyResponse
}

export async function updateColony(
  token: string,
  id: string,
  payload: ColonyUpdate,
): Promise<ColonyResponse> {
  const res = await fetch(`${API_URL}/api/v1/colonies/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.detail || 'Failed to update colony')
  }
  return (await res.json()) as ColonyResponse
}

export async function deleteColony(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/colonies/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete colony')
}

// ── Colony events ─────────────────────────────────────────────────────────────

export async function listColonyEvents(
  token: string,
  colonyId: string,
): Promise<ColonyEventResponse[]> {
  const res = await fetch(`${API_URL}/api/v1/colonies/${colonyId}/events`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load colony events')
  return (await res.json()) as ColonyEventResponse[]
}

export async function createColonyEvent(
  token: string,
  colonyId: string,
  payload: ColonyEventCreate,
): Promise<ColonyEventResponse> {
  const res = await fetch(`${API_URL}/api/v1/colonies/${colonyId}/events`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.detail || 'Failed to log event')
  }
  return (await res.json()) as ColonyEventResponse
}

export async function updateColonyEvent(
  token: string,
  eventId: string,
  payload: ColonyEventUpdate,
): Promise<ColonyEventResponse> {
  const res = await fetch(`${API_URL}/api/v1/colonies/events/${eventId}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.detail || 'Failed to update event')
  }
  return (await res.json()) as ColonyEventResponse
}

export async function deleteColonyEvent(token: string, eventId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/colonies/events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete event')
}

// ── Presentation helpers ──────────────────────────────────────────────────────

export const COLONY_EVENT_TYPES: {
  type: ColonyEventType
  label: string
  icon: string
  /** Adjusts a stage bucket (+/-). Non-count events are pure observations. */
  adjustsCount: boolean
  /** Whether the delta may be negative. */
  allowNegative: boolean
  /** Severity picker is shown for aggression / cannibalism. */
  hasSeverity: boolean
  description: string
}[] = [
  { type: 'birth', label: 'Birth', icon: '🐣', adjustsCount: true, allowNegative: false, hasSeverity: false, description: 'New offspring joined the colony' },
  { type: 'death', label: 'Death', icon: '💀', adjustsCount: true, allowNegative: true, hasSeverity: false, description: 'Lost individuals (enter a negative number)' },
  { type: 'added', label: 'Added', icon: '➕', adjustsCount: true, allowNegative: false, hasSeverity: false, description: 'Added individuals to the colony' },
  { type: 'removed', label: 'Removed', icon: '➖', adjustsCount: true, allowNegative: true, hasSeverity: false, description: 'Removed / sold individuals (negative)' },
  { type: 'cannibalism', label: 'Cannibalism', icon: '🦴', adjustsCount: true, allowNegative: true, hasSeverity: true, description: 'Cannibalism loss (negative)' },
  { type: 'aggression', label: 'Aggression', icon: '⚔️', adjustsCount: false, allowNegative: false, hasSeverity: true, description: 'Aggression incident (no count change)' },
  { type: 'molt_found', label: 'Molt found', icon: '🐚', adjustsCount: false, allowNegative: false, hasSeverity: false, description: 'Found a molt (observation)' },
  { type: 'split', label: 'Split', icon: '✂️', adjustsCount: true, allowNegative: true, hasSeverity: false, description: 'Split off part of the colony (negative)' },
  { type: 'merge', label: 'Merge', icon: '🔗', adjustsCount: true, allowNegative: false, hasSeverity: false, description: 'Merged in another group (positive)' },
  { type: 'observation', label: 'Observation', icon: '📝', adjustsCount: false, allowNegative: false, hasSeverity: false, description: 'Free-form note (no count change)' },
  { type: 'count_correction', label: 'Count fix', icon: '✏️', adjustsCount: true, allowNegative: true, hasSeverity: false, description: 'Manual inventory correction (+/-)' },
]

export function colonyEventMeta(type: ColonyEventType) {
  return COLONY_EVENT_TYPES.find((e) => e.type === type)
}
