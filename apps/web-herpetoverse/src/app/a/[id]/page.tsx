/**
 * Public animal profile route — destination of label QR codes.
 *
 * ADR-003 collapsed the per-taxon `/s/[id]` (snake) and `/l/[id]`
 * (lizard) routes into this one taxon-agnostic route. The backend
 * `/api/v1/a/{id}` endpoint returns the taxon in its payload, so the
 * shared ReptilePublicProfile renderer no longer needs a taxon prop.
 *
 * This file is the route entry that resolves the dynamic `[id]` param
 * and forwards to the shared renderer.
 */
import type { Metadata } from 'next'
import ReptilePublicProfile from '@/components/ReptilePublicProfile'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

interface Params {
  id: string
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  // Only already-public animals get a preview; any failure gets a bare title.
  try {
    const r = await fetch(`${API_URL}/api/v1/public-card/herpetoverse/${encodeURIComponent(id)}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { title: 'Herpetoverse' }
    const p = await r.json()
    const title = p.name || p.scientific_name || 'A specimen'
    // Whatever the title doesn't already say: common name, plus the species
    // when the animal has its own name.
    const description = [p.scientific_name, p.common_name].filter((v) => v && v !== title).join(' · ') || undefined
    const image = `${RENDERER}/api/og/herpetoverse/${encodeURIComponent(id)}`
    return {
      title,
      description,
      openGraph: { title, description, url: `https://herpetoverse.com/a/${encodeURIComponent(id)}`, images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    }
  } catch {
    return { title: 'Herpetoverse' }
  }
}

export default async function PublicAnimalPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  return <ReptilePublicProfile animalId={id} />
}
