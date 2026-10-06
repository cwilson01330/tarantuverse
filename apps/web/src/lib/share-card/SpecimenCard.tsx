/**
 * The specimen-label share card (spec §3). Rendered by next/og (satori), so:
 * flexbox only, inline styles only, every element with >1 child needs
 * display:flex. Fixed paper palette — the card is an image and must read the
 * same on light and dark feeds.
 */
export type Shape = 'story' | 'post' | 'square' | 'wide'
export type Frame = 'specimen' | 'notes' | 'herbarium'

/** The Field notes frame's handwritten copy, composed on the server. */
export type CardNotes = { headline: string | null; species_line: string | null; facts: string[] }

export type CardPayload = {
  app: 'tarantuverse' | 'herpetoverse'
  kind: 'molt' | 'profile'
  taxon: string
  header: string
  name: string | null
  scientific_name: string | null
  common_name: string | null
  photo_url: string | null
  facts: { label: string; value: string }[]
  notes: CardNotes
  shape: Shape
  frame: Frame
}

export const SHAPE_SIZE: Record<Shape, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  wide: { width: 1200, height: 630 },
}

const PAPER = '#F1EFE8'
const INK = '#2C2C2A'
const INK_SOFT = '#5F5E5A'
const RULE = '#888780'
const PHOTO_BG = '#444441'

const GLYPH: Record<string, string> = {
  tarantula: 'T', scorpion: 'S', centipede: 'C', snake: 'S', lizard: 'L',
}

/** The letter shown in place of a missing photo. */
export function taxonGlyph(taxon: string): string {
  return GLYPH[taxon] ?? (/^[a-z]/.test(taxon) ? taxon[0].toUpperCase() : '·')
}

function Photo({ url, taxon, w, h }: { url: string | null; taxon: string; w: number; h: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover', borderRadius: 6 }} />
  }
  return (
    <div style={{ width: w, height: h, background: PHOTO_BG, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RULE, fontSize: Math.round(h / 5) }}>
      {GLYPH[taxon] ?? '·'}
    </div>
  )
}

function Ruler({ width }: { width: number }) {
  const ticks = Math.floor(width / 24)
  return (
    <div style={{ display: 'flex', width, height: 18, borderTop: `1.5px solid ${RULE}`, marginTop: 14 }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <div key={i} style={{ width: 24, height: i % 2 === 0 ? 16 : 9, borderLeft: `1.5px solid ${RULE}` }} />
      ))}
    </div>
  )
}

/** Values like "3.2 → 4.1 in": the arrow is drawn as SVG so satori never shapes
 *  U+2192 (none of our card fonts have it; satori would fetch a Google font at
 *  render). Shared by every frame. */
export function FactValue({ value, size, color = INK }: { value: string; size: number; color?: string }) {
  if (!value.includes(' → ')) return <span>{value}</span>
  const parts = value.split(' → ')
  const w = Math.round(size * 0.9)
  const h = Math.round(size * 0.5)
  const m = Math.round(size * 0.25)
  return (
    <span style={{ display: 'flex', alignItems: 'center' }}>
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 ? (
            <svg width={w} height={h} viewBox="0 0 18 10" style={{ marginLeft: m, marginRight: m }}>
              <path d="M0 5 H16 M11.5 1 L16.5 5 L11.5 9" stroke={color} strokeWidth="1.5" fill="none" />
            </svg>
          ) : null}
          <span>{part}</span>
        </span>
      ))}
    </span>
  )
}

function Label({ p, scale, width }: { p: CardPayload; scale: number; width: number }) {
  const s = (n: number) => Math.round(n * scale)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', color: INK, width }}>
      <div style={{ fontSize: s(26), letterSpacing: 2, color: INK_SOFT }}>{p.header}</div>
      {p.name ? <div style={{ fontSize: s(64), lineHeight: 1.1, marginTop: s(6) }}>{p.name}</div> : null}
      {p.scientific_name ? <div style={{ fontSize: s(34), fontStyle: 'italic', color: '#444441', marginTop: s(4) }}>{p.scientific_name}</div> : null}
      {p.common_name ? <div style={{ fontSize: s(26), color: INK_SOFT, marginTop: s(2) }}>{p.common_name}</div> : null}
      {p.facts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1.5px solid ${RULE}`, marginTop: s(20), paddingTop: s(12) }}>
          {p.facts.map((f) => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: s(30), lineHeight: 1.5 }}>
              <span>{f.label}</span><FactValue value={f.value} size={s(30)} />
            </div>
          ))}
        </div>
      ) : null}
      <Ruler width={width} />
    </div>
  )
}

const sidePad = (shape: Shape) => (shape === 'wide' ? 36 : 48)
const TALL_PAD = 56

/** The photo's drawn size. Exported so the renderer can crop to it exactly. */
export function specimenPhotoSize(shape: Shape): { w: number; h: number } {
  const { width, height } = SHAPE_SIZE[shape]
  if (shape === 'wide' || shape === 'square') {
    const pad = sidePad(shape)
    return { w: Math.round(width * (shape === 'wide' ? 0.46 : 0.5)) - pad, h: height - pad * 2 }
  }
  return { w: width - TALL_PAD * 2, h: Math.round(height * (shape === 'story' ? 0.56 : 0.5)) }
}

export function SpecimenCard({ p, shape }: { p: CardPayload; shape: Shape }) {
  const { width, height } = SHAPE_SIZE[shape]
  const wordmark = (
    <div style={{ fontSize: shape === 'wide' ? 22 : 28, color: INK_SOFT }}>{p.app}</div>
  )
  if (shape === 'wide' || shape === 'square') {
    const pad = sidePad(shape)
    const photoW = specimenPhotoSize(shape).w
    const labelW = width - photoW - pad * 3
    return (
      <div style={{ width, height, background: PAPER, display: 'flex', padding: pad, fontFamily: 'Caslon' }}>
        <Photo url={p.photo_url} taxon={p.taxon} w={photoW} h={height - pad * 2} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', marginLeft: pad, width: labelW }}>
          <Label p={p} scale={shape === 'wide' ? 0.62 : 0.8} width={labelW} />
          {wordmark}
        </div>
      </div>
    )
  }
  const pad = TALL_PAD
  const photoH = specimenPhotoSize(shape).h
  return (
    <div style={{ width, height, background: PAPER, display: 'flex', flexDirection: 'column', padding: pad, fontFamily: 'Caslon' }}>
      <Photo url={p.photo_url} taxon={p.taxon} w={width - pad * 2} h={photoH} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, marginTop: 40 }}>
        <Label p={p} scale={1} width={width - pad * 2} />
        {wordmark}
      </div>
    </div>
  )
}
