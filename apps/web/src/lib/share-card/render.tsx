import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FieldNotesCard, fieldNotesPhotoSize } from './FieldNotesCard'
import { HerbariumCard, herbariumPhotoBox } from './HerbariumCard'
import { CARD_KINDS, CardKind, CardPayload, Frame, PhotoFocus, SHAPE_SIZE, Shape, SpecimenCard, specimenPhotoSize } from './SpecimenCard'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Font = { name: string; data: Buffer; style: 'normal' | 'italic' }
let fonts: Promise<Font[]> | null = null

// Literal paths only. A path built at runtime (a loop over directories, a
// variable file name) makes Vercel's file tracer give up and bundle the whole
// project into the function — that pushed /api/card past the 250 MB limit.
const FONT_FILES = {
  regular: path.join(process.cwd(), 'src/lib/share-card/fonts/LibreCaslonText-Regular.ttf'),
  italic: path.join(process.cwd(), 'src/lib/share-card/fonts/LibreCaslonText-Italic.ttf'),
  // Herbarium name (OFL, from Fontsource's Latin subset).
  gloock: path.join(process.cwd(), 'src/lib/share-card/fonts/Gloock-Regular.ttf'),
  // Field notes handwriting (OFL, from Fontsource's Latin subset).
  reenie: path.join(process.cwd(), 'src/lib/share-card/fonts/ReenieBeanie-Regular.ttf'),
}

function loadFonts(): Promise<Font[]> {
  if (!fonts) {
    fonts = Promise.all([
      readFile(FONT_FILES.regular).then((data) => ({ name: 'Caslon', data, style: 'normal' as const })),
      readFile(FONT_FILES.italic).then((data) => ({ name: 'Caslon', data, style: 'italic' as const })),
      readFile(FONT_FILES.gloock).then((data) => ({ name: 'Gloock', data, style: 'normal' as const })),
      readFile(FONT_FILES.reenie).then((data) => ({ name: 'Reenie', data, style: 'normal' as const })),
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
 *  unexpected returns null and the card falls back to the glyph block.
 *
 *  With `fit`, the photo is cropped to exactly the pixels it will occupy on
 *  the card before satori sees it. Letting the renderer decode and scale a
 *  full-size phone photo was the slowest step of every card (~180ms+). */
// A warm instance keeps the last few photos it fetched: a keeper flicking
// between frames and fields re-renders the same photo many times, and the
// download from storage was a quarter-second of every preview. Bounded by
// entry count (photos are capped at MAX_PHOTO_BYTES).
const PHOTO_CACHE = new Map<string, Uint8Array>()
const PHOTO_CACHE_MAX = 6

async function fetchPhotoBytes(url: string): Promise<Uint8Array | null> {
  const hit = PHOTO_CACHE.get(url)
  if (hit) {
    PHOTO_CACHE.delete(url) // refresh recency
    PHOTO_CACHE.set(url, hit)
    return hit
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' })
  if (!r.ok) return null
  if (Number(r.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return null
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.byteLength > MAX_PHOTO_BYTES) return null
  PHOTO_CACHE.set(url, buf)
  while (PHOTO_CACHE.size > PHOTO_CACHE_MAX) PHOTO_CACHE.delete(PHOTO_CACHE.keys().next().value as string)
  return buf
}

/** The part of a W×H photo to show in a w×h window, centred on the keeper's
 *  focus point at their zoom, clamped so it never runs off the photo. Same
 *  maths as the composers' "Adjust photo" editor. */
export function focusCrop(W: number, H: number, w: number, h: number, f: PhotoFocus) {
  const zoom = Math.min(4, Math.max(1, f.zoom))
  const cover = Math.max(w / W, h / H)
  const cw = Math.min(W, w / (cover * zoom))
  const ch = Math.min(H, h / (cover * zoom))
  const left = Math.min(W - cw, Math.max(0, f.x * W - cw / 2))
  const top = Math.min(H - ch, Math.max(0, f.y * H - ch / 2))
  const r = (n: number) => Math.max(0, Math.round(n))
  return { left: r(left), top: r(top), width: Math.max(1, Math.min(W - r(left), Math.round(cw))), height: Math.max(1, Math.min(H - r(top), Math.round(ch))) }
}

export async function loadPhoto(url: string | null, fit?: { w: number; h: number }, focus?: PhotoFocus | null): Promise<string | null> {
  if (!url || !allowedPhotoUrl(url)) return null
  try {
    const buf = await fetchPhotoBytes(url)
    if (!buf) return null
    const mime = sniffMime(buf)
    if (!mime) return null
    if (fit) {
      const w = Math.max(1, Math.round(fit.w))
      const h = Math.max(1, Math.round(fit.h))
      let img = sharp(buf, { limitInputPixels: 50_000_000 })
      const meta = await img.metadata()
      if (meta.orientation && meta.orientation > 1) {
        // Uploads are stored upright already; bake in any stray orientation
        // first so the crop maths sees the photo the way people do.
        img = sharp(await img.rotate().toBuffer())
      }
      if (focus) {
        const { width: W = 0, height: H = 0 } = await img.metadata()
        if (W > 0 && H > 0) img = img.extract(focusCrop(W, H, w, h, focus))
        img = img.resize(w, h, { fit: 'cover' })
      } else {
        img = img.resize(w, h, { fit: 'cover', position: 'attention' })
      }
      const out = await img.jpeg({ quality: 88 }).toBuffer()
      return `data:image/jpeg;base64,${out.toString('base64')}`
    }
    return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
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
  const n = (o.notes && typeof o.notes === 'object' ? o.notes : {}) as Record<string, unknown>
  const notes = {
    headline: clamp(n.headline, 160),
    species_line: clamp(n.species_line, 200),
    facts: (Array.isArray(n.facts) ? n.facts : []).map((f) => clamp(f, 120)).filter((f): f is string => !!f).slice(0, 6),
  }
  return {
    app: o.app === 'herpetoverse' ? 'herpetoverse' : 'tarantuverse',
    // Unknown kinds (a newer API) still draw: the text is all server-made.
    kind: (CARD_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as CardKind) : 'profile',
    taxon: typeof o.taxon === 'string' ? o.taxon.slice(0, 40) : '',
    header: clamp(o.header, 120) ?? '',
    name: clamp(o.name, 120),
    scientific_name: clamp(o.scientific_name, 200),
    common_name: clamp(o.common_name, 200),
    photo_url: typeof o.photo_url === 'string' ? o.photo_url.slice(0, 500) : null,
    photo_focus: asFocus(o.photo_focus),
    facts,
    notes,
    shape: shapeOverride ?? asShape(typeof o.shape === 'string' ? o.shape : null),
    frame: asFrame(o.frame, notes.headline !== null || notes.facts.length > 0),
  }
}

function asFocus(v: unknown): PhotoFocus | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const n = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d)
  return { x: n(o.x, 0, 1, 0.5), y: n(o.y, 0, 1, 0.5), zoom: n(o.zoom, 1, 4, 1) }
}

/** Unknown frames render as the specimen card. Field notes needs the server's
 *  notes block; a payload without one (an old snapshot) falls back too. */
export function asFrame(v: unknown, hasNotes: boolean): Frame {
  if (v === 'herbarium') return 'herbarium'
  if (v === 'notes' && hasNotes) return 'notes'
  return 'specimen'
}

/** The size the photo is drawn at for this frame and shape. */
export function photoSizeFor(p: CardPayload, shape: Shape): { w: number; h: number } {
  if (p.frame === 'herbarium') {
    const b = herbariumPhotoBox(p, shape)
    return { w: b.width, h: b.height }
  }
  if (p.frame === 'notes') return fieldNotesPhotoSize(p, shape)
  return specimenPhotoSize(shape, p)
}

function CardFor({ p, shape }: { p: CardPayload; shape: Shape }) {
  if (p.frame === 'herbarium') return <HerbariumCard p={p} shape={shape} />
  if (p.frame === 'notes') return <FieldNotesCard p={p} shape={shape} />
  return <SpecimenCard p={p} shape={shape} />
}

// Always send a finished PNG with an explicit Content-Length. Without it the
// response goes out chunked, and Facebook's image processor rejects that as a
// "corrupted image" even though the bytes are a valid PNG.
function imageResponse(body: Uint8Array<ArrayBuffer>, type: string, headers: Record<string, string>): Response {
  return new Response(body, { headers: { ...headers, 'Content-Type': type, 'Content-Length': String(body.byteLength) } })
}
function pngResponse(buf: ArrayBuffer, headers: Record<string, string>): Response {
  return imageResponse(new Uint8Array(buf), 'image/png', headers)
}

export type RenderOptions = {
  /** < 1 returns a smaller image (live previews). The card is drawn at full
   *  size and shrunk afterwards: scaling inside the renderer was 4-6x slower
   *  for frames with rotations or rounded photos. */
  scale?: number
  /** JPEG is ~10x smaller than PNG for a photo card. Opt-in, so older app builds keep PNG. */
  format?: 'png' | 'jpeg'
}

export async function renderCard(raw: unknown, policy: CachePolicy, shape?: Shape, o: RenderOptions = {}): Promise<Response> {
  const p = sanitizePayload(raw)
  const useShape = shape ?? p.shape
  const scale = o.scale && o.scale > 0 && o.scale < 1 ? o.scale : 1
  const opts = { ...SHAPE_SIZE[useShape], fonts: await loadFonts() }
  const box = photoSizeFor(p, useShape)
  const photo = await loadPhoto(p.photo_url, { w: box.w, h: box.h }, p.photo_focus).catch(() => null)
  let buf: ArrayBuffer
  try {
    buf = await new ImageResponse(<CardFor p={{ ...p, photo_url: photo }} shape={useShape} />, opts).arrayBuffer()
  } catch {
    // Any render failure (bad image, satori quirk): retry once with the glyph block.
    buf = await new ImageResponse(<CardFor p={{ ...p, photo_url: null }} shape={useShape} />, opts).arrayBuffer()
  }
  if (scale === 1 && o.format !== 'jpeg') return imageResponse(new Uint8Array(buf), 'image/png', IMAGE_CACHE[policy])
  let img = sharp(Buffer.from(buf))
  if (scale < 1) img = img.resize(Math.round(opts.width * scale))
  const out = o.format === 'jpeg'
    // Previews can be lighter; a shared card keeps full colour detail (4:4:4) so small type stays crisp.
    ? await img.jpeg(scale < 1 ? { quality: 80 } : { quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
    : await img.png().toBuffer()
  return imageResponse(new Uint8Array(out), o.format === 'jpeg' ? 'image/jpeg' : 'image/png', IMAGE_CACHE[policy])
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
