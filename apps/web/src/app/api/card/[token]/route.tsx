import { API_URL, fetchCardPayload, gone, notFound, renderCard, unavailable } from '@/lib/share-card/render'

export const runtime = 'nodejs'

// The Herpetoverse composer fetches the PNG as a blob cross-origin. The token
// is the credential, so a wildcard origin exposes nothing extra.
function cors(res: Response): Response {
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await fetchCardPayload(`${API_URL}/api/v1/share-cards/${encodeURIComponent(token)}/data`, { cache: 'no-store' })
  if (res.kind === 'not_found') return cors(notFound(true))
  if (res.kind === 'gone') return cors(gone(true))
  if (res.kind === 'unavailable') return cors(unavailable())
  return cors(await renderCard(res.payload, 'token'))
}
