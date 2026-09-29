const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type CardKind = 'molt' | 'profile'
export type CardShape = 'story' | 'post' | 'square'
export type CardApp = 'tarantuverse' | 'herpetoverse'

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
  return call<{ fields: string[] }>(token, `/share-cards/defaults?app=${app}&kind=${kind}`).then((d) => d.fields)
}

export function createShareCard(token: string, body: {
  app: CardApp; animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; link: boolean; preview?: boolean
}) {
  return call<{ image_url: string; card_link: string | null; code: string | null; fields: string[] }>(
    token, '/share-cards/', { method: 'POST', body: JSON.stringify(body) },
  )
}
