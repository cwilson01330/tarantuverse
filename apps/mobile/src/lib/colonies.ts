/**
 * Colony mode API client — ADR-010.
 *
 * Population-level tracking for communal/colony keepers (roaches, millipedes,
 * isopods/springtails-as-"other"). A colony is a first-class collection entry
 * with per-life-stage headcounts, tracked as ONE entry (counts 1 toward the
 * free cap regardless of headcount).
 *
 * Modeled on the FeederColony pattern (JSONB stage buckets + an events stream
 * that adjusts the buckets). The taxon vocabulary is the SAME shared invert
 * registry (INVERT_TAXA / INVERT_TAXON_ORDER) — colonies do not invent a
 * parallel taxon list.
 *
 * apiClient baseURL already includes /api/v1 — paths start at /colonies.
 * Collection endpoints use a trailing slash; by-id/action endpoints do not.
 */
import { apiClient } from '../services/api';
import type { InvertTaxon, Source, Visibility } from './inverts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-life-stage buckets. Casual keepers can dump everything in "mixed". */
export type StageCounts = Record<string, number>;

export type ColonyEventType =
  | 'birth'
  | 'death'
  | 'added'
  | 'removed'
  | 'cannibalism'
  | 'aggression'
  | 'molt_found'
  | 'split'
  | 'merge'
  | 'observation'
  | 'count_correction';

export interface ColonyListItem {
  id: string;
  taxon: InvertTaxon;
  name: string;
  photo_url: string | null;
  total_count: number;
  count_is_estimated: boolean;
  stage_counts: StageCounts;
  is_active: boolean;
  species_display_name: string | null;
  species_scientific_name: string | null;
  species_missing: boolean;
  /** Last ACCEPTED feeding. Lets the collection card read "Fed 4d ago" like
   *  every other card. */
  last_feeding_date?: string | null;
  days_since_last_feeding?: number | null;
}

export interface Colony {
  id: string;
  user_id: string;
  taxon: InvertTaxon;
  species_id: string | null;
  enclosure_id: string | null;
  name: string;
  date_acquired: string | null;
  founded_date: string | null;
  source: Source | null;
  stage_counts: StageCounts;
  count_is_estimated: boolean;
  /** terrestrial | arboreal | fossorial. Same vocabulary as inverts. */
  enclosure_type: string | null;
  /** Free text, e.g. "12x12x12 inches". Floor space per animal is the main
   *  driver of communal success, so this matters more here than on a solitary
   *  animal — it was missing entirely until 2026-07-29. */
  enclosure_size: string | null;
  substrate_type: string | null;
  substrate_depth: string | null;
  last_substrate_change: string | null;
  target_temp_min: string | null;
  target_temp_max: string | null;
  target_humidity_min: string | null;
  target_humidity_max: string | null;
  water_dish: boolean;
  notes: string | null;
  photo_url: string | null;
  visibility: Visibility | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  total_count: number;
  species_display_name: string | null;
  species_scientific_name: string | null;
  species_missing: boolean;
}

export interface ColonyCreate {
  name: string;
  taxon: InvertTaxon;
  species_id?: string | null;
  enclosure_id?: string | null;
  date_acquired?: string | null;
  founded_date?: string | null;
  source?: Source | null;
  stage_counts?: StageCounts | null;
  count_is_estimated?: boolean;
  enclosure_type?: string | null;
  enclosure_size?: string | null;
  substrate_type?: string | null;
  substrate_depth?: string | null;
  last_substrate_change?: string | null;
  target_temp_min?: string | null;
  target_temp_max?: string | null;
  target_humidity_min?: string | null;
  target_humidity_max?: string | null;
  water_dish?: boolean;
  notes?: string | null;
  photo_url?: string | null;
  visibility?: Visibility | null;
}

/** Partial update — everything optional (name/taxon not required on PUT). */
export type ColonyUpdate = Partial<Omit<ColonyCreate, 'taxon'>> & {
  taxon?: InvertTaxon;
  is_active?: boolean;
};

export interface ColonyEvent {
  id: string;
  colony_id: string;
  user_id: string;
  event_type: ColonyEventType;
  stage: string | null;
  count_delta: number | null;
  occurred_at: string; // YYYY-MM-DD
  severity: string | null;
  notes: string | null;
  created_at: string;
}

export interface ColonyEventCreate {
  event_type: ColonyEventType;
  stage?: string | null;
  count_delta?: number | null;
  occurred_at?: string | null;
  severity?: string | null;
  notes?: string | null;
}

export type ColonyEventUpdate = Partial<ColonyEventCreate>;

// ---------------------------------------------------------------------------
// Colony CRUD
// ---------------------------------------------------------------------------

export async function listColonies(includeInactive = false): Promise<ColonyListItem[]> {
  const { data } = await apiClient.get<ColonyListItem[]>('/colonies/', {
    params: { include_inactive: includeInactive },
  });
  return data;
}

export async function getColony(id: string): Promise<Colony> {
  const { data } = await apiClient.get<Colony>(`/colonies/${id}`);
  return data;
}

export async function createColony(payload: ColonyCreate): Promise<Colony> {
  const { data } = await apiClient.post<Colony>('/colonies/', payload);
  return data;
}

export async function updateColony(id: string, payload: ColonyUpdate): Promise<Colony> {
  const { data } = await apiClient.put<Colony>(`/colonies/${id}`, payload);
  return data;
}

export async function deleteColony(id: string): Promise<void> {
  await apiClient.delete(`/colonies/${id}`);
}

// ---------------------------------------------------------------------------
// Colony events (population lifecycle — adjusts stage_counts on write)
// ---------------------------------------------------------------------------

export async function listColonyEvents(id: string): Promise<ColonyEvent[]> {
  const { data } = await apiClient.get<ColonyEvent[]>(`/colonies/${id}/events`);
  return data;
}

export async function createColonyEvent(id: string, payload: ColonyEventCreate): Promise<ColonyEvent> {
  const { data } = await apiClient.post<ColonyEvent>(`/colonies/${id}/events`, payload);
  return data;
}

export async function updateColonyEvent(eventId: string, payload: ColonyEventUpdate): Promise<ColonyEvent> {
  const { data } = await apiClient.put<ColonyEvent>(`/colonies/events/${eventId}`, payload);
  return data;
}

export async function deleteColonyEvent(eventId: string): Promise<void> {
  await apiClient.delete(`/colonies/events/${eventId}`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Sum a stage_counts object into a total headcount. */
export function sumStageCounts(counts: StageCounts | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

/** "≈N" when estimated, "N" otherwise. */
export function formatColonyCount(total: number, estimated: boolean): string {
  const n = total.toLocaleString();
  return estimated ? `≈${n}` : n;
}

/** Human-readable label for an event type. */
export const COLONY_EVENT_LABELS: Record<ColonyEventType, string> = {
  birth: 'Birth',
  death: 'Death',
  added: 'Added',
  removed: 'Removed',
  cannibalism: 'Cannibalism',
  aggression: 'Aggression',
  molt_found: 'Molt found',
  split: 'Split',
  merge: 'Merge',
  observation: 'Observation',
  count_correction: 'Count correction',
};

/** Emoji glyph for an event type — used in the timeline. */
export const COLONY_EVENT_ICONS: Record<ColonyEventType, string> = {
  birth: '🐣',
  death: '💀',
  added: '➕',
  removed: '➖',
  cannibalism: '🩸',
  aggression: '⚔️',
  molt_found: '🐚',
  split: '🔀',
  merge: '🔗',
  observation: '📝',
  count_correction: '✏️',
};

/** Event types that carry a severity rating (aggression/cannibalism). */
export function eventHasSeverity(t: ColonyEventType): boolean {
  return t === 'aggression' || t === 'cannibalism';
}

// ---------------------------------------------------------------------------
// Photos + feedings (cph_20260729_colony_logs)
//
// A communal tarantula is a display animal housed as a group, so it gets the
// same gallery and feeding log as any other animal. Feeder colonies can use
// these too — nothing is withheld — but the UI doesn't push them at it.
// ---------------------------------------------------------------------------

export interface ColonyPhoto {
  id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

export interface ColonyFeedingLog {
  id: string;
  colony_id: string | null;
  fed_at: string;
  food_type: string | null;
  food_size: string | null;
  /** How many prey items went in. THE number for a group feeding — you don't
   *  feed a communal "a cricket", you drop six in for eleven spiders, and the
   *  ratio is what tells you whether the colony is being fed enough. */
  quantity: number | null;
  /** For a colony this means "did the GROUP take it", not any one animal —
   *  a communal is fed as a unit and you can't see which spider ate what. */
  accepted: boolean;
  notes: string | null;
}

/**
 * A molt found in the colony.
 *
 * Unattributed by definition — you can't tell which of eleven spiders shed it,
 * which is exactly why `is_unidentified` is forced true server-side. The
 * measurement fields exist because the table is shared with individual animals;
 * for a colony they're expected to stay null, since you can't weigh a molt's
 * owner when you don't know who that is.
 *
 * Worth more here than for a solitary animal, not less: for a communal a shed
 * skin is often the only observation that surfaces on its own, and sexing a
 * communal means sexing molts.
 */
export interface ColonyMoltLog {
  id: string;
  colony_id: string | null;
  molted_at: string;
  notes: string | null;
  image_url: string | null;
  is_unidentified: boolean;
}

export async function listColonyMolts(id: string): Promise<ColonyMoltLog[]> {
  const { data } = await apiClient.get<ColonyMoltLog[]>(`/colonies/${id}/molts`);
  return data;
}

export async function createColonyMolt(
  id: string,
  payload: { molted_at: string; notes?: string | null; image_url?: string | null },
): Promise<ColonyMoltLog> {
  const { data } = await apiClient.post<ColonyMoltLog>(`/colonies/${id}/molts`, payload);
  return data;
}

/** Shared with individual animals — molts resolve ownership through whichever
 *  parent they carry, so no colony-specific delete route was needed. */
export async function deleteColonyMolt(moltId: string): Promise<void> {
  await apiClient.delete(`/molts/${moltId}`);
}

export async function listColonyPhotos(id: string): Promise<ColonyPhoto[]> {
  const { data } = await apiClient.get<ColonyPhoto[]>(`/colonies/${id}/photos`);
  return data;
}

export async function listColonyFeedings(id: string): Promise<ColonyFeedingLog[]> {
  const { data } = await apiClient.get<ColonyFeedingLog[]>(`/colonies/${id}/feedings`);
  return data;
}

export async function createColonyFeeding(
  id: string,
  payload: {
    fed_at: string;
    food_type?: string | null;
    food_size?: string | null;
    quantity?: number | null;
    accepted?: boolean;
    notes?: string | null;
  },
): Promise<ColonyFeedingLog> {
  const { data } = await apiClient.post<ColonyFeedingLog>(`/colonies/${id}/feedings`, payload);
  return data;
}

/** Promote a photo to the colony's hero. Shares the generic photo route —
 *  `set-main` resolves ownership through the photo's parent, so it needed no
 *  colony-specific handling. */
export async function setColonyMainPhoto(photoId: string): Promise<void> {
  await apiClient.patch(`/photos/${photoId}/set-main`);
}

export async function deleteColonyPhoto(photoId: string): Promise<void> {
  await apiClient.delete(`/photos/${photoId}`);
}

export async function uploadColonyPhoto(id: string, form: FormData): Promise<ColonyPhoto> {
  const { data } = await apiClient.post<ColonyPhoto>(`/colonies/${id}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
