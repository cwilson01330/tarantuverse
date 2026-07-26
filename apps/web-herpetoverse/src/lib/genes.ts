/**
 * Genes data layer + morph calculator math.
 *
 * Wraps the Tarantuverse API's /api/v1/genes/* public endpoints. Reads only —
 * the public calculator doesn't need auth because the gene catalog is public.
 *
 * Also exports the pure math for Punnett squares and combined offspring
 * probability. Math lives here (not in a component) so it can be unit-tested
 * later without a React harness.
 *
 * Model assumption (standard hobby genetics):
 *   - Each gene assorts independently — we combine per-gene probabilities
 *     by multiplication across an offspring genotype vector.
 *   - No epistasis, no linkage. This matches how genecalc.com, MorphMarket's
 *     calculator, and World of Ball Pythons compute offspring ratios.
 *   - poss_het percentages are NOT parents' own probabilities — they're how
 *     the calculator later flags offspring het rows. Keep out of this v1.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

const REVALIDATE_SECONDS = 300

// ---------------------------------------------------------------------------
// Types. Mirrors apps/api/app/schemas/gene.py GeneResponse.
// ---------------------------------------------------------------------------

export type GeneType =
  | 'recessive'
  | 'dominant'
  | 'codominant'
  | 'incomplete_dominant'

export type WelfareFlag = 'neurological' | 'structural' | 'viability'

export type CitationSourceType = 'peer_reviewed' | 'breeder_community'

export interface WelfareCitation {
  title?: string
  url?: string
  author?: string
  publication?: string
  publication_date?: string
  source_type?: CitationSourceType
  summary?: string
  ref_key?: string
}

export interface Gene {
  id: string
  species_scientific_name: string
  common_name: string
  symbol: string | null
  description: string | null
  image_url: string | null
  gene_type: GeneType
  welfare_flag: WelfareFlag | null
  welfare_notes: string | null
  lethal_homozygous: boolean
  welfare_citations: WelfareCitation[] | null
  content_last_reviewed_at: string | null
  is_verified: boolean
  submitted_by: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string | null
}

interface PaginatedResponse {
  items: Gene[]
  total: number
  skip: number
  limit: number
  has_more: boolean
}

// ---------------------------------------------------------------------------
// Fetchers. Return null on failure so pages can render degraded states.
// ---------------------------------------------------------------------------

export async function fetchGenesForSpecies(
  scientificName: string,
): Promise<Gene[] | null> {
  try {
    const params = new URLSearchParams({
      species: scientificName,
      verified_only: 'true',
      limit: '200',
    })
    const res = await fetch(`${API_URL}/api/v1/genes/?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const data = (await res.json()) as PaginatedResponse
    return data.items
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Supported species for the calculator. Keeping this explicit (not derived
// from the catalog) so we only expose species that have enough seeded data
// to produce meaningful results. Extend as more gene catalogs land.
// ---------------------------------------------------------------------------

export interface CalculatorSpecies {
  scientific_name: string
  common_name: string
  note?: string
}

export const CALCULATOR_SPECIES: CalculatorSpecies[] = [
  {
    scientific_name: 'Python regius',
    common_name: 'Ball python',
    note: 'Most comprehensive catalog — 30+ genes seeded.',
  },
  {
    scientific_name: 'Eublepharis macularius',
    common_name: 'Leopard gecko',
    note:
      'Single-locus genes only. The three albino strains (Tremper, Bell, ' +
      'Rainwater) are separate genes and do not combine. Line-bred traits ' +
      'like tangerine and hypo are not predictable and are excluded.',
  },
]

// ---------------------------------------------------------------------------
// Calculator domain model.
//
// "Allele state" = what the keeper marks for a parent on a specific gene:
//   - 'absent'    : both alleles wild-type (no copies of the morph)
//   - 'het'       : one copy (recessives: not visible; dominants: visible)
//   - 'visual'    : two copies of a fully-dominant/recessive
//                   OR one copy of a [co]dominant (heterozygous expression)
//   - 'super'     : two copies of a co/incomplete dominant (super form)
//
// The mapping from allele state to "number of morph alleles" is:
//     absent=0, het=1, visual=1 (for co/inc_dominant) or 2 (recessive/dominant),
//     super=2 (co/inc_dominant only).
// We normalize to allele counts (0/1/2) internally for Punnett math.
// ---------------------------------------------------------------------------

export type AlleleState = 'absent' | 'het' | 'poss_het' | 'visual' | 'super'

/**
 * The allele states a parent can meaningfully hold, given the gene's
 * inheritance mode. UI uses this to render only the sensible picker options.
 *
 * 'poss_het' ("possible het", e.g. "66% het Albino") is offered for RECESSIVE
 * genes only. For dominant / co-dominant / incomplete-dominant genes a single
 * copy is visible, so a carrier is never hidden and "possible het" is
 * meaningless — you can always see whether the animal has the gene.
 */
export function validStatesForGene(geneType: GeneType): AlleleState[] {
  switch (geneType) {
    case 'recessive':
      return ['absent', 'poss_het', 'het', 'visual']
    case 'dominant':
      // Dominants don't have a super form in hobby parlance — two copies
      // looks identical to one. Keep the picker to 0/1/2 with 'visual' = 2.
      return ['absent', 'het', 'visual']
    case 'codominant':
    case 'incomplete_dominant':
      return ['absent', 'visual', 'super']
  }
}

/**
 * Convert an allele state + gene type into an allele-count (0, 1, or 2).
 * For recessives and dominants: het=1, visual=2. For co/inc_dominant:
 * visual=1 (heterozygous phenotype), super=2.
 */
export function stateToCount(
  state: AlleleState,
  geneType: GeneType,
): 0 | 1 | 2 {
  if (state === 'absent') return 0
  if (state === 'super') return 2
  // A possible het is *probably* carrying one copy. This best-guess count is
  // for display only — the offspring math never uses it, because a poss-het
  // parent is a probability distribution, not a fixed genotype. See
  // allelePassProbability().
  if (state === 'het' || state === 'poss_het') return 1
  // 'visual'
  if (geneType === 'recessive' || geneType === 'dominant') return 2
  return 1 // codominant / incomplete_dominant visual = 1 copy
}

/**
 * Probability that a parent passes the morph allele to any given offspring.
 *
 * This is the single value the offspring math needs from a parent, and it is
 * what makes "possible het" parents work:
 *
 *   - absent (0 copies)      → 0     (never passes)
 *   - het (1 copy)           → 0.5
 *   - visual recessive (2)   → 1     (always passes)
 *   - co-dom visual (1 copy) → 0.5
 *   - super (2 copies)       → 1
 *   - 66% poss het           → 0.66 × 0.5 = 0.33
 *
 * The poss-het case blends two different uncertainties: whether the parent
 * carries the gene at all, and Mendelian chance given that it does. Callers
 * displaying results should be careful not to present the combined number as
 * pure Mendelian odds.
 */
export function allelePassProbability(
  state: AlleleState,
  geneType: GeneType,
  possHetPercent?: number | null,
): number {
  if (state === 'poss_het') {
    const pct = Math.min(100, Math.max(0, possHetPercent ?? 0)) / 100
    return pct * 0.5
  }
  return stateToCount(state, geneType) / 2
}

/**
 * Convert an allele count (0/1/2) back to a displayable state label, given
 * the gene's inheritance mode. Used to label offspring rows.
 */
export function countToState(
  count: 0 | 1 | 2,
  geneType: GeneType,
): AlleleState {
  if (count === 0) return 'absent'
  if (count === 2) {
    if (geneType === 'recessive' || geneType === 'dominant') return 'visual'
    return 'super'
  }
  // count === 1
  if (geneType === 'recessive') return 'het'
  // dominant / codominant / incomplete_dominant: one copy is visible
  return 'visual'
}

/**
 * Human-readable label for an allele state, contextualized by gene type.
 * Example: ('het', 'recessive') => "het" ; ('visual', 'codominant') => "visual (het)"
 */
export function stateLabel(state: AlleleState, geneType: GeneType): string {
  if (state === 'absent') return 'none'
  if (state === 'het') return 'het'
  if (state === 'poss_het') return 'poss. het'
  if (state === 'super') return 'super'
  // visual
  if (geneType === 'recessive' || geneType === 'dominant') {
    return 'visual (homozygous)'
  }
  return 'visual (het)'
}

// ---------------------------------------------------------------------------
// Per-gene Punnett.
//
// Given two allele counts (0/1/2) on the same gene, return the probability
// distribution over offspring counts (0/1/2).
//
// Each parent contributes one allele, chosen uniformly from its two.
// P(pass morph allele) = count / 2. So:
//   - 0 x 0 → 100% 0
//   - 0 x 1 → 50% 0, 50% 1
//   - 0 x 2 → 100% 1
//   - 1 x 1 → 25% 0, 50% 1, 25% 2
//   - 1 x 2 → 50% 1, 50% 2
//   - 2 x 2 → 100% 2
//
// Returns an object { 0: p0, 1: p1, 2: p2 } summing to 1.
// ---------------------------------------------------------------------------

export interface CountDistribution {
  0: number
  1: number
  2: number
}

export function punnett(
  parentA: 0 | 1 | 2,
  parentB: 0 | 1 | 2,
): CountDistribution {
  return punnettFromPass(parentA / 2, parentB / 2)
}

/**
 * The general form: combine two arbitrary allele-pass probabilities.
 *
 * `punnett()` above is the special case where each parent has a known,
 * definite genotype (pass probability is exactly 0, 0.5 or 1). Possible-het
 * parents produce intermediate values (a 66% het passes with p = 0.33), which
 * is why the math is expressed over probabilities rather than allele counts.
 */
export function punnettFromPass(
  pA: number,
  pB: number,
): CountDistribution {
  const qA = 1 - pA
  const qB = 1 - pB
  return {
    0: qA * qB,
    1: pA * qB + qA * pB,
    2: pA * pB,
  }
}

/**
 * The hobby's "66% het" number, for a RECESSIVE gene.
 *
 * Given an offspring distribution, this answers: "for a baby that does not
 * visually show the trait, what's the chance it's a carrier?" That's a
 * conditional probability — we exclude the visual (2-copy) offspring, because
 * a visual animal is not a het:
 *
 *     P(het | not visual) = P(1 copy) / (P(0 copies) + P(1 copy))
 *
 * Worked examples, which are the numbers keepers actually quote:
 *   het × het        → 0.50 / 0.75 = 66.7%  →  "66% het"
 *   visual × normal  → 1.00 / 1.00 = 100%   →  "100% het"
 *   het × normal     → 0.50 / 1.00 = 50%    →  "50% het"
 *
 * Returns null when every offspring is visual (nothing left to be "possibly"
 * het), so callers can omit the row entirely rather than print a misleading 0.
 */
export function possHetPercentage(
  dist: CountDistribution,
): number | null {
  const nonVisual = dist[0] + dist[1]
  if (nonVisual <= 0) return null
  return (dist[1] / nonVisual) * 100
}

/**
 * Literal 4-cell Punnett grid for display. Each parent's two alleles are
 * shown as "+" (wild-type) or "M" (morph). Returns a 2×2 grid of allele
 * counts (0/1/2).
 *
 * For a het (count=1) parent, the two alleles are shown as [+, M].
 * For a homozygous parent (count=0 or 2), both alleles are identical.
 * We keep the cell order stable so the UI can render it as a table.
 */
export interface PunnettGridCell {
  parentAAllele: '+' | 'M'
  parentBAllele: '+' | 'M'
  offspringCount: 0 | 1 | 2
}

export function punnettGrid(
  parentA: 0 | 1 | 2,
  parentB: 0 | 1 | 2,
): PunnettGridCell[] {
  const allelesA: Array<'+' | 'M'> =
    parentA === 0 ? ['+', '+'] : parentA === 2 ? ['M', 'M'] : ['+', 'M']
  const allelesB: Array<'+' | 'M'> =
    parentB === 0 ? ['+', '+'] : parentB === 2 ? ['M', 'M'] : ['+', 'M']

  const cells: PunnettGridCell[] = []
  for (const a of allelesA) {
    for (const b of allelesB) {
      const count = ((a === 'M' ? 1 : 0) + (b === 'M' ? 1 : 0)) as 0 | 1 | 2
      cells.push({ parentAAllele: a, parentBAllele: b, offspringCount: count })
    }
  }
  return cells
}

// ---------------------------------------------------------------------------
// Combined offspring probability across multiple genes.
//
// Given a list of genes plus each parent's allele count per gene, enumerate
// every offspring genotype (a vector of counts, one per gene) and its
// probability (the product of per-gene probabilities, since genes assort
// independently).
//
// Output is sorted by probability descending so the UI can show the most
// likely outcomes first.
// ---------------------------------------------------------------------------

export interface GeneInput {
  gene: Gene
  parentA: 0 | 1 | 2
  parentB: 0 | 1 | 2
  /**
   * Optional "possible het" percentages (0–100) per parent. When set, that
   * parent is treated as *probably* carrying one copy rather than definitely
   * holding `parentA`/`parentB` copies — a 66 here means the parent passes the
   * morph allele with probability 0.66 × 0.5 = 0.33.
   *
   * Only meaningful for recessive genes (see validStatesForGene). Leaving
   * these undefined preserves the original definite-genotype behaviour, so
   * existing callers are unaffected.
   */
  parentAPossHet?: number | null
  parentBPossHet?: number | null
}

export interface OffspringOutcome {
  /** Count per gene in the same order as the input genes[] array. */
  counts: Array<0 | 1 | 2>
  /** Probability in [0, 1]. */
  probability: number
  /**
   * True if this outcome is biologically non-viable — any gene marked
   * lethal_homozygous is at count=2. These are still listed (for transparency)
   * but flagged visually and their probability is labeled as "lethal".
   */
  isLethal: boolean
}

export function combineOffspring(
  inputs: GeneInput[],
): OffspringOutcome[] {
  if (inputs.length === 0) return []

  // Per-gene distributions. A poss-het parent contributes an intermediate
  // pass probability (pct × 0.5); otherwise it's the definite count / 2.
  const perGene = inputs.map((g) => ({
    gene: g.gene,
    dist: punnettFromPass(
      g.parentAPossHet != null ? (g.parentAPossHet / 100) * 0.5 : g.parentA / 2,
      g.parentBPossHet != null ? (g.parentBPossHet / 100) * 0.5 : g.parentB / 2,
    ),
  }))

  // Cartesian product — each combination is one genotype vector.
  const outcomes: OffspringOutcome[] = []

  const recurse = (idx: number, counts: Array<0 | 1 | 2>, prob: number) => {
    if (idx === perGene.length) {
      if (prob <= 0) return
      const isLethal = counts.some(
        (c, i) => c === 2 && perGene[i].gene.lethal_homozygous,
      )
      outcomes.push({ counts: [...counts], probability: prob, isLethal })
      return
    }
    const { dist } = perGene[idx]
    for (const c of [0, 1, 2] as const) {
      const p = dist[c]
      if (p === 0) continue
      counts.push(c)
      recurse(idx + 1, counts, prob * p)
      counts.pop()
    }
  }
  recurse(0, [], 1)

  // Sort: viable first, then by probability desc. Lethal rows drop to the
  // bottom because they're informational, not outcomes a keeper plans around.
  outcomes.sort((a, b) => {
    if (a.isLethal !== b.isLethal) return a.isLethal ? 1 : -1
    return b.probability - a.probability
  })

  return outcomes
}

/**
 * Format a probability as both a fraction (best common denominator up to 64)
 * and a percentage. We cap the denominator because past 1/64 the fractions
 * become unhelpful (1/256 "super pastel ghost hets" etc.) — percent carries
 * the meaning there.
 */
export function formatProbability(p: number): string {
  const pct = (p * 100).toFixed(p < 0.001 ? 3 : p < 0.01 ? 2 : 1)
  const frac = toFraction(p)
  return frac ? `${frac}  ·  ${pct}%` : `${pct}%`
}

function toFraction(p: number): string | null {
  for (const denom of [1, 2, 4, 8, 16, 32, 64]) {
    const num = Math.round(p * denom)
    if (num >= 0 && Math.abs(num / denom - p) < 1e-9) {
      if (num === 0) return '0'
      if (num === denom) return '1'
      return `${num}/${denom}`
    }
  }
  return null
}
