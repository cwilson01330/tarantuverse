'use client'

/**
 * Herpetoverse sign-in.
 *
 * Posts to the shared Tarantuverse auth endpoint — we reuse the same user
 * table, so a Tarantuverse account signs right in here. Register links back
 * to Tarantuverse for account creation until Herpetoverse has its own
 * onboarding flow.
 *
 * On success we persist the token + user to localStorage via `setSession`
 * and land the keeper on /app/reptiles — the first authenticated page.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/apiClient'
import { AuthUser, getToken, setSession } from '@/lib/auth'

interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/app/reptiles'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in? Bounce straight through.
  useEffect(() => {
    if (getToken()) router.replace(next)
  }, [next, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const data = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        json: { email: email.trim(), password },
        auth: false,
      })
      setSession(data.access_token, data.user)
      router.replace(next)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Incorrect email or password.' : err.message)
      } else {
        setError('Could not sign in. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 mb-6"
          >
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
          <h1 className="text-2xl font-bold mb-2">Sign in</h1>
          <p className="text-sm text-neutral-400">
            Your Tarantuverse account works here too.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/40"
        >
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
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full herp-gradient-bg text-herp-dark font-bold py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-neutral-500 pt-2">
            New here?{' '}
            <a
              href="https://tarantuverse.com/register"
              className="text-herp-teal hover:text-herp-lime transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              Create a Tarantuverse account
            </a>{' '}
            — it works for both.
          </p>
        </form>

        <p className="text-center text-xs text-neutral-600 mt-6">
          <Link
            href="/"
            className="hover:text-neutral-400 transition-colors"
          >
            ← Back to landing
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
