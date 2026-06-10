/**
 * Shared web invert taxon config (ADR-006 / ADR-007).
 *
 * Non-tarantula taxa live on the unified `inverts` surface. The web pages
 * use the generic endpoints (POST /inverts/, /inverts/{id}/logs,
 * /invert-species/?taxon=), so `prefix`/`speciesPrefix` are kept for
 * reference but are no longer required for new taxa.
 */
export type InvertTaxon =
  | 'scorpion'
  | 'centipede'
  | 'whip_spider'
  | 'vinegaroon'
  | 'true_spider'
  | 'millipede'
  | 'mantis'
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
  scorpion: { label: 'Scorpion', glyph: '🦂', prefix: 'scorpions', speciesPrefix: 'scorpion-species', sizeLabel: 'Length (mm)' },
  centipede: { label: 'Centipede', glyph: '🐛', prefix: 'centipedes', speciesPrefix: 'centipede-species', sizeLabel: 'Length (mm)' },
  whip_spider: { label: 'Whip spider', glyph: '🕸️', prefix: 'whip-spiders', speciesPrefix: 'whip-spider-species', sizeLabel: 'Leg span (mm)' },
  vinegaroon: { label: 'Vinegaroon', glyph: '🦂', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  true_spider: { label: 'True spider', glyph: '🕷', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Leg span (mm)' },
  millipede: { label: 'Millipede', glyph: '🪱', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  mantis: { label: 'Mantis', glyph: '🦗', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  other: { label: 'Other invertebrate', glyph: '🐾', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Size (mm)' },
}

export function isInvertTaxon(t: string | null | undefined): t is InvertTaxon {
  return t != null && t in INVERT_TAXA
}

// ---------------------------------------------------------------------------
// Feature-module registry (ADR-008) — web mirror of
// apps/mobile/src/lib/taxon-modules.ts. Keep the two in lockstep.
// Tarantula isn't listed here because its web pages are bespoke.
// ---------------------------------------------------------------------------

export type FeatureModule = 'premolt' | 'feedingStats' | 'growth' | 'breeding'

export const TAXON_MODULES: Record<InvertTaxon, FeatureModule[]> = {
  scorpion: ['growth'],
  centipede: ['growth'],
  whip_spider: [],
  vinegaroon: [],
  true_spider: [],
  millipede: [], // deliberately skipped: molts underground, rarely measured
  mantis: ['growth'], // instar tracking is core to mantis keeping
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
