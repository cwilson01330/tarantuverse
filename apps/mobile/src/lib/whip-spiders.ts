/**
 * Whip spider (Amblypygi) API client — ADR-006 taxon #1.
 *
 * Single import path for everything whip-spider-related:
 *
 *  - Whip spider CRUD                      /whip-spiders/
 *  - WhipSpiderSpecies catalog (public)    /whip-spider-species/
 *  - Per-animal logs                       /whip-spiders/{id}/{feedings|molts|substrate-changes|photos}
 *  - QR upload sessions                    /whip-spiders/{id}/upload-session
 *
 * Whip spiders launch on the unified `inverts` table (taxon='whip_spider')
 * — no legacy table, the /whip-spiders/ routes are a per-taxon facade.
 * From the client's perspective they behave exactly like /centipedes/.
 *
 * Domain notes:
 *  - Whip spiders are HARMLESS — no venom, no sting. `venom_severity`
 *    is therefore null for every species; the care sheet says so.
 *  - They molt (current_instar) and are measured by leg span
 *    (current_length_mm holds leg span in mm here).
 *  - Many species (Damon, Phrynus) are communal — see `communal_suitable`
 *    on the species. Per-animal colony grouping is deferred for v1.
 *  - feeding_mode is always 'predator' (live prey).
 *
 * IMPORTANT — apiClient baseURL already includes `/api/v1` (see the
 * mobile_apiclient_baseurl_double_prefix memory). Paths start at the
 * resource, e.g. '/whip-spiders/', NOT '/api/v1/whip-spiders/'.
 *
 * Mirrors the shape of `./centipedes.ts`.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Enum-ish types — lowercase wire values (DB sex/source are UPPERCASE PG
// enums but the API surfaces them lowercase).
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
/** Whip spiders are arboreal (vertical-surface dwellers), but the column
 * is shared across taxa so the full union is kept. */
export type WhipSpiderEnclosureType = 'terrestrial' | 'arboreal' | 'fossorial';

export type CareLevel = 'beginner' | 'intermediate' | 'advanced';
/** Species-level feeding mode (ADR-006). Whip spiders are predators. */
export type FeedingMode = 'predator' | 'detritivore' | 'omnivore';

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const FEEDING_MODE_LABELS: Record<FeedingMode, string> = {
  predator: 'Predator (live prey)',
  detritivore: 'Detritivore (decaying matter)',
  omnivore: 'Omnivore',
};

// ---------------------------------------------------------------------------
// Domain types — mirror apps/api/app/schemas/whip_spider.py + invert_species.py.
// ---------------------------------------------------------------------------

export interface WhipSpider {
  id: string;
  user_id: string;
  /** Always 'whip_spider' for rows reached through this lib. */
  taxon: 'whip_spider';
  species_id: string | null;
  enclosure_id: string | null;

  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;

  date_acquired: string | null;
  source: Source | null;
  price_paid: string | null;

  /** Molt count / instar. */
  current_instar: number | null;
  /** Leg span in mm (whip spiders are measured leg-tip to leg-tip). */
  current_length_mm: string | null;

  enclosure_type: WhipSpiderEnclosureType | null;
  enclosure_size: string | null;
  substrate_type: string | null;
  substrate_depth: string | null;
  last_substrate_change: string | null;
  target_temp_min: string | null;
  target_temp_max: string | null;
  target_humidity_min: string | null;
  target_humidity_max: string | null;
  water_dish: boolean;
  misting_schedule: string | null;
  last_enclosure_cleaning: string | null;
  enclosure_notes: string | null;

  feeding_paused_reason: string | null;
  feeding_paused_until: string | null;

  photo_url: string | null;
  is_public: boolean;
  visibility: Visibility | null;
  notes: string | null;

  created_at: string;
  updated_at: string | null;
}

export interface WhipSpiderCreate {
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  sex?: Sex | null;
  species_id?: string | null;
  enclosure_id?: string | null;
  date_acquired?: string | null;
  source?: Source | null;
  price_paid?: string | number | null;
  current_instar?: number | null;
  current_length_mm?: string | number | null;
  enclosure_type?: WhipSpiderEnclosureType | null;
  enclosure_size?: string | null;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  last_substrate_change?: string | null;
  target_temp_min?: string | number | null;
  target_temp_max?: string | number | null;
  target_humidity_min?: string | number | null;
  target_humidity_max?: string | number | null;
  water_dish?: boolean | null;
  misting_schedule?: string | null;
  last_enclosure_cleaning?: string | null;
  enclosure_notes?: string | null;
  feeding_paused_reason?: string | null;
  feeding_paused_until?: string | null;
  photo_url?: string | null;
  is_public?: boolean;
  notes?: string | null;
  visibility?: Visibility | null;
}

export type WhipSpiderUpdate = Partial<WhipSpiderCreate>;

export interface WhipSpiderSpecies {
  id: string;
  /** Always 'whip_spider' here — underlying table is invert_species. */
  taxon: 'whip_spider';
  scientific_name: string;
  scientific_name_lower: string;
  slug: string;
  common_names: string[];
  genus: string | null;
  family: string | null;
  order_name: string | null;

  care_level: CareLevel | null;
  temperament: string | null;
  native_region: string | null;
  adult_size: string | null;
  adult_length_min_mm: string | null;
  adult_length_max_mm: string | null;
  growth_rate: string | null;
  type: string | null;

  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;

  enclosure_size_sling: string | null;
  enclosure_size_juvenile: string | null;
  enclosure_size_adult: string | null;
  substrate_depth: string | null;
  substrate_type: string | null;

  feeding_mode: FeedingMode | null;
  prey_size: string | null;
  feeding_frequency_sling: string | null;
  feeding_frequency_juvenile: string | null;
  feeding_frequency_adult: string | null;

  water_dish_required: boolean;
  communal_suitable: boolean;

  /** Whip spiders have no venom — this is null for the taxon. Kept on
   * the type because the underlying invert_species row carries it. */
  venom_severity: string | null;
  venom_notes: string | null;

  care_guide: string | null;
  image_url: string | null;

  is_verified: boolean;
  times_kept: number;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Log types — same DB tables as tarantula/centipede logs, parented by
// invert_id.
// ---------------------------------------------------------------------------

export interface WhipSpiderFeedingLog {
  id: string;
  invert_id: string | null;
  fed_at: string;
  food_type: string | null;
  food_size: string | null;
  quantity: number;
  accepted: boolean;
  notes: string | null;
  created_at: string;
}

export interface WhipSpiderFeedingCreate {
  fed_at: string;
  food_type?: string | null;
  food_size?: string | null;
  quantity?: number;
  accepted?: boolean;
  notes?: string | null;
}

export interface WhipSpiderMoltLog {
  id: string;
  invert_id: string | null;
  molted_at: string;
  premolt_started_at: string | null;
  /** Leg span pre/post molt (mm), logged via the shared molt schema's
   * leg_span fields. */
  leg_span_before: string | null;
  leg_span_after: string | null;
  weight_before: string | null;
  weight_after: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

export interface WhipSpiderMoltCreate {
  molted_at: string;
  premolt_started_at?: string | null;
  leg_span_before?: string | number | null;
  leg_span_after?: string | number | null;
  weight_before?: string | number | null;
  weight_after?: string | number | null;
  notes?: string | null;
  image_url?: string | null;
}

export interface WhipSpiderSubstrateChange {
  id: string;
  invert_id: string | null;
  changed_at: string;
  substrate_type: string | null;
  substrate_depth: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface WhipSpiderSubstrateChangeCreate {
  changed_at: string;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface WhipSpiderPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Whip spider CRUD
// ---------------------------------------------------------------------------

export async function listWhipSpiders(): Promise<WhipSpider[]> {
  const { data } = await apiClient.get<WhipSpider[]>('/whip-spiders/');
  return data;
}

export async function getWhipSpider(id: string): Promise<WhipSpider> {
  const { data } = await apiClient.get<WhipSpider>(`/whip-spiders/${id}`);
  return data;
}

export async function createWhipSpider(
  payload: WhipSpiderCreate,
): Promise<WhipSpider> {
  const { data } = await apiClient.post<WhipSpider>('/whip-spiders/', payload);
  return data;
}

export async function updateWhipSpider(
  id: string,
  payload: WhipSpiderUpdate,
): Promise<WhipSpider> {
  const { data } = await apiClient.put<WhipSpider>(`/whip-spiders/${id}`, payload);
  return data;
}

export async function deleteWhipSpider(id: string): Promise<void> {
  await apiClient.delete(`/whip-spiders/${id}`);
}

// ---------------------------------------------------------------------------
// Whip spider species catalog (public reads)
// ---------------------------------------------------------------------------

export async function listWhipSpiderSpecies(options?: {
  skip?: number;
  limit?: number;
  verifiedOnly?: boolean;
  careLevel?: CareLevel;
}): Promise<WhipSpiderSpecies[]> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.skip != null) params.skip = options.skip;
  if (options?.limit != null) params.limit = options.limit;
  if (options?.verifiedOnly) params.verified_only = true;
  if (options?.careLevel) params.care_level = options.careLevel;
  const { data } = await apiClient.get<WhipSpiderSpecies[]>(
    '/whip-spider-species/',
    { params },
  );
  return data;
}

export async function searchWhipSpiderSpecies(
  q: string,
  limit = 10,
): Promise<WhipSpiderSpecies[]> {
  const { data } = await apiClient.get<WhipSpiderSpecies[]>(
    '/whip-spider-species/search',
    { params: { q, limit } },
  );
  return data;
}

export async function getWhipSpiderSpecies(id: string): Promise<WhipSpiderSpecies> {
  const { data } = await apiClient.get<WhipSpiderSpecies>(
    `/whip-spider-species/${id}`,
  );
  return data;
}

export async function getWhipSpiderSpeciesBySlug(
  slug: string,
): Promise<WhipSpiderSpecies> {
  const { data } = await apiClient.get<WhipSpiderSpecies>(
    `/whip-spider-species/by-slug/${slug}`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Per-whip-spider logs
// ---------------------------------------------------------------------------

export async function listWhipSpiderFeedings(
  whipSpiderId: string,
): Promise<WhipSpiderFeedingLog[]> {
  const { data } = await apiClient.get<WhipSpiderFeedingLog[]>(
    `/whip-spiders/${whipSpiderId}/feedings`,
  );
  return data;
}

export async function createWhipSpiderFeeding(
  whipSpiderId: string,
  payload: WhipSpiderFeedingCreate,
): Promise<WhipSpiderFeedingLog> {
  const { data } = await apiClient.post<WhipSpiderFeedingLog>(
    `/whip-spiders/${whipSpiderId}/feedings`,
    payload,
  );
  return data;
}

export async function listWhipSpiderMolts(
  whipSpiderId: string,
): Promise<WhipSpiderMoltLog[]> {
  const { data } = await apiClient.get<WhipSpiderMoltLog[]>(
    `/whip-spiders/${whipSpiderId}/molts`,
  );
  return data;
}

export async function createWhipSpiderMolt(
  whipSpiderId: string,
  payload: WhipSpiderMoltCreate,
): Promise<WhipSpiderMoltLog> {
  const { data } = await apiClient.post<WhipSpiderMoltLog>(
    `/whip-spiders/${whipSpiderId}/molts`,
    payload,
  );
  return data;
}

export async function listWhipSpiderSubstrateChanges(
  whipSpiderId: string,
): Promise<WhipSpiderSubstrateChange[]> {
  const { data } = await apiClient.get<WhipSpiderSubstrateChange[]>(
    `/whip-spiders/${whipSpiderId}/substrate-changes`,
  );
  return data;
}

export async function createWhipSpiderSubstrateChange(
  whipSpiderId: string,
  payload: WhipSpiderSubstrateChangeCreate,
): Promise<WhipSpiderSubstrateChange> {
  const { data } = await apiClient.post<WhipSpiderSubstrateChange>(
    `/whip-spiders/${whipSpiderId}/substrate-changes`,
    payload,
  );
  return data;
}

export async function listWhipSpiderPhotos(
  whipSpiderId: string,
): Promise<WhipSpiderPhoto[]> {
  const { data } = await apiClient.get<WhipSpiderPhoto[]>(
    `/whip-spiders/${whipSpiderId}/photos`,
  );
  return data;
}

/** Multipart photo upload — caller passes FormData (image + optional caption). */
export async function uploadWhipSpiderPhoto(
  whipSpiderId: string,
  form: FormData,
): Promise<WhipSpiderPhoto> {
  const { data } = await apiClient.post<WhipSpiderPhoto>(
    `/whip-spiders/${whipSpiderId}/photos`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// QR upload session
// ---------------------------------------------------------------------------

export interface WhipSpiderUploadSession {
  token: string;
  upload_url: string;
  expires_at: string;
  expires_in_minutes: number;
  taxon: 'whip_spider';
  whip_spider_name: string;
}

export async function createWhipSpiderUploadSession(
  whipSpiderId: string,
): Promise<WhipSpiderUploadSession> {
  const { data } = await apiClient.post<WhipSpiderUploadSession>(
    `/whip-spiders/${whipSpiderId}/upload-session`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "Whippy (Damon diadema)" — tries name first, falls back to species. */
export function whipSpiderDisplayName(w: WhipSpider): string {
  const parts: string[] = [];
  if (w.name) parts.push(w.name);
  const label = w.common_name || w.scientific_name;
  if (label) parts.push(w.name ? `(${label})` : label);
  return parts.join(' ') || 'Unnamed whip spider';
}
