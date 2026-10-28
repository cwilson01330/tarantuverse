'use client'

/**
 * "First feeding not logged" nudge for the dashboard (Day-one, 2026-10-27).
 *
 * Shows the animals it is given (the dashboard passes the first three the
 * server flags `needs_first_feeding`). Each row's "When did it last eat?" opens
 * an inline chooser: Today / Yesterday log at once (local noon of that day),
 * Pick a date reveals a date input (no future days) and a Log button, Not yet
 * just closes. The X hides the whole card for 14 days (localStorage
 * `first_feeding_card_hidden_at`, decided by `nudgeHidden`).
 *
 * Renders nothing with no items, before the hidden-until value has been read,
 * or while hidden. Web twin of apps/mobile/src/components/FirstFeedingCard.tsx.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FIRST_FEEDING_COPY,
  dateFromInputValue,
  lastFedIso,
  nudgeHidden,
  todayInputValue,
} from '@/lib/firstFeeding'

export const FIRST_FEEDING_HIDDEN_KEY = 'first_feeding_card_hidden_at'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
// A typed year like "0002" is a valid date to the browser; nobody's first meal is older than this.
const EARLIEST_PICK = '1990-01-01'

export interface FirstFeedingCardProps {
  items: { id: string; name: string }[]
  token: string | null
  /** A feeding was logged: the caller re-runs its feeding-status fetch. */
  onLogged: () => void
}

export default function FirstFeedingCard({ items, token, onLogged }: FirstFeedingCardProps) {
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
    if (!iso || !token || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${API_URL}/api/v1/inverts/${encodeURIComponent(id)}/feedings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fed_at: iso, accepted: true }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not save. Try again?')
      }
      closeChooser()
      onLogged()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save. Try again?')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  if (items.length === 0 || hiddenAt === undefined || nudgeHidden(hiddenAt)) return null

  const chip =
    'px-4 py-2 rounded-full text-sm font-semibold border border-theme bg-surface text-theme-primary hover:bg-surface-elevated disabled:opacity-60'
  const pickedIso = lastFedIso('pick', dateFromInputValue(pickedValue))
  const pickedOk = pickedIso !== null && pickedValue >= EARLIEST_PICK

  return (
    <section
      aria-labelledby="first-feeding-title"
      className="bg-surface rounded-2xl shadow-lg border border-theme p-6"
    >
      <div className="flex items-center gap-2 mb-2">
        <h2 id="first-feeding-title" className="flex-1 text-xl font-bold text-theme-primary">
          🍽️ {FIRST_FEEDING_COPY.nudgeTitle}
        </h2>
        <button
          type="button"
          onClick={hide}
          aria-label={FIRST_FEEDING_COPY.nudgeHideLabel}
          title={FIRST_FEEDING_COPY.nudgeHideLabel}
          className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-theme-secondary hover:bg-surface-elevated"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {items.map((item) => {
          const open = activeId === item.id
          return (
            <li key={item.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-theme-primary truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    closeChooser()
                    if (!open) setActiveId(item.id)
                  }}
                  aria-expanded={open}
                  aria-label={`${FIRST_FEEDING_COPY.nudgeRowButton} ${item.name}`}
                  className="px-4 py-2 rounded-full border border-primary text-primary text-sm font-semibold hover:bg-surface-elevated flex-shrink-0"
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
                        className="px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        disabled={busy || !pickedOk}
                        onClick={() => void log(item.id, pickedIso)}
                        className="px-4 py-2 rounded-lg bg-gradient-brand text-white text-sm font-semibold disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'Log it'}
                      </button>
                    </div>
                  )}

                  {error && (
                    <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
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
