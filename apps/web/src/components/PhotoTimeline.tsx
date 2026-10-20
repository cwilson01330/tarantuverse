'use client'

/**
 * Photo timeline (2026-10-20) — every photo of one animal in date order on a
 * scrubbable slider, each labelled by the molt period it falls in, with a
 * marker on the slider at every logged molt. Optional side-by-side compare.
 *
 * Opens for living, died and transferred animals alike. The one edit is the
 * photo's DATE ("Change date", only when the parent passes onSetDate): uploads
 * are dated by upload time, so old photos added in one go land out of order,
 * and both the order and the molt grouping follow the date — there's no free
 * drag-to-reorder on purpose. Grouping lives in lib/photoTimeline.ts (pure,
 * shared rules with the mobile + Herpetoverse copies). Lengths go through
 * lib/units — never a hardcoded unit.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useUnits } from '@/components/UnitsProvider'
import { formatLength } from '@/lib/units'
import { formatLocalDate } from '@/lib/date'
import { formatStage, growthLengthLabel, stageSummary, tracksInstars } from '@/lib/inverts'
import {
  PHOTO_DATE_MIN,
  daysAfterLabel,
  groupPhotosByMolt,
  localDateInput,
  markerFraction,
  markerLabel,
  periodLabel,
  photoDateError,
  takenAtFromLocalDate,
  toLocalDateInput,
  type PhotoTimelineEntry,
} from '@/lib/photoTimeline'

export interface TimelinePhotoRow {
  id: string
  url: string
  thumbnail_url?: string | null
  caption?: string | null
  taken_at?: string | null
  created_at?: string | null
}

export interface TimelineMoltRow {
  id: string
  molted_at: string
  leg_span_after?: string | number | null
  outcome?: string | null
  is_ultimate?: boolean
}

type Entry = PhotoTimelineEntry<TimelinePhotoRow>

export default function PhotoTimeline({
  open,
  onClose,
  animalName,
  taxon,
  currentInstar,
  photos,
  molts,
  imageUrl,
  onSetDate,
}: {
  open: boolean
  onClose: () => void
  animalName: string
  taxon: string
  /** inverts.current_instar — only used to name stages for instar taxa. */
  currentInstar?: number | null
  photos: TimelinePhotoRow[]
  molts: TimelineMoltRow[]
  /** Resolves a stored photo url (relative → API origin). */
  imageUrl: (url?: string | null) => string
  /**
   * PATCH the photo's taken_at and update the parent's list; throw an Error
   * with a readable message on failure. Omit for viewers who can't edit.
   */
  onSetDate?: (photoId: string, takenAt: string | null) => Promise<void>
}) {
  const { units } = useUnits()
  const timeline = useMemo(
    () => groupPhotosByMolt(photos, molts.map((m) => ({ id: m.id, at: m.molted_at }))),
    [photos, molts],
  )
  const { entries, markers, moltCount } = timeline
  const n = entries.length

  // Instar taxa name the stage each molt reached — the same arithmetic as the
  // Stages card (stageSummary), so the two never disagree. Unset instar = no names.
  const stageById = useMemo(() => {
    const map = new Map<string, number>()
    if (!tracksInstars(taxon) || currentInstar == null) return map
    for (const e of stageSummary(molts, currentInstar).entries) if (e.stage != null) map.set(e.id, e.stage)
    return map
  }, [taxon, currentInstar, molts])
  const moltById = useMemo(() => new Map(molts.map((m) => [m.id, m])), [molts])

  const [idx, setIdx] = useState(0)
  const [compare, setCompare] = useState(false)
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // "Change date" editor for the current photo.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)
  const editingRef = useRef(false)
  editingRef.current = editing
  // After a save the photo moves; follow it to its new place.
  const followId = useRef<string | null>(null)

  // Open on the newest photo; compare defaults to first vs latest.
  useEffect(() => {
    if (!open) return
    setIdx(Math.max(0, n - 1))
    setLeft(0)
    setRight(Math.max(0, n - 1))
    setCompare(false)
    setEditing(false)
  }, [open, n])

  useEffect(() => {
    if (!followId.current) return
    const at = entries.findIndex((e) => e.photo.id === followId.current)
    followId.current = null
    if (at >= 0) setIdx(at)
  }, [entries])

  // Moving to another photo (or into compare) drops an unsaved edit.
  useEffect(() => {
    setEditing(false)
    setDateError(null)
  }, [idx, compare])

  // Dialog behaviour: focus in, Escape closes (or cancels a date edit),
  // ←/→ step, body scroll locked.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingRef.current) { setEditing(false); return }
        onCloseRef.current()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      // The range input and selects handle their own arrow keys.
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

  const noun = 'molt' as const
  const titleFor = (e: Entry) => {
    const period = periodLabel(e.moltNumber, moltCount, noun)
    const stage = e.moltId && stageById.has(e.moltId) ? formatStage(taxon, stageById.get(e.moltId)!) : null
    return period ? (stage ? `${period} (${stage})` : period) : 'Photo'
  }
  const metaFor = (e: Entry) =>
    [formatLocalDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' }), daysAfterLabel(e.daysAfterMolt, noun)]
      .filter(Boolean)
      .join(' · ')
  const sizeFor = (e: Entry) => {
    if (!e.moltId) return null
    const v = formatLength(moltById.get(e.moltId)?.leg_span_after, units)
    return v ? `${growthLengthLabel(taxon)} after molt ${e.moltNumber}: ${v}` : null
  }
  const optionLabel = (e: Entry, i: number) => `${i + 1}. ${titleFor(e)} · ${metaFor(e)}`

  const current = entries[Math.min(idx, n - 1)]

  const startEdit = () => {
    setDraft(localDateInput(current.date) ?? toLocalDateInput(new Date()))
    setDateError(null)
    setEditing(true)
  }
  const saveDate = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!onSetDate || saving) return
    const problem = photoDateError(draft)
    const takenAt = problem ? null : takenAtFromLocalDate(draft)
    if (problem || !takenAt) { setDateError(problem ?? 'Enter a valid date.'); return }
    setSaving(true)
    setDateError(null)
    try {
      followId.current = current.photo.id
      await onSetDate(current.photo.id, takenAt)
      setEditing(false)
    } catch (err) {
      followId.current = null
      setDateError(err instanceof Error && err.message ? err.message : 'Could not save the date.')
    } finally {
      setSaving(false)
    }
  }

  // Periods that have photos, for the jump chips.
  const periods: { moltNumber: number; first: number; count: number }[] = []
  entries.forEach((e, i) => {
    const last = periods[periods.length - 1]
    if (last && last.moltNumber === e.moltNumber) last.count++
    else periods.push({ moltNumber: e.moltNumber, first: i, count: 1 })
  })

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo timeline for ${animalName}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white sm:rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Photo timeline</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {animalName} · {n} photos{moltCount ? ` · ${moltCount} ${moltCount === 1 ? 'molt' : 'molts'} logged` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCompare((c) => !c)}
              aria-pressed={compare}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                compare
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Compare
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close photo timeline"
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
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
                    <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center h-[45vh]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl(e.photo.url)} alt={e.photo.caption || titleFor(e)} className="max-h-full max-w-full object-contain" />
                    </div>
                    <EntryCaption title={titleFor(e)} meta={metaFor(e)} size={sizeFor(e)} caption={e.photo.caption} />
                    <label className="block mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {side} photo
                      <select
                        value={value}
                        onChange={(ev) => set(Number(ev.target.value))}
                        className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
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
              <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center h-[55vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(current.photo.url)} alt={current.photo.caption || titleFor(current)} className="max-h-full max-w-full object-contain" />
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/65 text-white text-xs font-semibold">
                  {idx + 1} / {n}
                </span>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => setIdx(idx - 1)}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white text-xl hover:bg-black/75"
                  >
                    ‹
                  </button>
                )}
                {idx < n - 1 && (
                  <button
                    type="button"
                    onClick={() => setIdx(idx + 1)}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white text-xl hover:bg-black/75"
                  >
                    ›
                  </button>
                )}
              </div>
              <EntryCaption title={titleFor(current)} meta={metaFor(current)} size={sizeFor(current)} caption={current.photo.caption} />

              {onSetDate && (editing ? (
                <form onSubmit={saveDate} className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Date taken
                    <input
                      type="date"
                      value={draft}
                      min={PHOTO_DATE_MIN}
                      max={toLocalDateInput(new Date())}
                      onChange={(e) => setDraft(e.target.value)}
                      required
                      autoFocus
                      className="mt-1 block px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save date'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  {dateError && (
                    <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">{dateError}</p>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="mt-2 text-sm font-medium text-primary-700 dark:text-primary-400 hover:underline"
                >
                  Change date
                </button>
              ))}

              {/* Slider. Native range input: drag, click and arrow keys for
                  free. Molt markers sit between the photo stops. */}
              <div className="mt-5 px-2">
                {n > 1 && (
                  <div className="relative h-6" aria-hidden="true">
                    {markers.map((m) => (
                      <div
                        key={m.molts[0].id}
                        className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                        style={{ left: `${markerFraction(m.beforeIndex, n) * 100}%` }}
                        title={`${markerLabel(m, noun)} · ${formatLocalDate(m.molts[m.molts.length - 1].at)}`}
                      >
                        {markers.length <= 8 && (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                            {markerLabel(m, noun)}
                          </span>
                        )}
                        <span className="w-0.5 h-2 bg-amber-600 dark:bg-amber-400 rounded" />
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
                    className="w-full accent-primary-600 cursor-pointer"
                  />
                )}
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>{formatLocalDate(entries[0].date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>{formatLocalDate(entries[n - 1].date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>

              {/* Jump to a molt period. */}
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
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                          active
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {periodLabel(p.moltNumber, moltCount, noun)} ({p.count})
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Photos are dated by when they were added to the app.
            {onSetDate ? ' One out of order? Use Change date to set the day it was taken and it moves into place.' : ''}
            {moltCount === 0 ? ' Log molts to see each photo placed between them.' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function EntryCaption({ title, meta, size, caption }: { title: string; meta: string; size: string | null; caption?: string | null }) {
  return (
    <div className="mt-3">
      <p className="text-base font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">{meta}</p>
      {size && <p className="text-sm text-gray-600 dark:text-gray-300">{size}</p>}
      {caption && <p className="text-sm italic text-gray-500 dark:text-gray-400 mt-1">{caption}</p>}
    </div>
  )
}
