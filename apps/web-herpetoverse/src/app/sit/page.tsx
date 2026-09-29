'use client'

/**
 * Sitter pass page — /sit#<token>  (PRD-shared-keeping, Phases 1–2)
 *
 * The person opening this has no account and may never have kept a
 * reptile. They're probably standing at an enclosure with a phone in one
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
 * LOGGING (rung 2)
 * ----------------
 * If the keeper turned logging on, the page asks for the PIN they shared
 * separately. /sitter/unlock trades it for a write session, which REPLACES the
 * read session in sessionStorage (it can read too). The PIN itself is never
 * stored. If the keeper changes the PIN or turns logging off, writes start
 * returning 403 and the page simply asks for the PIN again. After 5 wrong
 * PINs, logging pauses (423) but the feeding list stays readable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SitterPassView, { fmtDate, type Payload } from '@/components/SitterPassView'
import type { LogInput, SitterLoggingHandlers, UnlockResult } from '@/components/SitterLogging'

import { API_URL } from '@/lib/apiClient'
const SESSION_KEY = 'hv_sitter_session'
const SITTER_API = `${API_URL}/api/v1/sitter`

type View =
  | { kind: 'loading' }
  | { kind: 'no-link' }
  | { kind: 'unavailable' }
  | { kind: 'timed-out' }
  | { kind: 'scheduled'; startsAt: string }
  | { kind: 'error' }
  | { kind: 'ready'; data: Payload }

async function detailMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  const d = body?.detail
  if (typeof d === 'string') return d
  if (d && typeof d.message === 'string') return d.message
  return fallback
}

export default function SitterPassPage() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const started = useRef(false)
  const sessionRef = useRef<string | null>(null)

  const saveSession = (s: string | null) => {
    sessionRef.current = s
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, s)
      else sessionStorage.removeItem(SESSION_KEY)
    } catch { /* private mode */ }
  }

  const sitterFetch = useCallback((path: string, init: RequestInit = {}) => {
    return fetch(`${SITTER_API}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${sessionRef.current ?? ''}`,
      },
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  }, [])

  const load = useCallback(async (session: string) => {
    sessionRef.current = session
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await sitterFetch(`/pass?tz_offset_minutes=${tz}`)
      if (res.status === 401) {
        saveSession(null)
        setView({ kind: 'timed-out' })
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      setView({ kind: 'ready', data: (await res.json()) as Payload })
    } catch {
      setView({ kind: 'error' })
    }
  }, [sitterFetch])

  const reload = useCallback(async () => {
    if (sessionRef.current) await load(sessionRef.current)
  }, [load])

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
          const res = await fetch(`${SITTER_API}/exchange`, {
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
          saveSession(session)
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

  const unlocked = view.kind === 'ready' && Boolean(view.data.logging_unlocked)

  const logging: SitterLoggingHandlers = useMemo(() => ({
    unlocked,

    unlock: async (pin: string): Promise<UnlockResult> => {
      try {
        const res = await sitterFetch('/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        })
        if (res.ok) {
          const { session } = (await res.json()) as { session: string }
          saveSession(session)
          await load(session)
          return { ok: true }
        }
        if (res.status === 423) {
          // Logging is paused after too many wrong PINs; the list still works.
          await reload()
          return { ok: false, message: await detailMessage(res, 'Logging on this link is paused.'), locked: true }
        }
        if (res.status === 401) {
          saveSession(null)
          setView({ kind: 'timed-out' })
          return { ok: false, message: 'This page timed out.' }
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => null)
          const left = body?.detail?.attempts_left
          return {
            ok: false,
            message: typeof left === 'number'
              ? `That PIN didn't match. ${left} ${left === 1 ? 'try' : 'tries'} left before the link pauses.`
              : "That PIN didn't match.",
          }
        }
        return { ok: false, message: await detailMessage(res, "Couldn't check the PIN. Try again.") }
      } catch {
        return { ok: false, message: "Couldn't reach the server. Check your connection and try again." }
      }
    },

    log: async (kind: string, id: string, entry: LogInput) => {
      try {
        const res = await sitterFetch('/feedings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id, ...entry }),
        })
        if (res.ok) {
          await reload()
          return null
        }
        if (res.status === 401) {
          saveSession(null)
          setView({ kind: 'timed-out' })
          return 'This page timed out.'
        }
        if (res.status === 403 || res.status === 423) {
          // The keeper changed the PIN or turned logging off, or logging was
          // paused. Reload so the page shows the right state, not dead buttons.
          const msg = res.status === 423
            ? await detailMessage(res, 'Logging on this link is paused.')
            : 'Enter the PIN again to keep logging.'
          await reload()
          return msg
        }
        return await detailMessage(res, "That didn't save. Try again.")
      } catch {
        return "That didn't save — check your connection and try again."
      }
    },

    undo: async (entryId: string) => {
      try {
        const res = await sitterFetch(`/feedings/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
        if (res.ok || res.status === 404) {
          await reload()
          return null
        }
        if (res.status === 401) {
          saveSession(null)
          setView({ kind: 'timed-out' })
          return 'This page timed out.'
        }
        if (res.status === 403 || res.status === 423) {
          await reload()
          return res.status === 423 ? 'Logging on this link is paused.' : 'Enter the PIN again to undo.'
        }
        return await detailMessage(res, "Couldn't undo that. Try again.")
      } catch {
        return "Couldn't undo that — check your connection and try again."
      }
    },
  }), [unlocked, sitterFetch, load, reload])

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        <p className="text-sm font-bold herp-gradient-text tracking-wide mb-4">Herpetoverse</p>
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
        {view.kind === 'ready' && <SitterPassView data={view.data} logging={logging} />}
      </div>
    </main>
  )
}

function Message({ title, body, busy }: { title: string; body?: string; busy?: boolean }) {
  return (
    <div role="status" aria-live="polite"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
      {busy && <div className="w-8 h-8 mb-4 border-4 border-herp-teal border-t-transparent rounded-full animate-spin" />}
      <h1 className="text-xl font-bold text-neutral-100">{title}</h1>
      {body && <p className="mt-2 text-neutral-300">{body}</p>}
    </div>
  )
}
