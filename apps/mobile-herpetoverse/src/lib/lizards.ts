/**
 * Lizard API client — mirrors web-herpetoverse/src/lib/lizards.ts.
 *
 * Same surface as snakes.ts. Bundle 4 adds create/delete methods.
 *
 * Note on polymorphic logs: WeightLog / FeedingLog / ShedLog rows have
 * both `snake_id` and `lizard_id` columns; exactly one is non-null on
 * any given row. The lizard-context fetchers below filter to lizard
 * rows on the server side, so the response is shape-clean for UI use.
 *
 * Note on weight-log path: API uses `/weight-logs`, NOT `/weights`.
 * Bundle 3 had this wrong and detail screens silently failed to load
 * weight history.
 */
import { apiClient } from '../services/api';
import type {
  CreateFeedingPayload,
  CreateShedPayload,
  CreateWeightLogPayload,
  Sex,
  Source,
  Visibility,
  WeightContext,
} from './snakes';

export type { Sex, Source, Visibility, WeightContext };
export type {
  CreateFeedingPayload,
  CreateShedPayload,
  CreateWeightLogPayload,
};

export interface Lizard {
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

// Polymorphic logs — both snake_id and lizard_id columns; one is null.
export interface WeightLog {
  id: string;
  snake_id: string | null;
  lizard_id: string | null;
  weighed_at: string;
  weight_g: string;
  context: WeightContext;
  notes: string | null;
  created_at: string;
}

export interface FeedingLog {
  id: string;
  snake_id: string | null;
  lizard_id: string | null;
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
  snake_id: string | null;
  lizard_id: string | null;
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

export async function getLizard(id: string): Promise<Lizard> {
  const { data } = await apiClient.get<Lizard>(`/lizards/${encodeURIComponent(id)}`);
  return data;
}

export async function listWeightLogs(lizardId: string): Promise<WeightLog[]> {
  const { data } = await apiClient.get<WeightLog[]>(
    `/lizards/${encodeURIComponent(lizardId)}/weight-logs`,
  );
  return data;
}

export async function listFeedings(lizardId: string): Promise<FeedingLog[]> {
  const { data } = await apiClient.get<FeedingLog[]>(
    `/lizards/${encodeURIComponent(lizardId)}/feedings`,
  );
  return data;
}

export async function listSheds(lizardId: string): Promise<ShedLog[]> {
  const { data } = await apiClient.get<ShedLog[]>(
    `/lizards/${encodeURIComponent(lizardId)}/sheds`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Mutations — Bundle 4
// ---------------------------------------------------------------------------

export interface CreateLizardPayload {
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

export async function createLizard(payload: CreateLizardPayload): Promise<Lizard> {
  const { data } = await apiClient.post<Lizard>('/lizards/', payload);
  return data;
}

/**
 * Update a lizard. Reuses CreateLizardPayload because the form surface
 * is the same — backend LizardUpdate inherits LizardBase (all fields
 * optional).
 */
export async function updateLizard(
  id: string,
  payload: CreateLizardPayload,
): Promise<Lizard> {
  const { data } = await apiClient.put<Lizard>(
    `/lizards/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteLizard(id: string): Promise<void> {
  await apiClient.delete(`/lizards/${encodeURIComponent(id)}`);
}

export async function createWeightLog(
  lizardId: string,
  payload: CreateWeightLogPayload,
): Promise<WeightLog> {
  const { data } = await apiClient.post<WeightLog>(
    `/lizards/${encodeURIComponent(lizardId)}/weight-logs`,
    payload,
  );
  return data;
}

export async function createFeeding(
  lizardId: string,
  payload: CreateFeedingPayload,
): Promise<FeedingLog> {
  const { data } = await apiClient.post<FeedingLog>(
    `/lizards/${encodeURIComponent(lizardId)}/feedings`,
    payload,
  );
  return data;
}

export async function createShed(
  lizardId: string,
  payload: CreateShedPayload,
): Promise<ShedLog> {
  const { data } = await apiClient.post<ShedLog>(
    `/lizards/${encodeURIComponent(lizardId)}/sheds`,
    payload,
  );
  return data;
}

// Delete endpoints are global (no taxon prefix) so reuse from snakes.ts.
export { deleteFeeding, deleteShed, deleteWeightLog } from './snakes';

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function lizardTitle(l: Pick<Lizard, 'name' | 'common_name' | 'scientific_name'>): string {
  return l.name || l.common_name || l.scientific_name || 'Unnamed';
}
