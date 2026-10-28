'use client'

/**
 * One-click unsubscribe from the daily email reminder (Day-one, 2026-10-27).
 *
 * Public, no sign-in: the signed token in the path IS the access (API:
 * routers/notification_preferences.py, `email-unsubscribe`). Nothing happens on
 * load - mail scanners and link previewers open links, and they must not turn
 * a keeper's reminders off. The keeper presses the button, which POSTs the
 * token. Kept out of robots, analytics and Referer headers (robots.ts,
 * next.config.js, PostHogProvider, SafeAnalytics).
 */
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FIRST_FEEDING_COPY } from '@/lib/firstFeeding'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Phase = 'ask' | 'working' | 'done' | 'invalid'

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>()
  const raw = params?.token
  const token = Array.isArray(raw) ? raw[0] : raw
  const [phase, setPhase] = useState<Phase>('ask')
  // A server or network failure is not "bad link": the keeper can press again.
  const [failed, setFailed] = useState(false)

  const unsubscribe = async () => {
    if (phase === 'working') return
    if (!token) {
      setPhase('invalid')
      return
    }
    setFailed(false)
    setPhase('working')
    try {
      const r = await fetch(
        `${API_URL}/api/v1/notification-preferences/email-unsubscribe?token=${encodeURIComponent(token)}`,
        { method: 'POST', referrerPolicy: 'no-referrer' },
      )
      if (r.ok) {
        setPhase('done')
      } else if (r.status === 404 || r.status === 400) {
        // The API answers 404 to a forged or garbled token.
        setPhase('invalid')
      } else {
        // 5xx, 429, anything else: back to the ask with a retry line.
        setFailed(true)
        setPhase('ask')
      }
    } catch {
      setFailed(true)
      setPhase('ask')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-lg">
        {phase === 'done' ? (
          <>
            <div aria-hidden="true" className="text-4xl mb-3">✅</div>
            <p role="status" className="text-lg font-semibold text-gray-900 dark:text-white">
              {FIRST_FEEDING_COPY.unsubscribeOk}
            </p>
          </>
        ) : phase === 'invalid' ? (
          <p role="alert" className="text-lg font-semibold text-gray-900 dark:text-white">
            {FIRST_FEEDING_COPY.unsubscribeBad}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {FIRST_FEEDING_COPY.unsubscribeHeading}
            </h1>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={phase === 'working'}
              className="mt-6 w-full px-6 py-3 rounded-xl bg-gradient-brand text-white font-semibold disabled:opacity-60"
            >
              {phase === 'working' ? 'Working…' : FIRST_FEEDING_COPY.unsubscribeButton}
            </button>
            {failed && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                Something went wrong. Please try again.
              </p>
            )}
          </>
        )}
        <p className="mt-6 text-sm">
          <Link href="/dashboard/settings/notifications" className="text-purple-600 dark:text-purple-400 hover:underline">
            Reminder settings
          </Link>
        </p>
      </div>
    </main>
  )
}
