/**
 * Field notes frame: photo inset on paper, a printed species line, then the
 * headline and facts in the keeper's "hand". Only the notes are handwritten;
 * species and wordmark stay printed. The text comes from the server-composed
 * `notes` block, so the client still never chooses what is said.
 *
 * Satori rules as in HerbariumCard. Reenie Beanie has no U+2192, so arrows go
 * through FactValue's SVG; its `·` is fine.
 * Spec: design_handoff_share_cards/README.md §3.
 */
import { CSSProperties } from 'react'
import { CardPayload, FactValue, SHAPE_SIZE, Shape, taxonGlyph } from './SpecimenCard'

const GROUND = '#F4F1E8'
const HAND = '#1F2A44'
const PRINT = '#6B6962'
const PHOTO_BG = '#444441'
const GLYPH_INK = '#888780'
const PAD = 54

const TYPE: Record<Shape, { headline: number; facts: number }> = {
  story: { headline: 132, facts: 78 },
  post: { headline: 120, facts: 72 },
  square: { headline: 92, facts: 56 },
  wide: { headline: 90, facts: 57 },
}
// Square used to put the photo in a 480px-wide side column (a 1:2 sliver);
// it now stacks like post.
const PHOTO_H: Record<'story' | 'post' | 'square', number> = { story: 1254, post: 786, square: 600 }

const upper = (s: string) => s.toUpperCase()

function Photo({ url, taxon, w, h }: { url: string | null; taxon: string; w: number; h: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover' }} />
  }
  return (
    <div style={{ width: w, height: h, background: PHOTO_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', fontFamily: 'Reenie', fontSize: 192, color: GLYPH_INK }}>{taxonGlyph(taxon)}</div>
    </div>
  )
}

/** One handwritten fact line; " · " separators sit between facts. */
function FactsLine({ facts, size, stacked }: { facts: string[]; size: number; stacked: boolean }) {
  const common: CSSProperties = { fontFamily: 'Reenie', fontSize: size, color: HAND, transform: 'rotate(-1deg)', transformOrigin: '0% 50%' }
  if (stacked) {
    return (
      <div style={{ ...common, display: 'flex', flexDirection: 'column', marginTop: 24, lineHeight: 1.1 }}>
        {facts.map((f) => (
          <div key={f} style={{ display: 'flex' }}><FactValue value={f} size={size} color={HAND} /></div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ ...common, display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 12, marginLeft: 18, lineHeight: 1.15 }}>
      {facts.map((f, i) => (
        // The dot rides on the end of the fact before it, so a wrapped line
        // never starts with one.
        <div key={f} style={{ display: 'flex', alignItems: 'center' }}>
          <FactValue value={f} size={size} color={HAND} />
          {i < facts.length - 1 ? <span style={{ marginLeft: Math.round(size * 0.3), marginRight: Math.round(size * 0.3) }}>·</span> : null}
        </div>
      ))}
    </div>
  )
}

function Text({ p, shape }: { p: CardPayload; shape: Shape }) {
  const t = TYPE[shape]
  const side = shape === 'wide'
  const facts = p.notes.facts
  // At the side-column shapes two facts read best one per line, like a note;
  // longer lists stay on one wrapping line so they still fit the column.
  const stacked = side && facts.length <= 2
  const printed: CSSProperties = { display: 'flex', fontSize: side ? 21 : 27, letterSpacing: side ? 4 : 6, color: PRINT }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      {p.notes.species_line ? <div style={printed}>{upper(p.notes.species_line)}</div> : null}
      {p.notes.headline ? (
        <div
          style={{
            display: 'flex', fontFamily: 'Reenie', fontSize: t.headline, lineHeight: 0.95, color: HAND,
            marginTop: 24, transform: 'rotate(-1.5deg)', transformOrigin: '0% 50%',
          }}
        >
          {p.notes.headline}
        </div>
      ) : null}
      {facts.length > 0 ? <FactsLine facts={facts} size={t.facts} stacked={stacked} /> : null}
      <div style={{ ...printed, marginTop: 'auto' }}>{upper(p.app)}</div>
    </div>
  )
}

/** Rough height of the story/post text block. Reenie Beanie averages well
 *  under 0.4em per character; 0.4 errs high. */
function estimateTextHeight(p: CardPayload, shape: Shape, textW: number): number {
  const t = TYPE[shape]
  const lines = (text: string, size: number, w: number) => Math.max(1, Math.ceil((text.length * size * 0.4) / w))
  let h = 27 * 1.25 * 2 + 60 // species line + wordmark + breathing room
  if (p.notes.headline) h += 24 + t.headline * 0.95 * lines(p.notes.headline, t.headline, textW)
  if (p.notes.facts.length > 0) h += 12 + t.facts * 1.15 * lines(p.notes.facts.join(' · '), t.facts, textW - 18)
  return Math.ceil(h)
}

/** The photo's drawn size. Exported so the renderer can crop to it exactly. */
export function fieldNotesPhotoSize(p: CardPayload, shape: Shape): { w: number; h: number } {
  const { width, height } = SHAPE_SIZE[shape]
  if (shape === 'wide') {
    return { w: 546, h: height - PAD * 2 }
  }
  // No facts line: the photo takes the freed height. A long headline or
  // facts line takes height back, so the text never runs into the wordmark.
  const freed = p.notes.facts.length > 0 ? 0 : Math.round(TYPE[shape].facts * 1.15) + 12
  const room = height - PAD * 2 - 42 - estimateTextHeight(p, shape, width - PAD * 2)
  return { w: width - PAD * 2, h: Math.max(shape === 'square' ? 380 : 480, Math.min(PHOTO_H[shape] + freed, room)) }
}

export function FieldNotesCard({ p, shape }: { p: CardPayload; shape: Shape }) {
  const { width, height } = SHAPE_SIZE[shape]
  const ph = fieldNotesPhotoSize(p, shape)
  if (shape === 'wide') {
    const photoW = ph.w
    return (
      <div style={{ width, height, background: GROUND, display: 'flex', padding: PAD, fontFamily: 'Caslon' }}>
        <Photo url={p.photo_url} taxon={p.taxon} w={photoW} h={ph.h} />
        <div style={{ display: 'flex', marginLeft: 42, width: width - PAD * 2 - photoW - 42 }}>
          <Text p={p} shape={shape} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ width, height, background: GROUND, display: 'flex', flexDirection: 'column', padding: PAD, fontFamily: 'Caslon' }}>
      <Photo url={p.photo_url} taxon={p.taxon} w={ph.w} h={ph.h} />
      <div style={{ display: 'flex', flexGrow: 1, marginTop: 42 }}>
        <Text p={p} shape={shape} />
      </div>
    </div>
  )
}
