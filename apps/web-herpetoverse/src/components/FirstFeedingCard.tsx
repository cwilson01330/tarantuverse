'use client'

/**
 * "First meal not logged" card for the dashboard (HV day one, 2026-11-18).
 *
 * Shows the animals it is given (the dashboard passes up to three the server
 * flags `needs_first_feeding`). Each row's "When did it last eat?" opens an
 * inline chooser: Today / Yesterday log at once (local noon of that day),
 * Pick a date reveals a date input (no future days) and a Log button, Not yet
 * just closes. The X hides the whole card for 14 days (localStorage
 * `first_feeding_card_hidden_at`, decided by `nudgeHidden`).
 *
 * Renders nothing with no items, before the hidden-until value has been read,
 * or while hidden. Web twin of Tarantuverse's FirstFeedingCard and HV
 * mobile's FirstFeedingCard.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { createFeeding } from '@/lib/animals'
import {
  FIRST_FEEDING_COPY,
  dateFromInputValue,
  lastFedIso,
  nudgeHidden,
  todayInputValue,
} from '@/lib/firstFeeding'

export const FIRST_FEEDING_HIDDEN_KEY = 'first_feeding_card_hidden_at'

// A typed year like "0002" is a valid date to the browser; nobody's first meal is older than this.
const EARLIEST_PICK = '1990-01-01'

export interface FirstFeedingCardProps {
  items: { id: string; name: string }[]
  /** A feeding was logged: the caller re-runs its feeding-status fetch. */
  onLogged: () => void
}

export default function FirstFeedingCard({ items, onLogged }: FirstFeedingCardProps) {
  // undefined = not read yet (render nothing rather than flash the card).
  const [hiddenAt, setHiddenAt] = useState<string | null | undefined>(undefined)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pickedValue, setPickedValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    try {
      setHiddenAt(window.localStorage.getItem(FIRST_FEEDING_HIDDEN_KEY))
    } catch {
      setHiddenAt(null)
    }
  }, [])

  const hide = useCallback(() => {
    const now = new Date().toISOString()
    setHiddenAt(now)
    try {
      window.localStorage.setItem(FIRST_FEEDING_HIDDEN_KEY, now)
    } catch {
      // Hidden for this visit at least.
    }
  }, [])

  const closeChooser = () => {
    setActiveId(null)
    setPicking(false)
    setPickedValue('')
    setError(null)
  }

  const log = async (id: string, iso: string | null) => {
    if (!iso || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      await createFeeding(id, { fed_at: iso, accepted: true })
      closeChooser()
      onLogged()
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : 'Could not save. Try again?')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  if (items.length === 0 || hiddenAt === undefined || nudgeHidden(hiddenAt)) return null

  const chip =
    'px-3 py-1.5 rounded-full border border-neutral-800 bg-neutral-950 text-sm text-neutral-300 hover:border-neutral-600 disabled:opacity-60'
  const pickedIso = lastFedIso('pick', dateFromInputValue(pickedValue))
  const pickedOk = pickedIso !== null && pickedValue >= EARLIEST_PICK

  return (
    <section
      aria-labelledby="first-feeding-title"
      className="relative mb-8 rounded-lg border border-herp-teal/30 bg-neutral-900/50 p-5"
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 id="first-feeding-title" className="flex-1 text-base font-semibold text-white">
          {FIRST_FEEDING_COPY.nudgeTitle}
        </h2>
        <button
          type="button"
          onClick={hide}
          aria-label={FIRST_FEEDING_COPY.nudgeHideLabel}
          title={FIRST_FEEDING_COPY.nudgeHideLabel}
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ul className="divide-y divide-neutral-800">
        {items.map((item) => {
          const open = activeId === item.id
          return (
            <li key={item.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-neutral-100">{item.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    closeChooser()
                    if (!open) setActiveId(item.id)
                  }}
                  aria-expanded={open}
                  aria-label={`${FIRST_FEEDING_COPY.nudgeRowButton} ${item.name}`}
                  className="flex-shrink-0 rounded-full border border-herp-teal px-4 py-2 text-sm font-semibold text-herp-teal transition-colors hover:bg-herp-teal/10"
                >
                  {FIRST_FEEDING_COPY.nudgeRowButton}
                </button>
              </div>

              {open && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void log(item.id, lastFedIso('today', null))} className={chip}>
                      {FIRST_FEEDING_COPY.nudgeChipToday}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void log(item.id, lastFedIso('yesterday', null))} className={chip}>
                      {FIRST_FEEDING_COPY.nudgeChipYesterday}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={picking}
                      onClick={() => {
                        setPicking(true)
                        if (!pickedValue) setPickedValue(todayInputValue())
                      }}
                      className={chip}
                    >
                      {FIRST_FEEDING_COPY.nudgeChipPickDate}
                    </button>
                    <button type="button" disabled={busy} onClick={closeChooser} className={chip}>
                      {FIRST_FEEDING_COPY.nudgeChipNotYet}
                    </button>
                  </div>

                  {picking && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        aria-label={FIRST_FEEDING_COPY.nudgeRowButton}
                        min={EARLIEST_PICK}
                        max={todayInputValue()}
                        value={pickedValue}
                        onChange={(e) => setPickedValue(e.target.value)}
                        className="px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 [color-scheme:dark]"
                      />
                      <button
                        type="button"
                        disabled={busy || !pickedOk}
                        onClick={() => void log(item.id, pickedIso)}
                        className="herp-gradient-bg rounded-md px-4 py-2 text-sm font-bold text-herp-dark disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Log it'}
                      </button>
                    </div>
                  )}

                  {error && (
                    <p role="alert" className="mt-2 text-sm text-rose-400">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
