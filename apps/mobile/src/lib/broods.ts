// Egg sac / brood helpers. Mobile copy of apps/web/src/lib/broods.ts.

// ---- shared below: keep identical in both copies ----

/** Where an egg sac / brood stands. `hatched_removed` = hatched, but the
 *  group made from it has since been deleted. */
export type SacStatus = 'waiting' | 'hatched' | 'hatched_removed' | 'failed'

export function sacStatus(sac: {
  outcome: string | null
  hatched_colony: { id: string; name: string } | null
}): SacStatus {
  if (sac.outcome === 'failed') return 'failed'
  if (sac.outcome === 'hatched') return sac.hatched_colony ? 'hatched' : 'hatched_removed'
  return 'waiting'
}

/** Live-bearers have no waiting period, so their words differ. */
export function sacStatusLabel(status: SacStatus, liveBirth: boolean): string {
  switch (status) {
    case 'waiting':
      return liveBirth ? 'Not grouped yet' : 'Waiting'
    case 'hatched':
      return liveBirth ? 'Grouped' : 'Hatched'
    case 'hatched_removed':
      return 'Hatched (group removed)'
    case 'failed':
      return "Didn't hatch"
  }
}

export const SPLIT_MAX = 50

/** How many animals one split may create: the group's count, capped. */
export function splitMax(total: number): number {
  if (!Number.isFinite(total)) return 0
  return Math.min(SPLIT_MAX, Math.max(0, Math.floor(total)))
}

export function splitNoun(taxon: string): string {
  switch (taxon) {
    case 'true_spider':
    case 'tarantula':
      return 'spiders'
    case 'mantis':
      return 'mantids'
    case 'scorpion':
      return 'scorpions'
    default:
      return 'animals'
  }
}

export function splitCapText(canAdd: number): string {
  return canAdd > 0 ? `You can add ${canAdd} more on the free plan` : "You're at the free plan's limit"
}
