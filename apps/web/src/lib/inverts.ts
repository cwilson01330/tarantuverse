/**
 * Shared web invert taxon config (ADR-006 web parity).
 *
 * Non-tarantula taxa live on the unified `inverts` surface. Per-animal CRUD
 * and logs route through the per-taxon facade prefix (e.g. /whip-spiders/),
 * while the generic /inverts/ endpoints handle create/get/update/delete.
 */
export type InvertTaxon = 'scorpion' | 'centipede' | 'whip_spider'

export interface InvertTaxonMeta {
  label: string
  glyph: string
  /** Per-animal facade prefix (logs, photos). */
  prefix: string
  /** Per-taxon species catalog prefix (autocomplete). */
  speciesPrefix: string
  /** Whip spiders measure leg span; others measure body length. */
  sizeLabel: string
}

export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = {
  scorpion: { label: 'Scorpion', glyph: '🦂', prefix: 'scorpions', speciesPrefix: 'scorpion-species', sizeLabel: 'Length (mm)' },
  centipede: { label: 'Centipede', glyph: '🐛', prefix: 'centipedes', speciesPrefix: 'centipede-species', sizeLabel: 'Length (mm)' },
  whip_spider: { label: 'Whip spider', glyph: '🕸️', prefix: 'whip-spiders', speciesPrefix: 'whip-spider-species', sizeLabel: 'Leg span (mm)' },
}

export function isInvertTaxon(t: string | null | undefined): t is InvertTaxon {
  return t === 'scorpion' || t === 'centipede' || t === 'whip_spider'
}
