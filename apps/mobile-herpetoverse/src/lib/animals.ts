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

// Taxon registry (ADR-011) — the single source of truth for HV herp groups.
// Adding a group = one entry here (+ the web mirror) + a species seed; the
// backend taxon column is a flexible VARCHAR, so no migration. Kept in
// lockstep with ANIMAL_TAXON_VALUES in apps/api/app/models/animal.py and the
// web-herpetoverse registry.
export type AnimalTaxon =
  | 'snake'
  | 'lizard'
  | 'turtle'
  | 'tortoise'
  | 'frog'
  | 'salamander'
  | 'other';

export interface AnimalTaxonMeta {
  key: AnimalTaxon;
  /** Singular label for pickers + detail chrome. */
  label: string;
  /** Plural label for collection filters + section headers. */
  plural: string;
  /** Emoji glyph for cards / pickers. */
  glyph: string;
}

export const ANIMAL_TAXA: Record<AnimalTaxon, AnimalTaxonMeta> = {
  snake: { key: 'snake', label: 'Snake', plural: 'Snakes', glyph: '🐍' },
  lizard: { key: 'lizard', label: 'Lizard', plural: 'Lizards', glyph: '🦎' },
  turtle: { key: 'turtle', label: 'Turtle', plural: 'Turtles', glyph: '🐢' },
  tortoise: { key: 'tortoise', label: 'Tortoise', plural: 'Tortoises', glyph: '🐢' },
  frog: { key: 'frog', label: 'Frog', plural: 'Frogs & toads', glyph: '🐸' },
  salamander: { key: 'salamander', label: 'Salamander', plural: 'Salamanders & newts', glyph: '🐉' },
  other: { key: 'other', label: 'Other', plural: 'Other herps', glyph: '🦕' },
};

/** Display order for pickers / filters. */
export const ANIMAL_TAXON_ORDER: AnimalTaxon[] = [
  'snake', 'lizard', 'turtle', 'tortoise', 'frog', 'salamander', 'other',
];

export function isAnimalTaxon(t: string | null | undefined): t is AnimalTaxon {
  return t != null && t in ANIMAL_TAXA;
}

/** Back-compat: label lookup derived from the registry. */
export const TAXON_LABELS: Record<AnimalTaxon, string> = Object.fromEntries(
  ANIMAL_TAXON_ORDER.map((k) => [k, ANIMAL_TAXA[k].label]),
) as Record<AnimalTaxon, string>;

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

  // Provenance / transfer (backend htr_20260707, read-only). When this
  // record has been handed off, transferred_out_at is set (SOURCE record).
  // The rest populate a CLAIMED record's provenance block. `provenance` is
  // the frozen snapshot dict — see AnimalProvenance.
  transferred_out_at?: string | null;
  origin_keeper_name?: string | null;
  bred_by_user_id?: string | null;
  source_transfer_id?: string | null;
  provenance?: AnimalProvenance | null;
}

/**
 * Frozen snapshot carried onto a claimed animal (BRIEF §6). Reptile/amphibian
 * lineage isn't resolved on-platform yet, so dam/sire are always null — the
 * block renders honestly (no fabricated pedigree). Mirrors
 * `_build_animal_snapshot` in apps/api/app/routers/transfers.py.
 */
export interface AnimalProvenance {
  taxon?: string | null;
  scientific_name?: string | null;
  common_name?: string | null;
  name?: string | null;
  sex?: string | null;
  species_id?: string | null;
  breeder_handle?: string | null;
  bred_by_user_id?: string | null;
  origin_keeper_name?: string | null;
  dam_scientific_name?: string | null;
  sire_scientific_name?: string | null;
  dob_or_acquired?: string | null;
  weight_g?: number | null;
  length_in?: number | null;
  last_shed_at?: string | null;
  transferred_at?: string | null;
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
 * Free-tier collection cap status for the current keeper.
 *
 * `limit` is -1 for premium (any active Appalachian Tarantulas
 * subscription) = unlimited animals; otherwise it's the free cap (5 as
 * of this writing). `at_limit` is true when a free keeper has reached
 * it — the next create returns HTTP 402. Used to surface a subtle
 * "X / 5" counter on the collection header (hidden when premium).
 *
 * Backend: GET /animals/limits. apiClient baseURL already carries
 * /api/v1 so the path starts at /animals/... (never /api/v1/animals/...).
 */
export interface AnimalLimits {
  /** -1 when premium (unlimited); otherwise the free cap (5). */
  limit: number;
  current_count: number;
  is_premium: boolean;
  /** null for premium (unlimited); otherwise animals left before the cap. */
  remaining: number | null;
  at_limit: boolean;
}

export async function getAnimalLimits(): Promise<AnimalLimits> {
  const { data } = await apiClient.get<AnimalLimits>('/animals/limits');
  return data;
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

// ---------------------------------------------------------------------------
// Feeding Day — bulk feeding across the whole collection
// ---------------------------------------------------------------------------

/**
 * One row of the Feeding Day status board. Mirrors the backend
 * `GET /animals/feeding-status` response — already sorted neediest-first
 * (never-fed and overdue bubble to the top). `days_since_last_feeding`
 * counts from the last ACCEPTED feeding (refusals don't reset the clock),
 * and is null when the animal has never been fed.
 */
export interface AnimalFeedingStatus {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon: AnimalTaxon;
  photo_url: string | null;
  last_feeding_date: string | null;
  days_since_last_feeding: number | null;
  is_feeding_paused: boolean;
  is_overdue: boolean;
  interval_days: number | null;
  feeds_on_cgd: boolean;
}

/**
 * Fetch the feeding-status board for the whole collection. `tz` is the
 * device's `getTimezoneOffset()` (minutes) so "days since" is computed in
 * the keeper's local calendar, not a UTC-midnight floor.
 */
export async function listAnimalFeedingStatus(
  tz: number,
): Promise<AnimalFeedingStatus[]> {
  const { data } = await apiClient.get<AnimalFeedingStatus[]>(
    `/animals/feeding-status?tz_offset_minutes=${tz}`,
  );
  return data;
}

export interface BulkFeedPayload {
  animal_ids: string[];
  accepted: boolean;
  food_type?: string | null;
  food_size?: string | null;
  quantity?: number | null;
  notes?: string | null;
}

export interface BulkFeedResult {
  created_count: number;
  created_ids: string[];
  skipped: unknown[];
}

/**
 * Log one feeding for many animals at once. The backend applies the same
 * food_type / accepted / notes to every id in `animal_ids` and returns
 * how many rows it created.
 */
export async function bulkFeedAnimals(
  payload: BulkFeedPayload,
): Promise<BulkFeedResult> {
  const { data } = await apiClient.post<BulkFeedResult>(
    '/animals/bulk-feedings',
    payload,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Transfer / rehome (provenance). Claiming itself is web-first (the shared
// claim link opens the HV web claim page) — there is no mobile claim screen.
// ---------------------------------------------------------------------------

export interface CreateTransferPayload {
  note?: string | null;
  /** PRIVATE seller ledger — never shown to the buyer. */
  sale_price?: number | null;
  include_photos?: boolean;
  /** 1–90 days; backend defaults to 30. */
  expires_in_days?: number;
}

export interface TransferCreateResponse {
  token: string;
  claim_url: string;
  expires_at: string;
}

/**
 * Create a one-time claim link ("rehome") for an animal the caller owns.
 * Returns the claim_url to copy/share. The buyer claims on the HV web page.
 * Mirrors POST /animals/{id}/transfer (transfers.py).
 */
export async function createAnimalTransfer(
  animalId: string,
  payload: CreateTransferPayload,
): Promise<TransferCreateResponse> {
  const { data } = await apiClient.post<TransferCreateResponse>(
    `/animals/${encodeURIComponent(animalId)}/transfer`,
    payload,
  );
  return data;
}

/** Seller cancels a still-pending transfer. */
export async function cancelAnimalTransfer(token: string): Promise<void> {
  await apiClient.post(`/transfers/${encodeURIComponent(token)}/cancel`);
}
