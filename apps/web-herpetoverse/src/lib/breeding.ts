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
import type { AnimalTaxon } from './animals'

// ─── Pairings ──────────────────────────────────────────────────────────

// ADR-011: taxon is the flexible animals discriminator — any group can be
// paired (backend enforces same-taxon parents), so this is just AnimalTaxon.
export type Taxon = AnimalTaxon
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
  // ADR-003: both parents are rows in the unified animals table; the
  // per-taxon *_snake_id / *_lizard_id columns were collapsed.
  male_animal_id: string
  female_animal_id: string
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
  // ADR-003: optional hold-back link to a live animal record.
  animal_id: string | null
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
  animal_id?: string | null
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
  animal_id?: string | null
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

// ─── Limits ────────────────────────────────────────────────────────────

/** Upper bound on every clutch count — mirrors CLUTCH_COUNT_MAX in
 *  apps/api/app/schemas/reptile_breeding.py. Was 200, which blocked frog
 *  and toad spawns (often thousands of eggs). Keep the two in step. */
export const CLUTCH_COUNT_MAX = 5000

// ─── Breeding vocabulary ───────────────────────────────────────────────
//
// The breeding tables were built for snakes, so the schema says
// `slug_count` and the forms said "Slugs" and "reptile" to every keeper.
// "Slug" is snake and gecko hobby slang for an infertile egg; a frog keeper
// counting a spawn, or a turtle keeper, shouldn't be told to count slugs.
// Mirror of apps/mobile-herpetoverse/src/lib/breeding.ts::BREEDING_VOCABULARY
// — keep the two in lockstep. Same idea as TV's BREEDING_VOCABULARY.

export interface BreedingVocab {
  /** Animal noun, singular / plural ("snake" / "snakes"; "animal" for Other). */
  animal: string
  animals: string
  /** Clutch count label on the detail page ("Eggs"; "Eggs or young"). */
  countLabel: string
  /** Create-form label for the first count. */
  initialCountLabel: string
  initialCountHint: string
  countPlaceholder: string
  /** Infertile count: "Slugs" for snakes + lizards, "Infertile" otherwise. */
  infertileLabel: string
  infertileFormLabel: string
  /** One hatched young ("Hatchling"; "Offspring" where hatchling is wrong). */
  young: string
  /** Lower-case singular for sentences ("hatchling"). */
  youngLower: string
  /** Empty offspring list. */
  emptyOffspring: string
  /** Clutch-create notes placeholder. */
  clutchNotesPlaceholder: string
}

const EGG_LAYER_HINT = 'Total eggs laid — fertile, infertile and anything in-between.'

export const BREEDING_VOCABULARY: Record<Taxon, BreedingVocab> = {
  snake: {
    animal: 'snake', animals: 'snakes',
    countLabel: 'Eggs', initialCountLabel: 'Initial egg count',
    initialCountHint: 'Total eggs laid — fertile + slug + anything in-between. Live-bearers: count the young.',
    countPlaceholder: 'e.g. 8',
    infertileLabel: 'Slugs', infertileFormLabel: 'Slugs (infertile)',
    young: 'Hatchling', youngLower: 'hatchling',
    emptyOffspring: 'No offspring recorded yet. Add the first one as eggs hatch.',
    clutchNotesPlaceholder: 'Maternal vs. artificial incubation, candling notes, hiccups…',
  },
  lizard: {
    animal: 'lizard', animals: 'lizards',
    countLabel: 'Eggs', initialCountLabel: 'Initial egg count',
    initialCountHint: 'Total eggs laid — fertile + slug + anything in-between.',
    countPlaceholder: 'e.g. 2',
    infertileLabel: 'Slugs', infertileFormLabel: 'Slugs (infertile)',
    young: 'Hatchling', youngLower: 'hatchling',
    emptyOffspring: 'No offspring recorded yet. Add the first one as eggs hatch.',
    clutchNotesPlaceholder: 'Incubation medium, candling notes, hiccups…',
  },
  turtle: {
    animal: 'turtle', animals: 'turtles',
    countLabel: 'Eggs', initialCountLabel: 'Initial egg count',
    initialCountHint: EGG_LAYER_HINT,
    countPlaceholder: 'e.g. 10',
    infertileLabel: 'Infertile', infertileFormLabel: 'Infertile',
    young: 'Hatchling', youngLower: 'hatchling',
    emptyOffspring: 'No offspring recorded yet. Add the first one as eggs hatch.',
    clutchNotesPlaceholder: 'Nesting site, incubation medium, candling notes…',
  },
  tortoise: {
    animal: 'tortoise', animals: 'tortoises',
    countLabel: 'Eggs', initialCountLabel: 'Initial egg count',
    initialCountHint: EGG_LAYER_HINT,
    countPlaceholder: 'e.g. 6',
    infertileLabel: 'Infertile', infertileFormLabel: 'Infertile',
    young: 'Hatchling', youngLower: 'hatchling',
    emptyOffspring: 'No offspring recorded yet. Add the first one as eggs hatch.',
    clutchNotesPlaceholder: 'Nesting site, incubation medium, candling notes…',
  },
  frog: {
    animal: 'frog', animals: 'frogs',
    countLabel: 'Eggs', initialCountLabel: 'Initial egg count',
    initialCountHint: 'Eggs in the spawn — an estimate is fine for a large egg mass.',
    countPlaceholder: 'e.g. 300',
    infertileLabel: 'Infertile', infertileFormLabel: 'Infertile',
    young: 'Offspring', youngLower: 'offspring',
    emptyOffspring: 'No offspring recorded yet. Add them as tadpoles or froglets come through.',
    clutchNotesPlaceholder: 'Where it was laid, water conditions, tadpole notes…',
  },
  salamander: {
    animal: 'salamander', animals: 'salamanders',
    countLabel: 'Eggs or young', initialCountLabel: 'Initial count',
    initialCountHint: 'Eggs laid — or larvae born, for live-bearing species.',
    countPlaceholder: 'e.g. 40',
    infertileLabel: 'Infertile', infertileFormLabel: 'Infertile',
    young: 'Offspring', youngLower: 'offspring',
    emptyOffspring: 'No offspring recorded yet. Add them as larvae come through.',
    clutchNotesPlaceholder: 'Where it was laid, water conditions, larvae notes…',
  },
  other: {
    animal: 'animal', animals: 'animals',
    countLabel: 'Eggs or young', initialCountLabel: 'Initial count',
    initialCountHint: 'Eggs laid, or young born for live-bearers.',
    countPlaceholder: 'e.g. 8',
    infertileLabel: 'Infertile', infertileFormLabel: 'Infertile',
    young: 'Offspring', youngLower: 'offspring',
    emptyOffspring: 'No offspring recorded yet.',
    clutchNotesPlaceholder: 'Incubation, conditions, anything unusual…',
  },
}

/** Vocabulary for a pairing's taxon; unknown / missing → the neutral 'other'
 *  set, never the snake one. */
export function breedingVocab(taxon: string | null | undefined): BreedingVocab {
  return taxon && taxon in BREEDING_VOCABULARY
    ? BREEDING_VOCABULARY[taxon as Taxon]
    : BREEDING_VOCABULARY.other
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
