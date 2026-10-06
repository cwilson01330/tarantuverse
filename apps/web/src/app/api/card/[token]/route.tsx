import { API_URL, fetchCardPayload, gone, notFound, renderCard, unavailable } from '@/lib/share-card/render'

export const runtime = 'nodejs'

// The Herpetoverse composer fetches the PNG as a blob cross-origin. The token
// is the credential, so a wildcard origin exposes nothing extra.
function cors(res: Response): Response {
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await fetchCardPayload(`${API_URL}/api/v1/share-cards/${encodeURIComponent(token)}/data`, { cache: 'no-store' })
  if (res.kind === 'not_found') return cors(notFound(true))
  if (res.kind === 'gone') return cors(gone(true))
  if (res.kind === 'unavailable') return cors(unavailable())
  // ?size=preview → half-size live preview; ?fmt=jpg → JPEG instead of PNG.
  // Both opt-in, so app builds that predate them keep the full-size PNG.
  const q = new URL(req.url).searchParams
  return cors(await renderCard(res.payload, 'token', undefined, {
    scale: q.get('size') === 'preview' ? 0.5 : 1,
    format: q.get('fmt') === 'jpg' ? 'jpeg' : 'png',
  }))
}
