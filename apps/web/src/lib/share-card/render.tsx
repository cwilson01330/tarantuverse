import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CardPayload, SHAPE_SIZE, Shape, SpecimenCard } from './SpecimenCard'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Font = { name: string; data: Buffer; style: 'normal' | 'italic' }
let fonts: Promise<Font[]> | null = null

// Literal paths only. A path built at runtime (a loop over directories, a
// variable file name) makes Vercel's file tracer give up and bundle the whole
// project into the function — that pushed /api/card past the 250 MB limit.
const FONT_FILES = {
  regular: path.join(process.cwd(), 'src/lib/share-card/fonts/LibreCaslonText-Regular.ttf'),
  italic: path.join(process.cwd(), 'src/lib/share-card/fonts/LibreCaslonText-Italic.ttf'),
}

function loadFonts(): Promise<Font[]> {
  if (!fonts) {
    fonts = Promise.all([
      readFile(FONT_FILES.regular).then((data) => ({ name: 'Caslon', data, style: 'normal' as const })),
      readFile(FONT_FILES.italic).then((data) => ({ name: 'Caslon', data, style: 'italic' as const })),
    ]).catch((e) => {
      fonts = null // don't poison a warm instance with one transient failure
      throw e
    })
  }
  return fonts
}

/* ---------- cache policies ---------- */
export type CachePolicy = 'token' | 'link' | 'og'
const IMAGE_CACHE: Record<CachePolicy, Record<string, string>> = {
  token: { 'Cache-Control': 'private, no-store' },
  link: { 'Cache-Control': 'public, max-age=60, s-maxage=60', 'X-Robots-Tag': 'noindex' },
  og: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
}
const MISS_CACHE = { 'Cache-Control': 'public, max-age=60' }
const NO_STORE = { 'Cache-Control': 'no-store' }

// `privateMiss` for the token route: its misses must not sit in a shared cache.
export function notFound(privateMiss = false) {
  return new Response('Not found', { status: 404, headers: privateMiss ? NO_STORE : MISS_CACHE })
}
export function gone(privateMiss = false) {
  return new Response('Gone', { status: 410, headers: privateMiss ? NO_STORE : MISS_CACHE })
}
export function unavailable() {
  return new Response('Upstream unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
}

/* ---------- upstream payload ---------- */
export type PayloadResult =
  | { kind: 'ok'; payload: unknown }
  | { kind: 'not_found' }
  | { kind: 'gone' }
  | { kind: 'unavailable' }

export async function fetchCardPayload(url: string, init: RequestInit & { next?: { revalidate?: number } } = {}): Promise<PayloadResult> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) })
    if (r.status === 404 || r.status === 400 || r.status === 422) return { kind: 'not_found' }
    if (r.status === 410) return { kind: 'gone' }
    if (!r.ok) return { kind: 'unavailable' }
    return { kind: 'ok', payload: await r.json() }
  } catch {
    return { kind: 'unavailable' }
  }
}

/* ---------- photo ---------- */
const MAX_PHOTO_BYTES = 8_000_000

export function allowedPhotoUrl(url: string | null): boolean {
  if (!url) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const extra = (process.env.SHARE_CARD_PHOTO_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  const host = u.hostname.toLowerCase()
  return host.endsWith('.r2.dev') || host === 'photos.tarantuverse.com' || extra.includes(host)
}

function sniffMime(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length > 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  return null
}

/** One GET of our own; satori only ever sees a verified data URL. Anything
 *  unexpected returns null and the card falls back to the glyph block. */
export async function loadPhoto(url: string | null): Promise<string | null> {
  if (!url || !allowedPhotoUrl(url)) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' })
    if (!r.ok) return null
    if (Number(r.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.byteLength > MAX_PHOTO_BYTES) return null
    const mime = sniffMime(buf)
    return mime ? `data:${mime};base64,${Buffer.from(buf).toString('base64')}` : null
  } catch {
    return null
  }
}

/* ---------- payload guards ---------- */
const clamp = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, n)
  return t || null
}

export function sanitizePayload(raw: unknown, shapeOverride?: Shape): CardPayload {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const facts = (Array.isArray(o.facts) ? o.facts : [])
    .map((f) => {
      const x = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
      return { label: clamp(x.label, 200), value: clamp(x.value, 200) }
    })
    .filter((f): f is { label: string; value: string } => !!f.label && !!f.value)
    .slice(0, 8)
  return {
    app: o.app === 'herpetoverse' ? 'herpetoverse' : 'tarantuverse',
    kind: o.kind === 'molt' ? 'molt' : 'profile',
    taxon: typeof o.taxon === 'string' ? o.taxon.slice(0, 40) : '',
    header: clamp(o.header, 120) ?? '',
    name: clamp(o.name, 120),
    scientific_name: clamp(o.scientific_name, 200),
    common_name: clamp(o.common_name, 200),
    photo_url: typeof o.photo_url === 'string' ? o.photo_url.slice(0, 500) : null,
    facts,
    shape: shapeOverride ?? asShape(typeof o.shape === 'string' ? o.shape : null),
  }
}

// Always send a finished PNG with an explicit Content-Length. Without it the
// response goes out chunked, and Facebook's image processor rejects that as a
// "corrupted image" even though the bytes are a valid PNG.
function pngResponse(buf: ArrayBuffer, headers: Record<string, string>): Response {
  return new Response(new Uint8Array(buf), {
    headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(buf.byteLength) },
  })
}

export async function renderCard(raw: unknown, policy: CachePolicy, shape?: Shape): Promise<Response> {
  const p = sanitizePayload(raw)
  const useShape = shape ?? p.shape
  const opts = { ...SHAPE_SIZE[useShape], fonts: await loadFonts() }
  const headers = { 'Content-Type': 'image/png', ...IMAGE_CACHE[policy] }
  const photo = await loadPhoto(p.photo_url)
  try {
    const buf = await new ImageResponse(<SpecimenCard p={{ ...p, photo_url: photo }} shape={useShape} />, opts).arrayBuffer()
    return pngResponse(buf, headers)
  } catch {
    // Any render failure (bad image, satori quirk): retry once with the glyph block.
    const buf = await new ImageResponse(<SpecimenCard p={{ ...p, photo_url: null }} shape={useShape} />, opts).arrayBuffer()
    return pngResponse(buf, headers)
  }
}

export async function renderNoLongerShared(shape: Shape) {
  const { width, height } = SHAPE_SIZE[shape]
  const buf = await new ImageResponse(
    (
      <div style={{ width, height, background: '#F1EFE8', color: '#5F5E5A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Caslon', fontSize: 40 }}>
        This card is no longer shared
      </div>
    ),
    { width, height, fonts: await loadFonts() },
  ).arrayBuffer()
  return pngResponse(buf, { 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' })
}

export function asShape(v: string | null): Shape {
  return v === 'story' || v === 'post' || v === 'square' || v === 'wide' ? v : 'wide'
}
