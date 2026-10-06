const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

export type CardKind = 'molt' | 'profile'
export type CardShape = 'story' | 'post' | 'square'
export type CardApp = 'tarantuverse' | 'herpetoverse'
export type CardFrame = 'specimen' | 'notes' | 'herbarium'

/** Composer order (handoff §4): Herbarium · Field notes · Specimen. */
export const FRAMES: { key: CardFrame; label: string }[] = [
  { key: 'herbarium', label: 'Herbarium' },
  { key: 'notes', label: 'Field notes' },
  { key: 'specimen', label: 'Specimen' },
]

export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  molts: 'Molt count', size: 'Size', size_change: 'Size change', days_in_care: 'Days in care',
  weight: 'Weight', length: 'Length', sheds: 'Shed count',
}

export const FIELDS: Record<string, string[]> = {
  'tarantuverse:molt': ['photo', 'name', 'species', 'size_change', 'days_in_care'],
  'tarantuverse:profile': ['photo', 'name', 'species', 'sex', 'in_care', 'molts', 'size'],
  'herpetoverse:profile': ['photo', 'name', 'species', 'sex', 'in_care', 'weight', 'length', 'sheds'],
}

/** The keeper's framing for the photo: point to centre (0-1) and zoom (1-4). */
export interface PhotoFocus { x: number; y: number; zoom: number }

/** Width/height of the photo window per frame and shape, so "Adjust photo"
 *  shows roughly what the card will. Mirrors the renderer in
 *  apps/web/src/lib/share-card (story/post/square photo slots). The renderer
 *  crops around the same centre point, so small differences don't matter. */
export const PHOTO_ASPECT: Record<CardFrame, Record<CardShape, number>> = {
  specimen: { story: 968 / 1075, post: 968 / 675, square: 984 / 540 },
  notes: { story: 972 / 1254, post: 972 / 786, square: 972 / 580 },
  herbarium: { story: 900 / 1140, post: 900 / 708, square: 924 / 570 },
}
export const focusKey = (f: PhotoFocus | null) => (f ? `${f.x.toFixed(3)},${f.y.toFixed(3)},${f.zoom.toFixed(2)}` : 'auto')

/** One of the animal's photos, for the composer's photo picker. */
export interface SharePhoto { id: string; url: string; thumbnail_url: string | null; is_main: boolean }

// The renderer returns a full-size PNG by default (older app builds rely on
// that). The composer asks for a half-size JPEG preview (~50 KB instead of
// ~3 MB) and a full-size JPEG to share.
const withParams = (u: string, q: string) => `${u}${u.includes('?') ? '&' : '?'}${q}`
export const previewImageUrl = (u: string) => withParams(u, 'size=preview&fmt=jpg')
export const shareImageUrl = (u: string) => withParams(u, 'fmt=jpg')

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  })
  if (!r.ok) {
    const body = await r.json().catch(() => null)
    const showDetail = [402, 403, 404, 409, 422].includes(r.status) && typeof body?.detail === 'string'
    throw new Error(showDetail ? body.detail : "Couldn't make the card. Try again.")
  }
  return r.json()
}

export function getShareDefaults(token: string, app: CardApp, kind: CardKind) {
  return call<{ fields: string[]; frame?: CardFrame }>(token, `/share-cards/defaults?app=${app}&kind=${kind}`)
    .then((d) => ({ fields: d.fields, frame: d.frame ?? 'specimen' }))
}

export function createShareCard(token: string, body: {
  app: CardApp; animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; frame: CardFrame; photo_id?: string | null; focus?: PhotoFocus | null; link: boolean; preview?: boolean
}) {
  return call<{ image_url: string; card_link: string | null; code: string | null; fields: string[] }>(
    token, '/share-cards/', { method: 'POST', body: JSON.stringify(body) },
  )
}

export function listSharePhotos(token: string, app: CardApp, animalId: string) {
  return call<SharePhoto[]>(token, `/share-cards/photos?app=${app}&animal_id=${encodeURIComponent(animalId)}`)
}
