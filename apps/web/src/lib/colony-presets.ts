/**
 * Colony presentation presets — web mirror of
 * apps/mobile/src/lib/colony-buckets.ts. Keep the two in lockstep.
 *
 * The census and enclosure vocabulary genuinely differ by group:
 *   * Communal tarantulas are tracked by sex, with most animals unsexed,
 *     because slings can't be sexed and mature males often need pulling.
 *   * Feeder roaches can only be sexed as adults (dubia males are winged,
 *     hisser males have pronotal horns); nymphs are one unsexed bucket by
 *     definition, and colonies live in bins measured by volume rather than
 *     enclosures described as terrestrial or arboreal.
 */
export const GENERIC_BUCKETS = ['Adults', 'Juveniles', 'Mixed']

const BUCKETS_BY_TAXON: Record<string, string[]> = {
  tarantula: ['Unsexed', 'Females', 'Males'],
  true_spider: ['Unsexed', 'Females', 'Males'],
  roach: ['Adult females', 'Adult males', 'Nymphs'],
  scorpion: ['Adults', 'Juveniles', 'Instars'],
  millipede: ['Adults', 'Juveniles', 'Mixed'],
}

export function suggestedBuckets(
  taxon: string | null | undefined,
  existing: Record<string, unknown> = {},
): string[] {
  const preset = (taxon && BUCKETS_BY_TAXON[taxon]) || GENERIC_BUCKETS
  const have = new Set(Object.keys(existing).map((k) => k.toLowerCase()))
  return preset.filter((b) => !have.has(b.toLowerCase()))
}

export function bucketHint(taxon: string | null | undefined): string | null {
  if (taxon === 'tarantula' || taxon === 'true_spider') {
    return 'Slings usually can’t be sexed — keep them in Unsexed and move them across as they mature.'
  }
  if (taxon === 'roach') {
    return 'Only adults can be sexed reliably. Nymphs stay in their own bucket.'
  }
  return null
}

/** Whether terrestrial/arboreal/fossorial is a meaningful choice here. */
export function showsEnclosureOrientation(taxon: string | null | undefined): boolean {
  return taxon !== 'roach'
}

/** Example matching how this taxon is actually housed. */
export function enclosureSizePlaceholder(taxon: string | null | undefined): string {
  switch (taxon) {
    case 'roach':
      return 'e.g. 32-quart bin'
    case 'millipede':
      return 'e.g. 10-gallon / 20x10x12 inches'
    default:
      return 'e.g. 12x12x12 inches'
  }
}
