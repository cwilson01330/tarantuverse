/**
 * Data layer for the Herpetoverse snake detail spike.
 *
 * Wraps the /api/v1/snakes/* family of endpoints plus the polymorphic
 * feedings/sheds routes and the Sprint 5 weight-log + prey-suggestion
 * endpoints.
 *
 * Decimal fields come through as strings (Pydantic default). The UI
 * formats them but we keep the wire shape verbatim so round-tripping
 * (read → edit → write) stays safe.
 */
'use client'

import { apiFetch } from './apiClient'

// ---------------------------------------------------------------------------
// Types — mirror apps/api/app/schemas/*.py
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown'
export type Source = 'bred' | 'bought' | 'wild_caught'
export type Visibility = 'private' | 'public'

export interface Snake {
  id: string
  user_id: string
  reptile_species_id: string | null
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
  snake_id: string
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
  snake_id: string | null
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
  snake_id: string
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

export function listSnakes(): Promise<Snake[]> {
  // Trailing slash required — FastAPI router mounts with slash, and redirect
  // drops the auth header.
  return apiFetch<Snake[]>('/api/v1/snakes/')
}

export function getSnake(id: string): Promise<Snake> {
  return apiFetch<Snake>(`/api/v1/snakes/${encodeURIComponent(id)}`)
}

/**
 * Payload for creating a snake. Mirrors SnakeCreate on the backend; every
 * field is optional so the form can progressively disclose sections. Numeric
 * fields accept either strings (straight from an <input>) or numbers —
 * backend Pydantic coerces Decimal either way.
 */
export interface CreateSnakePayload {
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
  reptile_species_id?: string | null
  sex?: Sex | null
  hatch_date?: string | null
  date_acquired?: string | null
  source?: Source | null
  source_breeder?: string | null
  price_paid?: string | number | null
  current_weight_g?: string | number | null
  current_length_in?: string | number | null
  notes?: string | null
}

export function createSnake(payload: CreateSnakePayload): Promise<Snake> {
  return apiFetch<Snake>('/api/v1/snakes/', {
    method: 'POST',
    json: payload,
  })
}

/**
 * SnakeUpdate on the backend inherits SnakeBase (all fields optional) plus
 * species/enclosure FKs. We reuse CreateSnakePayload here because the form
 * surface is the same — the add page and edit page fill the same bag.
 */
export function updateSnake(
  id: string,
  payload: CreateSnakePayload,
): Promise<Snake> {
  return apiFetch<Snake>(`/api/v1/snakes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    json: payload,
  })
}

/**
 * Soft-delete is *not* implemented on the backend — this is a hard delete
 * that CASCADEs to weight logs, feedings, sheds, and photos. Callers should
 * surface that clearly before calling.
 */
export function deleteSnake(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/snakes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listWeightLogs(snakeId: string): Promise<WeightLog[]> {
  return apiFetch<WeightLog[]>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/weight-logs`,
  )
}

export function getWeightTrend(
  snakeId: string,
): Promise<WeightTrendResponse> {
  return apiFetch<WeightTrendResponse>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/weight-logs/trend`,
  )
}

export function getPreySuggestion(
  snakeId: string,
): Promise<PreySuggestion> {
  return apiFetch<PreySuggestion>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/prey-suggestion`,
  )
}

export interface CreateWeightLogPayload {
  weighed_at: string
  weight_g: string | number
  context?: WeightContext
  notes?: string | null
}

export function createWeightLog(
  snakeId: string,
  payload: CreateWeightLogPayload,
): Promise<WeightLog> {
  return apiFetch<WeightLog>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/weight-logs`,
    { method: 'POST', json: payload },
  )
}

export function deleteWeightLog(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/weight-logs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listFeedings(snakeId: string): Promise<FeedingLog[]> {
  return apiFetch<FeedingLog[]>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/feedings`,
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
  snakeId: string,
  payload: CreateFeedingPayload,
): Promise<FeedingLog> {
  return apiFetch<FeedingLog>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/feedings`,
    { method: 'POST', json: payload },
  )
}

export function deleteFeeding(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/feedings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function listSheds(snakeId: string): Promise<ShedLog[]> {
  return apiFetch<ShedLog[]>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/sheds`,
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
  snakeId: string,
  payload: CreateShedPayload,
): Promise<ShedLog> {
  return apiFetch<ShedLog>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/sheds`,
    { method: 'POST', json: payload },
  )
}

export function deleteShed(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/sheds/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Photos — polymorphic. Backend accepts tarantula_id or snake_id on the
// photos table; these helpers all route through the snake-scoped endpoints.
// Upload is multipart; the browser sets Content-Type + boundary when we pass
// FormData to fetch (apiClient leaves Content-Type unset unless `json` is
// provided).
// ---------------------------------------------------------------------------

export interface Photo {
  id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
  taken_at: string | null
  created_at: string
}

export function listPhotos(snakeId: string): Promise<Photo[]> {
  return apiFetch<Photo[]>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/photos`,
  )
}

export interface UploadPhotoOptions {
  caption?: string | null
}

export function uploadPhoto(
  snakeId: string,
  file: File,
  { caption }: UploadPhotoOptions = {},
): Promise<Photo> {
  const form = new FormData()
  form.append('file', file)
  if (caption && caption.trim()) form.append('caption', caption.trim())
  return apiFetch<Photo>(
    `/api/v1/snakes/${encodeURIComponent(snakeId)}/photos`,
    { method: 'POST', body: form },
  )
}

export function deletePhoto(photoId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
  })
}

/**
 * Promote a photo to be the animal's main photo. Server responds with
 * {message, photo_url}; we don't surface that — callers refetch the snake.
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

export function snakeTitle(snake: Snake): string {
  return (
    snake.name ||
    snake.common_name ||
    snake.scientific_name ||
    'Unnamed reptile'
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

/** "2 days ago" / "Today" / "Yesterday". */
export function relativeDays(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}
