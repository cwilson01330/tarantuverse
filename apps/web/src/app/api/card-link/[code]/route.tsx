import { API_URL, asShape, fetchCardPayload, notFound, renderCard, renderNoLongerShared, unavailable } from '@/lib/share-card/render'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const shape = asShape(new URL(req.url).searchParams.get('shape'))
  const res = await fetchCardPayload(`${API_URL}/api/v1/card-links/${encodeURIComponent(code)}`, { cache: 'no-store' })
  if (res.kind === 'not_found') return notFound()
  if (res.kind === 'gone') return renderNoLongerShared(shape)
  if (res.kind === 'unavailable') return unavailable()
  return renderCard(res.payload, 'link', shape)
}
