/**
 * Per-taxon feature-module registry (ADR-008, convergence slice 4).
 *
 * The shared detail base renders a common layout (hero, identity, husbandry,
 * logs, photos, notes). The richer, taxon-specific pieces — premolt
 * prediction, feeding-stats charts, growth charts, breeding — are OPT-IN
 * "feature modules". This registry is the single source of truth for which
 * taxon gets which module, so enabling one for a new taxon is a one-line edit
 * here (plus the backend data the module needs), not a screen rewrite.
 *
 * Today only tarantula has modules enabled:
 *   - premolt:      tuned for tarantula feeding-refusal + molt-interval signal;
 *                   not validated for other taxa (see ADR-008).
 *   - feedingStats: backed by /inverts/{id}/feeding-stats, which is
 *                   taxon-agnostic. (This comment used to say the module was
 *                   blocked on "a generic invert feeding-stats endpoint" —
 *                   that endpoint shipped, and the claim outlived it. Enabled
 *                   for predator taxa; detritivores and omnivores are left off
 *                   because they graze rather than take prey on a cadence, so
 *                   "12 days since fed" would be a number without a meaning.)
 *   - growth:       backed by the generic /inverts/{id}/growth endpoint;
 *                   the invert molt form captures per-molt measurements.
 *                   Rolling out taxon-by-taxon — scorpion is the pilot
 *                   (ADR-008 follow-up). Millipedes deliberately skipped:
 *                   they molt underground and keepers rarely measure.
 *   - breeding:     tarantula pairings/egg-sacs/offspring.
 *
 * When the backing data lands for another taxon, add the module to its list
 * and render it in the shared spot — the gate is already here.
 */
export type FeatureModule = 'premolt' | 'feedingStats' | 'growth' | 'breeding';

export const TAXON_MODULES: Record<string, FeatureModule[]> = {
  tarantula: ['premolt', 'feedingStats', 'growth', 'breeding'],
  scorpion: ['feedingStats', 'growth', 'breeding'], // breeding pilot — ADR-010 Phase D (web + mobile)
  centipede: ['feedingStats', 'growth'],
  whip_spider: ['feedingStats'],
  vinegaroon: ['feedingStats'],
  true_spider: ['feedingStats'],
  millipede: [], // detritivore — no live-prey cadence, and molts underground
  mantis: ['feedingStats', 'growth'], // instar tracking is core to mantis keeping
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies are a separate table with their own screen (ADR-010), so an
  // individual roach genuinely has nothing here. Not an oversight.
  roach: [],
  other: [],
};

/** Whether a taxon opts into a given feature module. */
export function taxonHasModule(taxon: string, module: FeatureModule): boolean {
  return (TAXON_MODULES[taxon] ?? []).includes(module);
}

/**
 * Label for the linear growth measurement per taxon. The molt-log columns
 * are called leg_span_* for legacy reasons, but the number a keeper records
 * differs by taxon: leg span only makes sense for spiders — everything else
 * measures body length (honesty-first: never display a label that misstates
 * what the keeper measured).
 */
const GROWTH_LENGTH_LABELS: Record<string, string> = {
  tarantula: 'Leg span',
  true_spider: 'Leg span',
  whip_spider: 'Leg span',
};

export function growthLengthLabel(taxon: string): string {
  return GROWTH_LENGTH_LABELS[taxon] ?? 'Body length';
}
