/**
 * Genes data layer + morph calculator math (mobile port).
 *
 * Mirrors apps/web-herpetoverse/src/lib/genes.ts. The math is verbatim —
 * pure functions ported unchanged so the mobile calculator produces the
 * same offspring distributions as the web one.
 *
 * Only the fetch wrappers differ: web uses Next.js fetch with ISR,
 * mobile uses the authenticated `apiClient`. The genes catalog itself
 * is public (no auth required) but using apiClient keeps the request
 * shape identical to the rest of the app.
 *
 * Per-snake genotype CRUD is also exposed here (web does this inline in
 * the snake detail page; mobile factors it out). Lizards are NOT
 * supported yet — the gene catalog is ball-python only.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Types — mirror apps/api/app/schemas/gene.py + animal_genotype.py
// ---------------------------------------------------------------------------

export type GeneType =
  | 'recessive'
  | 'dominant'
  | 'codominant'
  | 'incomplete_dominant';

export type WelfareFlag = 'neurological' | 'structural' | 'viability';

export type CitationSourceType = 'peer_reviewed' | 'breeder_community';

export interface WelfareCitation {
  title?: string;
  url?: string;
  author?: string;
  publication?: string;
  publication_date?: string;
  source_type?: CitationSourceType;
  summary?: string;
  ref_key?: string;
}

export interface Gene {
  id: string;
  species_scientific_name: string;
  common_name: string;
  symbol: string | null;
  description: string | null;
  image_url: string | null;
  gene_type: GeneType;
  welfare_flag: WelfareFlag | null;
  welfare_notes: string | null;
  lethal_homozygous: boolean;
  welfare_citations: WelfareCitation[] | null;
  content_last_reviewed_at: string | null;
  is_verified: boolean;
  submitted_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface PaginatedGeneResponse {
  items: Gene[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
}

/** Animal genotype row — mirrors AnimalGenotypeResponse on the API. */
export type Zygosity = 'het' | 'visual' | 'poss_het' | 'super';

export interface AnimalGenotype {
  id: string;
  // ADR-003: genotype rows attach to the unified animals table.
  animal_id: string;
  gene_id: string;
  zygosity: Zygosity;
  poss_het_percentage: number | null;
  proven: boolean;
  notes: string | null;
  created_at: string;
}

export interface CreateGenotypePayload {
  gene_id: string;
  zygosity: Zygosity;
  poss_het_percentage?: number | null;
  proven?: boolean;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Calculator-supported species. Keeping this explicit (not derived from the
// catalog) so we only expose species with enough seeded data to produce
// meaningful results. Extend as more gene catalogs land.
// ---------------------------------------------------------------------------

export interface CalculatorSpecies {
  scientific_name: string;
  common_name: string;
  note?: string;
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
];

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Returns null on failure so callers can render degraded states. */
export async function fetchGenesForSpecies(
  scientificName: string,
): Promise<Gene[] | null> {
  try {
    const { data } = await apiClient.get<PaginatedGeneResponse>('/genes/', {
      params: {
        species: scientificName,
        verified_only: true,
        limit: 200,
      },
    });
    return data.items;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-animal genotype CRUD. ADR-003: snakes/lizards/frogs collapsed into
// `animals`, so the route is `/animals/{id}/genotype`. The gene catalog
// is ball-python only for now, but the genotype store itself is taxon-
// agnostic.
// ---------------------------------------------------------------------------

export async function listAnimalGenotype(
  animalId: string,
): Promise<AnimalGenotype[]> {
  const { data } = await apiClient.get<AnimalGenotype[]>(
    `/animals/${encodeURIComponent(animalId)}/genotype`,
  );
  return data;
}

export async function addAnimalGenotype(
  animalId: string,
  payload: CreateGenotypePayload,
): Promise<AnimalGenotype> {
  const { data } = await apiClient.post<AnimalGenotype>(
    `/animals/${encodeURIComponent(animalId)}/genotype`,
    payload,
  );
  return data;
}

export async function updateAnimalGenotype(
  animalId: string,
  genotypeId: string,
  payload: Partial<CreateGenotypePayload>,
): Promise<AnimalGenotype> {
  const { data } = await apiClient.put<AnimalGenotype>(
    `/animals/${encodeURIComponent(animalId)}/genotype/${encodeURIComponent(genotypeId)}`,
    payload,
  );
  return data;
}

export async function deleteAnimalGenotype(
  animalId: string,
  genotypeId: string,
): Promise<void> {
  await apiClient.delete(
    `/animals/${encodeURIComponent(animalId)}/genotype/${encodeURIComponent(genotypeId)}`,
  );
}

// ---------------------------------------------------------------------------
// Calculator domain model — see web genes.ts for full discussion.
// ---------------------------------------------------------------------------

export type AlleleState = 'absent' | 'het' | 'poss_het' | 'visual' | 'super';

/**
 * Allele states a parent can meaningfully hold for a given inheritance mode.
 *
 * 'poss_het' ("possible het", e.g. "66% het Albino") is RECESSIVE-only: for
 * dominant / co-dominant genes one copy is visible, so a carrier is never
 * hidden and "possible het" has no meaning.
 */
export function validStatesForGene(geneType: GeneType): AlleleState[] {
  switch (geneType) {
    case 'recessive':
      // NOTE: 'poss_het' is intentionally NOT offered here yet, even though
      // the math below fully supports it. app/morph-calculator.tsx does not
      // pass parentAPossHet/parentBPossHet through to combineOffspring, so a
      // possible het would be silently treated as a CERTAIN het — which
      // overstates the odds of visual offspring. Wrong numbers in a breeding
      // tool are worse than a missing option. Add 'poss_het' back the moment
      // the screen threads the percentage through. Web already does.
      return ['absent', 'het', 'visual'];
    case 'dominant':
      return ['absent', 'het', 'visual'];
    case 'codominant':
    case 'incomplete_dominant':
      return ['absent', 'visual', 'super'];
  }
}

/** Map an allele state + gene type to allele count (0/1/2). */
export function stateToCount(
  state: AlleleState,
  geneType: GeneType,
): 0 | 1 | 2 {
  if (state === 'absent') return 0;
  if (state === 'super') return 2;
  // poss_het's count is a display best-guess only; the offspring math uses
  // allelePassProbability() because a poss het is a distribution, not a
  // fixed genotype.
  if (state === 'het' || state === 'poss_het') return 1;
  // 'visual'
  if (geneType === 'recessive' || geneType === 'dominant') return 2;
  return 1; // codominant / incomplete_dominant visual = 1 copy
}

/**
 * Probability a parent passes the morph allele to a given offspring.
 * absent→0, het→0.5, visual recessive→1, co-dom visual→0.5, super→1,
 * and a 66% poss het → 0.66 × 0.5 = 0.33.
 */
export function allelePassProbability(
  state: AlleleState,
  geneType: GeneType,
  possHetPercent?: number | null,
): number {
  if (state === 'poss_het') {
    const pct = Math.min(100, Math.max(0, possHetPercent ?? 0)) / 100;
    return pct * 0.5;
  }
  return stateToCount(state, geneType) / 2;
}

/** Map an allele count back to a displayable state given the gene's mode. */
export function countToState(
  count: 0 | 1 | 2,
  geneType: GeneType,
): AlleleState {
  if (count === 0) return 'absent';
  if (count === 2) {
    if (geneType === 'recessive' || geneType === 'dominant') return 'visual';
    return 'super';
  }
  // count === 1
  if (geneType === 'recessive') return 'het';
  return 'visual';
}

/** Human-readable label for an allele state, contextualized by gene type. */
export function stateLabel(state: AlleleState, geneType: GeneType): string {
  if (state === 'absent') return 'none';
  if (state === 'het') return 'het';
  if (state === 'poss_het') return 'poss. het';
  if (state === 'super') return 'super';
  // visual
  if (geneType === 'recessive' || geneType === 'dominant') {
    return 'visual (homozygous)';
  }
  return 'visual (het)';
}

/** Map an animal_genotype.zygosity to an allele count for the calculator. */
export function zygosityToCount(
  z: Zygosity,
  geneType: GeneType,
): 0 | 1 | 2 {
  if (z === 'het') return 1;
  if (z === 'super') return 2;
  if (z === 'visual') {
    return geneType === 'recessive' || geneType === 'dominant' ? 2 : 1;
  }
  // poss_het — count is a display best-guess only. Do NOT feed this into the
  // offspring math: treating a 66% het as a certain het overstates the odds.
  // Use zygosityToPassProbability() instead.
  return 1;
}

/**
 * Allele-pass probability for a stored animal genotype. This is the correct
 * bridge from an AnimalGenotype row into the calculator, because it honours
 * poss_het_percentage instead of rounding a possible het up to a certain one.
 *
 * A proven het is a certainty regardless of any recorded percentage — that's
 * what `proven` means — so it passes at 0.5.
 */
export function zygosityToPassProbability(
  z: Zygosity,
  geneType: GeneType,
  possHetPercentage?: number | null,
  proven?: boolean,
): number {
  if (z === 'poss_het' && !proven) {
    const pct = Math.min(100, Math.max(0, possHetPercentage ?? 0)) / 100;
    return pct * 0.5;
  }
  return zygosityToCount(z, geneType) / 2;
}

/** Display string for a zygosity. */
export function zygosityLabel(
  z: Zygosity,
  poss_het_percentage?: number | null,
): string {
  if (z === 'poss_het') {
    return poss_het_percentage != null
      ? `poss het (${poss_het_percentage}%)`
      : 'poss het';
  }
  return z;
}

// ---------------------------------------------------------------------------
// Per-gene Punnett.
// ---------------------------------------------------------------------------

export interface CountDistribution {
  0: number;
  1: number;
  2: number;
}

export function punnett(
  parentA: 0 | 1 | 2,
  parentB: 0 | 1 | 2,
): CountDistribution {
  return punnettFromPass(parentA / 2, parentB / 2);
}

/**
 * General form: combine two arbitrary allele-pass probabilities. punnett()
 * is the special case of definite genotypes (0, 0.5 or 1); possible-het
 * parents produce intermediate values (66% het passes with p = 0.33).
 */
export function punnettFromPass(
  pA: number,
  pB: number,
): CountDistribution {
  const qA = 1 - pA;
  const qB = 1 - pB;
  return {
    0: qA * qB,
    1: pA * qB + qA * pB,
    2: pA * pB,
  };
}

/**
 * The hobby's "66% het" number, for a RECESSIVE gene: given an offspring
 * that does NOT visually show the trait, the chance it's a carrier.
 *
 *     P(het | not visual) = P(1 copy) / (P(0) + P(1))
 *
 *   het × het       → 0.50 / 0.75 = 66.7%  ("66% het")
 *   visual × normal → 1.00 / 1.00 = 100%
 *   het × normal    → 0.50 / 1.00 = 50%
 *
 * Returns null when every offspring is visual, so callers can omit the row
 * rather than print a misleading 0.
 */
export function possHetPercentage(
  dist: CountDistribution,
): number | null {
  const nonVisual = dist[0] + dist[1];
  if (nonVisual <= 0) return null;
  return (dist[1] / nonVisual) * 100;
}

// ---------------------------------------------------------------------------
// Combined offspring probability across multiple genes.
// ---------------------------------------------------------------------------

export interface GeneInput {
  gene: Gene;
  parentA: 0 | 1 | 2;
  parentB: 0 | 1 | 2;
  /**
   * Optional "possible het" percentages (0–100) per parent. When set, that
   * parent is treated as probably carrying one copy rather than definitely
   * holding parentA/parentB copies — 66 means it passes the morph allele with
   * probability 0.66 × 0.5 = 0.33. Recessive genes only. Leaving these
   * undefined preserves the original behaviour for existing callers.
   */
  parentAPossHet?: number | null;
  parentBPossHet?: number | null;
}

export interface OffspringOutcome {
  /** Count per gene in the same order as the input genes[] array. */
  counts: Array<0 | 1 | 2>;
  probability: number;
  isLethal: boolean;
}

export function combineOffspring(inputs: GeneInput[]): OffspringOutcome[] {
  if (inputs.length === 0) return [];

  // A poss-het parent contributes an intermediate pass probability
  // (pct × 0.5); otherwise it's the definite count / 2.
  const perGene = inputs.map((g) => ({
    gene: g.gene,
    dist: punnettFromPass(
      g.parentAPossHet != null ? (g.parentAPossHet / 100) * 0.5 : g.parentA / 2,
      g.parentBPossHet != null ? (g.parentBPossHet / 100) * 0.5 : g.parentB / 2,
    ),
  }));

  const outcomes: OffspringOutcome[] = [];

  const recurse = (idx: number, counts: Array<0 | 1 | 2>, prob: number) => {
    if (idx === perGene.length) {
      if (prob <= 0) return;
      const isLethal = counts.some(
        (c, i) => c === 2 && perGene[i].gene.lethal_homozygous,
      );
      outcomes.push({ counts: [...counts], probability: prob, isLethal });
      return;
    }
    const { dist } = perGene[idx];
    for (const c of [0, 1, 2] as const) {
      const p = dist[c];
      if (p === 0) continue;
      counts.push(c);
      recurse(idx + 1, counts, prob * p);
      counts.pop();
    }
  };
  recurse(0, [], 1);

  // Viable first, then by probability desc.
  outcomes.sort((a, b) => {
    if (a.isLethal !== b.isLethal) return a.isLethal ? 1 : -1;
    return b.probability - a.probability;
  });

  return outcomes;
}

/** Format a probability as a fraction + percent string. */
export function formatProbability(p: number): string {
  const pct = (p * 100).toFixed(p < 0.001 ? 3 : p < 0.01 ? 2 : 1);
  const frac = toFraction(p);
  return frac ? `${frac}  ·  ${pct}%` : `${pct}%`;
}

function toFraction(p: number): string | null {
  for (const denom of [1, 2, 4, 8, 16, 32, 64]) {
    const num = Math.round(p * denom);
    if (num >= 0 && Math.abs(num / denom - p) < 1e-9) {
      if (num === 0) return '0';
      if (num === denom) return '1';
      return `${num}/${denom}`;
    }
  }
  return null;
}

/**
 * Build a phenotype label from per-gene counts. e.g.:
 *   "Pastel het Albino"
 *   "Super pastel"
 *   "Wild type"
 * Lethal-homozygous outcomes get a "(lethal)" suffix.
 */
export function describeOutcome(
  outcome: OffspringOutcome,
  genes: Gene[],
): string {
  const parts: string[] = [];
  const visibleParts: string[] = [];
  const hetParts: string[] = [];

  outcome.counts.forEach((count, i) => {
    const gene = genes[i];
    if (count === 0) return;
    const state = countToState(count, gene.gene_type);
    if (state === 'het') {
      hetParts.push(`het ${gene.common_name}`);
    } else if (state === 'super') {
      visibleParts.push(`Super ${gene.common_name}`);
    } else {
      // 'visual'
      visibleParts.push(gene.common_name);
    }
  });

  parts.push(...visibleParts);
  parts.push(...hetParts);

  let label = parts.length === 0 ? 'Wild type' : parts.join(' ');
  if (outcome.isLethal) label += ' (lethal)';
  return label;
}
