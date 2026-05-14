/**
 * Reptile breeding API client — pairings, clutches, offspring.
 *
 * Mobile port of apps/web-herpetoverse/src/lib/breeding.ts.
 *
 * ADR-003: snakes/lizards/frogs collapsed into one `animals` table, so
 * both pairing parents are `male_animal_id` / `female_animal_id` (plus
 * a denormalized `taxon`), and offspring link to a live record via a
 * single `animal_id`.
 *
 * Per-pairing visibility (`is_private` defaults TRUE) and a parent-
 * genotypes endpoint that packages each parent's recorded zygosities so
 * the morph calculator can run combineOffspring without re-fetching.
 *
 * apiClient baseURL already includes `/api/v1` (see
 * `feedback_mobile_apiclient_baseurl_double_prefix` memory), so all
 * paths here start at the resource, not `/api/v1/<resource>`.
 */
import { apiClient } from '../services/api';

// ─── Pairings ──────────────────────────────────────────────────────────

// ADR-003: frogs joined snakes + lizards under the unified animals table.
export type Taxon = 'snake' | 'lizard' | 'frog';
export type ReptilePairingType =
  | 'natural'
  | 'cohabitation'
  | 'assisted'
  | 'ai';
export type ReptilePairingOutcome =
  | 'in_progress'
  | 'successful'
  | 'unsuccessful'
  | 'abandoned'
  | 'unknown';

export interface ReptilePairing {
  id: string;
  user_id: string;
  taxon: Taxon;
  // ADR-003: both parents are rows in the unified animals table.
  male_animal_id: string;
  female_animal_id: string;
  paired_date: string;
  separated_date: string | null;
  pairing_type: ReptilePairingType;
  outcome: ReptilePairingOutcome;
  is_private: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  male_display_name: string | null;
  female_display_name: string | null;
  clutch_count: number;
}

export interface CreatePairingPayload {
  taxon: Taxon;
  male_id: string;
  female_id: string;
  paired_date: string;
  separated_date?: string | null;
  pairing_type?: ReptilePairingType;
  outcome?: ReptilePairingOutcome;
  is_private?: boolean;
  notes?: string | null;
}

export interface UpdatePairingPayload {
  separated_date?: string | null;
  pairing_type?: ReptilePairingType;
  outcome?: ReptilePairingOutcome;
  is_private?: boolean;
  notes?: string | null;
}

export async function listPairings(): Promise<ReptilePairing[]> {
  const { data } = await apiClient.get<ReptilePairing[]>('/reptile-pairings/');
  return data;
}

export async function getPairing(id: string): Promise<ReptilePairing> {
  const { data } = await apiClient.get<ReptilePairing>(
    `/reptile-pairings/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function createPairing(
  payload: CreatePairingPayload,
): Promise<ReptilePairing> {
  const { data } = await apiClient.post<ReptilePairing>(
    '/reptile-pairings/',
    payload,
  );
  return data;
}

export async function updatePairing(
  id: string,
  payload: UpdatePairingPayload,
): Promise<ReptilePairing> {
  const { data } = await apiClient.put<ReptilePairing>(
    `/reptile-pairings/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deletePairing(id: string): Promise<void> {
  await apiClient.delete(`/reptile-pairings/${encodeURIComponent(id)}`);
}

// ─── Clutches ──────────────────────────────────────────────────────────

export interface CandleEntry {
  date: string;
  fertile?: number | null;
  slug?: number | null;
  notes?: string | null;
}

export interface Clutch {
  id: string;
  pairing_id: string;
  user_id: string;
  laid_date: string;
  pulled_date: string | null;
  expected_hatch_date: string | null;
  hatch_date: string | null;
  incubation_temp_min_f: string | null;
  incubation_temp_max_f: string | null;
  incubation_humidity_min_pct: number | null;
  incubation_humidity_max_pct: number | null;
  expected_count: number | null;
  fertile_count: number | null;
  slug_count: number | null;
  hatched_count: number | null;
  viable_count: number | null;
  candle_log: CandleEntry[] | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string | null;
  offspring_count: number;
}

export interface CreateClutchPayload {
  pairing_id: string;
  laid_date: string;
  pulled_date?: string | null;
  expected_hatch_date?: string | null;
  hatch_date?: string | null;
  incubation_temp_min_f?: number | null;
  incubation_temp_max_f?: number | null;
  incubation_humidity_min_pct?: number | null;
  incubation_humidity_max_pct?: number | null;
  expected_count?: number | null;
  fertile_count?: number | null;
  slug_count?: number | null;
  hatched_count?: number | null;
  viable_count?: number | null;
  candle_log?: CandleEntry[] | null;
  notes?: string | null;
  photo_url?: string | null;
}

export interface UpdateClutchPayload {
  pulled_date?: string | null;
  expected_hatch_date?: string | null;
  hatch_date?: string | null;
  incubation_temp_min_f?: number | null;
  incubation_temp_max_f?: number | null;
  incubation_humidity_min_pct?: number | null;
  incubation_humidity_max_pct?: number | null;
  expected_count?: number | null;
  fertile_count?: number | null;
  slug_count?: number | null;
  hatched_count?: number | null;
  viable_count?: number | null;
  candle_log?: CandleEntry[] | null;
  notes?: string | null;
  photo_url?: string | null;
}

export async function listClutchesForPairing(
  pairingId: string,
): Promise<Clutch[]> {
  const { data } = await apiClient.get<Clutch[]>(
    `/reptile-pairings/${encodeURIComponent(pairingId)}/clutches`,
  );
  return data;
}

export async function getClutch(id: string): Promise<Clutch> {
  const { data } = await apiClient.get<Clutch>(
    `/clutches/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function createClutch(
  payload: CreateClutchPayload,
): Promise<Clutch> {
  const { data } = await apiClient.post<Clutch>('/clutches', payload);
  return data;
}

export async function updateClutch(
  id: string,
  payload: UpdateClutchPayload,
): Promise<Clutch> {
  const { data } = await apiClient.put<Clutch>(
    `/clutches/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteClutch(id: string): Promise<void> {
  await apiClient.delete(`/clutches/${encodeURIComponent(id)}`);
}

// ─── Offspring ─────────────────────────────────────────────────────────

export type OffspringStatus =
  | 'hatched'
  | 'kept'
  | 'available'
  | 'sold'
  | 'traded'
  | 'gifted'
  | 'deceased'
  | 'unknown';

export type Zygosity = 'wild' | 'het' | 'hom';

export interface GenotypeEntry {
  /** The gene's common_name — same identifier the morph calculator uses. */
  gene_key: string;
  zygosity: Zygosity;
}

export interface ReptileOffspring {
  id: string;
  clutch_id: string;
  user_id: string;
  // ADR-003: optional hold-back link to a live animal record.
  animal_id: string | null;
  morph_label: string | null;
  recorded_genotype: GenotypeEntry[] | null;
  status: OffspringStatus;
  status_date: string | null;
  buyer_info: string | null;
  price_sold: string | null;
  hatch_weight_g: string | null;
  hatch_length_in: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CreateOffspringPayload {
  clutch_id: string;
  animal_id?: string | null;
  morph_label?: string | null;
  recorded_genotype?: GenotypeEntry[] | null;
  status?: OffspringStatus;
  status_date?: string | null;
  buyer_info?: string | null;
  price_sold?: number | null;
  hatch_weight_g?: number | null;
  hatch_length_in?: number | null;
  notes?: string | null;
  photo_url?: string | null;
}

export interface UpdateOffspringPayload {
  animal_id?: string | null;
  morph_label?: string | null;
  recorded_genotype?: GenotypeEntry[] | null;
  status?: OffspringStatus;
  status_date?: string | null;
  buyer_info?: string | null;
  price_sold?: number | null;
  hatch_weight_g?: number | null;
  hatch_length_in?: number | null;
  notes?: string | null;
  photo_url?: string | null;
}

export async function listOffspringForClutch(
  clutchId: string,
): Promise<ReptileOffspring[]> {
  const { data } = await apiClient.get<ReptileOffspring[]>(
    `/clutches/${encodeURIComponent(clutchId)}/offspring`,
  );
  return data;
}

export async function getOffspring(id: string): Promise<ReptileOffspring> {
  const { data } = await apiClient.get<ReptileOffspring>(
    `/reptile-offspring/${encodeURIComponent(id)}`,
  );
  return data;
}

export async function createOffspring(
  payload: CreateOffspringPayload,
): Promise<ReptileOffspring> {
  const { data } = await apiClient.post<ReptileOffspring>(
    '/reptile-offspring',
    payload,
  );
  return data;
}

export async function updateOffspring(
  id: string,
  payload: UpdateOffspringPayload,
): Promise<ReptileOffspring> {
  const { data } = await apiClient.put<ReptileOffspring>(
    `/reptile-offspring/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteOffspring(id: string): Promise<void> {
  await apiClient.delete(`/reptile-offspring/${encodeURIComponent(id)}`);
}

// ─── Parent genotype handoff for morph predictor ───────────────────────

export interface ParentGenotypeBundle {
  animal_id: string;
  display_name: string;
  genotypes: GenotypeEntry[];
}

export interface ClutchParentGenotypes {
  pairing_id: string;
  clutch_id: string;
  taxon: Taxon;
  male: ParentGenotypeBundle;
  female: ParentGenotypeBundle;
  /** Genes both parents have on file — the safe overlap to predict against. */
  overlapping_gene_keys: string[];
  note: string | null;
}

export async function getClutchParentGenotypes(
  clutchId: string,
): Promise<ClutchParentGenotypes> {
  const { data } = await apiClient.get<ClutchParentGenotypes>(
    `/clutches/${encodeURIComponent(clutchId)}/parent-genotypes`,
  );
  return data;
}

// ─── Display helpers ───────────────────────────────────────────────────

export const PAIRING_TYPE_LABEL: Record<ReptilePairingType, string> = {
  natural: 'Natural',
  cohabitation: 'Cohabitation',
  assisted: 'Assisted',
  ai: 'AI',
};

export const PAIRING_OUTCOME_LABEL: Record<ReptilePairingOutcome, string> = {
  in_progress: 'In progress',
  successful: 'Successful',
  unsuccessful: 'Unsuccessful',
  abandoned: 'Abandoned',
  unknown: 'Unknown',
};

export const OFFSPRING_STATUS_LABEL: Record<OffspringStatus, string> = {
  hatched: 'Hatched',
  kept: 'Kept',
  available: 'Available',
  sold: 'Sold',
  traded: 'Traded',
  gifted: 'Gifted',
  deceased: 'Deceased',
  unknown: 'Unknown',
};
