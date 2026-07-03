/**
 * Invert care-guide page — SERVER component (SEO surface).
 *
 * Non-tarantula care guides (scorpion, mantis, jumping spider, roach, millipede,
 * centipede, whip spider, vinegaroon, …) live here. The interactive UI is in
 * InvertCareSheetClient.tsx ('use client'); this thin server wrapper ships real
 * per-species <title>/meta + Open Graph + JSON-LD in the initial HTML and is
 * cached via ISR — without it these pages crawled as the generic site title only.
 * Mirrors the tarantula route at species/[id]/page.tsx.
 */
import type { Metadata } from 'next'
import InvertCareSheetClient, { type InvertSpecies } from './InvertCareSheetClient'

// Revalidate cached HTML hourly — care content changes rarely.
export const revalidate = 3600

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://tarantuverse.com'

const TAXON_LABELS: Record<string, string> = {
  whip_spider: 'whip spider',
  scorpion: 'scorpion',
  centipede: 'centipede',
  tarantula: 'tarantula',
  mantis: 'mantis',
  roach: 'roach',
  millipede: 'millipede',
  vinegaroon: 'vinegaroon',
  true_spider: 'jumping/true spider',
  other: 'invertebrate',
}

// Full InvertSpecies shape lives in the client component; the server fetches
// the complete record and hands it over as `initialSpecies` so the whole care
// sheet renders into the SSR HTML.

async function getSpecies(id: string): Promise<InvertSpecies | null> {
  try {
    const res = await fetch(`${API}/api/v1/invert-species/${id}`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    return (await res.json()) as InvertSpecies
  } catch {
    return null
  }
}

function buildDescription(s: InvertSpecies): string {
  const name = s.common_names?.[0] || s.scientific_name
  if (s.care_guide && s.care_guide.trim()) {
    const flat = s.care_guide.replace(/[#*_>`\-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (flat.length > 0) return flat.slice(0, 155)
  }
  const taxon = TAXON_LABELS[s.taxon] ?? 'invertebrate'
  const bits = [
    `${name} (${taxon}) care guide`,
    'enclosure, temperature, humidity, feeding & temperament',
  ]
  if (s.native_region) bits.push(`native to ${s.native_region}`)
  return `${bits.join(' — ')}. Track your collection free on Tarantuverse.`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const s = await getSpecies(id)
  if (!s) {
    return { title: 'Care Guide | Tarantuverse' }
  }
  const common = s.common_names?.[0]
  const title = `${s.scientific_name}${common ? ` (${common})` : ''} Care Guide | Tarantuverse`
  const description = buildDescription(s)
  const url = `${SITE}/species/inverts/${id}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      siteName: 'Tarantuverse',
      images: s.image_url ? [{ url: s.image_url }] : undefined,
    },
    twitter: {
      card: s.image_url ? 'summary_large_image' : 'summary',
      title,
      description,
      images: s.image_url ? [s.image_url] : undefined,
    },
  }
}

export default async function InvertSpeciesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const s = await getSpecies(id)

  // JSON-LD for rich results — rendered server-side so crawlers see it without JS.
  const jsonLd = s
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `${s.scientific_name} Care Guide`,
        about: s.scientific_name,
        description: buildDescription(s),
        ...(s.image_url ? { image: s.image_url } : {}),
        publisher: {
          '@type': 'Organization',
          name: 'Tarantuverse',
          url: SITE,
        },
        mainEntityOfPage: `${SITE}/species/inverts/${id}`,
      }
    : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <InvertCareSheetClient initialSpecies={s} />
    </>
  )
}
