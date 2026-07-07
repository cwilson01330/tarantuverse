/**
 * Feeder Keeping data layer (ADR-012) — web mirror.
 *
 * Wraps the shared FastAPI feeder endpoints:
 *   - Catalog (public):  /api/v1/hv-feeder-species/*
 *   - Stocks   (auth):   /api/v1/hv-feeder-stocks/*  + /{id}/logs
 *
 * The whole point of this feature is frozen inventory: a keeper tracks a
 * freezer full of sized rodents ("Pinky 20 · Hopper 8 · Adult 12") and
 * decrements a bucket with a one-tap "Used" action. A `count` stock is the
 * same idea with a single number instead of per-size buckets.
 *
 * Decimal/mixed fields aren't a concern here — counts are integers and the
 * backend floors buckets at 0 on write, so the client never has to guard
 * against negatives. We keep the wire shape verbatim so round-tripping
 * (read → edit → write) stays safe.
 *
 * Feeder keeping is planned as HV-premium, but the backend gate is OFF for
 * now (testable). No paywall here yet — build open.
 */
'use client'

import { apiFetch } from './apiClient'

// ---------------------------------------------------------------------------
// Types — mirror the backend feeder schemas
// ---------------------------------------------------------------------------

export type FeederCategory = 'rodent' | 'fish' | 'insect' | 'chick' | 'other'
export type FeederForm = 'live' | 'frozen'
export type InventoryMode = 'count' | 'sized'
export type FeederCareLevel = 'beginner' | 'intermediate' | 'advanced'

export type FeederLogType =
  | 'restock'
  | 'used'
  | 'cleaned'
  | 'bred'
  | 'died'
  | 'count_correction'

/** A row in the browsable feeder catalog (public). */
export interface FeederSpecies {
  id: string
  scientific_name: string
  common_names: string[]
  category: FeederCategory
  care_level: FeederCareLevel | null
  temperature_min: number | null
  temperature_max: number | null
  humidity_min: number | null
  humidity_max: number | null
  /** Whether this feeder is sold/kept in graded sizes (rodents, fish). */
  supports_sizes: boolean
  /** Ordered size ladder, e.g. ["pinky","fuzzy","hopper","adult"]. */
  typical_sizes: string[]
  typical_adult_size_mm: number | null
  prey_size_notes: string | null
  care_notes: string | null
  handling_notes: string | null
  image_url: string | null
  is_verified: boolean
}

/** A keeper's feeder stock (live colony or frozen freezer inventory). */
export interface FeederStock {
  id: string
  user_id: string
  hv_feeder_species_id: string | null
  name: string
  form: FeederForm
  inventory_mode: InventoryMode
  /** Present when inventory_mode === 'count'. */
  count: number | null
  /** Present when inventory_mode === 'sized' — { size: count }. */
  sized_counts: Record<string, number> | null
  storage_location: string | null
  low_threshold: number | null
  notes: string | null
  // Server-computed conveniences.
  total_count: number
  is_low_stock: boolean
  species_display_name: string | null
  last_restocked: string | null
  last_used: string | null
  last_cleaned: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

/** One entry in a stock's history (restock / used / cleaned / …). */
export interface FeederLog {
  id: string
  hv_feeder_stock_id: string
  log_type: FeederLogType
  /** Which size bucket this log adjusted, for sized stocks. */
  size: string | null
  /** Signed delta the backend applied (negative for used, positive restock). */
  count_delta: number | null
  logged_at: string
  notes: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Catalog (public — no auth needed, but apiFetch attaches a token if present)
// ---------------------------------------------------------------------------

export interface ListFeederSpeciesParams {
  q?: string
  category?: FeederCategory | ''
  limit?: number
}

/** Browse / search the feeder catalog. */
export function listFeederSpecies(
  params: ListFeederSpeciesParams = {},
): Promise<FeederSpecies[]> {
  const qs = new URLSearchParams()
  if (params.q && params.q.trim()) qs.set('q', params.q.trim())
  if (params.category) qs.set('category', params.category)
  qs.set('limit', String(params.limit ?? 200))
  return apiFetch<FeederSpecies[]>(
    `/api/v1/hv-feeder-species/?${qs.toString()}`,
    { auth: false },
  )
}

/** One catalog entry (care sheet). */
export function getFeederSpecies(id: string): Promise<FeederSpecies> {
  return apiFetch<FeederSpecies>(
    `/api/v1/hv-feeder-species/${encodeURIComponent(id)}`,
    { auth: false },
  )
}

// ---------------------------------------------------------------------------
// Stocks (auth)
// ---------------------------------------------------------------------------

/** List the keeper's feeder stocks. `includeInactive` shows retired stocks. */
export function listFeederStocks(
  includeInactive = false,
): Promise<FeederStock[]> {
  const qs = includeInactive ? '?include_inactive=true' : ''
  return apiFetch<FeederStock[]>(`/api/v1/hv-feeder-stocks/${qs}`)
}

export function getFeederStock(id: string): Promise<FeederStock> {
  return apiFetch<FeederStock>(
    `/api/v1/hv-feeder-stocks/${encodeURIComponent(id)}`,
  )
}

export interface CreateFeederStockPayload {
  name: string
  hv_feeder_species_id?: string | null
  form: FeederForm
  inventory_mode: InventoryMode
  /** For inventory_mode === 'count'. */
  count?: number | null
  /** For inventory_mode === 'sized' — { size: count }. */
  sized_counts?: Record<string, number> | null
  storage_location?: string | null
  low_threshold?: number | null
  notes?: string | null
}

export function createFeederStock(
  payload: CreateFeederStockPayload,
): Promise<FeederStock> {
  return apiFetch<FeederStock>('/api/v1/hv-feeder-stocks/', {
    method: 'POST',
    json: payload,
  })
}

export type UpdateFeederStockPayload = Partial<CreateFeederStockPayload> & {
  is_active?: boolean
}

export function updateFeederStock(
  id: string,
  payload: UpdateFeederStockPayload,
): Promise<FeederStock> {
  return apiFetch<FeederStock>(
    `/api/v1/hv-feeder-stocks/${encodeURIComponent(id)}`,
    { method: 'PUT', json: payload },
  )
}

export function deleteFeederStock(id: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/hv-feeder-stocks/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

// ---------------------------------------------------------------------------
// Logs — the used/restock quick actions run through here
// ---------------------------------------------------------------------------

export function listFeederLogs(stockId: string): Promise<FeederLog[]> {
  return apiFetch<FeederLog[]>(
    `/api/v1/hv-feeder-stocks/${encodeURIComponent(stockId)}/logs`,
  )
}

export interface CreateFeederLogPayload {
  log_type: FeederLogType
  /** Which bucket to adjust for sized stocks; omit for count stocks. */
  size?: string | null
  /** SIGNED int — negative for used, positive for restock. */
  count_delta?: number | null
  logged_at?: string | null
  notes?: string | null
}

export function createFeederLog(
  stockId: string,
  payload: CreateFeederLogPayload,
): Promise<FeederLog> {
  return apiFetch<FeederLog>(
    `/api/v1/hv-feeder-stocks/${encodeURIComponent(stockId)}/logs`,
    { method: 'POST', json: payload },
  )
}

export function deleteFeederLog(logId: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/hv-feeder-stocks/logs/${encodeURIComponent(logId)}`,
    { method: 'DELETE' },
  )
}

// ---------------------------------------------------------------------------
// Quick-action helpers — the "Used" / "Restock" one-tap buttons.
// The backend adjusts count/bucket and floors at 0; we just POST the log
// and let the caller refetch the stock for the new totals.
// ---------------------------------------------------------------------------

/**
 * Record N feeders used out of a stock. For a sized stock pass the bucket
 * name in `size`; for a count stock leave it undefined. `count` is a
 * positive magnitude — we send it as a negative delta.
 */
export function logFeederUsed(
  stockId: string,
  count: number,
  size?: string,
): Promise<FeederLog> {
  return createFeederLog(stockId, {
    log_type: 'used',
    size: size ?? null,
    count_delta: -Math.abs(count),
  })
}

/**
 * Restock N feeders into a stock. Same size/count rules as above; `count`
 * is a positive magnitude sent as a positive delta.
 */
export function logFeederRestock(
  stockId: string,
  count: number,
  size?: string,
): Promise<FeederLog> {
  return createFeederLog(stockId, {
    log_type: 'restock',
    size: size ?? null,
    count_delta: Math.abs(count),
  })
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export interface FeederCategoryMeta {
  key: FeederCategory
  label: string
  plural: string
  glyph: string
}

export const FEEDER_CATEGORIES: Record<FeederCategory, FeederCategoryMeta> = {
  rodent: { key: 'rodent', label: 'Rodent', plural: 'Rodents', glyph: '🐁' },
  fish: { key: 'fish', label: 'Fish', plural: 'Fish', glyph: '🐟' },
  insect: { key: 'insect', label: 'Insect', plural: 'Insects', glyph: '🦗' },
  chick: { key: 'chick', label: 'Chick', plural: 'Chicks', glyph: '🐤' },
  other: { key: 'other', label: 'Other', plural: 'Other', glyph: '🍽️' },
}

export const FEEDER_CATEGORY_ORDER: FeederCategory[] = [
  'rodent', 'fish', 'insect', 'chick', 'other',
]

export function feederCategoryMeta(cat: string): FeederCategoryMeta {
  return (
    FEEDER_CATEGORIES[cat as FeederCategory] ?? {
      key: 'other',
      label: cat || 'Other',
      plural: cat || 'Other',
      glyph: '🍽️',
    }
  )
}

/** Human title for a stock — its name, falling back to the species. */
export function feederStockTitle(stock: FeederStock): string {
  return stock.name || stock.species_display_name || 'Feeder stock'
}

/** Capitalize the first letter (for size bucket labels like "pinky"). */
export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * Ordered [size, count] pairs for a sized stock. Sorted to follow the
 * species' `typical_sizes` ladder when we know it; unknown/extra buckets
 * fall to the end alphabetically so the render is stable.
 */
export function sizedBucketEntries(
  sizedCounts: Record<string, number> | null | undefined,
  ladder?: string[] | null,
): Array<[string, number]> {
  if (!sizedCounts) return []
  const entries = Object.entries(sizedCounts)
  const order = ladder ?? []
  const rank = (size: string): number => {
    const i = order.indexOf(size)
    return i === -1 ? order.length : i
  }
  return entries.sort((a, b) => {
    const ra = rank(a[0])
    const rb = rank(b[0])
    if (ra !== rb) return ra - rb
    return a[0].localeCompare(b[0])
  })
}

/** "Pinky 20 · Hopper 8 · Adult 12" one-line breakdown for a sized stock. */
export function sizedSummary(
  sizedCounts: Record<string, number> | null | undefined,
  ladder?: string[] | null,
): string {
  const entries = sizedBucketEntries(sizedCounts, ladder)
  if (entries.length === 0) return 'Empty'
  return entries.map(([size, n]) => `${capitalize(size)} ${n}`).join(' · ')
}

/** "Apr 22, 2026" from ISO. */
export function fmtFeederDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
