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
 * Enabled per taxon below — the old claim that "only tarantula has modules
 * enabled" outlived the table it describes:
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
 *   - breeding:     pairings and their offspring. What comes BETWEEN those two
 *                   differs by animal, so the module is paired with
 *                   BREEDING_VOCABULARY below — enabling the module without
 *                   checking the vocabulary is how a scorpion keeper ends up
 *                   being offered an "egg sac".
 *
 * When the backing data lands for another taxon, add the module to its list
 * and render it in the shared spot — the gate is already here.
 */
export type FeatureModule = 'premolt' | 'feedingStats' | 'growth' | 'breeding';

export const TAXON_MODULES: Record<string, FeatureModule[]> = {
  tarantula: ['premolt', 'feedingStats', 'growth', 'breeding'],
  scorpion: ['feedingStats', 'growth', 'breeding'], // breeding pilot — ADR-021 Phase D (web + mobile)
  centipede: ['feedingStats', 'growth'],
  whip_spider: ['feedingStats'],
  vinegaroon: ['feedingStats'],
  // Jumping spiders are the demand here — one keeper has 24 of them, 9 males
  // and 10 females. They lay an egg sac like a tarantula, so the whole
  // pairing → sac → offspring chain is biologically the same shape.
  true_spider: ['feedingStats', 'breeding'],
  millipede: [], // detritivore — no live-prey cadence, and molts underground
  mantis: ['feedingStats', 'growth'], // instar tracking is core to mantis keeping
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies are a separate table with their own screen (ADR-010), so an
  // individual roach genuinely has nothing here. Not an oversight.
  roach: [],
  // Detritivores kept as a COLONY, not as individuals — the population is the
  // unit, and colonies have their own screen (ADR-010). No feeding cadence to
  // nag about, and no per-animal molt log worth charting: isopods molt in two
  // halves and nobody records it.
  isopod: [],
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

// ---------------------------------------------------------------------------
// Breeding vocabulary
// ---------------------------------------------------------------------------

/**
 * What a taxon's breeding cycle is actually CALLED, and whether it has an
 * egg-laying stage at all.
 *
 * WHY THIS EXISTS
 * ---------------
 * The breeding tables were built for tarantulas, so the schema says
 * `egg_sacs` and `spiderling_count`. Those are spider words. Turning the
 * module on for another taxon without translating them produces a screen that
 * is confidently wrong about the animal in front of the keeper:
 *
 *   - a mantis lays an OOTHECA and it hatches NYMPHS, not an egg sac of
 *     spiderlings;
 *   - a scorpion is viviparous. It has no egg-laying stage whatsoever — the
 *     female gives live birth to a BROOD and carries the young on her back.
 *     Offering her keeper an "egg sac" form isn't a wording nit, it's the app
 *     asking for something that will never exist.
 *
 * That second case is why `clutch` is nullable rather than just a label.
 * Scorpion breeding is already enabled in TAXON_MODULES and the web upgrade
 * copy still promises "pairings, egg sacs, and offspring" to those keepers, so
 * this isn't hypothetical — it shipped.
 *
 * KEEP IN LOCKSTEP with apps/web/src/lib/inverts.ts::BREEDING_VOCABULARY.
 * A taxon that has `breeding` in TAXON_MODULES but no entry here falls back to
 * neutral wording, which is safe but reads generic — add a real entry.
 */
export interface BreedingVocabulary {
  /** The egg-laying stage, or null for live-bearing taxa. */
  clutch: {
    /** Sentence-case singular for headings and buttons: "Egg sac". */
    noun: string;
    /** Lower-case plural for running copy: "egg sacs". */
    plural: string;
    /** What the keeper records a count of: "spiderlings". */
    offspring: string;
  } | null;
  /**
   * Live-bearing taxa skip straight from pairing to young. The noun names what
   * the female produces — a scorpion's "brood".
   */
  liveBirth: { noun: string; plural: string; offspring: string } | null;
}

export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = {
  tarantula: {
    clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' },
    liveBirth: null,
  },
  true_spider: {
    // Jumpers and other true spiders lay a sac like a tarantula, so the
    // tarantula vocabulary is correct here rather than merely tolerable.
    clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' },
    liveBirth: null,
  },
  whip_spider: {
    // Amblypygids carry eggs in a ventral sac then the young ride the mother.
    // "Brood" is what keepers say for the post-hatch stage.
    clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' },
    liveBirth: null,
  },
  mantis: {
    clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' },
    liveBirth: null,
  },
  roach: {
    clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' },
    liveBirth: null,
  },
  centipede: {
    // "plings" is the hobby term, by analogy with tarantula "slings". Worth a
    // second opinion from someone who keeps them before this ships.
    clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'plings' },
    liveBirth: null,
  },
  millipede: {
    clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'young' },
    liveBirth: null,
  },
  scorpion: {
    // Viviparous — no egg stage exists. See the note above.
    clutch: null,
    liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'instars' },
  },
  isopod: {
    // No egg stage the keeper ever sees. The female broods eggs internally in
    // a marsupium and releases live young, so offering an "egg sac" form would
    // ask for something that never exists outside her.
    clutch: null,
    // "Mancae" is the correct and universally used hobby term for newly
    // released isopods — not nymphs (insects) and not spiderlings.
    liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'mancae' },
  },
  vinegaroon: {
    // Also carries an egg sac beneath the abdomen, young ride the mother.
    clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' },
    liveBirth: null,
  },
};

/** Neutral wording for a taxon with no entry — safe, deliberately generic. */
const FALLBACK_VOCABULARY: BreedingVocabulary = {
  clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'offspring' },
  liveBirth: null,
};

export function breedingVocabulary(taxon: string): BreedingVocabulary {
  return BREEDING_VOCABULARY[taxon] ?? FALLBACK_VOCABULARY;
}

/**
 * Whether this taxon has an egg-laying stage to record between pairing and
 * offspring. False for live-bearers, whose UI must skip the clutch step
 * entirely rather than label it something else.
 */
export function taxonLaysClutch(taxon: string): boolean {
  return breedingVocabulary(taxon).clutch !== null;
}

/**
 * Heading for the clutch step — "Egg sacs", "Oothecae", or for a live-bearer
 * the thing they actually produce ("Broods").
 *
 * Reads the stored `plural` rather than appending "s". That shortcut produced
 * "Oothecas" and "Clutchs" — the correct forms were already sitting in the
 * table unused, which is the whole reason they're stored explicitly.
 */
export function clutchSectionLabel(taxon: string): string {
  const v = breedingVocabulary(taxon);
  const plural = v.clutch?.plural ?? v.liveBirth?.plural ?? 'clutches';
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** What a count of young is called: "spiderlings", "nymphs", "instars". */
export function offspringNoun(taxon: string): string {
  const v = breedingVocabulary(taxon);
  return v.clutch?.offspring ?? v.liveBirth?.offspring ?? 'offspring';
}
