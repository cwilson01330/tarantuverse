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
 *   - feedingStats: backed by /analytics/tarantulas/{id}/feeding-stats only.
 *                   Extending to predatory inverts (feeding_mode='predator')
 *                   needs a generic invert feeding-stats endpoint first.
 *   - growth:       needs per-molt leg-span/weight measurements, which the
 *                   simple invert molt log doesn't capture yet.
 *   - breeding:     tarantula pairings/egg-sacs/offspring.
 *
 * When the backing data lands for another taxon, add the module to its list
 * and render it in the shared spot — the gate is already here.
 */
export type FeatureModule = 'premolt' | 'feedingStats' | 'growth' | 'breeding';

export const TAXON_MODULES: Record<string, FeatureModule[]> = {
  tarantula: ['premolt', 'feedingStats', 'growth', 'breeding'],
  scorpion: [],
  centipede: [],
  whip_spider: [],
  vinegaroon: [],
  true_spider: [],
  millipede: [],
  mantis: [],
  other: [],
};

/** Whether a taxon opts into a given feature module. */
export function taxonHasModule(taxon: string, module: FeatureModule): boolean {
  return (TAXON_MODULES[taxon] ?? []).includes(module);
}
