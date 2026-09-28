'use client'

/**
 * Herpetoverse email verification — where the link in the confirmation
 * email lands.
 *
 * This page didn't exist before: verification emails for Herpetoverse
 * signups were titled "Tarantuverse" and linked to tarantuverse.com. The API
 * now sends HV keepers here (register/resend pass `frontend_url`, allowlisted
 * in apps/api/app/utils/frontend_origin.py).
 *
 * An expired or already-used link offers a fresh one in place, rather than
 * ending on an error with nowhere to go.
 *
 * `useSearchParams` requires a Suspense boundary in Next 14 — the default
 * export wraps the content so the Vercel build doesn't fail on prerender.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/apiClient'
import ResendVerification from '@/components/ResendVerification'

type Status = 'verifying' | 'success' | 'expired' | 'invalid'

function VerifyEmailContent() {
  const search = useSearchParams()
  const token = search.get('token')

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid')
  const [email, setEmail] = useState('')
  // A token is single-use. React strict mode runs effects twice in dev, and
  // the second call would find the token already consumed and report
  // failure over a success — so only ever send it once.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    ;(async () => {
      try {
        await apiFetch(
          `/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`,
          { method: 'POST', auth: false },
        )
        setStatus('success')
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : ''
        setStatus(/expired/i.test(msg) ? 'expired' : 'invalid')
      }
    })()
  }, [token])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt=""
              width={40}
              height={41}
              className="select-none"
              draggable={false}
            />
            <span className="herp-gradient-text text-2xl font-bold tracking-wide">
              Herpetoverse
            </span>
          </Link>
          <h1 className="text-2xl font-bold">Confirm your email</h1>
        </div>

        <div
          className="space-y-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/40"
          role="status"
          aria-live="polite"
        >
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-10 h-10 border-4 border-herp-teal border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-neutral-300">Confirming your email…</p>
            </div>
          )}

          {status === 'success' && (
            <>
              <p className="text-neutral-100 font-semibold">You&apos;re all set.</p>
              <p className="text-sm text-neutral-300">
                Your email is confirmed. Sign in to start tracking your collection.
              </p>
              <Link
                href="/login"
                className="block w-full text-center herp-gradient-bg text-herp-dark font-bold py-2.5 rounded-md tracking-wide"
              >
                Sign in
              </Link>
            </>
          )}

          {(status === 'expired' || status === 'invalid') && (
            <>
              <p className="text-neutral-100 font-semibold">
                {status === 'expired'
                  ? 'This link has expired'
                  : "This link didn't work"}
              </p>
              <p className="text-sm text-neutral-300">
                {status === 'expired'
                  ? 'Links last 3 days. Enter your email and we’ll send a fresh one.'
                  : 'It may have already been used — if so, just sign in. Otherwise, enter your email and we’ll send a fresh link.'}
              </p>
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
                  placeholder="you@example.com"
                />
              </div>
              {/* Keyed on the address so an edit resets a previous "sent". */}
              <ResendVerification
                key={email.trim()}
                email={email}
                intro="We'll email a new confirmation link to this address."
              />
              <Link
                href="/login"
                className="block text-center text-sm text-herp-teal hover:text-herp-lime transition-colors"
              >
                Already confirmed? Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  )
}
