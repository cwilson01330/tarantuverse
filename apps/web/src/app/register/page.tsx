'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import OAuthButtons from '@/components/auth/OAuthButtons'
import { warmupApi, useColdStartIndicator } from '@/lib/cold-start'

interface ReferrerInfo {
  valid: boolean;
  referrer_username?: string;
  referrer_display_name?: string;
  message?: string;
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || ''
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    display_name: '',
    referral_code: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null)
  const [validatingReferral, setValidatingReferral] = useState(false)

  // Check for referral code in URL on mount
  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      setFormData(prev => ({ ...prev, referral_code: refCode }))
      validateReferralCode(refCode)
    }
  }, [searchParams])

  // Warm the Render container while the user fills out the form.
  useEffect(() => {
    warmupApi()
  }, [])

  const showColdStartHint = useColdStartIndicator(loading, 3000)

  const validateReferralCode = async (code: string) => {
    if (!code) {
      setReferrerInfo(null)
      return
    }

    setValidatingReferral(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/referrals/validate/${code}`)
      const data = await response.json()
      setReferrerInfo(data)
    } catch (err) {
      setReferrerInfo({ valid: false, message: 'Could not validate referral code' })
    } finally {
      setValidatingReferral(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Step 1: Register the user via API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      // Only include referral_code if it's valid
      const registrationData: any = {
        email: formData.email,
        username: formData.username,
        password: formData.password,
        display_name: formData.display_name || undefined,
      }

      // Include referral code only if it's been validated as valid
      if (formData.referral_code && referrerInfo?.valid) {
        registrationData.referral_code = formData.referral_code
      }

      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed')
      }

      // Step 2: Auto-sign-in so the user lands in the dashboard with one
      // action instead of being forced to re-enter email + password on a
      // login page. If email verification is required the API will
      // respond with a non-verified user and signIn will surface that
      // error — we fall back to the success screen so the user can
      // check their inbox.
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (signInResult?.ok) {
        // Prefer the ?redirect=... param when present (e.g. user clicked
        // Sign up from a gated page); otherwise drop them at the dashboard.
        const target = redirectTo || '/dashboard'
        router.push(target)
        router.refresh()
        return
      }

      // Auto-login didn't succeed (email verification required, or
      // a transient sign-in error). Show the success screen so they
      // still have a clear next step.
      setSuccessMessage(data.message || 'Registration successful. Check your inbox if email verification is required, then log in.')
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-24">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4">Registration Successful!</h2>
          <p className="text-theme-secondary mb-8">
            {successMessage || (
              <>
                Your account for <strong>{formData.email}</strong> is ready to go.
                You can log in now.
              </>
            )}
          </p>
          <a
            href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
            className="inline-block py-3 px-8 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 sm:p-12 md:p-24">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold mb-2 text-center">Create Account</h1>
        <p className="text-center text-sm text-theme-secondary mb-6">
          Free forever for up to 15 tarantulas · No credit card required
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
            {error}
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
            <span className="px-2 bg-theme text-theme-tertiary">Or sign up with email</span>
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
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              required
              minLength={3}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="••••••••"
            />
            <p className="text-xs text-theme-tertiary mt-1">At least 8 characters</p>
          </div>

          {/*
            Optional fields are collapsed behind a disclosure by default —
            the core form is email/username/password, and every visible
            field costs conversion. `open` auto-expands when we've received
            a referral code via ?ref=... so the user can see the green
            "Referred by @..." confirmation without having to hunt for it.
          */}
          <details
            open={Boolean(formData.referral_code)}
            className="rounded-xl border border-theme bg-surface"
          >
            <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-theme-secondary hover:text-theme-primary flex items-center justify-between">
              <span>Add a display name or referral code (optional)</span>
              <svg
                className="w-4 h-4 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-4 border-t border-theme">
              <div>
                <label className="block text-sm font-medium mb-1 mt-3">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="Your Name"
                />
                <p className="text-xs text-theme-tertiary mt-1">Shown on your keeper profile. Defaults to your username.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Referral Code</label>
                <input
                  type="text"
                  value={formData.referral_code}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase()
                    setFormData({ ...formData, referral_code: code })
                    if (code.length >= 8) {
                      validateReferralCode(code)
                    } else {
                      setReferrerInfo(null)
                    }
                  }}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="ABCD1234"
                  maxLength={12}
                />
                {validatingReferral && (
                  <p className="text-xs text-theme-tertiary mt-1">Validating referral code...</p>
                )}
                {referrerInfo && !validatingReferral && (
                  <div className={`mt-2 p-2 rounded-lg text-sm ${
                    referrerInfo.valid
                      ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                  }`}>
                    {referrerInfo.valid ? (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Referred by <strong>@{referrerInfo.referrer_username}</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span>{referrerInfo.message || 'Invalid referral code'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Creating Account...' : 'Register'}
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

          {/*
            Legal acceptance lives here (not behind an extra checkbox) —
            click-wrap acceptance tied to the Register action satisfies
            most jurisdictions while keeping conversion friction to zero.
            Links open in new tabs so the user doesn't lose their form.
          */}
          <p className="mt-3 text-center text-xs text-theme-tertiary leading-relaxed">
            By creating an account, you agree to our{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-theme-primary"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-theme-primary"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-theme-secondary">
          Already have an account?{' '}
          <Link href="/login" className="text-primary-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}

function RegisterLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-24">
      <div className="w-full max-w-md text-center">
        <div className="animate-pulse">
          <div className="h-10 bg-surface-elevated rounded w-3/4 mx-auto mb-8"></div>
          <div className="space-y-4">
            <div className="h-10 bg-surface-elevated rounded"></div>
            <div className="h-10 bg-surface-elevated rounded"></div>
            <div className="h-10 bg-surface-elevated rounded"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterLoading />}>
      <RegisterForm />
    </Suspense>
  )
}
