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

export type AlleleState = 'absent' | 'het' | 'visual' | 'super'

/**
 * The allele states a parent can meaningfully hold, given the gene's
 * inheritance mode. UI uses this to render only the sensible picker options.
 */
export function validStatesForGene(geneType: GeneType): AlleleState[] {
  switch (geneType) {
    case 'recessive':
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
  if (state === 'het') return 1
  // 'visual'
  if (geneType === 'recessive' || geneType === 'dominant') return 2
  return 1 // codominant / incomplete_dominant visual = 1 copy
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
  const pA = parentA / 2 // probability A passes morph allele
  const pB = parentB / 2
  const qA = 1 - pA
  const qB = 1 - pB
  return {
    0: qA * qB,
    1: pA * qB + qA * pB,
    2: pA * pB,
  }
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

  // Per-gene distributions.
  const perGene = inputs.map((g) => ({
    gene: g.gene,
    dist: punnett(g.parentA, g.parentB),
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
