/**
 * Herbarium sheet frame: the photo is "mounted" at a slight tilt with two tape
 * strips on ruled paper, with a bordered determination box. Same payload as
 * the specimen card (header / name / species / facts).
 *
 * Satori rules: flexbox only, inline styles, every multi-child element
 * display:flex, no `gap`, no `inset`, no repeating gradients, no
 * text-transform (uppercase in code), explicit transformOrigin.
 * Spec: design_handoff_share_cards/README.md §3.
 */
import { CSSProperties } from 'react'
import { CardPayload, FactValue, SHAPE_SIZE, Shape, taxonGlyph } from './SpecimenCard'

const GROUND = '#EDE7D6'
const RULE_LINE = 'rgba(60,50,30,.07)'
const INK = '#2A251C'
const INK_MID = '#4A4336'
const INK_SOFT = '#6B6353'
const BORDER = '#3B3528'
const TAPE = 'rgba(240,228,190,.78)'
const PHOTO_BG = '#444441'
const GLYPH_INK = '#888780'

type Box = { left: number; top: number; width: number; height: number }

type Layout = {
  photo: Box
  /** photo height when the card has no facts (story/post only) */
  photoNoFacts?: number
  box: { left: number; right: number; bottom: number; top?: number }
  tape: { w: number; h: number; a: [number, number]; b: [number, number] }
  stacked: boolean
  type: { header: number; name: number; sci: number; common: number; label: number; value: number; row: number }
}

const BIG_TAPE = { w: 210, h: 48, a: [-48, -36] as [number, number], b: [-156, -90] as [number, number] }
const SMALL_TAPE = { w: 168, h: 39, a: [-36, -24] as [number, number], b: [-108, -54] as [number, number] }

const LAYOUT: Record<Shape, Layout> = {
  story: {
    photo: { left: 90, top: 156, width: 900, height: 1140 },
    photoNoFacts: 1302,
    box: { left: 90, right: 90, bottom: 126 },
    tape: BIG_TAPE,
    stacked: false,
    type: { header: 24, name: 90, sci: 39, common: 28, label: 22, value: 31, row: 28 },
  },
  post: {
    photo: { left: 90, top: 102, width: 900, height: 708 },
    photoNoFacts: 870,
    box: { left: 90, right: 90, bottom: 90 },
    tape: BIG_TAPE,
    stacked: false,
    type: { header: 24, name: 84, sci: 36, common: 28, label: 22, value: 31, row: 28 },
  },
  // Square departs from the handoff, which put a 510x900 photo beside a
  // narrow box: a 1:2 sliver that cut most phone photos badly, and the box
  // wrapped. It now stacks like post; the photo gives up height to the box.
  square: {
    photo: { left: 78, top: 72, width: 924, height: 600 },
    photoNoFacts: 680,
    box: { left: 78, right: 78, bottom: 60 },
    tape: SMALL_TAPE,
    stacked: false,
    type: { header: 20, name: 64, sci: 30, common: 24, label: 18, value: 26, row: 26 },
  },
  wide: {
    photo: { left: 54, top: 48, width: 504, height: 534 },
    box: { left: 612, right: 48, bottom: 48, top: 48 },
    tape: SMALL_TAPE,
    stacked: true,
    type: { header: 20, name: 63, sci: 28, common: 24, label: 25, value: 25, row: 25 },
  },
}

const appName = (app: string) => (app === 'herpetoverse' ? 'Herpetoverse' : 'Tarantuverse')
const upper = (s: string) => s.toUpperCase()

/** Faint horizontal rules every 72px, drawn as divs (satori has no repeating gradients). */
function Rules({ width, height }: { width: number; height: number }) {
  const n = Math.floor(height / 72)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height, display: 'flex', flexDirection: 'column' }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: 'flex', width, height: 72, borderBottom: `3px solid ${RULE_LINE}` }} />
      ))}
    </div>
  )
}

// Blurred box-shadows cost ~600ms each in the renderer, so shadows here are
// a few offset, faintly tinted layers instead. Visually near-identical at
// card size; effectively free to draw.
function Tape({ left, top, w, h }: { left: number; top: number; w: number; h: number }) {
  const tape: CSSProperties = { position: 'absolute', left, top, width: w, height: h, display: 'flex', transform: 'rotate(-38deg)', transformOrigin: 'center' }
  return (
    <>
      <div style={{ ...tape, top: top + 3, background: 'rgba(0,0,0,.07)' }} />
      <div style={{ ...tape, background: TAPE }} />
    </>
  )
}

/** Soft drop shadow under the mounted photo: stacked translucent layers,
 *  each a little lower and wider, approximating a 27px blur. */
function PhotoShadow({ box }: { box: Box }) {
  const layers = [
    { dy: 4, grow: 0, a: 0.06 },
    { dy: 9, grow: 4, a: 0.05 },
    { dy: 14, grow: 10, a: 0.035 },
    { dy: 20, grow: 18, a: 0.025 },
  ]
  return (
    <>
      {layers.map((l, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', display: 'flex', left: box.left - l.grow, top: box.top + l.dy - l.grow,
            width: box.width + l.grow * 2, height: box.height + l.grow * 2, background: `rgba(40,30,10,${l.a})`,
            borderRadius: l.grow, transform: 'rotate(-1.2deg)', transformOrigin: 'center',
          }}
        />
      ))}
    </>
  )
}

function MountedPhoto({ url, taxon, box }: { url: string | null; taxon: string; box: Box }) {
  const frame: CSSProperties = {
    position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, display: 'flex',
    transform: 'rotate(-1.2deg)', transformOrigin: 'center',
  }
  if (url) {
    return (
      <div style={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} width={box.width} height={box.height} style={{ width: box.width, height: box.height, objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div style={{ ...frame, background: PHOTO_BG, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', fontFamily: 'Gloock', fontSize: 216, color: GLYPH_INK }}>{taxonGlyph(taxon)}</div>
    </div>
  )
}

/** Rough height of the story/post determination box, for keeping it clear of
 *  the photo. Errs high: Gloock averages ~0.5em per character. */
function estimateBoxHeight(p: CardPayload, t: Layout['type'], nameSize: number, boxW: number): number {
  const inner = boxW - 96 - 9
  let h = 42 + 36 + 9 + t.header * 1.25
  if (p.name) h += 24 + nameSize * 1.05 * Math.max(1, Math.ceil((p.name.length * nameSize * 0.5) / inner))
  if (p.scientific_name) h += 9 + t.sci * 1.3
  if (p.common_name) h += 3 + t.common * 1.3
  if (p.facts.length > 0) h += 36 + 27 + 3 + t.label * 1.3 + 4 + t.value * 1.3
  return Math.ceil(h)
}

function nameSizeFor(p: CardPayload, L: Layout): number {
  // Long names step down a size.
  return p.name && p.name.length > 16 ? Math.round(L.type.name * (L.stacked ? 0.66 : 0.78)) : L.type.name
}

/** Where the mounted photo sits. Exported so the renderer can crop the photo
 *  to exactly this size before drawing (much cheaper than letting the
 *  renderer scale a full-size photo). */
export function herbariumPhotoBox(p: CardPayload, shape: Shape): Box {
  const { width, height } = SHAPE_SIZE[shape]
  const L = LAYOUT[shape]
  // Story/post: the box sits under the photo. The spec photo height is the
  // most it gets; when the box runs taller (common name, a two-line name) the
  // photo gives up the difference so the two never overlap.
  let photoH = p.facts.length === 0 && L.photoNoFacts ? L.photoNoFacts : L.photo.height
  if (!L.stacked) {
    const boxH = estimateBoxHeight(p, L.type, nameSizeFor(p, L), width - L.box.left - L.box.right)
    const room = height - L.box.bottom - boxH - 48 - L.photo.top
    photoH = Math.max(360, Math.min(photoH, room))
  }
  return { ...L.photo, height: photoH }
}

export function HerbariumCard({ p, shape }: { p: CardPayload; shape: Shape }) {
  const { width, height } = SHAPE_SIZE[shape]
  const L = LAYOUT[shape]
  const t = L.type
  const hasFacts = p.facts.length > 0
  const nameSize = nameSizeFor(p, L)
  const photo = herbariumPhotoBox(p, shape)
  const boxStyle: CSSProperties = {
    position: 'absolute', left: L.box.left, right: L.box.right, bottom: L.box.bottom,
    ...(L.box.top !== undefined ? { top: L.box.top } : {}),
    border: `4.5px solid ${BORDER}`, background: 'rgba(237,231,214,.6)',
    padding: L.stacked ? '30px 32px 24px' : shape === 'square' ? '30px 36px 26px' : '42px 48px 36px',
    display: 'flex', flexDirection: 'column', color: INK,
  }
  const headerStyle: CSSProperties = { display: 'flex', fontSize: t.header, letterSpacing: L.stacked ? 4 : 6.6, color: INK_SOFT }

  return (
    <div style={{ width, height, background: GROUND, display: 'flex', position: 'relative', fontFamily: 'Caslon' }}>
      <Rules width={width} height={height} />
      <PhotoShadow box={photo} />
      <MountedPhoto url={p.photo_url} taxon={p.taxon} box={photo} />
      <Tape left={photo.left + L.tape.a[0]} top={photo.top + L.tape.a[1]} w={L.tape.w} h={L.tape.h} />
      <Tape left={photo.left + photo.width + L.tape.b[0]} top={photo.top + photo.height + L.tape.b[1]} w={L.tape.w} h={L.tape.h} />

      <div style={boxStyle}>
        {L.stacked ? (
          <div style={headerStyle}>{upper(p.header)}</div>
        ) : (
          <div style={{ ...headerStyle, justifyContent: 'space-between' }}>
            <span>{upper(p.header)}</span>
            <span>{upper(appName(p.app))}</span>
          </div>
        )}
        {p.name ? (
          <div style={{ display: 'flex', fontFamily: 'Gloock', fontSize: nameSize, lineHeight: 1.05, marginTop: 24, color: INK }}>{p.name}</div>
        ) : null}
        {p.scientific_name ? (
          <div style={{ display: 'flex', fontStyle: 'italic', fontSize: t.sci, color: INK_MID, marginTop: 9 }}>{p.scientific_name}</div>
        ) : null}
        {p.common_name ? (
          <div style={{ display: 'flex', fontSize: t.common, color: INK_SOFT, marginTop: 3 }}>{p.common_name}</div>
        ) : null}

        {hasFacts && !L.stacked ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, paddingTop: 27, borderTop: `3px solid ${BORDER}` }}>
            {p.facts.slice(0, 4).map((f) => (
              <div key={f.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: t.label, letterSpacing: 4.5, color: INK_SOFT }}>{upper(f.label)}</span>
                <div style={{ display: 'flex', fontSize: t.value, color: INK, marginTop: 4 }}>
                  <FactValue value={f.value} size={t.value} color={INK} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {hasFacts && L.stacked ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, paddingTop: 18, borderTop: `3px solid ${BORDER}` }}>
            {p.facts.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.row, marginTop: i === 0 ? 0 : 9 }}>
                <span style={{ color: INK_SOFT }}>{f.label}</span>
                <FactValue value={f.value} size={t.row} color={INK} />
              </div>
            ))}
          </div>
        ) : null}

        {L.stacked ? (
          <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 18, fontSize: t.header, letterSpacing: 4, color: INK_SOFT }}>{upper(appName(p.app))}</div>
        ) : null}
      </div>
    </div>
  )
}
