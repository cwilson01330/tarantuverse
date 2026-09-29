import { API_URL, fetchCardPayload, gone, notFound, renderCard, unavailable } from '@/lib/share-card/render'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ app: string; id: string }> }) {
  const { app, id } = await params
  if (app !== 'tarantuverse' && app !== 'herpetoverse') return notFound()
  const res = await fetchCardPayload(`${API_URL}/api/v1/public-card/${app}/${encodeURIComponent(id)}`, { next: { revalidate: 600 } })
  if (res.kind === 'not_found') return notFound()
  if (res.kind === 'gone') return gone()
  if (res.kind === 'unavailable') return unavailable()
  return renderCard(res.payload, 'og', 'wide')
}
