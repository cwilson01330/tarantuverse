'use client'

/**
 * Herpetoverse password reset.
 *
 * Combined "forgot password" + "reset password" page — same URL handles
 * both states. With no `?token=` it shows the email request form; with a
 * token it shows the new-password form.
 *
 * The forgot-password POST includes `frontend_url: window.location.origin`
 * so the emailed reset link comes back to this domain. The backend
 * allowlists herpetoverse.com and tarantuverse.com origins for that
 * field; anything else falls back to the default FRONTEND_URL.
 *
 * `useSearchParams` requires a Suspense boundary in Next 14 — the
 * default export wraps the form in <Suspense> so the Vercel build
 * doesn't fail on static prerender.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/apiClient'

const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600'
const LABEL_CLS =
  'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'

function ResetPasswordContent() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get('token')
  const isResetMode = Boolean(token)

  // Forgot (email request) state
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  // Reset (new password) state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetDone, setResetDone] = useState(false)

  // Shared
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequestEmail(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        auth: false,
        json: {
          email: email.trim(),
          frontend_url:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      })
      setSent(true)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not send reset email. Check your connection and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        auth: false,
        json: { token, new_password: newPassword },
      })
      setResetDone(true)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reset password. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

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
          <h1 className="text-2xl font-bold mb-2">
            {isResetMode ? 'Set a new password' : 'Reset your password'}
          </h1>
          <p className="text-sm text-neutral-400">
            {isResetMode
              ? 'Enter a new password for your account.'
              : 'Enter your email and we will send a link to reset your password.'}
          </p>
        </div>

        {sent ? (
          <SuccessCard
            title="Check your email"
            body="If an account exists for that email, a password reset link is on its way. The link expires in 24 hours."
            actionLabel="Back to sign in"
            onAction={() => router.push('/login')}
          />
        ) : resetDone ? (
          <SuccessCard
            title="Password updated"
            body="You can now sign in with your new password."
            actionLabel="Sign in"
            onAction={() => router.replace('/login')}
          />
        ) : isResetMode ? (
          <form
            onSubmit={handleReset}
            className="space-y-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/40"
          >
            <div>
              <label htmlFor="newPassword" className={LABEL_CLS}>
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className={LABEL_CLS}>
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={INPUT_CLS}
                placeholder="Repeat your new password"
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
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleRequestEmail}
            className="space-y-4 p-6 rounded-lg border border-neutral-800 bg-neutral-900/40"
          >
            <div>
              <label htmlFor="email" className={LABEL_CLS}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLS}
                placeholder="you@example.com"
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
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="text-center text-xs text-neutral-500 pt-2">
              Remembered your password?{' '}
              <Link
                href="/login"
                className="text-herp-teal hover:text-herp-lime transition-colors"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}

        <p className="text-center text-xs text-neutral-600 mt-6">
          <Link href="/login" className="hover:text-neutral-400 transition-colors">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

function SuccessCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="p-6 rounded-lg border border-herp-teal/30 bg-neutral-900/40 text-center">
      <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
      <p className="text-sm text-neutral-400 mb-5">{body}</p>
      <button
        onClick={onAction}
        className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide"
      >
        {actionLabel}
      </button>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
