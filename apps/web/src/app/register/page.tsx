'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import OAuthButtons from '@/components/auth/OAuthButtons'

interface ReferrerInfo {
  valid: boolean;
  referrer_username?: string;
  referrer_display_name?: string;
  message?: string;
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-4">Registration Successful!</h2>
          <p className="text-gray-600 mb-8">
            We've sent a verification email to <strong>{formData.email}</strong>.
            Please check your inbox and verify your account to log in.
          </p>
          <a
            href="/login"
            className="inline-block py-3 px-8 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-24">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold mb-8 text-center">Create Account</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* OAuth Buttons */}
        <OAuthButtons />

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or sign up with email</span>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Display Name (Optional)</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="Your Name"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
          </div>

          {/* Referral Code */}
          <div>
            <label className="block text-sm font-medium mb-1">Referral Code (Optional)</label>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="ABCD1234"
              maxLength={12}
            />
            {validatingReferral && (
              <p className="text-xs text-gray-500 mt-1">Validating referral code...</p>
            )}
            {referrerInfo && !validatingReferral && (
              <div className={`mt-2 p-2 rounded-lg text-sm ${
                referrerInfo.valid
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/login" className="text-primary-600 hover:underline">
            Login
          </a>
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
          <div className="h-10 bg-gray-200 rounded w-3/4 mx-auto mb-8"></div>
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
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
