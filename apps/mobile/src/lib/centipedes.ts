/**
 * Centipede API client — ADR-005 Phase C3.
 *
 * Covers the C2 backend surface so mobile screens have a single
 * import path for everything centipede-related:
 *
 *  - Centipede CRUD                       /centipedes/
 *  - CentipedeSpecies catalog (public)    /centipede-species/
 *  - Per-centipede logs                   /centipedes/{id}/{feedings|molts|substrate-changes|photos}
 *  - QR upload sessions                   /centipedes/{id}/upload-session
 *
 * Centipedes launch on the unified `inverts` table — there's no
 * legacy centipedes table. The /centipedes/ routes are a per-taxon
 * facade over `inverts WHERE taxon='centipede'`. From the mobile
 * client's perspective they behave exactly like /scorpions/.
 *
 * Notably absent: centipedes are SOLITARY (cannibalistic), so there's
 * no /centipede-colonies/ surface here.
 *
 * IMPORTANT — apiClient baseURL already includes `/api/v1` (see the
 * mobile_apiclient_baseurl_double_prefix memory). All paths start at
 * the resource, e.g. '/centipedes/', NOT '/api/v1/centipedes/'.
 *
 * Mirrors the shape of `./scorpions.ts`.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Enum-ish types — lowercase wire values, same as the scorpion + tarantula
// APIs. (DB `sex` / `source` are UPPERCASE PG enums but the API surfaces
// them lowercase.)
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
export type CentipedeEnclosureType = 'terrestrial' | 'arboreal' | 'fossorial';

export type CareLevel = 'beginner' | 'intermediate' | 'advanced';
export type VenomSeverity = 'mild' | 'moderate' | 'medically_significant';
/** Anamorphic centipedes add segments with each molt; epimorphic species
 * hatch with their full adult segment count. Every species in the v1
 * seed is epimorphic but the schema supports both. */
export type DevelopmentalClass = 'anamorphic' | 'epimorphic';
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

export const DEVELOPMENTAL_CLASS_LABELS: Record<DevelopmentalClass, string> = {
  anamorphic: 'Anamorphic (adds segments with each molt)',
  epimorphic: 'Epimorphic (hatches with adult segment count)',
};

// ---------------------------------------------------------------------------
// Domain types — mirror apps/api/app/schemas/centipede.py + invert_species.py.
// ---------------------------------------------------------------------------

export interface Centipede {
  id: string;
  user_id: string;
  /** Always 'centipede' for rows reached through this lib. */
  taxon: 'centipede';
  species_id: string | null;
  enclosure_id: string | null;

  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;

  date_acquired: string | null;
  source: Source | null;
  price_paid: string | null;

  /** Centipede + scorpion shared — instar number. Most pet trade
   * Scolopendra fall in the 1-10 range. */
  current_instar: number | null;
  /** Total body length in mm (NOT leg span). */
  current_length_mm: string | null;
  /** Centipede-specific — most Scolopendromorpha have 21. */
  current_segment_count: number | null;
  /** Centipede-specific — usually equals segment count. */
  current_leg_pair_count: number | null;

  enclosure_type: CentipedeEnclosureType | null;
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

export interface CentipedeCreate {
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
  current_segment_count?: number | null;
  current_leg_pair_count?: number | null;
  enclosure_type?: CentipedeEnclosureType | null;
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

export type CentipedeUpdate = Partial<CentipedeCreate>;

export interface CentipedeSpecies {
  id: string;
  /** Always 'centipede' here — the underlying table is invert_species
   * but the per-taxon route filters. */
  taxon: 'centipede';
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

  venom_severity: VenomSeverity | null;
  venom_notes: string | null;

  /** Centipede-specific — drives the care-sheet developmental-biology callout. */
  developmental_class: DevelopmentalClass | null;
  typical_segment_count: number | null;
  typical_leg_pair_count: number | null;

  care_guide: string | null;
  image_url: string | null;

  is_verified: boolean;
  times_kept: number;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Log types — same DB tables as tarantula/scorpion logs, but the row is
// parented only by invert_id. The mobile lib exposes them as
// CentipedeFeedingLog / CentipedeMoltLog / CentipedeSubstrateChange so a
// screen can type its state without referencing the polymorphic shape.
// ---------------------------------------------------------------------------

export interface CentipedeFeedingLog {
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

export interface CentipedeFeedingCreate {
  fed_at: string;
  food_type?: string | null;
  food_size?: string | null;
  quantity?: number;
  accepted?: boolean;
  notes?: string | null;
}

export interface CentipedeMoltLog {
  id: string;
  invert_id: string | null;
  molted_at: string;
  premolt_started_at: string | null;
  /** Tarantula-domain field, usually null for centipedes. Reserved
   * for keepers who want to log total body length pre/post-molt via
   * the existing molt schema. */
  leg_span_before: string | null;
  leg_span_after: string | null;
  /** Grams */
  weight_before: string | null;
  weight_after: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

export interface CentipedeMoltCreate {
  molted_at: string;
  premolt_started_at?: string | null;
  leg_span_before?: string | number | null;
  leg_span_after?: string | number | null;
  weight_before?: string | number | null;
  weight_after?: string | number | null;
  notes?: string | null;
  image_url?: string | null;
}

export interface CentipedeSubstrateChange {
  id: string;
  invert_id: string | null;
  changed_at: string;
  substrate_type: string | null;
  substrate_depth: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface CentipedeSubstrateChangeCreate {
  changed_at: string;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface CentipedePhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Centipede CRUD
// ---------------------------------------------------------------------------

export async function listCentipedes(): Promise<Centipede[]> {
  const { data } = await apiClient.get<Centipede[]>('/centipedes/');
  return data;
}

export async function getCentipede(id: string): Promise<Centipede> {
  const { data } = await apiClient.get<Centipede>(`/centipedes/${id}`);
  return data;
}

export async function createCentipede(
  payload: CentipedeCreate,
): Promise<Centipede> {
  const { data } = await apiClient.post<Centipede>('/centipedes/', payload);
  return data;
}

export async function updateCentipede(
  id: string,
  payload: CentipedeUpdate,
): Promise<Centipede> {
  const { data } = await apiClient.put<Centipede>(`/centipedes/${id}`, payload);
  return data;
}

export async function deleteCentipede(id: string): Promise<void> {
  await apiClient.delete(`/centipedes/${id}`);
}

// ---------------------------------------------------------------------------
// Centipede species catalog (public reads)
// ---------------------------------------------------------------------------

export async function listCentipedeSpecies(options?: {
  skip?: number;
  limit?: number;
  verifiedOnly?: boolean;
  careLevel?: CareLevel;
}): Promise<CentipedeSpecies[]> {
  const params: Record<string, string | number | boolean> = {};
  if (options?.skip != null) params.skip = options.skip;
  if (options?.limit != null) params.limit = options.limit;
  if (options?.verifiedOnly) params.verified_only = true;
  if (options?.careLevel) params.care_level = options.careLevel;
  const { data } = await apiClient.get<CentipedeSpecies[]>(
    '/centipede-species/',
    { params },
  );
  return data;
}

export async function searchCentipedeSpecies(
  q: string,
  limit = 10,
): Promise<CentipedeSpecies[]> {
  const { data } = await apiClient.get<CentipedeSpecies[]>(
    '/centipede-species/search',
    { params: { q, limit } },
  );
  return data;
}

export async function getCentipedeSpecies(id: string): Promise<CentipedeSpecies> {
  const { data } = await apiClient.get<CentipedeSpecies>(
    `/centipede-species/${id}`,
  );
  return data;
}

export async function getCentipedeSpeciesBySlug(
  slug: string,
): Promise<CentipedeSpecies> {
  const { data } = await apiClient.get<CentipedeSpecies>(
    `/centipede-species/by-slug/${slug}`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Per-centipede logs
// ---------------------------------------------------------------------------

export async function listCentipedeFeedings(
  centipedeId: string,
): Promise<CentipedeFeedingLog[]> {
  const { data } = await apiClient.get<CentipedeFeedingLog[]>(
    `/centipedes/${centipedeId}/feedings`,
  );
  return data;
}

export async function createCentipedeFeeding(
  centipedeId: string,
  payload: CentipedeFeedingCreate,
): Promise<CentipedeFeedingLog> {
  const { data } = await apiClient.post<CentipedeFeedingLog>(
    `/centipedes/${centipedeId}/feedings`,
    payload,
  );
  return data;
}

export async function listCentipedeMolts(
  centipedeId: string,
): Promise<CentipedeMoltLog[]> {
  const { data } = await apiClient.get<CentipedeMoltLog[]>(
    `/centipedes/${centipedeId}/molts`,
  );
  return data;
}

export async function createCentipedeMolt(
  centipedeId: string,
  payload: CentipedeMoltCreate,
): Promise<CentipedeMoltLog> {
  const { data } = await apiClient.post<CentipedeMoltLog>(
    `/centipedes/${centipedeId}/molts`,
    payload,
  );
  return data;
}

export async function listCentipedeSubstrateChanges(
  centipedeId: string,
): Promise<CentipedeSubstrateChange[]> {
  const { data } = await apiClient.get<CentipedeSubstrateChange[]>(
    `/centipedes/${centipedeId}/substrate-changes`,
  );
  return data;
}

export async function createCentipedeSubstrateChange(
  centipedeId: string,
  payload: CentipedeSubstrateChangeCreate,
): Promise<CentipedeSubstrateChange> {
  const { data } = await apiClient.post<CentipedeSubstrateChange>(
    `/centipedes/${centipedeId}/substrate-changes`,
    payload,
  );
  return data;
}

export async function listCentipedePhotos(
  centipedeId: string,
): Promise<CentipedePhoto[]> {
  const { data } = await apiClient.get<CentipedePhoto[]>(
    `/centipedes/${centipedeId}/photos`,
  );
  return data;
}

/** Multipart photo upload — caller passes a FormData (image file + optional caption). */
export async function uploadCentipedePhoto(
  centipedeId: string,
  form: FormData,
): Promise<CentipedePhoto> {
  const { data } = await apiClient.post<CentipedePhoto>(
    `/centipedes/${centipedeId}/photos`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// QR upload session
// ---------------------------------------------------------------------------

export interface CentipedeUploadSession {
  token: string;
  upload_url: string;
  expires_at: string;
  expires_in_minutes: number;
  taxon: 'centipede';
  centipede_name: string;
}

export async function createCentipedeUploadSession(
  centipedeId: string,
): Promise<CentipedeUploadSession> {
  const { data } = await apiClient.post<CentipedeUploadSession>(
    `/centipedes/${centipedeId}/upload-session`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "Stinger (Scolopendra heros)" → tries name first, falls back to species. */
export function centipedeDisplayName(c: Centipede): string {
  const parts: string[] = [];
  if (c.name) parts.push(c.name);
  const label = c.common_name || c.scientific_name;
  if (label) parts.push(c.name ? `(${label})` : label);
  return parts.join(' ') || 'Unnamed centipede';
}

/** Venom-tier pill colors — same palette as scorpions so the collection
 * card can show a consistent "hot keepers only" badge across taxa. */
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
