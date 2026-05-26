/**
 * Unified animal API client (ADR-003) — supersedes lib/snakes.ts +
 * lib/lizards.ts.
 *
 * The per-taxon snakes/lizards/frogs tables collapsed into one `animals`
 * table discriminated by `taxon`. One set of CRUD helpers; pass a
 * `taxon` to `listAnimals` when a screen needs a single-taxon view.
 *
 * Mirrors apps/web-herpetoverse/src/lib/animals.ts. apiClient baseURL
 * already includes `/api/v1` (see the `feedback_mobile_apiclient_baseurl_
 * double_prefix` memory), so paths here start at the resource.
 *
 * Endpoint paths must match the FastAPI router exactly (`/weight-logs`,
 * not `/weights`); a wrong slug 404s silently because the route just
 * isn't registered.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Shared enum-ish types — backend stores these as Postgres enums; values
// are lowercase to match API responses.
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
export type AnimalTaxon = 'snake' | 'lizard' | 'frog';

export const TAXON_LABELS: Record<AnimalTaxon, string> = {
  snake: 'Snake',
  lizard: 'Lizard',
  frog: 'Frog',
};

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
// Schemas — mirror apps/api/app/schemas/animal.py (subset the mobile
// screens read; add fields here as screens need them).
// ---------------------------------------------------------------------------

export interface Animal {
  id: string;
  user_id: string;
  taxon: AnimalTaxon;
  // Renamed from reptile_species_id in anh_20260514 — the catalog table
  // is herp_species now (it holds amphibians too).
  herp_species_id: string | null;
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
  /** Canonical reasons: hunger_strike | post_rehouse | recovering | breeding_season | other */
  feeding_paused_reason: string | null;
  /** ISO date (YYYY-MM-DD) — pause auto-resumes after this date. Null = indefinite. */
  feeding_paused_until: string | null;

  /** Per-animal CGD override. NULL inherits the species default. */
  feeds_on_cgd_override: boolean | null;
  /** Resolved CGD flag (override ?? species default). Server-computed. */
  feeds_on_cgd: boolean;

  photo_url: string | null;

  notes: string | null;

  last_fed_at: string | null;
  last_shed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface WeightLog {
  id: string;
  animal_id: string;
  weighed_at: string;
  weight_g: string;
  context: WeightContext;
  notes: string | null;
  created_at: string;
}

export interface FeedingLog {
  id: string;
  animal_id: string | null;
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
  animal_id: string;
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

/**
 * Prey-size + interval guidance for an animal's current life stage.
 * Mirrors the backend PreySuggestion schema. The wire field name is
 * `snake_weight_g` for backward-compat — for any taxon the value is
 * still that animal's weight.
 */
export interface PreySuggestion {
  stage: string; // hatchling | juvenile | subadult | adult | unknown
  snake_weight_g: string | null;
  suggested_min_g: string | null;
  suggested_max_g: string | null;
  interval_days_min: number | null;
  interval_days_max: number | null;
  power_feeding_threshold_g: string | null;
  is_data_available: boolean;
  warning: string | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * List the keeper's animals. Pass a `taxon` to scope to one taxon — the
 * single-taxon collection views pass it; a unified view omits it.
 */
export async function listAnimals(taxon?: AnimalTaxon): Promise<Animal[]> {
  const qs = taxon ? `?taxon=${encodeURIComponent(taxon)}` : '';
  const { data } = await apiClient.get<Animal[]>(`/animals/${qs}`);
  return data;
}

export async function getAnimal(id: string): Promise<Animal> {
  const { data } = await apiClient.get<Animal>(
    `/animals/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function listWeightLogs(animalId: string): Promise<WeightLog[]> {
  const { data } = await apiClient.get<WeightLog[]>(
    `/animals/${encodeURIComponent(animalId)}/weight-logs`,
  );
  return data;
}

export async function listFeedings(animalId: string): Promise<FeedingLog[]> {
  const { data } = await apiClient.get<FeedingLog[]>(
    `/animals/${encodeURIComponent(animalId)}/feedings`,
  );
  return data;
}

export async function listSheds(animalId: string): Promise<ShedLog[]> {
  const { data } = await apiClient.get<ShedLog[]>(
    `/animals/${encodeURIComponent(animalId)}/sheds`,
  );
  return data;
}

export async function getPreySuggestion(
  animalId: string,
): Promise<PreySuggestion> {
  const { data } = await apiClient.get<PreySuggestion>(
    `/animals/${encodeURIComponent(animalId)}/prey-suggestion`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Animal mutations
// ---------------------------------------------------------------------------

/**
 * Payload for creating an animal. Mirrors AnimalCreate on the backend.
 * `taxon` is required and immutable once set; every other field is
 * optional so the form can progressively disclose sections.
 */
export interface CreateAnimalPayload {
  taxon: AnimalTaxon;
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  herp_species_id?: string | null;
  enclosure_id?: string | null;
  sex?: Sex | null;
  hatch_date?: string | null;
  date_acquired?: string | null;
  source?: Source | null;
  current_weight_g?: string | number | null;
  current_length_in?: string | number | null;
  /** Per-animal CGD override. null inherits the species default. */
  feeds_on_cgd_override?: boolean | null;
  notes?: string | null;
}

export async function createAnimal(
  payload: CreateAnimalPayload,
): Promise<Animal> {
  const { data } = await apiClient.post<Animal>('/animals/', payload);
  return data;
}

/**
 * AnimalUpdate on the backend is all-optional and does NOT accept
 * `taxon` (immutable). We reuse a Partial of the create payload minus
 * taxon — the add screen and edit screen fill the same bag otherwise.
 */
export type UpdateAnimalPayload = Partial<Omit<CreateAnimalPayload, 'taxon'>>;

export async function updateAnimal(
  id: string,
  payload: UpdateAnimalPayload,
): Promise<Animal> {
  const { data } = await apiClient.put<Animal>(
    `/animals/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteAnimal(id: string): Promise<void> {
  await apiClient.delete(`/animals/${encodeURIComponent(id)}`);
}

/**
 * Pause feeding reminders for an animal. The backend's
 * `_compute_feeding_status` returns `status='paused'` while this is
 * active. Reason values from the canonical list (hunger_strike,
 * post_rehouse, recovering, breeding_season, other) get translated to
 * friendly prose; other strings pass through verbatim.
 *
 * `until` is an ISO date (YYYY-MM-DD). Pass `null` for indefinite —
 * keeper resumes manually. ADR-003: one route for every taxon, no
 * taxon arg.
 */
export async function pauseFeeding(
  animalId: string,
  reason: string,
  until: string | null,
): Promise<Animal> {
  const { data } = await apiClient.put<Animal>(
    `/animals/${encodeURIComponent(animalId)}`,
    { feeding_paused_reason: reason, feeding_paused_until: until },
  );
  return data;
}

export async function resumeFeeding(animalId: string): Promise<Animal> {
  const { data } = await apiClient.put<Animal>(
    `/animals/${encodeURIComponent(animalId)}`,
    { feeding_paused_reason: null, feeding_paused_until: null },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Weight logs
// ---------------------------------------------------------------------------

export interface CreateWeightLogPayload {
  weighed_at: string;
  weight_g: string | number;
  context?: WeightContext;
  notes?: string | null;
}

export async function createWeightLog(
  animalId: string,
  payload: CreateWeightLogPayload,
): Promise<WeightLog> {
  const { data } = await apiClient.post<WeightLog>(
    `/animals/${encodeURIComponent(animalId)}/weight-logs`,
    payload,
  );
  return data;
}

export async function getWeightLog(id: string): Promise<WeightLog> {
  const { data } = await apiClient.get<WeightLog>(
    `/weight-logs/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function updateWeightLog(
  id: string,
  payload: Partial<CreateWeightLogPayload>,
): Promise<WeightLog> {
  const { data } = await apiClient.put<WeightLog>(
    `/weight-logs/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteWeightLog(id: string): Promise<void> {
  await apiClient.delete(`/weight-logs/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Feedings
// ---------------------------------------------------------------------------

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
  animalId: string,
  payload: CreateFeedingPayload,
): Promise<FeedingLog> {
  const { data } = await apiClient.post<FeedingLog>(
    `/animals/${encodeURIComponent(animalId)}/feedings`,
    payload,
  );
  return data;
}

export async function getFeeding(id: string): Promise<FeedingLog> {
  const { data } = await apiClient.get<FeedingLog>(
    `/feedings/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function updateFeeding(
  id: string,
  payload: Partial<CreateFeedingPayload>,
): Promise<FeedingLog> {
  const { data } = await apiClient.put<FeedingLog>(
    `/feedings/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteFeeding(id: string): Promise<void> {
  await apiClient.delete(`/feedings/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Sheds
// ---------------------------------------------------------------------------

export interface CreateShedPayload {
  shed_at: string;
  in_blue_started_at?: string | null;
  is_complete_shed?: boolean;
  has_retained_shed?: boolean;
  retained_shed_notes?: string | null;
  notes?: string | null;
}

export async function createShed(
  animalId: string,
  payload: CreateShedPayload,
): Promise<ShedLog> {
  const { data } = await apiClient.post<ShedLog>(
    `/animals/${encodeURIComponent(animalId)}/sheds`,
    payload,
  );
  return data;
}

export async function getShed(id: string): Promise<ShedLog> {
  const { data } = await apiClient.get<ShedLog>(
    `/sheds/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function updateShed(
  id: string,
  payload: Partial<CreateShedPayload>,
): Promise<ShedLog> {
  const { data } = await apiClient.put<ShedLog>(
    `/sheds/${encodeURIComponent(id)}`,
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

export function animalTitle(
  a: Pick<Animal, 'name' | 'common_name' | 'scientific_name'>,
): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}
