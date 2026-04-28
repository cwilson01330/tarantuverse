/**
 * Snake API client — mirrors web-herpetoverse/src/lib/snakes.ts.
 *
 * Bundle 4 adds the create/delete surface for the log-entry screens.
 * Endpoint paths must match the FastAPI router exactly (`/weight-logs`,
 * not `/weights`); a wrong slug returns 404 silently because the route
 * just isn't registered. Bundle 3 had `/weights` — fixed here.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Shared enum-ish types — keep in sync with web. Backend stores these as
// Postgres enums; values are lowercase to match the API responses.
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';

export type WeightContext =
  | 'routine'
  | 'pre_feed'
  | 'post_shed'
  | 'pre_breeding'
  | 'post_lay'
  | 'other';

export const WEIGHT_CONTEXT_LABELS: Record<WeightContext, string> = {
  routine: 'Routine',
  pre_feed: 'Pre-feed',
  post_shed: 'Post-shed',
  pre_breeding: 'Pre-breeding',
  post_lay: 'Post-lay',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Schemas (a subset of what the web client tracks — only fields the mobile
// detail screen reads. Add more here as Bundle 5 lands.)
// ---------------------------------------------------------------------------

export interface Snake {
  id: string;
  user_id: string;
  reptile_species_id: string | null;
  enclosure_id: string | null;

  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;

  date_acquired: string | null;
  hatch_date: string | null;
  source: Source | null;

  current_weight_g: string | null;
  current_length_in: string | null;

  feeding_schedule: string | null;
  brumation_active: boolean;
  brumation_started_at: string | null;

  photo_url: string | null;

  notes: string | null;

  last_fed_at: string | null;
  last_shed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface WeightLog {
  id: string;
  snake_id: string;
  weighed_at: string;
  weight_g: string;
  context: WeightContext;
  notes: string | null;
  created_at: string;
}

export interface FeedingLog {
  id: string;
  snake_id: string | null;
  fed_at: string;
  food_type: string | null;
  food_size: string | null;
  quantity: number;
  accepted: boolean;
  prey_weight_g: string | null;
  notes: string | null;
  created_at: string;
}

export interface ShedLog {
  id: string;
  snake_id: string;
  shed_at: string;
  in_blue_started_at: string | null;
  weight_before_g: string | null;
  weight_after_g: string | null;
  length_before_in: string | null;
  length_after_in: string | null;
  is_complete_shed: boolean;
  has_retained_shed: boolean;
  retained_shed_notes: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function getSnake(id: string): Promise<Snake> {
  const { data } = await apiClient.get<Snake>(`/snakes/${encodeURIComponent(id)}`);
  return data;
}

export async function listWeightLogs(snakeId: string): Promise<WeightLog[]> {
  const { data } = await apiClient.get<WeightLog[]>(
    `/snakes/${encodeURIComponent(snakeId)}/weight-logs`,
  );
  return data;
}

export async function listFeedings(snakeId: string): Promise<FeedingLog[]> {
  const { data } = await apiClient.get<FeedingLog[]>(
    `/snakes/${encodeURIComponent(snakeId)}/feedings`,
  );
  return data;
}

export async function listSheds(snakeId: string): Promise<ShedLog[]> {
  const { data } = await apiClient.get<ShedLog[]>(
    `/snakes/${encodeURIComponent(snakeId)}/sheds`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Mutations — Bundle 4
// ---------------------------------------------------------------------------

export interface CreateSnakePayload {
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  reptile_species_id?: string | null;
  enclosure_id?: string | null;
  sex?: Sex | null;
  hatch_date?: string | null;
  date_acquired?: string | null;
  source?: Source | null;
  current_weight_g?: string | number | null;
  notes?: string | null;
}

export async function createSnake(payload: CreateSnakePayload): Promise<Snake> {
  const { data } = await apiClient.post<Snake>('/snakes/', payload);
  return data;
}

/**
 * Update a snake. Reuses CreateSnakePayload because the form surface is
 * the same — backend SnakeUpdate inherits SnakeBase (all fields optional).
 */
export async function updateSnake(
  id: string,
  payload: CreateSnakePayload,
): Promise<Snake> {
  const { data } = await apiClient.put<Snake>(
    `/snakes/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteSnake(id: string): Promise<void> {
  await apiClient.delete(`/snakes/${encodeURIComponent(id)}`);
}

export interface CreateWeightLogPayload {
  weighed_at: string;
  weight_g: string | number;
  context?: WeightContext;
  notes?: string | null;
}

export async function createWeightLog(
  snakeId: string,
  payload: CreateWeightLogPayload,
): Promise<WeightLog> {
  const { data } = await apiClient.post<WeightLog>(
    `/snakes/${encodeURIComponent(snakeId)}/weight-logs`,
    payload,
  );
  return data;
}

export async function deleteWeightLog(id: string): Promise<void> {
  await apiClient.delete(`/weight-logs/${encodeURIComponent(id)}`);
}

export interface CreateFeedingPayload {
  fed_at: string;
  food_type?: string | null;
  food_size?: string | null;
  quantity?: number;
  accepted?: boolean;
  prey_weight_g?: string | number | null;
  notes?: string | null;
}

export async function createFeeding(
  snakeId: string,
  payload: CreateFeedingPayload,
): Promise<FeedingLog> {
  const { data } = await apiClient.post<FeedingLog>(
    `/snakes/${encodeURIComponent(snakeId)}/feedings`,
    payload,
  );
  return data;
}

export async function deleteFeeding(id: string): Promise<void> {
  await apiClient.delete(`/feedings/${encodeURIComponent(id)}`);
}

export interface CreateShedPayload {
  shed_at: string;
  in_blue_started_at?: string | null;
  is_complete_shed?: boolean;
  has_retained_shed?: boolean;
  retained_shed_notes?: string | null;
  notes?: string | null;
}

export async function createShed(
  snakeId: string,
  payload: CreateShedPayload,
): Promise<ShedLog> {
  const { data } = await apiClient.post<ShedLog>(
    `/snakes/${encodeURIComponent(snakeId)}/sheds`,
    payload,
  );
  return data;
}

export async function deleteShed(id: string): Promise<void> {
  await apiClient.delete(`/sheds/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function snakeTitle(s: Pick<Snake, 'name' | 'common_name' | 'scientific_name'>): string {
  return s.name || s.common_name || s.scientific_name || 'Unnamed';
}
