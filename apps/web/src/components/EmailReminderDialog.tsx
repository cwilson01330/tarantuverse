'use client'

/**
 * One-time "Want an email when {name} is due?" ask (Day-one, 2026-10-27).
 *
 * Two variants, tracked separately in localStorage (`email_reminder_ask_v1`,
 * see lib/firstFeeding.ts): `after_save` (right after the keeper adds an
 * animal) and `due` (the first time something is due). The shown flag is
 * written the moment the dialog opens, so a keeper is never asked twice for
 * the same variant whatever they do next.
 *
 * "Email me" turns on the daily email reminder (and the daily digest it rides
 * on) and saves this browser's zone; "Not now" just closes. A failed save
 * shows a message and stays open.
 *
 * Also exports the pieces a page needs to decide WHETHER to ask:
 * `readAskState`, `fetchEmailReminderPrefs`.
 */
import { useEffect, useRef, useState } from 'react'
import {
  EMAIL_ASK_STORAGE_KEY,
  FIRST_FEEDING_COPY,
  parseAskState,
  shouldAskAfterSave,
  type AskState,
} from '@/lib/firstFeeding'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type EmailAskVariant = 'after_save' | 'due'

/** The stored ask state; defaults when storage is missing, blocked or garbage. */
export function readAskState(): AskState {
  try {
    return parseAskState(window.localStorage.getItem(EMAIL_ASK_STORAGE_KEY))
  } catch {
    return parseAskState(null)
  }
}

function markShown(variant: EmailAskVariant) {
  try {
    const next = readAskState()
    if (variant === 'after_save') next.afterSaveShown = true
    else next.dueShown = true
    window.localStorage.setItem(EMAIL_ASK_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: the ask may repeat next visit, which is acceptable.
  }
}

export interface EmailReminderPrefs {
  /** The daily email reminder is already on. */
  emailOn: boolean
  /** The daily digest (which the email rides on) is on. Off = the keeper said no to reminders. */
  digestOn: boolean
}

/**
 * The saved reminder preferences, from one GET. `null` when they can't be read:
 * callers then don't ask (never nag on a guess).
 */
export async function fetchEmailReminderPrefs(token: string): Promise<EmailReminderPrefs | null> {
  try {
    const r = await fetch(`${API_URL}/api/v1/notification-preferences/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    const data = await r.json()
    return {
      emailOn: data?.email_digest_enabled === true,
      digestOn: data?.daily_digest_enabled !== false,
    }
  } catch {
    return null
  }
}

/**
 * Should the after-save ask open now? Reads the stored state, then the saved
 * preference. Any read failure means no ask.
 */
export async function decideAskAfterSave(token: string | null): Promise<boolean> {
  if (!token) return false
  const state = readAskState()
  if (state.afterSaveShown) return false
  const prefs = await fetchEmailReminderPrefs(token)
  if (prefs === null) return false
  return shouldAskAfterSave(state, prefs.emailOn, prefs.digestOn)
}

interface Props {
  open: boolean
  variant: EmailAskVariant
  animalName?: string
  token: string | null
  onClose: () => void
}

export default function EmailReminderDialog({ open, variant, animalName, token, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    markShown(variant)
    setBusy(false)
    setError(null)
    acceptRef.current?.focus()
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const title =
    variant === 'after_save'
      ? FIRST_FEEDING_COPY.emailAskAfterSaveTitle(animalName || 'your animal')
      : FIRST_FEEDING_COPY.emailAskWhenDueTitle

  const accept = async () => {
    if (busy) return
    if (!token) {
      setError('Sign in again to turn this on.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${API_URL}/api/v1/notification-preferences/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email_digest_enabled: true,
          daily_digest_enabled: true,
          tz_offset_minutes: new Date().getTimezoneOffset(),
        }),
      })
      if (!r.ok) throw new Error()
      setBusy(false)
      onClose()
    } catch {
      setBusy(false)
      setError("Couldn't turn on email reminders. Try again, or use Settings.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-ask-title"
        aria-describedby="email-ask-body"
        className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-xl"
      >
        <h2 id="email-ask-title" className="text-lg font-bold text-gray-900 dark:text-white">
          {title}
        </h2>
        <p id="email-ask-body" className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {FIRST_FEEDING_COPY.emailAskBody}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-60"
          >
            {FIRST_FEEDING_COPY.emailAskDecline}
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={accept}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gradient-brand text-white font-semibold disabled:opacity-60"
          >
            {busy ? 'Saving…' : FIRST_FEEDING_COPY.emailAskAccept}
          </button>
        </div>
      </div>
    </div>
  )
}
