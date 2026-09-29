/**
 * A card link (spec §6): the card image and nothing else. No path into the
 * animal, the collection or the keeper — by design. Unlisted: noindex.
 *
 * Never cached (a revoke must take effect immediately). A backend outage is
 * its own state, 'unavailable', and is never reported as "no longer shared".
 */
import type { Metadata } from 'next'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

type Params = { params: Promise<{ code: string }> }
type Card = {
  status: 'ok' | 'gone' | 'missing' | 'unavailable'
  name?: string | null
  species?: string | null
}

async function load(code: string): Promise<Card> {
  try {
    const r = await fetch(`${API_URL}/api/v1/card-links/${encodeURIComponent(code)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 410) return { status: 'gone' }
    if (r.status === 404) return { status: 'missing' }
    if (!r.ok) return { status: 'unavailable' }
    const p = await r.json()
    return { status: 'ok', name: p.name, species: p.scientific_name }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params
  const card = await load(code)
  const title =
    card.status === 'ok'
      ? card.name || card.species || 'A specimen'
      : card.status === 'unavailable'
        ? 'Specimen card'
        : 'No longer shared'
  const image = `${RENDERER}/api/card-link/${encodeURIComponent(code)}?shape=wide`
  return {
    title,
    robots: { index: false, follow: false },
    openGraph: { title, url: `https://www.tarantuverse.com/c/${encodeURIComponent(code)}`, images: card.status === 'ok' ? [{ url: image, width: 1200, height: 630 }] : [] },
    twitter: { card: card.status === 'ok' ? 'summary_large_image' : 'summary', title, images: card.status === 'ok' ? [image] : [] },
  }
}

export default async function CardLinkPage({ params }: Params) {
  const { code } = await params
  const card = await load(code)
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      {card.status === 'ok' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${RENDERER}/api/card-link/${encodeURIComponent(code)}?shape=post`}
          alt={[card.name, card.species].filter(Boolean).join(', ') || 'Specimen card'}
          width={1080}
          height={1350}
          className="w-full max-w-md h-auto aspect-[4/5] rounded-lg shadow-sm"
        />
      ) : card.status === 'unavailable' ? (
        <p className="text-gray-600 dark:text-gray-400">This card can&apos;t be loaded right now.</p>
      ) : (
        <p className="text-gray-600 dark:text-gray-400">This card is no longer shared.</p>
      )}
    </main>
  )
}
