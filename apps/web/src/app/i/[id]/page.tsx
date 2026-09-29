import type { Metadata } from 'next'
import InvertPublicClient from './InvertPublicClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // Only animals that are ALREADY public get a preview; anything else (or any
  // failure) gets a bare title, so a private animal's link reveals nothing.
  try {
    const r = await fetch(`${API_URL}/api/v1/public-card/tarantuverse/${encodeURIComponent(id)}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { title: 'Tarantuverse' }
    const p = await r.json()
    const title = p.name || p.scientific_name || 'A specimen'
    const image = `${RENDERER}/api/og/tarantuverse/${encodeURIComponent(id)}`
    return {
      title,
      description: p.scientific_name ?? undefined,
      openGraph: { title, url: `https://www.tarantuverse.com/i/${encodeURIComponent(id)}`, images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title, images: [image] },
    }
  } catch {
    return { title: 'Tarantuverse' }
  }
}

export default function Page() {
  return <InvertPublicClient />
}
