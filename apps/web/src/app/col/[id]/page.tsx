import type { Metadata } from 'next'
import ColonyPublicClient from './ColonyPublicClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const RENDERER = process.env.NEXT_PUBLIC_CARD_RENDERER_URL || 'https://www.tarantuverse.com'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  // Same rule as /i: only a colony that is ALREADY public gets a preview. The
  // public endpoint answers 403/404 for anything else (and this request is
  // anonymous), so a private colony's link reveals nothing. Any failure gets a
  // bare title.
  try {
    const r = await fetch(`${API_URL}/api/v1/col/${encodeURIComponent(id)}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { title: 'Tarantuverse' }
    const p = await r.json()
    const title = p.name || p.scientific_name || 'A colony'
    const description = [p.scientific_name, p.common_name].filter((v) => v && v !== title).join(' · ') || undefined
    // The preview card: /public-card applies the same rule again (and also
    // drops ended colonies), so the image never shows more than /col does.
    const image = `${RENDERER}/api/og/colony/${encodeURIComponent(id)}`
    return {
      title,
      description,
      openGraph: { title, description, url: `https://www.tarantuverse.com/col/${encodeURIComponent(id)}`, images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    }
  } catch {
    return { title: 'Tarantuverse' }
  }
}

export default function Page() {
  return <ColonyPublicClient />
}
