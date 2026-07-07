'use client'

/**
 * Herpetoverse sign-up.
 *
 * Posts to the shared Tarantuverse auth endpoints — one user table across
 * both apps. On success we register, then immediately log in (same
 * credentials) and persist the token to localStorage via `setSession`, so a
 * new keeper lands in the app with a single action.
 *
 * Transfer-claim resume path (mirrors Tarantuverse): when a buyer arrives via
 * a /claim/{token} link and registers, we carry `next=/claim/{token}` through
 * and drop a one-shot `hv_claim_new_signup` marker so the claim page reports
 * an authoritative new_signup instead of relying on the server's account-age
 * heuristic. This is the growth flywheel — every sold animal onboards its new
 * keeper with a populated account.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/apiClient'
import { AuthUser, setSession } from '@/lib/auth'
import GoogleSignInButton from '@/components/GoogleSignInButton'

interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

function RegisterForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') || '/app/reptiles'

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      // Step 1: register.
      await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        auth: false,
        json: {
          email: email.trim(),
          username: username.trim(),
          password,
          display_name: displayName.trim() || undefined,
        },
      })

      // Step 2: log in with the same credentials so the keeper lands in the
      // app without re-entering anything.
      const data = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        auth: false,
        json: { email: email.trim(), password },
      })
      setSession(data.access_token, data.user)

      // Resume-path marker for the transfer funnel: a claim-driven
      // registration is a *known* new signup. The claim page consumes this
      // one-shot flag and reports new_signup=true.
      if (next.startsWith('/claim/')) {
        try {
          sessionStorage.setItem('hv_claim_new_signup', next)
        } catch {
          // ignore — private mode
        }
      }

      router.replace(next)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Could not create your account. Check your connection and try again.')
      }
      setSubmitting(false)
    }
  }

  // Preserve the claim/next target when linking over to sign-in.
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

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
          <h1 className="text-2xl font-bold mb-2">Create your account</h1>
          <p className="text-sm text-neutral-400">
            Free forever for up to 15 animals · No credit card required
          </p>
          {next.startsWith('/claim/') && (
            <p className="mt-2 text-sm text-herp-teal">
              Your new animal will be waiting once you sign up.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/40"
        >
          <div>
            <label htmlFor="email" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
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
            <label htmlFor="username" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
              placeholder="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
              placeholder="••••••••"
            />
            <p className="text-xs text-neutral-600 mt-1">At least 8 characters</p>
          </div>

          <div>
            <label htmlFor="display_name" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
              Display name (optional)
            </label>
            <input
              id="display_name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600"
              placeholder="Your name"
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs text-neutral-500">or</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>
          <GoogleSignInButton next={next} onError={setError} />

          <p className="text-center text-xs text-neutral-500 pt-2">
            Already have an account?{' '}
            <Link href={loginHref} className="text-herp-teal hover:text-herp-lime transition-colors">
              Sign in
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-neutral-600 mt-6">
          <Link href="/" className="hover:text-neutral-400 transition-colors">
            ← Back to landing
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}
