'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import OAuthButtons from '@/components/auth/OAuthButtons'
import { warmupApi, useColdStartIndicator } from '@/lib/cold-start'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showResend, setShowResend] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  // Kick the Render container awake the moment the login page loads so
  // the first real request hits a warm worker. Keeps first-visit logins
  // from hanging for 20-30 seconds.
  useEffect(() => {
    warmupApi()
  }, [])

  // If login takes >3s, surface a friendly "waking up server" message.
  const showColdStartHint = useColdStartIndicator(loading, 3000)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setShowResend(false)
    setLoading(true)

    try {
      // Use NextAuth signIn with credentials provider
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false, // Handle redirect manually to show errors
      })

      if (result?.error) {
        if (result.error.includes('Email not verified')) {
          setShowResend(true)
        }
        throw new Error(result.error)
      }

      if (result?.ok) {
        router.push(redirectTo)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setResendLoading(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/auth/resend-verification?email=${formData.email}`, {
        method: 'POST',
      });

      if (response.ok) {
        alert('Verification email sent! Please check your inbox.');
      } else {
        alert('Failed to send verification email.');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-24">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold mb-8 text-center">Login</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl flex flex-col gap-2">
            <span>{error}</span>
            {showResend && (
              <button
                onClick={handleResendVerification}
                disabled={resendLoading}
                className="text-sm underline font-bold hover:text-red-900 dark:hover:text-red-300 text-left"
              >
                {resendLoading ? 'Sending...' : 'Resend Verification Email'}
              </button>
            )}
          </div>
        )}

        {/* OAuth Buttons */}
        <OAuthButtons />

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-theme"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-theme text-theme-tertiary">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {showColdStartHint && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-start gap-3 rounded-xl border border-primary-500/40 bg-primary-500/10 p-3 text-sm text-theme-secondary"
            >
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-primary-500"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span>
                Waking up our server — this can take 20-30 seconds if it's been idle. Hang tight!
              </span>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-theme-secondary">
          <Link href="/reset-password" className="text-primary-600 hover:underline">
            Forgot your password?
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-theme-secondary">
          Don't have an account?{' '}
          <Link href="/register" className="text-primary-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}

function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-24">
      <div className="w-full max-w-md text-center">
        <div className="animate-pulse">
          <div className="h-10 bg-surface-elevated rounded w-1/2 mx-auto mb-8"></div>
          <div className="space-y-4">
            <div className="h-10 bg-surface-elevated rounded"></div>
            <div className="h-10 bg-surface-elevated rounded"></div>
            <div className="h-12 bg-surface-elevated rounded"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  )
}
