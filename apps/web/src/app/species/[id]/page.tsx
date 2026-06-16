/**
 * Species care-guide page — SERVER component (SEO surface).
 *
 * The interactive UI lives in SpeciesDetailClient.tsx ('use client'); this
 * thin server wrapper exists so each care guide ships real per-species
 * <title>/meta + Open Graph + JSON-LD in the initial HTML, and is cached via
 * ISR. That's what lets these ~100+ guides rank and pull organic traffic
 * (previously the page was 'use client' with only the generic site title).
 */
import type { Metadata } from 'next'
import SpeciesDetailClient from './SpeciesDetailClient'

// Revalidate cached HTML hourly — care content changes rarely.
export const revalidate = 3600

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://tarantuverse.com'

interface Species {
  id: string
  scientific_name: string
  common_names?: string[]
  care_guide?: string | null
  care_level?: string | null
  temperament?: string | null
  type?: string | null
  native_region?: string | null
  adult_size?: string | null
  image_url?: string | null
}

async function getSpecies(id: string): Promise<Species | null> {
  try {
    const res = await fetch(`${API}/api/v1/species/${id}`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    return (await res.json()) as Species
  } catch {
    return null
  }
}

function buildDescription(s: Species): string {
  const name = s.common_names?.[0] || s.scientific_name
  if (s.care_guide && s.care_guide.trim()) {
    const flat = s.care_guide.replace(/[#*_>`\-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (flat.length > 0) return flat.slice(0, 155)
  }
  const bits = [
    `${name} care guide`,
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
  const url = `${SITE}/species/${id}`
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

export default async function SpeciesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const s = await getSpecies(id)

  // JSON-LD for rich results. Article is the safest fit for a care guide;
  // rendered server-side so crawlers see it without executing JS.
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
        mainEntityOfPage: `${SITE}/species/${id}`,
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
      <SpeciesDetailClient />
    </>
  )
}
