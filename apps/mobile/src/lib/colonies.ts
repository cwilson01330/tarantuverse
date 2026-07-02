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
