/**
 * Data layer for the unified Herpetoverse animals API (ADR-003).
 *
 * Supersedes lib/snakes.ts + lib/lizards.ts — the per-taxon snake/lizard/
 * frog tables collapsed into one `animals` table discriminated by
 * `taxon`. One set of CRUD helpers, filtered by taxon where the UI
 * needs a single-taxon view.
 *
 * Wraps /api/v1/animals/* plus the polymorphic feedings/sheds/weight-log
 * routes (now `/api/v1/animals/{id}/...`) and the standalone
 * log-operation routes (`/weight-logs/{id}`, `/feedings/{id}`,
 * `/sheds/{id}`, `/photos/{id}`).
 *
 * Decimal fields come through as strings (Pydantic default). The UI
 * formats them but we keep the wire shape verbatim so round-tripping
 * (read → edit → write) stays safe.
 *
 * Feeding-intelligence caveat carried over from lib/lizards.ts:
 * `life_stage_feeding` was designed around the snake whole-prey-bolus
 * model. For insectivorous taxa the ratio numbers are crude proxies —
 * the authoritative feeding protocol lives in the species sheet's
 * `supplementation_notes` + `feeding_frequency_*`.
 */
'use client'

import { apiFetch } from './apiClient'

// ---------------------------------------------------------------------------
// Types — mirror apps/api/app/schemas/animal.py
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown'
export type Source = 'bred' | 'bought' | 'wild_caught'
export type Visibility = 'private' | 'public'

// Taxon registry (ADR-011) — single source of truth for HV herp groups.
// Adding a group = one entry here (+ the mobile mirror) + a species seed; the
// backend taxon column is a flexible VARCHAR, so no migration. Kept in
// lockstep with ANIMAL_TAXON_VALUES in apps/api/app/models/animal.py.
export type AnimalTaxon =
  | 'snake'
  | 'lizard'
  | 'turtle'
  | 'tortoise'
  | 'frog'
  | 'salamander'
  | 'other'

export interface AnimalTaxonMeta {
  key: AnimalTaxon
  label: string
  plural: string
  glyph: string
}

export const ANIMAL_TAXA: Record<AnimalTaxon, AnimalTaxonMeta> = {
  snake: { key: 'snake', label: 'Snake', plural: 'Snakes', glyph: '🐍' },
  lizard: { key: 'lizard', label: 'Lizard', plural: 'Lizards', glyph: '🦎' },
  turtle: { key: 'turtle', label: 'Turtle', plural: 'Turtles', glyph: '🐢' },
  tortoise: { key: 'tortoise', label: 'Tortoise', plural: 'Tortoises', glyph: '🐢' },
  frog: { key: 'frog', label: 'Frog', plural: 'Frogs & toads', glyph: '🐸' },
  salamander: { key: 'salamander', label: 'Salamander', plural: 'Salamanders & newts', glyph: '🐉' },
  other: { key: 'other', label: 'Other', plural: 'Other herps', glyph: '🦕' },
}

export const ANIMAL_TAXON_ORDER: AnimalTaxon[] = [
  'snake', 'lizard', 'turtle', 'tortoise', 'frog', 'salamander', 'other',
]

export function isAnimalTaxon(t: string | null | undefined): t is AnimalTaxon {
  return t != null && t in ANIMAL_TAXA
}

export const TAXON_LABELS: Record<AnimalTaxon, string> = Object.fromEntries(
  ANIMAL_TAXON_ORDER.map((k) => [k, ANIMAL_TAXA[k].label]),
) as Record<AnimalTaxon, string>

export interface Animal {
  id: string
  user_id: string
  taxon: AnimalTaxon
  // Renamed from reptile_species_id in anh_20260514 — the catalog table
  // is herp_species now (it holds amphibians too).
  herp_species_id: string | null
  enclosure_id: string | null

  name: string | null
  common_name: string | null
  scientific_name: string | null
  sex: Sex | null

  date_acquired: string | null
  hatch_date: string | null
  source: Source | null
  source_breeder: string | null
  price_paid: string | null

  current_weight_g: string | null
  current_length_in: string | null

  feeding_schedule: string | null
  brumation_active: boolean
  brumation_started_at: string | null

  // Feeding pause — see migration pse_20260502. Distinct from brumation
  // (its own seasonal flag). `reason` is one of
  //   hunger_strike | post_rehouse | recovering | breeding_season | other
  // (free-form values pass through verbatim) and `until` is YYYY-MM-DD.
  feeding_paused_reason: string | null
  feeding_paused_until: string | null

  /** Per-animal CGD override. NULL inherits the species default. */
  feeds_on_cgd_override: boolean | null
  /** Resolved CGD flag (override ?? species default). Server-computed. */
  feeds_on_cgd: boolean

  photo_url: string | null

  is_public: boolean
  visibility: Visibility | null

  notes: string | null

  last_fed_at: string | null
  last_shed_at: string | null
  created_at: string
  updated_at: string | null
}

export type WeightContext =
  | 'routine'
  | 'pre_feed'
  | 'post_shed'
  | 'pre_breeding'
  | 'post_lay'
  | 'other'

export const WEIGHT_CONTEXT_LABELS: Record<WeightContext, string> = {
  routine: 'Routine',
  pre_feed: 'Pre-feed',
  post_shed: 'Post-shed',
  pre_breeding: 'Pre-breeding',
  post_lay: 'Post-lay',
  other: 'Other',
}

export interface WeightLog {
  id: string
  animal_id: string
  weighed_at: string
  weight_g: string
  context: WeightContext
  notes: string | null
  created_at: string
}

export interface WeightTrendPoint {
  weighed_at: string
  weight_g: string
}

export interface WeightTrendResponse {
  series: WeightTrendPoint[]
  latest_weight_g: string | null
  loss_pct_30d: string | null
  alert: boolean
  alert_threshold_pct: string | null
}

export interface PreySuggestion {
  stage: 'hatchling' | 'juvenile' | 'subadult' | 'adult' | 'unknown'
  // Wire field name is snake-legacy; value is whatever taxon's weight.
  snake_weight_g: string | null
  suggested_min_g: string | null
  suggested_max_g: string | null
  interval_days_min: number | null
  interval_days_max: number | null
  power_feeding_threshold_g: string | null
  is_data_available: boolean
  warning: string | null
}

export interface FeedingLog {
  id: string
  tarantula_id: string | null
  enclosure_id: string | null
  animal_id: string | null
  fed_at: string
  food_type: string | null
  food_size: string | null
  quantity: number
  accepted: boolean
  prey_weight_g: string | null
  notes: string | null
  created_at: string
}

export interface ShedLog {
  id: string
  animal_id: string
  shed_at: string
  in_blue_started_at: string | null
  weight_before_g: string | null
  weight_after_g: string | null
  length_before_in: string | null
  length_after_in: string | null
  is_complete_shed: boolean
  has_retained_shed: boolean
  retained_shed_notes: string | null
  notes: string | null
  image_url: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * List the keeper's animals. Pass a `taxon` to scope to one taxon —
 * the per-taxon collection screens (which used to hit /snakes,
 * /lizards) pass it; the unified collection view omits it.
 *
 * Trailing slash required — FastAPI mounts the router with a slash and
 * the redirect drops the auth header.
 */
export function listAnimals(taxon?: AnimalTaxon): Promise<Animal[]> {
  const qs = taxon ? `?taxon=${encodeURIComponent(taxon)}` : ''
  return apiFetch<Animal[]>(`/api/v1/animals/${qs}`)
}

export function getAnimal(id: string): Promise<Animal> {
  return apiFetch<Animal>(`/api/v1/animals/${encodeURIComponent(id)}`)
}

/**
 * Payload for creating an animal. Mirrors AnimalCreate on the backend.
 * `taxon` is required and immutable once set; every other field is
 * optional so the form can progressively disclose sections. Numeric
 * fields accept strings or numbers — Pydantic coerces Decimal either way.
 */
export interface CreateAnimalPayload {
  taxon: AnimalTaxon
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
  herp_species_id?: string | null
  enclosure_id?: string | null
  sex?: Sex | null
  hatch_date?: string | null
  date_acquired?: string | null
  source?: Source | null
  source_breeder?: string | null
  price_paid?: string | number | null
  current_weight_g?: string | number | null
  current_length_in?: string | number | null
  notes?: string | null
  // Pause fields — accepted by AnimalUpdate. Pass `null` on both to
  // resume. See migration pse_20260502.
  feeding_paused_reason?: string | null
  feeding_paused_until?: string | null
  /** Per-animal CGD override. null inherits the species default. */
  feeds_on_cgd_override?: boolean | null
}

export function createAnimal(payload: CreateAnimalPayload): Promise<Animal> {
  return apiFetch<Animal>('/api/v1/animals/', {
    method: 'POST',
    json: payload,
  })
}

/**
 * AnimalUpdate on the backend is all-optional and does NOT accept
 * `taxon` (immutable). We reuse a Partial of the create payload minus
 * taxon — the add page and edit page fill the same bag otherwise.
 */
export type UpdateAnimalPayload = Partial<Omit<CreateAnimalPayload, 'taxon'>>

export function updateAnimal(
  id: string,
  payload: UpdateAnimalPayload,
): Promise<Animal> {
  return apiFetch<Animal>(`/api/v1/animals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    json: payload,
  })
}

/**
 * Hard delete — CASCADEs to weight logs, feedings, sheds, and photos.
 * Callers should surface that clearly before calling.
 */
export function deleteAnimal(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/animals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listWeightLogs(animalId: string): Promise<WeightLog[]> {
  return apiFetch<WeightLog[]>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/weight-logs`,
  )
}

export function getWeightTrend(
  animalId: string,
): Promise<WeightTrendResponse> {
  return apiFetch<WeightTrendResponse>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/weight-logs/trend`,
  )
}

export function getPreySuggestion(
  animalId: string,
): Promise<PreySuggestion> {
  return apiFetch<PreySuggestion>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/prey-suggestion`,
  )
}

export interface CreateWeightLogPayload {
  weighed_at: string
  weight_g: string | number
  context?: WeightContext
  notes?: string | null
}

export function createWeightLog(
  animalId: string,
  payload: CreateWeightLogPayload,
): Promise<WeightLog> {
  return apiFetch<WeightLog>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/weight-logs`,
    { method: 'POST', json: payload },
  )
}

export function deleteWeightLog(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/weight-logs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listFeedings(animalId: string): Promise<FeedingLog[]> {
  return apiFetch<FeedingLog[]>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/feedings`,
  )
}

export interface CreateFeedingPayload {
  fed_at: string
  food_type?: string | null
  food_size?: string | null
  quantity?: number
  accepted?: boolean
  prey_weight_g?: string | number | null
  notes?: string | null
}

export function createFeeding(
  animalId: string,
  payload: CreateFeedingPayload,
): Promise<FeedingLog> {
  return apiFetch<FeedingLog>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/feedings`,
    { method: 'POST', json: payload },
  )
}

export function deleteFeeding(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/feedings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listSheds(animalId: string): Promise<ShedLog[]> {
  return apiFetch<ShedLog[]>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/sheds`,
  )
}

export interface CreateShedPayload {
  shed_at: string
  in_blue_started_at?: string | null
  is_complete_shed?: boolean
  has_retained_shed?: boolean
  retained_shed_notes?: string | null
  notes?: string | null
}

export function createShed(
  animalId: string,
  payload: CreateShedPayload,
): Promise<ShedLog> {
  return apiFetch<ShedLog>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/sheds`,
    { method: 'POST', json: payload },
  )
}

export function deleteShed(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/sheds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Photos — polymorphic (tarantula_id XOR animal_id on the photos table).
// These helpers route through the animal-scoped endpoints. Upload is
// multipart; the browser sets Content-Type + boundary when we pass
// FormData to fetch (apiClient leaves Content-Type unset unless `json`
// is provided).
// ---------------------------------------------------------------------------

export interface Photo {
  id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
  taken_at: string | null
  created_at: string
}

export function listPhotos(animalId: string): Promise<Photo[]> {
  return apiFetch<Photo[]>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/photos`,
  )
}

export interface UploadPhotoOptions {
  caption?: string | null
}

export function uploadPhoto(
  animalId: string,
  file: File,
  { caption }: UploadPhotoOptions = {},
): Promise<Photo> {
  const form = new FormData()
  form.append('file', file)
  if (caption && caption.trim()) form.append('caption', caption.trim())
  return apiFetch<Photo>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/photos`,
    { method: 'POST', body: form },
  )
}

export function deletePhoto(photoId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
  })
}

/**
 * Update a photo's editable metadata. Only caption is mutable
 * server-side right now; passing null or "" clears the caption.
 */
export function updatePhotoCaption(
  photoId: string,
  caption: string | null,
): Promise<Photo> {
  return apiFetch<Photo>(`/api/v1/photos/${encodeURIComponent(photoId)}`, {
    method: 'PATCH',
    json: { caption },
  })
}

/**
 * Promote a photo to be the animal's main photo. Server responds with
 * {message, photo_url}; we don't surface that — callers refetch.
 */
export function setMainPhoto(photoId: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/photos/${encodeURIComponent(photoId)}/set-main`,
    { method: 'PATCH' },
  )
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function animalTitle(animal: Animal): string {
  return (
    animal.name ||
    animal.common_name ||
    animal.scientific_name ||
    'Unnamed animal'
  )
}

/** Round Decimal string or number to N decimals for display. */
export function fmtDecimal(
  v: string | number | null | undefined,
  decimals = 1,
): string | null {
  if (v == null) return null
  const num = typeof v === 'string' ? Number(v) : v
  if (!Number.isFinite(num)) return null
  return num.toFixed(decimals).replace(/\.?0+$/, '')
}

export function fmtGrams(v: string | number | null | undefined): string | null {
  const s = fmtDecimal(v, 1)
  return s == null ? null : `${s} g`
}

/** "Apr 22, 2026" from ISO. */
export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * "2 days ago" / "Today" / "Yesterday".
 *
 * Calendar-day diff in the user's local timezone — NOT a UTC time-delta
 * floor. The naïve `Math.floor((now - then) / 86_400_000)` flips at UTC
 * midnight, not local midnight. Same Brooke-on-EST bug class fixed on
 * Tarantuverse.
 */
export function relativeDays(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null

  const now = new Date()
  const thenLocal = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round(
    (nowLocal.getTime() - thenLocal.getTime()) / 86_400_000,
  )

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}
