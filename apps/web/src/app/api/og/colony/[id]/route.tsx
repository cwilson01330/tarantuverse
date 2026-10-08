import { API_URL, fetchCardPayload, gone, notFound, renderCard, unavailable } from '@/lib/share-card/render'

export const runtime = 'nodejs'

/** Link-preview image for a colony that is ALREADY public (the /col rule:
 *  public collection, public colony, still running). The API answers 404 for
 *  anything else, so a private colony's link never gets an image. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await fetchCardPayload(`${API_URL}/api/v1/public-card/tarantuverse/colonies/${encodeURIComponent(id)}`, { next: { revalidate: 600 } })
  if (res.kind === 'not_found') return notFound()
  if (res.kind === 'gone') return gone()
  if (res.kind === 'unavailable') return unavailable()
  return renderCard(res.payload, 'og', 'wide')
}
