'use client'

/**
 * Log or edit an event — injuries, illnesses, bad molts, escapes, recoveries,
 * rehousings, vet visits and free observations (ADR-015 D5).
 *
 * Web twin of apps/mobile/app/invert/add-event.tsx — same picker order, same
 * per-type note prompts, same copy. Keep the two in step.
 *
 * Severity is offered only for injury and illness: on an observation it would
 * invite a judgment the keeper never made. A `death` event is only a note —
 * it never marks the animal as died; that has its own control on the page.
 */
import { useEffect, useState } from 'react'
import {
  ANIMAL_EVENT_LABELS,
  ANIMAL_EVENT_ORDER,
  createInvertEvent,
  eventHasSeverity,
  updateAnimalEvent,
  type AnimalEvent,
  type AnimalEventSeverity,
  type AnimalEventType,
} from '@/lib/animal-lifecycle'

const SEVERITIES: AnimalEventSeverity[] = ['minor', 'moderate', 'severe']

/** A prompt for the keeper's own words, which are the point of this log. */
const NOTE_HINT: Partial<Record<AnimalEventType, string>> = {
  injury: 'e.g. lost most of leg III right in a fall from the lid',
  illness: 'What you noticed, and what you changed',
  bad_molt: 'What went wrong, and how they are now',
  escape: 'How they got out, and where you found them',
  recovered: 'Which problem this answers',
  rehoused: 'What they moved into, and why',
  vet_visit: 'What was found, and what was advised',
  observation: 'Anything worth remembering',
  death: 'Marking them as died is on the animal’s own page — this is just a note',
}

/** Local calendar today as YYYY-MM-DD (not toISOString, which is UTC). */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary'

export default function AnimalEventDialog({
  open,
  token,
  invertId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  token: string | null
  invertId: string
  /** The event being edited; null/undefined logs a new one. */
  editing?: AnimalEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<AnimalEventType>('observation')
  const [date, setDate] = useState(todayIso())
  const [severity, setSeverity] = useState<AnimalEventSeverity | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setType(editing?.event_type ?? 'observation')
    setDate(editing?.occurred_at ? editing.occurred_at.slice(0, 10) : todayIso())
    setSeverity(editing?.severity ?? '')
    setNotes(editing?.notes ?? '')
    setError('')
  }, [open, editing])

  if (!open) return null

  const showSeverity = eventHasSeverity(type)

  const save = async () => {
    if (!token || saving) return
    setSaving(true)
    setError('')
    const payload = {
      event_type: type,
      occurred_at: date || null,
      // Don't smuggle a stale severity through if the type was switched.
      severity: showSeverity ? severity || null : null,
      notes: notes.trim() || null,
    }
    try {
      if (editing) await updateAnimalEvent(token, editing.id, payload)
      else await createInvertEvent(token, invertId, payload)
      onSaved()
      onClose()
    } catch {
      // Stay open — closing on failure would look like it saved.
      setError('Couldn’t save that. Nothing has changed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="animal-event-title"
        className="w-full max-w-md rounded-2xl border border-theme bg-surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="animal-event-title" className="text-xl font-bold text-theme-primary">
          {editing ? 'Edit event' : 'Log event'}
        </h2>

        <fieldset>
          <legend className="block text-sm font-medium text-theme-secondary mb-2">What happened?</legend>
          <div className="flex flex-wrap gap-2">
            {ANIMAL_EVENT_ORDER.map((t) => {
              const sel = t === type
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={sel}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                    sel
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                  }`}
                >
                  {ANIMAL_EVENT_LABELS[t]}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="block text-sm font-medium text-theme-secondary mb-1">When</span>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
          <span className="block mt-1 text-xs text-theme-tertiary">
            Most events get noticed after the fact — backdating is normal.
          </span>
        </label>

        {showSeverity && (
          <fieldset>
            <legend className="block text-sm font-medium text-theme-secondary mb-2">
              How bad? <span className="text-theme-tertiary font-normal">Optional</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((sv) => {
                const sel = sv === severity
                return (
                  <button
                    key={sv}
                    type="button"
                    onClick={() => setSeverity(sel ? '' : sv)}
                    aria-pressed={sel}
                    className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                      sel
                        ? 'bg-amber-500 border-amber-500 text-white dark:bg-amber-600 dark:border-amber-600'
                        : 'border-theme bg-surface text-theme-primary hover:border-amber-400'
                    }`}
                  >
                    {sv[0].toUpperCase() + sv.slice(1)}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-theme-secondary mb-1">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={NOTE_HINT[type]}
            className={inputCls}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-theme-secondary hover:text-theme-primary transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </div>
    </div>
  )
}
