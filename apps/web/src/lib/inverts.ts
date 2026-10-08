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
  | 'isopod'
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
  // Detritivore crustacean — measured by length, not leg span.
  isopod: { label: 'Isopod', glyph: '🪲', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Length (mm)' },
  other: { label: 'Other invertebrate', glyph: '🐾', prefix: 'inverts', speciesPrefix: 'invert-species', sizeLabel: 'Size (mm)' },
}

/**
 * Taxa a COLONY picker should offer — mirrors PICKER_TAXA in the mobile lib.
 *
 * The tarantula exclusion was removed 2026-09-08. It was a taxon-level answer
 * to a species-level question: balfouri and incei are established communals,
 * and two of the three colonies in production are tarantulas. Suitability is
 * now carried per species by `communal_suitable`, which exists on all three
 * catalogs (on `species` as of com_20260908). See the mobile lib for the full
 * reasoning.
 */
export const PICKER_TAXA: InvertTaxon[] = Object.keys(INVERT_TAXA) as InvertTaxon[]

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

/**
 * Registry entry for a taxon string off the wire. A missing taxon is read as
 * tarantula (older responses carried no taxon and were tarantula-only); an
 * unknown one falls back to "Other invertebrate".
 */
export function taxonMeta(taxon: string | null | undefined): InvertTaxonMeta {
  if (!taxon) return INVERT_TAXA.tarantula
  return isInvertTaxon(taxon) ? INVERT_TAXA[taxon] : INVERT_TAXA.other
}

/**
 * Public page for one animal. Tarantulas keep /t (printed QR labels point
 * there); every other taxon uses /i, which /t can't resolve.
 */
export function publicAnimalPath(animal: { id: string | number; taxon?: string | null }): string {
  return !animal.taxon || animal.taxon === 'tarantula' ? `/t/${animal.id}` : `/i/${animal.id}`
}

/** Name to show for an animal: its own name, then common, then scientific. */
export function animalDisplayName(animal: {
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
  taxon?: string | null
}): string {
  return animal.name || animal.common_name || animal.scientific_name || taxonMeta(animal.taxon).label
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
  scorpion: ['feedingStats', 'growth', 'breeding'], // breeding pilot — ADR-021 Phase D
  // Centipede breeding enabled 2026-10-06 (consistency audit C): the female
  // broods a clutch of eggs (no egg sac) — see 'Clutch' / 'plings' in
  // BREEDING_VOCABULARY below. 'plings' still wants a keeper's second opinion.
  centipede: ['feedingStats', 'growth', 'breeding'],
  // Growth enabled 2026-10-06 (consistency audit C): both molt through visible
  // instars and keepers measure them; /inverts/{id}/growth is taxon-agnostic
  // and growthLengthLabel() labels whip spiders 'Leg span', vinegaroons
  // 'Body length'. Breeding left off: no keeper demand on record.
  whip_spider: ['feedingStats', 'growth'],
  vinegaroon: ['feedingStats', 'growth'],
  // Jumping spiders lay an egg sac like a tarantula, so the pairing → sac →
  // offspring chain is the same shape. Enabled 2026-09-20 on real demand.
  true_spider: ['feedingStats', 'growth', 'breeding'],
  // Growth opt-in (2026-10-07): shown only once a molt carries a
  // measurement (showGrowthChart). Mirrors the mobile registry.
  millipede: ['growth'],
  // Instar tracking is core to mantis keeping. Breeding enabled 2026-09-22:
  // the ootheca → nymphs vocabulary below is correct and now actually read by
  // the hubs, so a mantis breeder is no longer offered a spider's "egg sac".
  // Demand is real — the first premium subscriber keeps 15 mantids.
  mantis: ['feedingStats', 'growth', 'breeding'],
  // Omnivore grazer, and kept as a colony far more often than individually —
  // colonies have their own screen (ADR-010). Not an oversight.
  roach: [],
  // Detritivores kept as a COLONY, not as individuals — the population is the
  // unit, and colonies have their own screen (ADR-010). No feeding cadence to
  // nag about, and no per-animal molt log worth charting: isopods molt in two
  // halves and nobody records it.
  isopod: [],
  // Catch-all keepers file real predators under; cards appear only with
  // data (2026-10-07, every taxon first-class). Mirrors mobile.
  other: ['feedingStats', 'growth'],
}

export function taxonHasModule(taxon: string, module: FeatureModule): boolean {
  return isInvertTaxon(taxon) && TAXON_MODULES[taxon].includes(module)
}

/**
 * Growth chart visibility. Most taxa show the card as soon as a molt exists
 * (it explains how to start measuring). Taxa that rarely get measured opt in
 * only once a molt actually carries a size or weight, so a millipede keeper
 * who never measures sees nothing new.
 */
const GROWTH_NEEDS_MEASUREMENT = new Set<string>(['millipede'])

export function showGrowthChart(
  taxon: string,
  growth: { total_molts: number; data_points?: { leg_span?: unknown; weight?: unknown }[] } | null | undefined,
): boolean {
  if (!growth || growth.total_molts <= 0 || !taxonHasModule(taxon, 'growth')) return false
  if (!GROWTH_NEEDS_MEASUREMENT.has(taxon)) return true
  return (growth.data_points ?? []).some((p) => p.leg_span != null || p.weight != null)
}

/** "today" / "yesterday" / "12 days ago" for the most recent molt, by calendar
 *  day in the viewer's timezone. A fact, not a prediction, so every taxon
 *  that logs molts gets it (premolt prediction stays tarantula-only). */
export function lastMoltAgo(molts: { molted_at: string }[]): string | null {
  if (!molts.length) return null
  const latest = molts.reduce((a, b) => (new Date(b.molted_at) > new Date(a.molted_at) ? b : a))
  const d = new Date(latest.molted_at)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const n = Math.round((day(new Date()) - day(d)) / 86_400_000)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
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

// ---------------------------------------------------------------------------
// Breeding vocabulary — mirror of
// apps/mobile/src/lib/taxon-modules.ts::BREEDING_VOCABULARY. Keep in lockstep.
//
// The breeding tables were built for tarantulas, so the schema says `egg_sacs`
// and `spiderling_count`. Those are spider words, and reusing them for another
// taxon makes the app confidently wrong about the animal in front of the
// keeper: a mantis lays an OOTHECA that hatches NYMPHS, and a scorpion is
// viviparous — it has no egg-laying stage at all, so offering its keeper an
// "egg sac" form asks for something that will never exist.
//
// That last case is why `clutch` is nullable rather than just a label. Scorpion
// breeding is already enabled above and the upgrade copy on the invert detail
// page still promises "pairings, egg sacs, and offspring", so this isn't
// hypothetical — it shipped.
// ---------------------------------------------------------------------------

export interface BreedingVocabulary {
  /** The egg-laying stage, or null for live-bearing taxa. */
  clutch: { noun: string; plural: string; offspring: string } | null
  /** Live-bearers skip from pairing straight to young. */
  liveBirth: { noun: string; plural: string; offspring: string } | null
}

export const BREEDING_VOCABULARY: Record<string, BreedingVocabulary> = {
  tarantula: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' }, liveBirth: null },
  // Jumpers lay a sac like a tarantula, so this is correct rather than merely tolerable.
  true_spider: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'spiderlings' }, liveBirth: null },
  whip_spider: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' }, liveBirth: null },
  mantis: { clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' }, liveBirth: null },
  roach: { clutch: { noun: 'Ootheca', plural: 'oothecae', offspring: 'nymphs' }, liveBirth: null },
  // "plings" is the hobby term, by analogy with tarantula "slings" — worth a
  // second opinion from someone who keeps them before this ships.
  centipede: { clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'plings' }, liveBirth: null },
  millipede: { clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'young' }, liveBirth: null },
  // Viviparous — no egg stage exists.
  scorpion: { clutch: null, liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'instars' } },
  // No egg stage the keeper sees: eggs are brooded internally in a marsupium
  // and released as live young. "Mancae" is the correct hobby term.
  isopod: { clutch: null, liveBirth: { noun: 'Brood', plural: 'broods', offspring: 'mancae' } },
  vinegaroon: { clutch: { noun: 'Egg sac', plural: 'egg sacs', offspring: 'young' }, liveBirth: null },
}

const FALLBACK_VOCABULARY: BreedingVocabulary = {
  clutch: { noun: 'Clutch', plural: 'clutches', offspring: 'offspring' },
  liveBirth: null,
}

export function breedingVocabulary(taxon: string): BreedingVocabulary {
  return BREEDING_VOCABULARY[taxon] ?? FALLBACK_VOCABULARY
}

/**
 * Whether this taxon has an egg-laying stage between pairing and offspring.
 * False for live-bearers, whose UI must SKIP the clutch step rather than
 * relabel it.
 */
export function taxonLaysClutch(taxon: string): boolean {
  return breedingVocabulary(taxon).clutch !== null
}

/**
 * Reads the stored `plural` rather than appending "s" — that shortcut produced
 * "Oothecas" and "Clutchs" while the correct forms sat in the table unused.
 */
export function clutchSectionLabel(taxon: string): string {
  const v = breedingVocabulary(taxon)
  const plural = v.clutch?.plural ?? v.liveBirth?.plural ?? 'clutches'
  return plural.charAt(0).toUpperCase() + plural.slice(1)
}

/**
 * Singular form for buttons and one-record headings — "Egg sac", "Ootheca",
 * "Brood".
 *
 * Reads the stored `noun` for the same reason clutchSectionLabel reads the
 * stored `plural`: deriving it by stripping an "s" gives "Clutche", and
 * "Oothecae" doesn't end in one at all. The correct forms are in the table.
 *
 * KEEP IN LOCKSTEP with apps/mobile/src/lib/taxon-modules.ts.
 */
export function clutchSingularLabel(taxon: string): string {
  const v = breedingVocabulary(taxon)
  return v.clutch?.noun ?? v.liveBirth?.noun ?? 'Clutch'
}

export function offspringNoun(taxon: string): string {
  const v = breedingVocabulary(taxon)
  return v.clutch?.offspring ?? v.liveBirth?.offspring ?? 'offspring'
}

// ---------------------------------------------------------------------------
// Stages (2026-10-07). For most non-tarantulas the instar, not size, is what
// keepers track: mantis keepers set it on two-thirds of their mantids and had
// logged no sizes at all. `current_instar` holds the instar for these taxa
// (keepers enter "L6", not a molt count) and the molt count for tarantulas;
// the server adds one per newest molt either way (api/app/utils/instar.py).

/** Taxa whose keepers count instars. */
const INSTAR_TAXA = new Set<string>(['mantis', 'scorpion', 'centipede', 'whip_spider', 'vinegaroon', 'true_spider'])

export function tracksInstars(taxon: string): boolean {
  return INSTAR_TAXA.has(taxon)
}

/** Label for the current_instar field. */
export function stageCountLabel(taxon: string): string {
  return INSTAR_TAXA.has(taxon) ? 'Instar' : 'Molts'
}

/** "L5" for mantids (the hobby's notation), "Instar 5" for other instar
 *  taxa, "5 molts" otherwise. */
export function formatStage(taxon: string, n: number): string {
  if (taxon === 'mantis') return `L${n}`
  if (INSTAR_TAXA.has(taxon)) return `Instar ${n}`
  return `${n} ${n === 1 ? 'molt' : 'molts'}`
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

/** "Usually adult after about 7 molts (around L8)". `moltsToAdult` is the
 *  care sheet's typical_instars_to_maturity, which stores MOLTS from hatching
 *  or birth to adult; keepers number the hatchling L1 / instar 1, so the
 *  adult stage is one more. Null when the sheet has no sourced figure, and
 *  never for taxa that keep molting as adults. */
export function adultStageHint(taxon: string, moltsToAdult: number | null | undefined): string | null {
  if (moltsToAdult == null || moltsToAdult < 1 || !INSTAR_TAXA.has(taxon) || !finalMoltCopy(taxon).offered) return null
  const stage = formatStage(taxon, moltsToAdult + 1)
  const around = taxon === 'mantis' ? stage : stage.charAt(0).toLowerCase() + stage.slice(1)
  const tail = taxon === 'mantis' ? '; males often one sooner' : ''
  return `Usually adult after about ${moltsToAdult} molts (around ${around})${tail}.`
}

const PROBLEM_OUTCOMES = new Set(['stuck', 'lost_limb', 'fatal'])
const OUTCOME_WORDS: Record<string, string> = { stuck: 'stuck', lost_limb: 'lost a limb', fatal: 'fatal' }

export interface StageEntry {
  id: string
  molted_at: string
  /** Stage reached with this molt, when the current stage is known. */
  stage: number | null
  daysSincePrevious: number | null
  outcome: string | null
  isFinal: boolean
}

export interface StageSummary {
  entries: StageEntry[] // newest first
  averageDaysPerStage: number | null
  problemCount: number
  problemSummary: string | null // "1 stuck, 1 lost a limb"
  adultSince: string | null // ISO date of the final molt
}

const dayMs = 86_400_000
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** The molt history as stages. The stage at each molt is counted back from
 *  the current one (newest molt = current stage), so it needs no baseline. */
export function stageSummary(
  molts: { id: string; molted_at: string; outcome?: string | null; is_ultimate?: boolean }[],
  currentStage: number | null | undefined,
): StageSummary {
  const asc = [...molts].sort((a, b) => dayOf(a.molted_at) - dayOf(b.molted_at))
  const entries: StageEntry[] = asc.map((m, i) => ({
    id: m.id,
    molted_at: m.molted_at,
    stage: currentStage != null ? currentStage - (asc.length - 1 - i) : null,
    daysSincePrevious: i > 0 ? Math.round((dayOf(m.molted_at) - dayOf(asc[i - 1].molted_at)) / dayMs) : null,
    outcome: m.outcome ?? null,
    isFinal: !!m.is_ultimate,
  }))
  for (const e of entries) if (e.stage != null && e.stage < 1) e.stage = null
  const gaps = entries.map((e) => e.daysSincePrevious).filter((d): d is number => d != null && d > 0)
  const problems = entries.filter((e) => e.outcome && PROBLEM_OUTCOMES.has(e.outcome))
  const counts: Record<string, number> = {}
  for (const p of problems) counts[p.outcome!] = (counts[p.outcome!] ?? 0) + 1
  const finalMolt = [...entries].reverse().find((e) => e.isFinal)
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
  const days = Math.max(0, Math.round((dayOf(new Date().toISOString()) - dayOf(iso)) / dayMs))
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  if (days < 63) return `${Math.round(days / 7)} weeks`
  const months = Math.round(days / 30.4)
  return `${months} ${months === 1 ? 'month' : 'months'}`
}

// ── Food vocabulary (audit-2 M6) ─────────────────────────────────────────────

export interface FoodVocabulary {
  /** Chips on the feeding form, most common first. The FIRST item is the
   *  default for a new feeding. Always ends with 'Other', which opens a
   *  free-text field — the typed text is what gets stored. */
  foods: string[]
  /** Whether "Prey size" means anything. Off for grazers: a handful of leaf
   *  litter has no "Medium". */
  preySize: boolean
}

/**
 * What each taxon is actually fed. Stored as plain text in feeding_logs.food_type,
 * so these are display strings, not codes — but keep the spellings stable
 * (and identical to the colony lists where they overlap), because the prey
 * breakdown in analytics groups on the exact string.
 *
 * Keep in lockstep with apps/mobile/src/lib/inverts.ts (test_food_vocabulary.py
 * compares the two; test_taxon_lists_in_sync.py checks every taxon is here).
 */
export const FOOD_VOCABULARY: Record<InvertTaxon, FoodVocabulary> = {
  tarantula: { foods: ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'], preySize: true },
  scorpion: { foods: ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'], preySize: true },
  centipede: { foods: ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'], preySize: true },
  // Adults take crickets and roaches; small nymphs start on flies.
  whip_spider: { foods: ['Cricket', 'Red Runner', 'Dubia Roach', 'Fruit fly', 'Other'], preySize: true },
  vinegaroon: { foods: ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'], preySize: true },
  // Jumping spiders and other small true spiders are mostly fed flies.
  true_spider: { foods: ['Fruit fly', 'House fly', 'Blue bottle fly', 'Cricket', 'Red Runner', 'Other'], preySize: true },
  millipede: { foods: ['Leaf litter', 'Rotting wood', 'Veg / greens', 'Fruit', 'Protein (fish flake)', 'Calcium (cuttlebone)', 'Other'], preySize: false },
  mantis: { foods: ['Fruit fly', 'House fly', 'Blue bottle fly', 'Cricket', 'Red Runner', 'Other'], preySize: true },
  roach: { foods: ['Dry gutload', 'Veg / greens', 'Fruit', 'Protein (fish flake)', 'Leaf litter', 'Other'], preySize: false },
  isopod: { foods: ['Leaf litter', 'Rotting wood', 'Veg / greens', 'Fruit', 'Protein (fish flake)', 'Calcium (cuttlebone)', 'Other'], preySize: false },
  other: { foods: ['Cricket', 'Dubia Roach', 'Fruit fly', 'Mealworm', 'Veg / greens', 'Leaf litter', 'Other'], preySize: true },
}

/** The vocabulary for a taxon string off the wire (unknown → "other"). */
export function foodVocabularyFor(taxon: string | null | undefined): FoodVocabulary {
  return (taxon && (FOOD_VOCABULARY as Record<string, FoodVocabulary>)[taxon]) || FOOD_VOCABULARY.other
}

/**
 * Split a stored food_type into the chip to select and the free text to show.
 * A value that isn't one of this taxon's chips (an older spelling, a food from
 * another list, or something typed under "Other") selects "Other" with the
 * text filled in, so editing a feeding never rewrites what was recorded.
 * Empty/null selects nothing: an unrecorded food stays unrecorded.
 */
export function splitStoredFood(stored: string | null | undefined, foods: string[]): { chip: string; other: string } {
  const value = (stored ?? '').trim()
  if (!value) return { chip: '', other: '' }
  const hit = foods.find((f) => f.toLowerCase() === value.toLowerCase())
  if (hit && hit !== 'Other') return { chip: hit, other: '' }
  return { chip: 'Other', other: hit === 'Other' ? '' : value }
}

/** The food_type to send: the chip, or the typed text under "Other". */
export function foodTypeToSave(chip: string, other: string): string | null {
  if (!chip) return null
  if (chip === 'Other') return other.trim() || 'Other'
  return chip
}
