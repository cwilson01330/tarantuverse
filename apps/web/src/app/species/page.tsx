/**
 * Species care-guide index — SERVER component (SEO surface).
 *
 * The interactive browser (taxon switcher, search, filters) lives in
 * SpeciesBrowserClient.tsx. This wrapper fetches the default view — the
 * tarantula catalog — on the server and hands it over as `initialSpecies`,
 * so the first HTML carries every species name and a link to its care
 * guide. Before this the page was 'use client' and crawlers received
 * "Loading species database..." and "0 tarantula species".
 *
 * Mirrors the pattern in species/[id]/page.tsx. Cached via ISR.
 */
import type { Metadata } from 'next'
import SpeciesBrowserClient, { type Species } from './SpeciesBrowserClient'

// Revalidate cached HTML hourly — the catalog changes rarely.
export const revalidate = 3600

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://tarantuverse.com'

const TITLE = 'Tarantula and Invertebrate Care Guides | Tarantuverse'
const DESCRIPTION =
  'Care guides for tarantulas, jumping spiders, scorpions, centipedes, mantises, isopods and more: temperature, humidity, enclosure, feeding and temperament for each species.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/species` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/species`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

async function getTarantulaSpecies(): Promise<Species[] | null> {
  try {
    const res = await fetch(`${API}/api/v1/species?limit=1000`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    const data = await res.json()
    // /species returns {items} or a bare array depending on version.
    const list = Array.isArray(data) ? data : data?.items
    return Array.isArray(list) ? (list as Species[]) : null
  } catch {
    // On any failure the client fetches as it always has.
    return null
  }
}

export default async function SpeciesPage() {
  const initialSpecies = await getTarantulaSpecies()
  return <SpeciesBrowserClient initialSpecies={initialSpecies} />
}
