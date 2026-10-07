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
 *                   Rolling out taxon-by-taxon — scorpion was the pilot
 *                   (ADR-008 follow-up); whip spider and vinegaroon joined
 *                   2026-10-06. Millipedes deliberately skipped:
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
  // Centipede breeding enabled 2026-10-06 (consistency audit C): the female
  // broods a clutch of eggs (no egg sac), which is exactly what the 'Clutch' /
  // 'plings' entry in BREEDING_VOCABULARY below says. The word 'plings' still
  // wants a keeper's second opinion.
  centipede: ['feedingStats', 'growth', 'breeding'],
  // Growth enabled 2026-10-06 (consistency audit C): both molt through visible
  // instars and keepers measure them; /inverts/{id}/growth is taxon-agnostic
  // and growthLengthLabel() already labels whip spiders 'Leg span' and
  // vinegaroons 'Body length'. Breeding left off for now: a vinegaroon
  // breeding module has no keeper demand on record.
  whip_spider: ['feedingStats', 'growth'],
  vinegaroon: ['feedingStats', 'growth'],
  // Jumping spiders are the demand here — one keeper has 24 of them, 9 males
  // and 10 females. They lay an egg sac like a tarantula, so the whole
  // pairing → sac → offspring chain is biologically the same shape.
  // Growth (2026-10-07): keepers measure huntsmen, wolf spiders and big
  // jumpers after a molt; the chart only appears once a molt has a size.
  true_spider: ['feedingStats', 'growth', 'breeding'],
  // Detritivore: no live-prey cadence. Growth is opt-in (2026-10-07): most
  // millipedes molt underground and are never measured, but some keepers of
  // giants do; the chart shows only once a molt carries a measurement
  // (showGrowthChart below).
  millipede: ['growth'],
  // Instar tracking is core to mantis keeping. Breeding enabled 2026-09-22:
  // the ootheca → nymphs vocabulary below is correct and now actually read by
  // the hubs, so a mantis breeder is no longer offered a spider's "egg sac".
  // Demand is real — the first premium subscriber keeps 15 mantids.
  mantis: ['feedingStats', 'growth', 'breeding'],
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies are a separate table with their own screen (ADR-010), so an
  // individual roach genuinely has nothing here. Not an oversight.
  roach: [],
  // Detritivores kept as a COLONY, not as individuals — the population is the
  // unit, and colonies have their own screen (ADR-010). No feeding cadence to
  // nag about, and no per-animal molt log worth charting: isopods molt in two
  // halves and nobody records it.
  isopod: [],
  // The catch-all, and keepers file real predators here (beetles, crickets,
  // odd arachnids). Both cards appear only with data, and with no species
  // there is no cadence to invent: a countdown needs the keeper's own
  // schedule. Enabled 2026-10-07 (every taxon first-class).
  other: ['feedingStats', 'growth'],
};

/** Whether a taxon opts into a given feature module. */
export function taxonHasModule(taxon: string, module: FeatureModule): boolean {
  return (TAXON_MODULES[taxon] ?? []).includes(module);
}

/**
 * Growth chart visibility. Most taxa show the card as soon as a molt exists
 * (it explains how to start measuring). Taxa that rarely get measured opt in
 * only once a molt actually carries a size or weight, so a millipede keeper
 * who never measures sees nothing new.
 */
const GROWTH_NEEDS_MEASUREMENT = new Set<string>(['millipede']);

export function showGrowthChart(
  taxon: string,
  growth: { total_molts: number; data_points?: { leg_span?: unknown; weight?: unknown }[] } | null | undefined,
): boolean {
  if (!growth || growth.total_molts <= 0 || !taxonHasModule(taxon, 'growth')) return false;
  if (!GROWTH_NEEDS_MEASUREMENT.has(taxon)) return true;
  return (growth.data_points ?? []).some((p) => p.leg_span != null || p.weight != null);
}

/** "today" / "yesterday" / "12 days ago" for the most recent molt, by calendar
 *  day in the viewer's timezone. A fact, not a prediction, so every taxon
 *  that logs molts gets it (premolt prediction stays tarantula-only). */
export function lastMoltAgo(molts: { molted_at: string }[]): string | null {
  if (!molts.length) return null;
  const latest = molts.reduce((a, b) => (new Date(b.molted_at) > new Date(a.molted_at) ? b : a));
  const d = new Date(latest.molted_at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const n = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
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

/**
 * Singular form for buttons and one-record headings — "Egg sac", "Ootheca",
 * "Brood".
 *
 * Reads the stored `noun` for the same reason clutchSectionLabel reads the
 * stored `plural`: deriving it by stripping an "s" gives "Clutche" and
 * "Oothecae" → "Oothecae". The correct forms are already in the table.
 */
export function clutchSingularLabel(taxon: string): string {
  const v = breedingVocabulary(taxon);
  return v.clutch?.noun ?? v.liveBirth?.noun ?? 'Clutch';
}

/** What a count of young is called: "spiderlings", "nymphs", "instars". */
export function offspringNoun(taxon: string): string {
  const v = breedingVocabulary(taxon);
  return v.clutch?.offspring ?? v.liveBirth?.offspring ?? 'offspring';
}

// ---------------------------------------------------------------------------
// Stages (2026-10-07). For most non-tarantulas the instar, not size, is what
// keepers track: mantis keepers set it on two-thirds of their mantids and had
// logged no sizes at all. `current_instar` holds the instar for these taxa
// (keepers enter "L6", not a molt count) and the molt count for tarantulas;
// the server adds one per newest molt either way (api/app/utils/instar.py).

/** Taxa whose keepers count instars. */
const INSTAR_TAXA = new Set<string>(['mantis', 'scorpion', 'centipede', 'whip_spider', 'vinegaroon', 'true_spider']);

export function tracksInstars(taxon: string): boolean {
  return INSTAR_TAXA.has(taxon);
}

/** Label for the current_instar field. */
export function stageCountLabel(taxon: string): string {
  return INSTAR_TAXA.has(taxon) ? 'Instar' : 'Molts';
}

/** "L5" for mantids (the hobby's notation), "Instar 5" for other instar
 *  taxa, "5 molts" otherwise. */
export function formatStage(taxon: string, n: number): string {
  if (taxon === 'mantis') return `L${n}`
  if (INSTAR_TAXA.has(taxon)) return `Instar ${n}`
  return `${n} ${n === 1 ? 'molt' : 'molts'}`;
}

/** Wording for the "final molt" flag. Centipedes and whip spiders keep
 *  molting as adults, so the flag isn't offered for them at all. */
export function finalMoltCopy(taxon: string): { offered: boolean; label: string; hint: string; done: string } {
  if (taxon === 'centipede' || taxon === 'whip_spider') {
    return { offered: false, label: '', hint: '', done: '' }
  }
  if (taxon === 'tarantula') {
    return {
      offered: true,
      label: 'This was the ultimate molt',
      hint: 'For a male that has matured. Leave off if they’ll keep growing.',
      done: 'Recorded as matured — no further molts expected, so premolt predictions stop here. You can untick this later.',
    }
  }
  if (taxon === 'mantis') {
    return {
      offered: true,
      label: 'This was the final molt (now adult)',
      hint: 'Mantids stop molting once they reach adulthood, when the wings are fully formed.',
      done: 'Recorded as adult — no further molts expected. You can untick this later.',
    }
  }
  if (taxon === 'true_spider') {
    return {
      offered: true,
      label: 'This was the final molt (now mature)',
      hint: 'Most spiders stop molting at maturity; mature males show swollen palps.',
      done: 'Recorded as mature — no further molts expected. You can untick this later.',
    }
  }
  return {
    offered: true,
    label: 'This was the final molt (now adult)',
    hint: 'Use when the animal has reached adulthood and won’t molt again.',
    done: 'Recorded as adult — no further molts expected. You can untick this later.',
  }
}

const PROBLEM_OUTCOMES = new Set(['stuck', 'lost_limb', 'fatal']);
const OUTCOME_WORDS: Record<string, string> = { stuck: 'stuck', lost_limb: 'lost a limb', fatal: 'fatal' }

export interface StageEntry {
  id: string;
  molted_at: string;
  /** Stage reached with this molt, when the current stage is known. */
  stage: number | null;
  daysSincePrevious: number | null;
  outcome: string | null;
  isFinal: boolean;
}

export interface StageSummary {
  entries: StageEntry[] // newest first;
  averageDaysPerStage: number | null;
  problemCount: number;
  problemSummary: string | null // "1 stuck, 1 lost a limb";
  adultSince: string | null // ISO date of the final molt;
}

const dayMs = 86_400_000;
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The molt history as stages. The stage at each molt is counted back from
 *  the current one (newest molt = current stage), so it needs no baseline. */
export function stageSummary(
  molts: { id: string; molted_at: string; outcome?: string | null; is_ultimate?: boolean }[],
  currentStage: number | null | undefined,
): StageSummary {
  const asc = [...molts].sort((a, b) => dayOf(a.molted_at) - dayOf(b.molted_at));
  const entries: StageEntry[] = asc.map((m, i) => ({
    id: m.id,
    molted_at: m.molted_at,
    stage: currentStage != null ? currentStage - (asc.length - 1 - i) : null,
    daysSincePrevious: i > 0 ? Math.round((dayOf(m.molted_at) - dayOf(asc[i - 1].molted_at)) / dayMs) : null,
    outcome: m.outcome ?? null,
    isFinal: !!m.is_ultimate,
  }));
  for (const e of entries) if (e.stage != null && e.stage < 1) e.stage = null
  const gaps = entries.map((e) => e.daysSincePrevious).filter((d): d is number => d != null && d > 0);
  const problems = entries.filter((e) => e.outcome && PROBLEM_OUTCOMES.has(e.outcome));
  const counts: Record<string, number> = {}
  for (const p of problems) counts[p.outcome!] = (counts[p.outcome!] ?? 0) + 1
  const finalMolt = [...entries].reverse().find((e) => e.isFinal);
  return {
    entries: entries.reverse(),
    averageDaysPerStage: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    problemCount: problems.length,
    problemSummary: problems.length ? Object.entries(counts).map(([k, n]) => `${n} ${OUTCOME_WORDS[k] ?? k}`).join(', ') : null,
    adultSince: finalMolt?.molted_at ?? null,
  }
}

/** "5 days", "6 weeks", "4 months" since a date. Elapsed only. */
export function elapsedSince(iso: string): string {
  const days = Math.max(0, Math.round((dayOf(new Date().toISOString()) - dayOf(iso)) / dayMs));
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  if (days < 63) return `${Math.round(days / 7)} weeks`
  const months = Math.round(days / 30.4);
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}
