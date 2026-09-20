/**
 * Shared web invert taxon config (ADR-006 / ADR-007).
 *
 * Non-tarantula taxa live on the unified `inverts` surface. The web pages
 * use the generic endpoints (POST /inverts/, /inverts/{id}/logs,
 * /invert-species/?taxon=), so `prefix`/`speciesPrefix` are kept for
 * reference but are no longer required for new taxa.
 */
// Tarantula is a member here (ADR-013). This union is "every taxon that
// exists", not "every taxon a picker should offer" — use PICKER_TAXA for that.
export type InvertTaxon =
  | 'tarantula'
  | 'scorpion'
  | 'centipede'
  | 'whip_spider'
  | 'vinegaroon'
  | 'true_spider'
  | 'millipede'
  | 'mantis'
  | 'roach'
  | 'isopod'
  | 'other'

export interface InvertTaxonMeta {
  label: string
  glyph: string
  /** Per-animal facade prefix (legacy; only scorpion/centipede/whip have one). */
  prefix: string
  /** Per-taxon species catalog prefix (legacy). */
  speciesPrefix: string
  /** Whip spiders measure leg span; others measure body length. */
  sizeLabel: string
}

export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = {
  tarantula: { label: 'Tarantula', glyph: '🕷️', prefix: 'tarantulas', speciesPrefix: 'species', sizeLabel: 'Leg span (mm)' },
  scorpion: { label: 'Scorpion', glyph: '🦂', prefix: 'scorpions', speciesPrefix: 'scorpion-species', sizeLabel: 'Length (mm)' },
  centipede: { label: 'Centipede', glyph: '🐛', prefix: 'centipedes', speciesPrefix: 'centipede-species', sizeLabel: 'Length (mm)' },
  whip_spider: { label: 'Whip spider', glyph: '🕸️', prefix: 'whip-spiders', speciesPrefix: 'whip-spider-species', sizeLabel: 'Leg span (mm)' },
  vinegaroon: { label: 'Vinegaroon', glyph: '🦂', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  true_spider: { label: 'True spider', glyph: '🕷', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Leg span (mm)' },
  millipede: { label: 'Millipede', glyph: '🪱', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  mantis: { label: 'Mantis', glyph: '🦗', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  roach: { label: 'Roach', glyph: '🪳', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  // Detritivore crustacean — measured by length, not leg span.
  isopod: { label: 'Isopod', glyph: '🪲', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  other: { label: 'Other invertebrate', glyph: '🐾', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Size (mm)' },
}

/**
 * Taxa a COLONY picker should offer — mirrors PICKER_TAXA in the mobile lib.
 *
 * The tarantula exclusion was removed 2026-09-08. It was a taxon-level answer
 * to a species-level question: balfouri and incei are established communals,
 * and two of the three colonies in production are tarantulas. Suitability is
 * now carried per species by `communal_suitable`, which exists on all three
 * catalogs (on `species` as of com_20260908). See the mobile lib for the full
 * reasoning.
 */
export const PICKER_TAXA: InvertTaxon[] = Object.keys(INVERT_TAXA) as InvertTaxon[]

/**
 * Type guard for "is this a known taxon".
 *
 * NB: this now returns TRUE for 'tarantula' (ADR-013 — tarantula joined the
 * union so it stops being a special case at every lookup). Call sites that
 * used this to mean "offerable in a colony picker" must use PICKER_TAXA.
 */
export function isInvertTaxon(t: string | null | undefined): t is InvertTaxon {
  return t != null && t in INVERT_TAXA
}

// ---------------------------------------------------------------------------
// Feature-module registry (ADR-008) — web mirror of
// apps/mobile/src/lib/taxon-modules.ts. Keep the two in lockstep.
//
// Tarantula is listed now (ADR-013). Its web pages are still bespoke, so the
// row isn't read by anything yet — but a registry that omits a taxon is how
// "this taxon is handled elsewhere" quietly becomes "this taxon has no
// features", which is the exact drift that produced two mobile detail screens.
// ---------------------------------------------------------------------------

export type FeatureModule = 'premolt' | 'feedingStats' | 'growth' | 'breeding'

export const TAXON_MODULES: Record<InvertTaxon, FeatureModule[]> = {
  tarantula: ['premolt', 'feedingStats', 'growth', 'breeding'],
  scorpion: ['feedingStats', 'growth', 'breeding'], // breeding pilot — ADR-021 Phase D
  centipede: ['feedingStats', 'growth'],
  whip_spider: ['feedingStats'],
  vinegaroon: ['feedingStats'],
  // Jumping spiders lay an egg sac like a tarantula, so the pairing → sac →
  // offspring chain is the same shape. Enabled 2026-09-20 on real demand.
  true_spider: ['feedingStats', 'breeding'],
  millipede: [], // detritivore — no live-prey cadence, and molts underground
  mantis: ['feedingStats', 'growth'], // instar tracking is core to mantis keeping
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies have their own screen (ADR-010). Not an oversight.
  roach: [],
  // Detritivores kept as a COLONY, not as individuals — the population is the
  // unit, and colonies have their own screen (ADR-010). No feeding cadence to
  // nag about, and no per-animal molt log worth charting: isopods molt in two
  // halves and nobody records it.
  isopod: [],
  other: [],
}

export function taxonHasModule(taxon: string, module: FeatureModule): boolean {
  return isInvertTaxon(taxon) && TAXON_MODULES[taxon].includes(module)
}

/**
 * Label for the linear growth measurement. Molt-log columns are named
 * leg_span_* for legacy reasons; only spiders actually measure leg span —
 * everything else records body length (honesty-first labeling).
 */
export function growthLengthLabel(taxon: string): string {
  return taxon === 'true_spider' || taxon === 'whip_spider' || taxon === 'tarantula'
    ? 'Leg span'
    : 'Body length'
}

// ---------------------------------------------------------------------------
// Breeding vocabulary — mirror of
// apps/mobile/src/lib/taxon-modules.ts::BREEDING_VOCABULARY. Keep in lockstep.
//
// The breeding tables were built for tarantulas, so the schema says `egg_sacs`
// and `spiderling_count`. Those are spider words, and reusing them for another
// taxon makes the app confidently wrong about the animal in front of the
// keeper: a mantis lays an OOTHECA that hatches NYMPHS, and a scorpion is
// viviparous — it has no egg-laying stage at all, so offering its keeper an
// "egg sac" form asks for something that will never exist.
//
// That last case is why `clutch` is nullable rather than just a label. Scorpion
// breeding is already enabled above and the upgrade copy on the invert detail
// page still promises "pairings, egg sacs, and offspring", so this isn't
// hypothetical — it shipped.
// ---------------------------------------------------------------------------

export interface BreedingVocabulary {
  /** The egg-laying stage, or null for live-bearing taxa. */
  clutch: { noun: string; plural: string; offspring: string } | null
  /** Live-bearers skip from pairing straight to young. */
  liveBirth: { noun: string; plural: string; offspring: string } | null
}

export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = {
  tarantula: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' }, liveBirth: null },
  // Jumpers lay a sac like a tarantula, so this is correct rather than merely tolerable.
  true_spider: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' }, liveBirth: null },
  whip_spider: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' }, liveBirth: null },
  mantis: { clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' }, liveBirth: null },
  roach: { clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' }, liveBirth: null },
  // "plings" is the hobby term, by analogy with tarantula "slings" — worth a
  // second opinion from someone who keeps them before this ships.
  centipede: { clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'plings' }, liveBirth: null },
  millipede: { clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'young' }, liveBirth: null },
  // Viviparous — no egg stage exists.
  scorpion: { clutch: null, liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'instars' } },
  // No egg stage the keeper sees: eggs are brooded internally in a marsupium
  // and released as live young. "Mancae" is the correct hobby term.
  isopod: { clutch: null, liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'mancae' } },
  vinegaroon: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' }, liveBirth: null },
}

const FALLBACK_VOCABULARY: BreedingVocabulary = {
  clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'offspring' },
  liveBirth: null,
}

export function breedingVocabulary(taxon: string): BreedingVocabulary {
  return BREEDING_VOCABULARY[taxon] ?? FALLBACK_VOCABULARY
}

/**
 * Whether this taxon has an egg-laying stage between pairing and offspring.
 * False for live-bearers, whose UI must SKIP the clutch step rather than
 * relabel it.
 */
export function taxonLaysClutch(taxon: string): boolean {
  return breedingVocabulary(taxon).clutch !== null
}

/**
 * Reads the stored `plural` rather than appending "s" — that shortcut produced
 * "Oothecas" and "Clutchs" while the correct forms sat in the table unused.
 */
export function clutchSectionLabel(taxon: string): string {
  const v = breedingVocabulary(taxon)
  const plural = v.clutch?.plural ?? v.liveBirth?.plural ?? 'clutches'
  return plural.charAt(0).toUpperCase() + plural.slice(1)
}

export function offspringNoun(taxon: string): string {
  const v = breedingVocabulary(taxon)
  return v.clutch?.offspring ?? v.liveBirth?.offspring ?? 'offspring'
}
