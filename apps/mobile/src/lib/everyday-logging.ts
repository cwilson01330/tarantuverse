import { formatStage, tracksInstars } from './taxon-modules'

// ---- shared below: keep identical in both copies ----

function localDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Time since a date as a short phrase, in local calendar days:
 *  "today", "12 d", "3 mo", "2 yr". A future date reads as "today". */
export function elapsedShort(fromIso: string, now: Date): string {
  const from = parseLocal(fromIso)
  if (!from) return ''
  const days = Math.round((localDay(now) - localDay(from)) / 86400000)
  if (days <= 0) return 'today'
  if (days < 60) return `${days} d`
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
  if (now.getDate() < from.getDate()) months -= 1
  if (months < 24) return `${Math.max(months, 1)} mo`
  return `${Math.floor(months / 12)} yr`
}

export function matureBadge(maturedAt: string | null, now: Date): string | null {
  if (!maturedAt) return null
  const e = elapsedShort(maturedAt, now)
  return e ? `Mature · ${e}` : null
}

const MATURE_MALE_SOURCE =
  'https://www.thebiodude.com/blogs/helpful-husbandry-faqs/how-to-sex-male-vs-female-tarantulas'

// Jackson, R. R. (1978), "Life history of Phidippus johnsoni (Araneae,
// Salticidae)", Journal of Arachnology 6:1-29: lab adult males lived 94 +/- 47.7 days.
const JUMPER_MALE_SOURCE =
  'https://www.americanarachnology.org/journal-joa/joa-all-articles/article/download/JoA_v6_p1.pdf'

/** One sourced sentence for mature males: tarantulas, and true spiders whose
 *  linked species is a Salticidae (jumping spider). Anything else gets nothing. */
export function matureMaleNote(
  taxon: string,
  sex: string | null,
  family?: string | null,
): { text: string; sourceUrl: string } | null {
  if ((sex ?? '').toLowerCase() !== 'male') return null
  if (taxon === 'tarantula') {
    return {
      text: 'Mature males typically live a few months to a couple of years after their final molt.',
      sourceUrl: MATURE_MALE_SOURCE,
    }
  }
  if (taxon === 'true_spider' && (family ?? '').trim().toLowerCase() === 'salticidae') {
    return {
      text: 'In a lab study of a Phidippus jumping spider, males lived about 3 months on average after their final molt.',
      sourceUrl: JUMPER_MALE_SOURCE,
    }
  }
  return null
}

/** "L5" / "Instar 5" for instar taxa once a count is set; nothing otherwise. */
export function stageChip(taxon: string, currentInstar: number | null | undefined): string | null {
  if (!tracksInstars(taxon)) return null
  if (currentInstar == null || currentInstar < 1) return null
  return formatStage(taxon, currentInstar)
}

export const MOLT_PHOTO_PROMPT_KEY = 'molt_photo_prompt_v1'

/** Offer a photo after a molt, except millipedes (buried molt), closed
 *  animals, and keepers who turned the prompt off. */
export function offerMoltPhoto(taxon: string, isClosed: boolean, dismissed: boolean): boolean {
  return taxon !== 'millipede' && !isClosed && !dismissed
}

export function preyLabel(food: string | null, quantity: number | null | undefined): string {
  const q = quantity != null && quantity > 1 ? quantity : 0
  if (!food) return q ? `${q} prey items` : ''
  return q ? `${q} × ${food}` : food
}
