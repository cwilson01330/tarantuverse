/**
 * Scorpion API client — Phase 3a of the scorpion expansion.
 *
 * Covers the full Phase 1a + 1b backend surface so Phase 3b
 * (detail screen, logs, photos) only has UI work to do:
 *
 *  - Scorpion CRUD                        /scorpions/
 *  - ScorpionSpecies catalog (public)     /scorpion-species/
 *  - ScorpionColony CRUD                  /scorpion-colonies/
 *  - Per-scorpion logs                    /scorpions/{id}/{feedings|molts|substrate-changes|photos}
 *  - QR upload sessions                   /scorpions/{id}/upload-session
 *
 * IMPORTANT — apiClient baseURL already includes `/api/v1` (see the
 * mobile_apiclient_baseurl_double_prefix memory). All paths here start
 * at the resource, e.g. '/scorpions/', NOT '/api/v1/scorpions/'.
 *
 * Mirrors the shape of `apps/mobile-herpetoverse/src/lib/animals.ts`.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Enum-ish types — values are the lowercase wire values the API expects.
// (DB stores `sex` / `source` as UPPERCASE Postgres enums, but the API
// schema layer surfaces them as lowercase — same as the tarantula API.)
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
export type ScorpionEnclosureType = 'terrestrial' | 'arboreal' | 'fossorial';

export type CareLevel = 'beginner' | 'intermediate' | 'advanced';
export type VenomSeverity = 'mild' | 'moderate' | 'medically_significant';
export type ScorpionType = 'terrestrial' | 'scansorial' | 'fossorial' | 'psammophile';
export type Burrowing = 'none' | 'light' | 'heavy';

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const VENOM_SEVERITY_LABELS: Record<VenomSeverity, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  medically_significant: 'Medically significant',
};

// ---------------------------------------------------------------------------
// Domain types — mirror apps/api/app/schemas/scorpion*.py (subset the
// mobile screens actually read; add fields here as screens need them).
// ---------------------------------------------------------------------------

export interface Scorpion {
  id: string;
  user_id: string;
  species_id: string | null;
  enclosure_id: string | null;
  colony_id: string | null;

  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;

  date_acquired: string | null;
  source: Source | null;
  price_paid: string | null;

  /** Scorpion-specific: 1-7 instar number. */
  current_instar: number | null;
  /** Total body length in mm (NOT leg span). */
  current_length_mm: string | null;

  enclosure_type: ScorpionEnclosureType | null;
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

export interface ScorpionCreate {
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  sex?: Sex | null;
  species_id?: string | null;
  enclosure_id?: string | null;
  colony_id?: string | null;
  date_acquired?: string | null;
  source?: Source | null;
  price_paid?: string | number | null;
  current_instar?: number | null;
  current_length_mm?: string | number | null;
  enclosure_type?: ScorpionEnclosureType | null;
  enclosure_size?: string | null;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  notes?: string | null;
  visibility?: Visibility | null;
}

export type ScorpionUpdate = Partial<ScorpionCreate>;

export interface ScorpionSpecies {
  id: string;
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
  type: ScorpionType | null;

  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;

  enclosure_size_juvenile: string | null;
  enclosure_size_adult: string | null;
  substrate_depth: string | null;
  substrate_type: string | null;

  prey_size: string | null;
  feeding_frequency_juvenile: string | null;
  feeding_frequency_adult: string | null;

  water_dish_required: boolean;
  burrowing: Burrowing | null;
  communal_suitable: boolean;

  venom_severity: VenomSeverity;
  venom_notes: string | null;

  care_guide: string | null;
  image_url: string | null;

  is_verified: boolean;
  times_kept: number;
  created_at: string;
  updated_at: string | null;
}

export interface ScorpionColony {
  id: string;
  user_id: string;
  name: string;
  enclosure_id: string | null;
  notes: string | null;
  member_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ScorpionColonyMember {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;
  current_instar: number | null;
  photo_url: string | null;
}

export interface ScorpionColonyDetail extends ScorpionColony {
  members: ScorpionColonyMember[];
}

export interface ScorpionColonyCreate {
  name: string;
  enclosure_id?: string | null;
  notes?: string | null;
}

export type ScorpionColonyUpdate = Partial<ScorpionColonyCreate>;

// ---------------------------------------------------------------------------
// Log types — shared with tarantulas (rows from the same DB tables, just
// parented to scorpion_id instead of tarantula_id). 3b's log screens read
// these.
// ---------------------------------------------------------------------------

export interface ScorpionFeedingLog {
  id: string;
  scorpion_id: string | null;
  fed_at: string;
  food_type: string | null;
  food_size: string | null;
  quantity: number;
  accepted: boolean;
  notes: string | null;
  created_at: string;
}

export interface ScorpionFeedingCreate {
  fed_at: string;
  food_type?: string | null;
  food_size?: string | null;
  quantity?: number;
  accepted?: boolean;
  notes?: string | null;
}

export interface ScorpionMoltLog {
  id: string;
  scorpion_id: string | null;
  molted_at: string;
  premolt_started_at: string | null;
  /** Inches — same column as tarantulas; for scorpions, often null. */
  leg_span_before: string | null;
  leg_span_after: string | null;
  /** Grams */
  weight_before: string | null;
  weight_after: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

export interface ScorpionMoltCreate {
  molted_at: string;
  premolt_started_at?: string | null;
  leg_span_before?: string | number | null;
  leg_span_after?: string | number | null;
  weight_before?: string | number | null;
  weight_after?: string | number | null;
  notes?: string | null;
  image_url?: string | null;
}

export interface ScorpionSubstrateChange {
  id: string;
  scorpion_id: string | null;
  changed_at: string;
  substrate_type: string | null;
  substrate_depth: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface ScorpionSubstrateChangeCreate {
  changed_at: string;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface ScorpionPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Scorpion CRUD
// ---------------------------------------------------------------------------

export async function listScorpions(options?: {
  colonyId?: string;
}): Promise<Scorpion[]> {
  const params: Record<string, string> = {};
  if (options?.colonyId) params.colony_id = options.colonyId;
  const { data } = await apiClient.get<Scorpion[]>('/scorpions/', { params });
  return data;
}

export async function getScorpion(id: string): Promise<Scorpion> {
  const { data } = await apiClient.get<Scorpion>(`/scorpions/${id}`);
  return data;
}

export async function createScorpion(
  payload: ScorpionCreate,
): Promise<Scorpion> {
  const { data } = await apiClient.post<Scorpion>('/scorpions/', payload);
  return data;
}

export async function updateScorpion(
  id: string,
  payload: ScorpionUpdate,
): Promise<Scorpion> {
  const { data } = await apiClient.put<Scorpion>(`/scorpions/${id}`, payload);
  return data;
}

export async function deleteScorpion(id: string): Promise<void> {
  await apiClient.delete(`/scorpions/${id}`);
}

// ---------------------------------------------------------------------------
// Scorpion species catalog (public reads)
// ---------------------------------------------------------------------------

export async function listScorpionSpecies(options?: {
  skip?: number;
  limit?: number;
  verifiedOnly?: boolean;
  careLevel?: CareLevel;
}): Promise<ScorpionSpecies[]> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.skip != null) params.skip = options.skip;
  if (options?.limit != null) params.limit = options.limit;
  if (options?.verifiedOnly) params.verified_only = true;
  if (options?.careLevel) params.care_level = options.careLevel;
  const { data } = await apiClient.get<ScorpionSpecies[]>(
    '/scorpion-species/',
    { params },
  );
  return data;
}

export async function searchScorpionSpecies(
  q: string,
  limit = 10,
): Promise<ScorpionSpecies[]> {
  const { data } = await apiClient.get<ScorpionSpecies[]>(
    '/scorpion-species/search',
    { params: { q, limit } },
  );
  return data;
}

export async function getScorpionSpecies(id: string): Promise<ScorpionSpecies> {
  const { data } = await apiClient.get<ScorpionSpecies>(
    `/scorpion-species/${id}`,
  );
  return data;
}

export async function getScorpionSpeciesBySlug(
  slug: string,
): Promise<ScorpionSpecies> {
  const { data } = await apiClient.get<ScorpionSpecies>(
    `/scorpion-species/by-slug/${slug}`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Scorpion colonies
// ---------------------------------------------------------------------------

export async function listScorpionColonies(): Promise<ScorpionColony[]> {
  const { data } = await apiClient.get<ScorpionColony[]>(
    '/scorpion-colonies/',
  );
  return data;
}

export async function getScorpionColony(
  id: string,
): Promise<ScorpionColonyDetail> {
  const { data } = await apiClient.get<ScorpionColonyDetail>(
    `/scorpion-colonies/${id}`,
  );
  return data;
}

export async function createScorpionColony(
  payload: ScorpionColonyCreate,
): Promise<ScorpionColony> {
  const { data } = await apiClient.post<ScorpionColony>(
    '/scorpion-colonies/',
    payload,
  );
  return data;
}

export async function updateScorpionColony(
  id: string,
  payload: ScorpionColonyUpdate,
): Promise<ScorpionColony> {
  const { data } = await apiClient.put<ScorpionColony>(
    `/scorpion-colonies/${id}`,
    payload,
  );
  return data;
}

export async function deleteScorpionColony(id: string): Promise<void> {
  await apiClient.delete(`/scorpion-colonies/${id}`);
}

// ---------------------------------------------------------------------------
// Per-scorpion logs (Phase 3b uses these)
// ---------------------------------------------------------------------------

export async function listScorpionFeedings(
  scorpionId: string,
): Promise<ScorpionFeedingLog[]> {
  const { data } = await apiClient.get<ScorpionFeedingLog[]>(
    `/scorpions/${scorpionId}/feedings`,
  );
  return data;
}

export async function createScorpionFeeding(
  scorpionId: string,
  payload: ScorpionFeedingCreate,
): Promise<ScorpionFeedingLog> {
  const { data } = await apiClient.post<ScorpionFeedingLog>(
    `/scorpions/${scorpionId}/feedings`,
    payload,
  );
  return data;
}

export async function listScorpionMolts(
  scorpionId: string,
): Promise<ScorpionMoltLog[]> {
  const { data } = await apiClient.get<ScorpionMoltLog[]>(
    `/scorpions/${scorpionId}/molts`,
  );
  return data;
}

export async function createScorpionMolt(
  scorpionId: string,
  payload: ScorpionMoltCreate,
): Promise<ScorpionMoltLog> {
  const { data } = await apiClient.post<ScorpionMoltLog>(
    `/scorpions/${scorpionId}/molts`,
    payload,
  );
  return data;
}

export async function listScorpionSubstrateChanges(
  scorpionId: string,
): Promise<ScorpionSubstrateChange[]> {
  const { data } = await apiClient.get<ScorpionSubstrateChange[]>(
    `/scorpions/${scorpionId}/substrate-changes`,
  );
  return data;
}

export async function createScorpionSubstrateChange(
  scorpionId: string,
  payload: ScorpionSubstrateChangeCreate,
): Promise<ScorpionSubstrateChange> {
  const { data } = await apiClient.post<ScorpionSubstrateChange>(
    `/scorpions/${scorpionId}/substrate-changes`,
    payload,
  );
  return data;
}

export async function listScorpionPhotos(
  scorpionId: string,
): Promise<ScorpionPhoto[]> {
  const { data } = await apiClient.get<ScorpionPhoto[]>(
    `/scorpions/${scorpionId}/photos`,
  );
  return data;
}

/** Multipart photo upload — caller passes a FormData (image file + optional caption). */
export async function uploadScorpionPhoto(
  scorpionId: string,
  form: FormData,
): Promise<ScorpionPhoto> {
  const { data } = await apiClient.post<ScorpionPhoto>(
    `/scorpions/${scorpionId}/photos`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// QR upload session — phone-without-login flow. Owner creates a 20-minute
// session; the returned URL is what the QR code encodes.
// ---------------------------------------------------------------------------

export interface ScorpionUploadSession {
  token: string;
  upload_url: string;
  expires_at: string;
  expires_in_minutes: number;
  taxon: 'scorpion';
  scorpion_name: string;
}

export async function createScorpionUploadSession(
  scorpionId: string,
): Promise<ScorpionUploadSession> {
  const { data } = await apiClient.post<ScorpionUploadSession>(
    `/scorpions/${scorpionId}/upload-session`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Display helpers — shared across the screens we'll build in 3a + 3b.
// ---------------------------------------------------------------------------

/** "Reaper (Pandinus imperator)" → tries name first, falls back to species. */
export function scorpionDisplayName(s: Scorpion): string {
  const parts: string[] = [];
  if (s.name) parts.push(s.name);
  const label = s.common_name || s.scientific_name;
  if (label) parts.push(s.name ? `(${label})` : label);
  return parts.join(' ') || 'Unnamed scorpion';
}

/** Lookup helper for venom-tier badge color. The collection card uses
 * this to render a thin pill so keepers can scan their roster for the
 * medically-significant species at a glance. */
export function venomSeverityColor(
  severity: VenomSeverity | null | undefined,
): { bg: string; fg: string; label: string } {
  switch (severity) {
    case 'medically_significant':
      return { bg: '#fee2e2', fg: '#991b1b', label: 'Hot' };
    case 'moderate':
      return { bg: '#fef3c7', fg: '#92400e', label: 'Moderate' };
    case 'mild':
      return { bg: '#dcfce7', fg: '#166534', label: 'Mild' };
    default:
      return { bg: '#e5e7eb', fg: '#374151', label: 'Unknown' };
  }
}
