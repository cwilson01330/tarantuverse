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
  other: { label: 'Other invertebrate', glyph: '🐾', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Size (mm)' },
}

/**
 * Taxa a COLONY picker should offer — mirrors PICKER_TAXA in the mobile lib.
 * Communal tarantula keeping isn't something to suggest, but stays valid at
 * the DB level for setups migrated in under ADR-010.
 */
export const PICKER_TAXA: InvertTaxon[] = (Object.keys(INVERT_TAXA) as InvertTaxon[])
  .filter((t) => t !== 'tarantula')

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
  scorpion: ['feedingStats', 'growth', 'breeding'], // breeding pilot — ADR-010 Phase D
  centipede: ['feedingStats', 'growth'],
  whip_spider: ['feedingStats'],
  vinegaroon: ['feedingStats'],
  true_spider: ['feedingStats'],
  millipede: [], // detritivore — no live-prey cadence, and molts underground
  mantis: ['feedingStats', 'growth'], // instar tracking is core to mantis keeping
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies have their own screen (ADR-010). Not an oversight.
  roach: [],
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
