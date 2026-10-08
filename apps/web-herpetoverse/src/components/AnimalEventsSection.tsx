'use client'

/**
 * Health & events — per-animal events list + log/edit dialog (audit-2 M12).
 *
 * Herpetoverse twin of TV web's "Health & events" log section on
 * dashboard/inverts/[id] and its AnimalEventDialog: same picker order,
 * severity only for injury / illness, same per-type note prompts, same copy.
 *
 * Permissions follow the other logs on the page: loggers and up add, and
 * change only their own entries (keepers / owner change any). A died or
 * transferred animal is a closed record (ADR-015) — the list stays
 * readable, but add / edit / delete are hidden; the parent passes
 * `canAdd=false` and a `canChange` that returns false for those.
 *
 * HV web is dark-only (no light theme in tailwind.config) — styling matches
 * the neutral-9xx cards used across the HV detail page.
 */

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { attribution } from '@/lib/coKeepers'
import { fmtDay, todayYMD } from '@/lib/lifecycle'
import {
  ANIMAL_EVENT_LABELS,
  ANIMAL_EVENT_NOTE_HINT,
  ANIMAL_EVENT_ORDER,
  ANIMAL_EVENT_SEVERITIES,
  type AnimalEvent,
  type AnimalEventSeverity,
  type AnimalEventType,
  createAnimalEvent,
  deleteAnimalEvent,
  eventHasSeverity,
  eventTitle,
  listAnimalEvents,
  updateAnimalEvent,
} from '@/lib/animalEvents'

export default function AnimalEventsSection({
  animalId,
  canAdd,
  canChange,
}: {
  animalId: string
  /** Logger or above, and the animal isn't closed (died / transferred). */
  canAdd: boolean
  /** Whether this viewer may edit / delete a given entry. */
  canChange: (e: AnimalEvent) => boolean
}) {
  const [events, setEvents] = useState<AnimalEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AnimalEvent | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setEvents(await listAnimalEvents(animalId))
      setError(null)
    } catch (err) {
      // A failed fetch must not read as "nothing recorded".
      setError(err instanceof ApiError ? err.message : "Couldn't load events.")
    }
  }, [animalId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDelete(e: AnimalEvent) {
    if (!window.confirm('Delete this event?')) return
    setDeleting(e.id)
    try {
      await deleteAnimalEvent(e.id)
      setEvents((prev) => (prev ?? []).filter((x) => x.id !== e.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that event.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {canAdd && (
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          className="px-3 py-1.5 rounded-md border border-herp-teal/60 text-sm font-semibold text-herp-teal hover:bg-herp-teal/10 transition-colors"
        >
          + Log event
        </button>
      )}

      {error && (
        <div
          role="alert"
          className="p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300 flex items-center gap-3"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold text-red-200 hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {events === null && !error ? (
        <p className="text-sm text-neutral-500">Loading events…</p>
      ) : events && events.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No events recorded. Injuries, illnesses, escapes and recoveries go here.
        </p>
      ) : events ? (
        <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-900/40">
          {events.map((e) => {
            const sub = [e.notes, attribution(e)].filter(Boolean).join(' · ')
            const changeable = canChange(e)
            return (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`text-sm font-medium ${
                        e.event_type === 'recovered' ? 'text-herp-green' : 'text-neutral-100'
                      }`}
                    >
                      {eventTitle(e)}
                    </span>
                    <span className="text-xs text-neutral-500 flex-shrink-0">
                      {fmtDay(e.occurred_at)}
                    </span>
                  </div>
                  {sub && (
                    <p className="text-xs text-neutral-400 mt-0.5 whitespace-pre-line break-words">
                      {sub}
                    </p>
                  )}
                </div>
                {changeable && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(e)
                        setDialogOpen(true)
                      }}
                      aria-label="Edit this event"
                      title="Edit this event"
                      className="flex-shrink-0 text-neutral-500 hover:text-herp-teal transition-colors px-1.5 py-0.5 text-xs"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(e)}
                      disabled={deleting === e.id}
                      aria-label="Delete this event"
                      title="Delete event"
                      className="text-xs text-neutral-500 hover:text-red-300 disabled:opacity-40 px-1.5 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      {dialogOpen && (
        <AnimalEventDialog
          animalId={animalId}
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

const FIELD_LABEL =
  'text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1'
const INPUT =
  'w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:border-herp-teal'

function AnimalEventDialog({
  animalId,
  editing,
  onClose,
  onSaved,
}: {
  animalId: string
  editing: AnimalEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<AnimalEventType>(editing?.event_type ?? 'observation')
  const [date, setDate] = useState(editing?.occurred_at?.slice(0, 10) ?? todayYMD())
  const [severity, setSeverity] = useState<AnimalEventSeverity | ''>(editing?.severity ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const showSeverity = eventHasSeverity(type)

  async function save() {
    if (saving) return
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
      if (editing) await updateAnimalEvent(editing.id, payload)
      else await createAnimalEvent(animalId, payload)
      onSaved()
    } catch {
      // Stay open — closing on failure would look like it saved.
      setError('Couldn’t save that. Nothing has changed.')
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hv-animal-event-title"
      onClick={() => !saving && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-neutral-800">
          <h2 id="hv-animal-event-title" className="text-sm font-semibold text-white tracking-wide">
            {editing ? 'Edit event' : 'Log event'}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          <fieldset>
            <legend className={FIELD_LABEL}>What happened?</legend>
            <div className="flex flex-wrap gap-2">
              {ANIMAL_EVENT_ORDER.map((t) => {
                const sel = t === type
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={sel}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      sel
                        ? 'border-herp-green bg-herp-green text-neutral-950'
                        : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
                    }`}
                  >
                    {ANIMAL_EVENT_LABELS[t]}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="hv-event-date" className={FIELD_LABEL}>
              When
            </label>
            <input
              id="hv-event-date"
              type="date"
              value={date}
              max={todayYMD()}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT}
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              Most events get noticed after the fact — backdating is normal.
            </p>
          </div>

          {showSeverity && (
            <fieldset>
              <legend className={FIELD_LABEL}>
                How bad?{' '}
                <span className="font-normal normal-case text-neutral-600">Optional</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {ANIMAL_EVENT_SEVERITIES.map((sv) => {
                  const sel = sv === severity
                  return (
                    <button
                      key={sv}
                      type="button"
                      onClick={() => setSeverity(sel ? '' : sv)}
                      aria-pressed={sel}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        sel
                          ? 'border-amber-500 bg-amber-500 text-neutral-950'
                          : 'border-neutral-700 text-neutral-300 hover:border-amber-400'
                      }`}
                    >
                      {sv[0].toUpperCase() + sv.slice(1)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor="hv-event-notes" className={FIELD_LABEL}>
              Notes
            </label>
            <textarea
              id="hv-event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={ANIMAL_EVENT_NOTE_HINT[type]}
              className={INPUT}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-neutral-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium text-neutral-400 hover:text-white px-4 py-2 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="bg-herp-green hover:bg-herp-lime text-neutral-950 font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </div>
    </div>
  )
}
