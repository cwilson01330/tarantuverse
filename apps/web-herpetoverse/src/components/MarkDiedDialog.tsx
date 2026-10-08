'use client'

/**
 * MarkDiedDialog — HV web mirror of the mobile MarkDiedSheet (ADR-015,
 * handoff §14.2).
 *
 * THE DIALOG IS THE CONFIRM. The date defaults to today, so one click
 * completes it. Cause and note sit behind a single optional line so it never
 * reads as a form. No toast and no checkmark afterwards — the detail page
 * changing in place is the acknowledgement.
 *
 * The confirm button is neutral: never the brand gradient (a call to action)
 * and never red (red means destructive, and this destroys nothing).
 */

import { useEffect, useState } from 'react'
import {
  COPY,
  DEATH_CAUSE_LABELS,
  HV_DEATH_CAUSE_ORDER,
  type DeathCause,
  lifecycleErrorMessage,
  markAnimalDied,
  pronounsFor,
  todayYMD,
} from '@/lib/lifecycle'

interface Props {
  open: boolean
  onClose: () => void
  animalId: string
  animalName: string
  sex: string | null | undefined
  /** Called after a successful save so the parent can refetch. */
  onDone: () => void
}

export default function MarkDiedDialog({
  open,
  onClose,
  animalId,
  animalName,
  sex,
  onDone,
}: Props) {
  const [date, setDate] = useState<string>(todayYMD)
  const [expanded, setExpanded] = useState(false)
  const [cause, setCause] = useState<DeathCause | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const p = pronounsFor(sex)

  // Fresh state every time it opens — a half-filled dialog from an earlier
  // open must never carry over onto a different animal.
  useEffect(() => {
    if (open) {
      setDate(todayYMD())
      setExpanded(false)
      setCause('')
      setNote('')
      setError(null)
      setSaving(false)
    }
  }, [open, animalId])

  if (!open) return null

  function close() {
    if (saving) return
    onClose()
  }

  async function submit() {
    if (saving) return
    const ymd = date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setError('Pick a date.')
      return
    }
    if (ymd > todayYMD()) {
      setError('That date is in the future.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await markAnimalDied(animalId, {
        died_at: ymd,
        death_cause: cause || null,
        death_notes: note.trim() || null,
      })
      onDone()
    } catch (err) {
      // Stay open — closing on an error would look like it worked.
      setError(
        lifecycleErrorMessage(
          err,
          'Couldn’t save that. Nothing has changed — try again.',
        ),
      )
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={COPY.dialogTitle(animalName)}
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-white tracking-wide">
            {COPY.dialogTitle(animalName)}
          </h2>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            {COPY.dialogBody(p)}
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="died-date"
              className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1"
            >
              {COPY.dateLabel}
            </label>
            <input
              id="died-date"
              type="date"
              value={date}
              max={todayYMD()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white focus:outline-none focus:border-herp-teal"
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              {date === todayYMD() ? 'Today. ' : ''}
              {COPY.dateHelper}
            </p>
          </div>

          {expanded && (
            <>
              <div>
                <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  {COPY.causeLabel}{' '}
                  <span className="font-normal normal-case text-neutral-600">
                    (optional)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {HV_DEATH_CAUSE_ORDER.map((c) => {
                    const sel = c === cause
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCause(sel ? '' : c)}
                        aria-pressed={sel}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                          sel
                            ? 'border-neutral-200 bg-neutral-200 text-neutral-950'
                            : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
                        }`}
                      >
                        {DEATH_CAUSE_LABELS[c]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="died-note"
                  className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1"
                >
                  {COPY.noteLabel}{' '}
                  <span className="font-normal normal-case text-neutral-600">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="died-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:border-herp-teal"
                />
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-neutral-800 flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="bg-neutral-100 hover:bg-white text-neutral-950 font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : COPY.confirm}
          </button>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-sm font-medium text-neutral-300 hover:text-white px-4 py-2 transition"
            >
              {COPY.optionalToggle}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="text-sm text-neutral-500 hover:text-neutral-300 px-4 py-2 transition"
          >
            {COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
