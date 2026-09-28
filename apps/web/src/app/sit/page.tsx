'use client'

/**
 * Sitter pass page — /sit#<token>  (PRD-shared-keeping, Phase 1)
 *
 * The person opening this has no account and may never have kept an
 * invertebrate. They're probably standing at an enclosure with a phone in one
 * hand. Everything here is written for them.
 *
 * TOKEN HANDLING (threat T3)
 * --------------------------
 * The token arrives in the URL FRAGMENT. Fragments are never sent to a server,
 * so the token stays out of Vercel logs, link-preview fetches and Referer
 * headers. On load we:
 *   1. read the fragment,
 *   2. immediately strip it from the address bar (history.replaceState), so it
 *      can't be screenshotted, bookmarked or picked up by anything later,
 *   3. POST it in a request BODY to /sitter/exchange for a short-lived session,
 *   4. keep only that session, in sessionStorage (this tab, this visit).
 * PostHog never starts on this route and Vercel Analytics drops it
 * (components/PostHogProvider.tsx, components/SafeAnalytics.tsx).
 *
 * The page renders only what the API returns; there is no way to write from
 * here in Phase 1.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import SitterPassView, { fmtDate, type Payload } from '@/components/SitterPassView'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'tv_sitter_session'

type View =
  | { kind: 'loading' }
  | { kind: 'no-link' }
  | { kind: 'unavailable' }
  | { kind: 'timed-out' }
  | { kind: 'scheduled'; startsAt: string }
  | { kind: 'error' }
  | { kind: 'ready'; data: Payload }

export default function SitterPassPage() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const started = useRef(false)

  const load = useCallback(async (session: string) => {
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await fetch(`${API_URL}/api/v1/sitter/pass?tz_offset_minutes=${tz}`, {
        headers: { Authorization: `Bearer ${session}` },
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      })
      if (res.status === 401) {
        try { sessionStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
        setView({ kind: 'timed-out' })
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      setView({ kind: 'ready', data: (await res.json()) as Payload })
    } catch {
      setView({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    // Strict mode runs effects twice in dev; the token must be spent once.
    if (started.current) return
    started.current = true

    // Only a string shaped like a real token (token_urlsafe(32) → 43 url-safe
    // chars) is spent as one. Anything else in the fragment — e.g. the in-page
    // "#if-something-goes-wrong" anchor after a reload — falls through to the
    // saved session instead of being "exchanged" and reported as an ended link.
    const fragment = window.location.hash.slice(1)
    const token = /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : null
    if (token) {
      // Strip the fragment before anything else can see it.
      window.history.replaceState(null, '', window.location.pathname)
      ;(async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/sitter/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
          })
          if (res.status === 409) {
            const body = await res.json().catch(() => null)
            const startsAt = body?.detail?.starts_at
            setView(startsAt ? { kind: 'scheduled', startsAt } : { kind: 'unavailable' })
            return
          }
          if (!res.ok) {
            setView({ kind: 'unavailable' })
            return
          }
          const { session } = (await res.json()) as { session: string }
          try { sessionStorage.setItem(SESSION_KEY, session) } catch { /* private mode */ }
          await load(session)
        } catch {
          setView({ kind: 'error' })
        }
      })()
      return
    }

    let session: string | null = null
    try { session = sessionStorage.getItem(SESSION_KEY) } catch { /* private mode */ }
    if (session) void load(session)
    else setView({ kind: 'no-link' })
  }, [load])

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-4">Tarantuverse</p>
        {view.kind === 'loading' && <Message title="Opening the feeding list…" busy />}
        {view.kind === 'no-link' && (
          <Message title="Open the link you were sent"
            body="This page shows a keeper's feeding list. Open the link or scan the QR code they gave you." />
        )}
        {view.kind === 'unavailable' && (
          <Message title="This feeding list has ended"
            body="Ask the keeper who sent it for a new link." />
        )}
        {view.kind === 'timed-out' && (
          <Message title="This page timed out"
            body="For safety, the list closes after a while. Open the original link again to carry on." />
        )}
        {view.kind === 'scheduled' && (
          <Message title="This feeding list isn't open yet"
            body={`It opens on ${fmtDate(view.startsAt)}. Open the same link again then.`} />
        )}
        {view.kind === 'error' && (
          <Message title="We couldn't load the list"
            body="Check your connection and reload the page. If it keeps happening, open the original link again." />
        )}
        {view.kind === 'ready' && <SitterPassView data={view.data} />}
      </div>
    </main>
  )
}

function Message({ title, body, busy }: { title: string; body?: string; busy?: boolean }) {
  return (
    <div role="status" aria-live="polite"
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      {busy && <div className="w-8 h-8 mb-4 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />}
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
      {body && <p className="mt-2 text-gray-600 dark:text-gray-300">{body}</p>}
    </div>
  )
}

