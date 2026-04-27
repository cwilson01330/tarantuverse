/**
 * Snake API client — mirrors web-herpetoverse/src/lib/snakes.ts but slim.
 *
 * Bundle 3 only needs the read paths for the detail screen (getSnake,
 * listWeightLogs, listFeedings, listSheds). Bundle 4 will add create
 * + delete methods when the log-entry screens land.
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
// detail screen reads. Add more here as Bundle 4 / 5 land.)
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
    `/snakes/${encodeURIComponent(snakeId)}/weights`,
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
// Display helpers
// ---------------------------------------------------------------------------

export function snakeTitle(s: Pick<Snake, 'name' | 'common_name' | 'scientific_name'>): string {
  return s.name || s.common_name || s.scientific_name || 'Unnamed';
}
