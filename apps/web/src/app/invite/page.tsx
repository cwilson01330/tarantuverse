'use client'

/**
 * Co-keeper invite — /invite#<token>  (PRD-shared-keeping rung 3, T11).
 *
 * Same token hygiene as /sit: the token is in the URL FRAGMENT (never sent to a
 * server, a log or a Referer), stripped from the address bar immediately, and
 * sent to the API in a POST body. If you're not signed in it is held in
 * sessionStorage (this tab only) while you sign in or register, then accepted.
 *
 * Accepting needs an account whose VERIFIED email matches the invite — the
 * API enforces that; this page only explains what to do when it doesn't.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { CoKeeperApiError, ROLE_HELP, ROLE_LABEL, coKeeperApi, type SharedCollection } from '@/lib/coKeepers'

const KEY = 'tv_invite_token'

type View =
  | { kind: 'working' }
  | { kind: 'no-link' }
  | { kind: 'done'; c: SharedCollection }
  | { kind: 'verify' }
  | { kind: 'wrong-email'; message: string }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }

export default function InvitePage() {
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()
  const [view, setView] = useState<View>({ kind: 'working' })
  const spent = useRef(false)

  useEffect(() => {
    // 1. Capture and strip the fragment before anything else can see it.
    const frag = window.location.hash.slice(1)
    if (/^[A-Za-z0-9_-]{43}$/.test(frag)) {
      try { sessionStorage.setItem(KEY, frag) } catch { /* private mode */ }
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (isLoading || spent.current) return
    let invite: string | null = null
    try { invite = sessionStorage.getItem(KEY) } catch { /* private mode */ }
    if (!invite) {
      setView({ kind: 'no-link' })
      return
    }
    if (!isAuthenticated || !token) {
      // Keep the token in this tab; come back here after signing in.
      router.push('/login?redirect=/invite')
      return
    }
    spent.current = true
    coKeeperApi.acceptToken(token, invite)
      .then((c) => {
        try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
        setView({ kind: 'done', c })
      })
      .catch((e) => {
        if (e instanceof CoKeeperApiError) {
          if (e.status === 403 && /verify/i.test(e.message)) {
            spent.current = false // they can verify and reload this page
            return setView({ kind: 'verify' })
          }
          if (e.status === 403) return setView({ kind: 'wrong-email', message: e.message })
          if (e.status === 404 || e.status === 410) {
            try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
            return setView({ kind: 'gone' })
          }
          return setView({ kind: 'error', message: e.message })
        }
        setView({ kind: 'error', message: 'Could not reach the server. Try again in a moment.' })
      })
  }, [isLoading, isAuthenticated, token, router])

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="max-w-lg mx-auto px-4 py-10">
        <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-4">Tarantuverse</p>
        <div role="status" aria-live="polite" className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-3">
          {view.kind === 'working' && <h1 className="text-xl font-bold">Opening your invite…</h1>}
          {view.kind === 'no-link' && (
            <>
              <h1 className="text-xl font-bold">Open the link from your invite email</h1>
              <p className="text-gray-600 dark:text-gray-300">This page accepts an invite to help keep someone&apos;s collection.</p>
            </>
          )}
          {view.kind === 'done' && (
            <>
              <h1 className="text-xl font-bold">You&apos;re in</h1>
              <p className="text-gray-600 dark:text-gray-300">
                You&apos;re now a <strong>{ROLE_LABEL[view.c.role]}</strong> on {view.c.owner.name}&apos;s collection. {ROLE_HELP[view.c.role]}
              </p>
              <Link href={`/dashboard/shared/${view.c.owner.id}`} className="inline-block px-4 py-2 rounded-xl font-semibold text-white bg-purple-700 hover:bg-purple-800">
                Open their collection
              </Link>
            </>
          )}
          {view.kind === 'verify' && (
            <>
              <h1 className="text-xl font-bold">Verify your email first</h1>
              <p className="text-gray-600 dark:text-gray-300">
                Invites are tied to an email address, so we need to know this one is yours. Check your inbox for the
                verification link, then come back to this page.
              </p>
            </>
          )}
          {view.kind === 'wrong-email' && (
            <>
              <h1 className="text-xl font-bold">This invite is for a different email</h1>
              <p className="text-gray-600 dark:text-gray-300">{view.message}</p>
            </>
          )}
          {view.kind === 'gone' && (
            <>
              <h1 className="text-xl font-bold">This invite isn&apos;t available any more</h1>
              <p className="text-gray-600 dark:text-gray-300">It may have been used, cancelled, or run out. Ask the keeper to send a new one.</p>
            </>
          )}
          {view.kind === 'error' && (
            <>
              <h1 className="text-xl font-bold">Something went wrong</h1>
              <p className="text-gray-600 dark:text-gray-300">{view.message}</p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
