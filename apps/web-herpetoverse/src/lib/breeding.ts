/**
 * Reptile breeding API client — pairings, clutches, offspring.
 *
 * Phase 1 backend ships three resources behind /reptile-pairings,
 * /clutches, and /reptile-offspring. The visibility model is per-pairing
 * (`is_private` defaults TRUE), and the parent-genotypes endpoint
 * packages each parent's recorded zygosities so the existing morph
 * calculator can run combineOffspring without a second round-trip.
 */
import { apiFetch } from './apiClient'

// ─── Pairings ──────────────────────────────────────────────────────────

export type Taxon = 'snake' | 'lizard'
export type ReptilePairingType =
  | 'natural'
  | 'cohabitation'
  | 'assisted'
  | 'ai'
export type ReptilePairingOutcome =
  | 'in_progress'
  | 'successful'
  | 'unsuccessful'
  | 'abandoned'
  | 'unknown'

export interface ReptilePairing {
  id: string
  user_id: string
  taxon: Taxon
  male_id: string
  female_id: string
  male_snake_id: string | null
  male_lizard_id: string | null
  female_snake_id: string | null
  female_lizard_id: string | null
  paired_date: string
  separated_date: string | null
  pairing_type: ReptilePairingType
  outcome: ReptilePairingOutcome
  is_private: boolean
  notes: string | null
  created_at: string
  updated_at: string | null
  male_display_name: string | null
  female_display_name: string | null
  clutch_count: number
}

export interface CreatePairingPayload {
  taxon: Taxon
  male_id: string
  female_id: string
  paired_date: string
  separated_date?: string | null
  pairing_type?: ReptilePairingType
  outcome?: ReptilePairingOutcome
  is_private?: boolean
  notes?: string | null
}

export interface UpdatePairingPayload {
  separated_date?: string | null
  pairing_type?: ReptilePairingType
  outcome?: ReptilePairingOutcome
  is_private?: boolean
  notes?: string | null
}

export function listPairings(): Promise<ReptilePairing[]> {
  return apiFetch<ReptilePairing[]>('/api/v1/reptile-pairings/')
}

export function getPairing(id: string): Promise<ReptilePairing> {
  return apiFetch<ReptilePairing>(
    `/api/v1/reptile-pairings/${encodeURIComponent(id)}`,
  )
}

export function createPairing(
  payload: CreatePairingPayload,
): Promise<ReptilePairing> {
  return apiFetch<ReptilePairing>('/api/v1/reptile-pairings/', {
    method: 'POST',
    json: payload,
  })
}

export function updatePairing(
  id: string,
  payload: UpdatePairingPayload,
): Promise<ReptilePairing> {
  return apiFetch<ReptilePairing>(
    `/api/v1/reptile-pairings/${encodeURIComponent(id)}`,
    { method: 'PUT', json: payload },
  )
}

export function deletePairing(id: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/reptile-pairings/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

// ─── Clutches ──────────────────────────────────────────────────────────

export interface CandleEntry {
  date: string
  fertile?: number | null
  slug?: number | null
  notes?: string | null
}

export interface Clutch {
  id: string
  pairing_id: string
  user_id: string
  laid_date: string
  pulled_date: string | null
  expected_hatch_date: string | null
  hatch_date: string | null
  incubation_temp_min_f: string | null
  incubation_temp_max_f: string | null
  incubation_humidity_min_pct: number | null
  incubation_humidity_max_pct: number | null
  expected_count: number | null
  fertile_count: number | null
  slug_count: number | null
  hatched_count: number | null
  viable_count: number | null
  candle_log: CandleEntry[] | null
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string | null
  offspring_count: number
}

export interface CreateClutchPayload {
  pairing_id: string
  laid_date: string
  pulled_date?: string | null
  expected_hatch_date?: string | null
  hatch_date?: string | null
  incubation_temp_min_f?: number | null
  incubation_temp_max_f?: number | null
  incubation_humidity_min_pct?: number | null
  incubation_humidity_max_pct?: number | null
  expected_count?: number | null
  fertile_count?: number | null
  slug_count?: number | null
  hatched_count?: number | null
  viable_count?: number | null
  candle_log?: CandleEntry[] | null
  notes?: string | null
  photo_url?: string | null
}

export interface UpdateClutchPayload {
  pulled_date?: string | null
  expected_hatch_date?: string | null
  hatch_date?: string | null
  incubation_temp_min_f?: number | null
  incubation_temp_max_f?: number | null
  incubation_humidity_min_pct?: number | null
  incubation_humidity_max_pct?: number | null
  expected_count?: number | null
  fertile_count?: number | null
  slug_count?: number | null
  hatched_count?: number | null
  viable_count?: number | null
  candle_log?: CandleEntry[] | null
  notes?: string | null
  photo_url?: string | null
}

export function listClutchesForPairing(
  pairingId: string,
): Promise<Clutch[]> {
  return apiFetch<Clutch[]>(
    `/api/v1/reptile-pairings/${encodeURIComponent(pairingId)}/clutches`,
  )
}

export function getClutch(id: string): Promise<Clutch> {
  return apiFetch<Clutch>(`/api/v1/clutches/${encodeURIComponent(id)}`)
}

export function createClutch(
  payload: CreateClutchPayload,
): Promise<Clutch> {
  return apiFetch<Clutch>('/api/v1/clutches', {
    method: 'POST',
    json: payload,
  })
}

export function updateClutch(
  id: string,
  payload: UpdateClutchPayload,
): Promise<Clutch> {
  return apiFetch<Clutch>(
    `/api/v1/clutches/${encodeURIComponent(id)}`,
    { method: 'PUT', json: payload },
  )
}

export function deleteClutch(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/clutches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
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
  | 'unknown'

export type Zygosity = 'wild' | 'het' | 'hom'

export interface GenotypeEntry {
  /** The gene's common_name — same identifier the morph calculator uses. */
  gene_key: string
  zygosity: Zygosity
}

export interface ReptileOffspring {
  id: string
  clutch_id: string
  user_id: string
  snake_id: string | null
  lizard_id: string | null
  morph_label: string | null
  recorded_genotype: GenotypeEntry[] | null
  status: OffspringStatus
  status_date: string | null
  buyer_info: string | null
  price_sold: string | null
  hatch_weight_g: string | null
  hatch_length_in: string | null
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string | null
}

export interface CreateOffspringPayload {
  clutch_id: string
  snake_id?: string | null
  lizard_id?: string | null
  morph_label?: string | null
  recorded_genotype?: GenotypeEntry[] | null
  status?: OffspringStatus
  status_date?: string | null
  buyer_info?: string | null
  price_sold?: number | null
  hatch_weight_g?: number | null
  hatch_length_in?: number | null
  notes?: string | null
  photo_url?: string | null
}

export interface UpdateOffspringPayload {
  snake_id?: string | null
  lizard_id?: string | null
  morph_label?: string | null
  recorded_genotype?: GenotypeEntry[] | null
  status?: OffspringStatus
  status_date?: string | null
  buyer_info?: string | null
  price_sold?: number | null
  hatch_weight_g?: number | null
  hatch_length_in?: number | null
  notes?: string | null
  photo_url?: string | null
}

export function listOffspringForClutch(
  clutchId: string,
): Promise<ReptileOffspring[]> {
  return apiFetch<ReptileOffspring[]>(
    `/api/v1/clutches/${encodeURIComponent(clutchId)}/offspring`,
  )
}

export function getOffspring(id: string): Promise<ReptileOffspring> {
  return apiFetch<ReptileOffspring>(
    `/api/v1/reptile-offspring/${encodeURIComponent(id)}`,
  )
}

export function createOffspring(
  payload: CreateOffspringPayload,
): Promise<ReptileOffspring> {
  return apiFetch<ReptileOffspring>('/api/v1/reptile-offspring', {
    method: 'POST',
    json: payload,
  })
}

export function updateOffspring(
  id: string,
  payload: UpdateOffspringPayload,
): Promise<ReptileOffspring> {
  return apiFetch<ReptileOffspring>(
    `/api/v1/reptile-offspring/${encodeURIComponent(id)}`,
    { method: 'PUT', json: payload },
  )
}

export function deleteOffspring(id: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/reptile-offspring/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

// ─── Parent genotype handoff for morph predictor ───────────────────────

export interface ParentGenotypeBundle {
  animal_id: string
  display_name: string
  genotypes: GenotypeEntry[]
}

export interface ClutchParentGenotypes {
  pairing_id: string
  clutch_id: string
  taxon: Taxon
  male: ParentGenotypeBundle
  female: ParentGenotypeBundle
  /** Genes both parents have on file — the safe overlap to predict against. */
  overlapping_gene_keys: string[]
  note: string | null
}

export function getClutchParentGenotypes(
  clutchId: string,
): Promise<ClutchParentGenotypes> {
  return apiFetch<ClutchParentGenotypes>(
    `/api/v1/clutches/${encodeURIComponent(clutchId)}/parent-genotypes`,
  )
}

// ─── Display helpers ───────────────────────────────────────────────────

export const PAIRING_TYPE_LABEL: Record<ReptilePairingType, string> = {
  natural: 'Natural',
  cohabitation: 'Cohabitation',
  assisted: 'Assisted',
  ai: 'AI',
}

export const PAIRING_OUTCOME_LABEL: Record<
  ReptilePairingOutcome,
  string
> = {
  in_progress: 'In progress',
  successful: 'Successful',
  unsuccessful: 'Unsuccessful',
  abandoned: 'Abandoned',
  unknown: 'Unknown',
}

export const OFFSPRING_STATUS_LABEL: Record<OffspringStatus, string> = {
  hatched: 'Hatched',
  kept: 'Kept',
  available: 'Available',
  sold: 'Sold',
  traded: 'Traded',
  gifted: 'Gifted',
  deceased: 'Deceased',
  unknown: 'Unknown',
}
