'use client'

/**
 * One-click unsubscribe from the daily email reminder (HV day one, 2026-11-18).
 *
 * Public, no sign-in: the signed token in the path IS the access (API:
 * routers/notification_preferences.py, `email-unsubscribe`). Nothing happens on
 * load - mail scanners and link previewers open links, and they must not turn
 * a keeper's reminders off. The keeper presses the button, which POSTs the
 * token (and the `app` value from the link's query string, unchanged). Kept
 * out of robots, analytics and Referer headers (public/robots.txt,
 * next.config.js, PostHogProvider, SafeAnalytics).
 */
import { Suspense, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FIRST_FEEDING_COPY } from '@/lib/firstFeeding'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

type Phase = 'ask' | 'working' | 'done' | 'invalid'

function UnsubscribeForm() {
  const params = useParams<{ token: string }>()
  const search = useSearchParams()
  const raw = params?.token
  const token = Array.isArray(raw) ? raw[0] : raw
  const app = search?.get('app') ?? null
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
      const qs = `token=${encodeURIComponent(token)}${app ? `&app=${encodeURIComponent(app)}` : ''}`
      const r = await fetch(`${API_URL}/api/v1/notification-preferences/email-unsubscribe?${qs}`, {
        method: 'POST',
        referrerPolicy: 'no-referrer',
      })
      if (r.ok) {
        setPhase('done')
      } else if (r.status === 404 || r.status === 400) {
        // The API answers 404 to a forged or garbled token.
        setPhase('invalid')
      } else {
        setFailed(true)
        setPhase('ask')
      }
    } catch {
      setFailed(true)
      setPhase('ask')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        {phase === 'done' ? (
          <p role="status" className="text-lg font-semibold text-white">
            {FIRST_FEEDING_COPY.unsubscribeOk}
          </p>
        ) : phase === 'invalid' ? (
          <p role="alert" className="text-lg font-semibold text-white">
            {FIRST_FEEDING_COPY.unsubscribeBad}
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white">{FIRST_FEEDING_COPY.unsubscribeHeading}</h1>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={phase === 'working'}
              className="herp-gradient-bg mt-6 w-full rounded-md px-6 py-3 font-bold text-herp-dark disabled:opacity-60"
            >
              {phase === 'working' ? 'Working…' : FIRST_FEEDING_COPY.unsubscribeButton}
            </button>
            {failed && (
              <p role="alert" className="mt-3 text-sm text-rose-400">
                Something went wrong. Please try again.
              </p>
            )}
          </>
        )}
        <p className="mt-6 text-sm">
          <Link href="/app/settings/notifications" className="text-herp-teal hover:text-herp-lime">
            Reminder settings
          </Link>
        </p>
      </div>
    </main>
  )
}

// useSearchParams needs a Suspense boundary for static prerendering.
export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeForm />
    </Suspense>
  )
}
