/**
 * Generic invert API client + taxon registry — ADR-007.
 *
 * Replaces the per-taxon libs (scorpions.ts / centipedes.ts / whip-spiders.ts)
 * with one config-driven surface that the generic mobile invert screens read.
 * Adding a taxon = one entry in INVERT_TAXA + a backend seed + facade routers.
 *
 * Data plane:
 *  - Animal CRUD reads the unified table: list/get/delete via /inverts/,
 *    create via the per-taxon facade POST /{prefix}/ (the InvertCreate schema
 *    forces taxon there and avoids the generic taxon-pattern coupling).
 *  - Logs + species use the per-taxon facade prefix.
 *
 * apiClient baseURL already includes /api/v1 — paths start at the resource.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Taxon registry — the single source of truth for the generic screens.
// ---------------------------------------------------------------------------

export type InvertTaxon =
  | 'scorpion'
  | 'centipede'
  | 'whip_spider'
  | 'vinegaroon'
  | 'true_spider'
  | 'millipede'
  | 'mantis'
  | 'other';

export type FeedingMode = 'predator' | 'detritivore' | 'omnivore';
export type Safety = 'harmless' | 'venom';

export interface InvertTaxonMeta {
  key: InvertTaxon;
  label: string;
  /** Bottom-left collection card stamp + add-picker glyph. */
  glyph: string;
  /** Per-animal facade prefix for logs/photos/create, e.g. 'whip-spiders'. */
  prefix: string;
  /** Per-taxon species catalog prefix, e.g. 'whip-spider-species'. */
  speciesPrefix: string;
  /** "Leg span" for whip spiders, "Length" for the rest. */
  sizeLabel: string;
  /** Default husbandry framing. Detritivores skip live-prey cadence. */
  feedingMode: FeedingMode;
  /** Drives the care-sheet safety treatment. */
  safety: Safety;
  /** Default enclosure orientation for the add/edit chip group. */
  defaultEnclosureType: 'arboreal' | 'terrestrial' | 'fossorial';
  /** 'other' is the freehand catch-all (no required species match). */
  freeform?: boolean;
}

export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = {
  scorpion: {
    key: 'scorpion', label: 'Scorpion', glyph: '🦂', prefix: 'scorpions',
    speciesPrefix: 'scorpion-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'fossorial',
  },
  centipede: {
    key: 'centipede', label: 'Centipede', glyph: '🐛', prefix: 'centipedes',
    speciesPrefix: 'centipede-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'fossorial',
  },
  whip_spider: {
    key: 'whip_spider', label: 'Whip spider', glyph: '🕸️', prefix: 'whip-spiders',
    speciesPrefix: 'whip-spider-species', sizeLabel: 'Leg span (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'arboreal',
  },
  vinegaroon: {
    key: 'vinegaroon', label: 'Vinegaroon', glyph: '🦂', prefix: 'vinegaroons',
    speciesPrefix: 'vinegaroon-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'fossorial',
  },
  true_spider: {
    key: 'true_spider', label: 'True spider', glyph: '🕷', prefix: 'true-spiders',
    speciesPrefix: 'true-spider-species', sizeLabel: 'Leg span (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'arboreal',
  },
  millipede: {
    key: 'millipede', label: 'Millipede', glyph: '🪱', prefix: 'millipedes',
    speciesPrefix: 'millipede-species', sizeLabel: 'Length (mm)', feedingMode: 'detritivore',
    safety: 'harmless', defaultEnclosureType: 'terrestrial',
  },
  mantis: {
    key: 'mantis', label: 'Mantis', glyph: '🦗', prefix: 'mantises',
    speciesPrefix: 'mantis-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'arboreal',
  },
  other: {
    key: 'other', label: 'Other invertebrate', glyph: '🐾', prefix: 'other-inverts',
    speciesPrefix: 'other-invert-species', sizeLabel: 'Size (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'terrestrial', freeform: true,
  },
};

/** Taxa exposed in the add-picker / collection filter, in display order. */
export const INVERT_TAXON_ORDER: InvertTaxon[] = [
  'scorpion', 'centipede', 'whip_spider', 'vinegaroon',
  'true_spider', 'millipede', 'mantis', 'other',
];

export function isInvertTaxon(t: string | null | undefined): t is InvertTaxon {
  return t != null && t in INVERT_TAXA;
}

export const FEEDING_MODE_LABELS: Record<FeedingMode, string> = {
  predator: 'Predator (live prey)',
  detritivore: 'Detritivore (decaying matter)',
  omnivore: 'Omnivore',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
export type CareLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Invert {
  id: string;
  user_id: string;
  taxon: InvertTaxon;
  species_id: string | null;
  enclosure_id: string | null;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;
  date_acquired: string | null;
  source: Source | null;
  price_paid: string | null;
  current_instar: number | null;
  current_length_mm: string | null;
  enclosure_type: string | null;
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

export type InvertCreate = Partial<Omit<Invert, 'id' | 'user_id' | 'taxon' | 'created_at' | 'updated_at' | 'is_public'>>;
export type InvertUpdate = InvertCreate;

export interface InvertSpecies {
  id: string;
  taxon: InvertTaxon;
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
  venom_severity: string | null;
  venom_notes: string | null;
  care_guide: string | null;
  image_url: string | null;
  is_verified: boolean;
  times_kept: number;
}

export interface InvertFeedingLog { id: string; invert_id: string | null; fed_at: string; food_type: string | null; accepted: boolean; notes: string | null; }
export interface InvertMoltLog { id: string; invert_id: string | null; molted_at: string; notes: string | null; }
export interface InvertSubstrateChange { id: string; invert_id: string | null; changed_at: string; substrate_type: string | null; substrate_depth: string | null; reason: string | null; notes: string | null; }
export interface InvertPhoto { id: string; url: string; thumbnail_url: string | null; caption: string | null; }

// ---------------------------------------------------------------------------
// Animal CRUD
// ---------------------------------------------------------------------------

/** List the whole cross-taxon collection (every invert taxon). */
export async function listInverts(): Promise<Invert[]> {
  const { data } = await apiClient.get<Invert[]>('/inverts/');
  return data;
}

export async function getInvert(id: string): Promise<Invert> {
  const { data } = await apiClient.get<Invert>(`/inverts/${id}`);
  return data;
}

/** Create via the per-taxon facade (taxon forced server-side). */
export async function createInvert(taxon: InvertTaxon, payload: InvertCreate): Promise<Invert> {
  const { data } = await apiClient.post<Invert>(`/${INVERT_TAXA[taxon].prefix}/`, payload);
  return data;
}

export async function updateInvert(id: string, payload: InvertUpdate): Promise<Invert> {
  const { data } = await apiClient.put<Invert>(`/inverts/${id}`, payload);
  return data;
}

export async function deleteInvert(id: string): Promise<void> {
  await apiClient.delete(`/inverts/${id}`);
}

// ---------------------------------------------------------------------------
// Species catalog (public)
// ---------------------------------------------------------------------------

export async function listInvertSpecies(taxon: InvertTaxon, limit = 200): Promise<InvertSpecies[]> {
  const { data } = await apiClient.get<InvertSpecies[]>(`/${INVERT_TAXA[taxon].speciesPrefix}/`, { params: { limit } });
  return data;
}

export async function searchInvertSpecies(taxon: InvertTaxon, q: string, limit = 8): Promise<InvertSpecies[]> {
  const { data } = await apiClient.get<InvertSpecies[]>(`/${INVERT_TAXA[taxon].speciesPrefix}/search`, { params: { q, limit } });
  return data;
}

export async function getInvertSpecies(id: string): Promise<InvertSpecies> {
  // The unified catalog returns any taxon by id.
  const { data } = await apiClient.get<InvertSpecies>(`/invert-species/${id}`);
  return data;
}

// ---------------------------------------------------------------------------
// Logs (parented by invert_id, reached through the per-taxon prefix)
// ---------------------------------------------------------------------------

const prefixFor = (taxon: InvertTaxon) => INVERT_TAXA[taxon].prefix;

export async function listInvertFeedings(taxon: InvertTaxon, id: string): Promise<InvertFeedingLog[]> {
  const { data } = await apiClient.get<InvertFeedingLog[]>(`/${prefixFor(taxon)}/${id}/feedings`);
  return data;
}
export async function createInvertFeeding(taxon: InvertTaxon, id: string, payload: { fed_at: string; food_type?: string | null; accepted?: boolean; notes?: string | null }): Promise<InvertFeedingLog> {
  const { data } = await apiClient.post<InvertFeedingLog>(`/${prefixFor(taxon)}/${id}/feedings`, payload);
  return data;
}
export async function listInvertMolts(taxon: InvertTaxon, id: string): Promise<InvertMoltLog[]> {
  const { data } = await apiClient.get<InvertMoltLog[]>(`/${prefixFor(taxon)}/${id}/molts`);
  return data;
}
export async function createInvertMolt(taxon: InvertTaxon, id: string, payload: { molted_at: string; notes?: string | null }): Promise<InvertMoltLog> {
  const { data } = await apiClient.post<InvertMoltLog>(`/${prefixFor(taxon)}/${id}/molts`, payload);
  return data;
}
export async function listInvertSubstrateChanges(taxon: InvertTaxon, id: string): Promise<InvertSubstrateChange[]> {
  const { data } = await apiClient.get<InvertSubstrateChange[]>(`/${prefixFor(taxon)}/${id}/substrate-changes`);
  return data;
}
export async function createInvertSubstrateChange(taxon: InvertTaxon, id: string, payload: { changed_at: string; substrate_type?: string | null; substrate_depth?: string | null; reason?: string | null; notes?: string | null }): Promise<InvertSubstrateChange> {
  const { data } = await apiClient.post<InvertSubstrateChange>(`/${prefixFor(taxon)}/${id}/substrate-changes`, payload);
  return data;
}
export async function listInvertPhotos(taxon: InvertTaxon, id: string): Promise<InvertPhoto[]> {
  const { data } = await apiClient.get<InvertPhoto[]>(`/${prefixFor(taxon)}/${id}/photos`);
  return data;
}
export async function uploadInvertPhoto(taxon: InvertTaxon, id: string, form: FormData): Promise<InvertPhoto> {
  const { data } = await apiClient.post<InvertPhoto>(`/${prefixFor(taxon)}/${id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function invertDisplayName(i: Invert): string {
  return i.name || i.common_name || i.scientific_name || `Unnamed ${INVERT_TAXA[i.taxon]?.label.toLowerCase() ?? 'invert'}`;
}
