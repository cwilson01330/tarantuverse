'use client'

/**
 * Photo timeline (2026-10-20) — every photo of one animal in date order on a
 * scrubbable slider, each labelled by the SHED period it falls in, with a
 * marker on the slider at every logged shed. Optional side-by-side compare.
 *
 * Read-only: opens for living, died and transferred animals alike. Grouping
 * lives in lib/photoTimeline.ts (pure; same rules as Tarantuverse, which
 * groups by molt). Lengths go through lib/units — never a hardcoded unit.
 * Herpetoverse web is dark-only, so this uses the neutral/herp palette.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useUnits } from '@/components/UnitsProvider'
import { formatLength } from '@/lib/units'
import type { Photo, ShedLog } from '@/lib/animals'
import {
  daysAfterLabel,
  groupPhotosByMolt,
  markerFraction,
  markerLabel,
  periodLabel,
  type PhotoTimelineEntry,
} from '@/lib/photoTimeline'

type Entry = PhotoTimelineEntry<Photo>
const NOUN = 'shed' as const

/** Bare "YYYY-MM-DD" is a local day; datetimes carry their own offset. */
function fmt(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PhotoTimeline({
  open,
  onClose,
  animalName,
  photos,
  sheds,
}: {
  open: boolean
  onClose: () => void
  animalName: string
  photos: Photo[]
  sheds: ShedLog[]
}) {
  const { units } = useUnits()
  const { entries, markers, moltCount } = useMemo(
    () => groupPhotosByMolt(photos, sheds.map((s) => ({ id: s.id, at: s.shed_at }))),
    [photos, sheds],
  )
  const n = entries.length
  const shedById = useMemo(() => new Map(sheds.map((s) => [s.id, s])), [sheds])

  const [idx, setIdx] = useState(0)
  const [compare, setCompare] = useState(false)
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Open on the newest photo; compare defaults to first vs latest.
  useEffect(() => {
    if (!open) return
    setIdx(Math.max(0, n - 1))
    setLeft(0)
    setRight(Math.max(0, n - 1))
    setCompare(false)
  }, [open, n])

  // Dialog behaviour: focus in, Escape closes, ←/→ step, body scroll locked.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [open, n])

  if (!open || n === 0) return null

  const titleFor = (e: Entry) => periodLabel(e.moltNumber, moltCount, NOUN) ?? 'Photo'
  const metaFor = (e: Entry) => [fmt(e.date), daysAfterLabel(e.daysAfterMolt, NOUN)].filter(Boolean).join(' · ')
  const sizeFor = (e: Entry) => {
    if (!e.moltId) return null
    const v = formatLength(shedById.get(e.moltId)?.length_after_in, units)
    return v ? `Length after shed ${e.moltNumber}: ${v}` : null
  }
  const optionLabel = (e: Entry, i: number) => `${i + 1}. ${titleFor(e)} · ${metaFor(e)}`

  const current = entries[Math.min(idx, n - 1)]
  const periods: { moltNumber: number; first: number; count: number }[] = []
  entries.forEach((e, i) => {
    const last = periods[periods.length - 1]
    if (last && last.moltNumber === e.moltNumber) last.count++
    else periods.push({ moltNumber: e.moltNumber, first: i, count: 1 })
  })

  const btn = 'px-3 py-1.5 rounded-md border text-xs font-medium transition-colors'
  const btnIdle = 'border-neutral-800 text-neutral-300 hover:text-herp-lime hover:border-herp-teal/40'
  const btnOn = 'border-herp-teal bg-herp-teal/15 text-herp-lime'

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo timeline for ${animalName}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl flex flex-col overflow-y-auto sm:rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">Photo timeline</h2>
            <p className="text-sm text-neutral-400 truncate">
              {animalName} · {n} photos{moltCount ? ` · ${moltCount} ${moltCount === 1 ? 'shed' : 'sheds'} logged` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={() => setCompare((c) => !c)} aria-pressed={compare} className={`${btn} ${compare ? btnOn : btnIdle}`}>
              Compare
            </button>
            <button type="button" onClick={onClose} aria-label="Close photo timeline" className={`${btn} ${btnIdle}`}>
              Close
            </button>
          </div>
        </div>

        <div className="p-5 flex-1">
          {compare ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([['Left', left, setLeft], ['Right', right, setRight]] as const).map(([side, value, set]) => {
                const e = entries[Math.min(value, n - 1)]
                return (
                  <div key={side} className="min-w-0">
                    <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center h-[45vh] border border-neutral-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.photo.url} alt={e.photo.caption || titleFor(e)} className="max-h-full max-w-full object-contain" />
                    </div>
                    <EntryCaption title={titleFor(e)} meta={metaFor(e)} size={sizeFor(e)} caption={e.photo.caption} />
                    <label className="block mt-2 text-xs font-medium text-neutral-400">
                      {side} photo
                      <select
                        value={value}
                        onChange={(ev) => set(Number(ev.target.value))}
                        className="mt-1 w-full px-2 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 focus:border-herp-teal focus:outline-none text-sm text-neutral-100"
                      >
                        {entries.map((o, i) => (
                          <option key={o.photo.id} value={i}>{optionLabel(o, i)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center h-[55vh] border border-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.photo.url} alt={current.photo.caption || titleFor(current)} className="max-h-full max-w-full object-contain" />
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/70 text-neutral-100 text-xs font-medium">
                  {idx + 1} / {n}
                </span>
                {idx > 0 && (
                  <button type="button" onClick={() => setIdx(idx - 1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-neutral-100 text-xl hover:text-herp-lime">
                    ‹
                  </button>
                )}
                {idx < n - 1 && (
                  <button type="button" onClick={() => setIdx(idx + 1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-neutral-100 text-xl hover:text-herp-lime">
                    ›
                  </button>
                )}
              </div>
              <EntryCaption title={titleFor(current)} meta={metaFor(current)} size={sizeFor(current)} caption={current.photo.caption} />

              <div className="mt-5 px-2">
                {n > 1 && (
                  <div className="relative h-6" aria-hidden="true">
                    {markers.map((m) => (
                      <div
                        key={m.molts[0].id}
                        className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                        style={{ left: `${markerFraction(m.beforeIndex, n) * 100}%` }}
                        title={`${markerLabel(m, NOUN)} · ${fmt(m.molts[m.molts.length - 1].at)}`}
                      >
                        {markers.length <= 8 && (
                          <span className="text-[10px] font-medium text-amber-400 whitespace-nowrap">{markerLabel(m, NOUN)}</span>
                        )}
                        <span className="w-0.5 h-2 bg-amber-400 rounded" />
                      </div>
                    ))}
                  </div>
                )}
                {n > 1 && (
                  <input
                    type="range"
                    min={0}
                    max={n - 1}
                    step={1}
                    value={idx}
                    onChange={(e) => setIdx(Number(e.target.value))}
                    aria-label="Scrub through photos"
                    aria-valuetext={`${titleFor(current)}, ${metaFor(current)}`}
                    className="w-full accent-herp-teal cursor-pointer"
                  />
                )}
                <div className="flex justify-between text-xs text-neutral-500 mt-1">
                  <span>{fmt(entries[0].date)}</span>
                  <span>{fmt(entries[n - 1].date)}</span>
                </div>
              </div>

              {moltCount > 0 && periods.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {periods.map((p) => {
                    const active = current.moltNumber === p.moltNumber
                    return (
                      <button
                        key={p.moltNumber}
                        type="button"
                        onClick={() => setIdx(p.first)}
                        aria-pressed={active}
                        className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${active ? btnOn : btnIdle}`}
                      >
                        {periodLabel(p.moltNumber, moltCount, NOUN)} ({p.count})
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          <p className="mt-4 text-xs text-neutral-500">
            Photos are dated by when they were added to the app.
            {moltCount === 0 ? ' Log sheds to see each photo placed between them.' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function EntryCaption({ title, meta, size, caption }: { title: string; meta: string; size: string | null; caption?: string | null }) {
  return (
    <div className="mt-3">
      <p className="text-base font-semibold text-neutral-100">{title}</p>
      <p className="text-sm text-neutral-400">{meta}</p>
      {size && <p className="text-sm text-neutral-400">{size}</p>}
      {caption && <p className="text-sm italic text-neutral-500 mt-1">{caption}</p>}
    </div>
  )
}
